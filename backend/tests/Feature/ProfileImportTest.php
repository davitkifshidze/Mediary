<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Game;
use App\Models\Module;
use App\Models\Movie;
use App\Models\RecordLock;
use App\Models\Status;
use App\Models\User;
use App\Services\Modules\FieldSettings;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **საჯარო პროფილიდან საკუთარ ბიბლიოთეკაში დამატება.**
 *
 * ⚠️ ფარგალი პროფილის სამი ფენაა (პროფილი → მოდული → ჩანაწერი) და ჩაკეტილი
 * არასდროს — ტესტი ამიტომ ყოველ ფენას ცალკე ხურავს და ამოწმებს, რომ id-ით
 * პირდაპირ მოთხოვნაც 404-ია და არა მხოლოდ სიაში დამალული.
 */
class ProfileImportTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $viewer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);
        Storage::fake('public');

        $this->owner = $this->makeUser('davit');
        $this->owner->forceFill(['profile_visibility' => 'public'])->save();
        $this->publish($this->owner, 'movie');
        $this->publish($this->owner, 'game');

        $this->viewer = $this->makeUser('nato');
        $this->giveCredential($this->viewer, 'tmdb');

        Http::fake([
            'api.themoviedb.org/3/*/credits*' => Http::response(['cast' => []]),
            'api.themoviedb.org/3/*/videos*' => Http::response(['results' => []]),
            'api.themoviedb.org/3/movie/*' => fn ($request) => Http::response([
                'id' => (int) basename(parse_url($request->url(), PHP_URL_PATH)),
                'title' => 'TMDB Title',
                'overview' => 'From TMDB.',
                'genres' => [],
            ]),
            '*' => Http::response([], 404),
        ]);
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name, 'username' => $name,
            'email' => "{$name}@example.com", 'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', ['movie', 'series', 'game'])->pluck('id')->all());

        return $user->refresh();
    }

    private function publish(User $user, string $key): void
    {
        $user->modules()->syncWithoutDetaching([Module::where('key', $key)->value('id') => ['is_public' => true]]);
    }

    private function movie(User $user, string $title, string $visibility = 'public', array $attrs = []): Movie
    {
        $movie = Movie::create(['user_id' => $user->id]);
        $movie->forceFill(['visibility' => $visibility, ...$attrs])->save();
        $movie->translations()->create(['locale' => 'en', 'title' => $title]);

        return $movie->refresh();
    }

    private function add(int $id, string $domain = 'movie', string $mode = 'default', ?User $as = null)
    {
        return $this->actingAs($as ?? $this->viewer)->postJson('/api/public-profiles/davit/item', [
            'domain' => $domain, 'id' => $id, 'status_mode' => $mode,
        ]);
    }

    /* ================= გეგმა ================= */

    public function test_the_plan_lists_only_public_unlocked_records_and_marks_what_i_have(): void
    {
        $new = $this->movie($this->owner, 'New', 'public', ['tmdb_id' => 3]);
        $have = $this->movie($this->owner, 'Have', 'public', ['tmdb_id' => 1]);
        $private = $this->movie($this->owner, 'Private', 'private', ['tmdb_id' => 4]);
        $locked = $this->movie($this->owner, 'Locked', 'public', ['tmdb_id' => 5]);
        $this->lock($locked);

        $mine = $this->movie($this->viewer, 'Mine', 'private', ['tmdb_id' => 1]);

        $res = $this->actingAs($this->viewer)
            ->postJson('/api/public-profiles/davit/plan', ['domain' => 'movie'])
            ->assertOk()
            ->assertJson(['counts' => ['new' => 1, 'have' => 1, 'trash' => 0]]);

        $ids = array_column($res->json('items'), 'id');
        sort($ids);
        $this->assertSame([$new->id, $have->id], $ids);
        $this->assertNotContains($private->id, $ids);
        $this->assertNotContains($locked->id, $ids);
        $this->assertSame($mine->id, collect($res->json('items'))->firstWhere('id', $have->id)['mine_id']);
        $this->assertSame(['default', 'owner'], $res->json('status_modes'));
    }

    /* ================= ერთი ჩანაწერი ================= */

    public function test_a_public_movie_is_copied_once_and_logged_with_its_source(): void
    {
        $movie = $this->movie($this->owner, 'Dune', 'public', ['tmdb_id' => 438631, 'is_favorite' => true]);

        $first = $this->add($movie->id)->assertOk()->assertJson(['result' => 'added']);
        $copy = Movie::withoutGlobalScopes()->findOrFail($first->json('id'));

        $this->assertSame($this->viewer->id, (int) $copy->user_id);
        $this->assertSame(438631, (int) $copy->tmdb_id);
        // რჩეული მფლობელის პირადი ნაწილია
        $this->assertFalse((bool) $copy->is_favorite);

        // მეორედ — „უკვე გაქვს", დუბლის გარეშე
        $this->add($movie->id)->assertOk()->assertJson(['result' => 'have', 'id' => $copy->id]);
        $this->assertSame(1, Movie::withoutGlobalScopes()->where('user_id', $this->viewer->id)->count());

        $log = AuditLog::where('action', AuditLog::ACTION_IMPORT)->sole();
        $this->assertSame($this->viewer->id, (int) $log->user_id);
        $this->assertSame(['source' => 'profile', 'owner' => 'davit'], $log->new_values);
        $this->assertSame(['owner' => 'davit', 'owner_id' => $this->owner->id], $log->context);

        // ბმულის მრიცხველი და მფლობელის შეტყობინება პროფილს არ ეხება
        $this->assertSame(0, DB::table('share_link_imports')->count());
        $this->assertSame(0, DB::table('notifications')->where('user_id', $this->owner->id)->count());
    }

    public function test_facts_come_over_but_the_owners_personal_part_does_not(): void
    {
        $game = new Game;
        $game->forceFill([
            'user_id' => $this->owner->id,
            'title_en' => 'Hades',
            'description_en' => 'Roguelike.',
            'developer' => 'Supergiant',
            'rating' => 9,
            'is_favorite' => true,
            'visibility' => 'public',
        ])->save();

        $id = $this->add($game->id, 'game')->assertOk()->assertJson(['result' => 'added'])->json('id');
        $copy = Game::withoutGlobalScopes()->findOrFail($id);

        $this->assertSame('Hades', $copy->title_en);
        $this->assertSame('Roguelike.', $copy->description_en);
        $this->assertSame('Supergiant', $copy->developer);
        $this->assertNull($copy->rating);
        $this->assertFalse((bool) $copy->is_favorite);
        $this->assertSame('to_play', $copy->status);
    }

    /** მფლობელის სვეტი პირად ფაილზე რომ უთითებდეს — ასლი მას არ წაიკითხავს (მხოლოდ საჯარო მედია) */
    public function test_a_main_photo_pointing_at_a_private_file_is_never_copied(): void
    {
        Storage::fake('private');
        Storage::disk('private')->put('notes/secret.txt', 'private');

        $game = new Game;
        $game->forceFill([
            'user_id' => $this->owner->id, 'title_en' => 'Hades', 'visibility' => 'public',
            'cover_path' => 'notes/secret.txt', 'cover_source' => 'upload',
        ])->save();

        $id = $this->add($game->id, 'game')->assertOk()->json('id');

        $this->assertNull(Game::withoutGlobalScopes()->findOrFail($id)->cover_path);
    }

    public function test_private_locked_and_foreign_records_are_404_even_by_id(): void
    {
        $private = $this->movie($this->owner, 'Private', 'private', ['tmdb_id' => 4]);
        $locked = $this->movie($this->owner, 'Locked', 'public', ['tmdb_id' => 5]);
        $this->lock($locked);
        // სხვისი საჯარო ჩანაწერი — ამ პროფილის id-ით ვერ გამოვა
        $stranger = $this->makeUser('stranger');
        $foreign = $this->movie($stranger, 'Foreign', 'public', ['tmdb_id' => 6]);

        foreach ([$private, $locked, $foreign] as $movie) {
            $this->add($movie->id)->assertNotFound()->assertJson(['message' => 'profile_record_not_found']);
        }

        $this->assertSame(0, Movie::withoutGlobalScopes()->where('user_id', $this->viewer->id)->count());
    }

    public function test_hidden_profiles_and_sections_are_404_and_my_own_profile_is_409(): void
    {
        $movie = $this->movie($this->owner, 'Dune', 'public', ['tmdb_id' => 1]);

        // სექცია პროფილზე არ ჩანს
        $this->actingAs($this->viewer)
            ->postJson('/api/public-profiles/davit/plan', ['domain' => 'series'])
            ->assertNotFound();
        // არაგადმოსატანი დომენი
        $this->actingAs($this->viewer)
            ->postJson('/api/public-profiles/davit/plan', ['domain' => 'gallery_album'])
            ->assertUnprocessable();

        $this->add($movie->id, as: $this->owner)->assertStatus(409)->assertJson(['message' => 'profile_own']);

        $this->owner->forceFill(['profile_visibility' => 'private'])->save();
        $this->add($movie->id)->assertNotFound();

        Auth::forgetGuards();
        $this->postJson('/api/public-profiles/davit/plan', ['domain' => 'movie'])->assertUnauthorized();
    }

    public function test_the_owners_status_comes_only_when_the_profile_shows_it(): void
    {
        Status::ensureDefaults($this->owner->id, 'movie');
        $movie = $this->movie($this->owner, 'Dune', 'public', ['tmdb_id' => 1]);
        $movie->applyStatusKey(Status::where('user_id', $this->owner->id)->where('module', 'movie')->where('role', 'done')->value('key'));
        $movie->save();

        app(FieldSettings::class)->save($this->owner, 'movie', ['status' => ['public' => false]]);

        $this->add($movie->id, mode: 'owner')->assertStatus(422)->assertJson(['message' => 'profile_status_hidden']);
        $this->actingAs($this->viewer)
            ->postJson('/api/public-profiles/davit/plan', ['domain' => 'movie'])
            ->assertJson(['status_modes' => ['default']]);

        app(FieldSettings::class)->save($this->owner, 'movie', ['status' => ['public' => true]]);

        $id = $this->add($movie->id, mode: 'owner')->assertOk()->json('id');
        $this->assertSame('done', Movie::withoutGlobalScopes()->findOrFail($id)->status?->role);
    }

    public function test_viewing_without_the_module_offers_a_request_instead(): void
    {
        $this->viewer->modules()->detach(Module::where('key', 'game')->value('id'));
        $game = new Game;
        $game->forceFill(['user_id' => $this->owner->id, 'title_en' => 'Hades', 'visibility' => 'public'])->save();

        $this->add($game->id, 'game')->assertForbidden();

        $sections = $this->actingAs($this->viewer)->getJson('/api/public/profiles/davit')->assertOk()->json('viewer.sections');
        $this->assertFalse($sections['game']['enabled']);
        $this->assertTrue($sections['movie']['can_create']);
    }

    /* ================= პროფილის API ================= */

    public function test_the_profile_tells_a_signed_in_stranger_what_they_can_add_and_already_have(): void
    {
        $have = $this->movie($this->owner, 'Have', 'public', ['tmdb_id' => 1]);
        $new = $this->movie($this->owner, 'New', 'public', ['tmdb_id' => 2]);
        $mine = $this->movie($this->viewer, 'Mine', 'private', ['tmdb_id' => 1]);

        // ანონიმი — არაფერი ახალი
        $anon = $this->getJson('/api/public/profiles/davit')->assertOk();
        $this->assertSame(['signed_in' => false, 'own' => false, 'sections' => []], $anon->json('viewer'));
        $cards = $this->getJson('/api/public/profiles/davit/movie')->assertOk()->json('data');
        $this->assertArrayNotHasKey('in_library', $cards[0]);

        // შესული უცხო
        $head = $this->actingAs($this->viewer)->getJson('/api/public/profiles/davit')->assertOk();
        $this->assertTrue($head->json('viewer.signed_in'));
        $this->assertSame(['movie', 'game'], array_keys($head->json('viewer.sections')));
        $this->assertTrue($head->json('viewer.sections.movie.owner_status'));

        $marks = collect($this->actingAs($this->viewer)->getJson('/api/public/profiles/davit/movie')->json('data'))
            ->pluck('in_library', 'id');
        $this->assertSame(['id' => $mine->id, 'trashed' => false], $marks[$have->id]);
        $this->assertNull($marks[$new->id]);

        // მფლობელი — „საკუთარი", დამატების გარეშე
        $self = $this->actingAs($this->owner)->getJson('/api/public/profiles/davit')->assertOk();
        $this->assertTrue($self->json('viewer.own'));
        $this->assertSame([], $self->json('viewer.sections'));
    }

    private function lock(Movie $movie): void
    {
        RecordLock::create([
            'user_id' => $this->owner->id,
            'lockable_type' => $movie->getMorphClass(),
            'lockable_id' => $movie->getKey(),
            'password_hash' => Hash::make('secret1'),
        ]);
    }
}
