<?php

namespace Tests\Feature;

use App\Models\Anime;
use App\Models\AuditLog;
use App\Models\Genre;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Series;
use App\Models\ShareLink;
use App\Models\Status;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * **გაზიარების ბმული — შექმნა და ნახვა (Tasks §40.2–40.7).**
 *
 * ⚠️ **ორი მნახველი, ორივე სავალდებულო** (§1.2-ის გაკვეთილი): ანონიმი **და**
 * შესული უცხო. ანონიმზე `owner` scope არაფერს ჭრის, ე.ი. მარტო ანონიმური
 * ტესტი ადვილ ნახევარს იცავს — შესულ უცხოს კი scope **მის საკუთარ**
 * ბიბლიოთეკაზე მოჭრიდა და ბმული ცარიელი გამოჩნდებოდა.
 */
class ShareLinkTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $stranger;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->owner = $this->makeUser('owner');
        $this->stranger = $this->makeUser('stranger');
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name, 'username' => $name,
            'email' => "{$name}@example.com", 'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', ['movie', 'series', 'anime'])->pluck('id')->all());

        return $user->refresh();
    }

    private function movie(User $user, string $title, array $attrs = [], ?string $status = null): Movie
    {
        $movie = Movie::create(['user_id' => $user->id, 'visibility' => 'private', ...$attrs]);
        $movie->translations()->create(['locale' => 'en', 'title' => $title]);

        if ($status !== null) {
            Status::ensureDefaults($user->id, 'movie');
            $movie->applyStatusKey($status);
            $movie->save();
        }

        return $movie->refresh();
    }

    private function genre(string $slug): Genre
    {
        $genre = Genre::create(['slug' => $slug]);
        $genre->setTranslation('en', ucfirst($slug));

        return $genre;
    }

    /** ბმულის შექმნა API-ით — აბრუნებს პასუხის `data`-ს */
    private function create(array $domains, array $extra = []): array
    {
        return $this->actingAs($this->owner)
            ->postJson('/api/share-links', ['domains' => $domains, ...$extra])
            ->assertCreated()
            ->json('data');
    }

    private function tokenOf(array $link): string
    {
        return basename((string) $link['url']);
    }

    /** ⚠️ ანონიმად — წინა `actingAs()` ტესტის ფარგლებში რჩება, ამიტომ ცხადად ვთიშავთ */
    private function anonymous(string $uri): TestResponse
    {
        Auth::forgetGuards();

        return $this->getJson($uri);
    }

    /* ================= შექმნა და ტოკენი ================= */

    public function test_the_token_is_stored_only_as_a_hash_and_an_encrypted_copy(): void
    {
        $link = $this->create(['movie' => ['scope' => 'all']]);
        $token = $this->tokenOf($link);

        $this->assertSame(48, strlen($token));
        $this->assertStringContainsString('/share/'.$token, (string) $link['url']);

        $row = DB::table('share_links')->first();
        $this->assertSame(hash('sha256', $token), $row->token_hash);
        $this->assertNotSame($token, $row->token, 'ღია ტოკენი ბაზაში დევს');
        $this->assertStringNotContainsString($token, json_encode($row));
    }

    public function test_the_audit_log_never_carries_the_token(): void
    {
        $link = $this->create(['movie' => ['scope' => 'all']], ['name' => 'For Nino']);
        $token = $this->tokenOf($link);

        $log = AuditLog::where('subject_type', 'share_link')->latest('id')->first();
        $this->assertNotNull($log, 'ბმულის შექმნა ჟურნალში არ ჩაიწერა');
        $this->assertStringNotContainsString($token, json_encode($log->toArray()));
        $this->assertStringNotContainsString(hash('sha256', $token), json_encode($log->toArray()));
    }

    public function test_an_empty_choice_is_a_422_never_everything(): void
    {
        foreach ([
            ['scope' => 'status', 'statuses' => []],
            ['scope' => 'genre', 'genres' => ['no-such-genre']],
            ['scope' => 'ids', 'ids' => []],
        ] as $spec) {
            $this->actingAs($this->owner)
                ->postJson('/api/share-links', ['domains' => ['movie' => $spec]])
                ->assertStatus(422);
        }

        $this->assertSame(0, ShareLink::withoutGlobalScopes()->count());
    }

    public function test_an_unknown_status_key_is_a_422(): void
    {
        $this->actingAs($this->owner)
            ->postJson('/api/share-links', ['domains' => ['movie' => ['scope' => 'status', 'statuses' => ['nope']]]])
            ->assertStatus(422)
            ->assertJson(['message' => 'invalid_status']);
    }

    /** ⚠️ ხელით მონიშნული მფლობელის ჩანაწერებზე იჭრება — სხვისი id ჩუმად ვარდება */
    public function test_picked_ids_are_cut_to_the_owners_records(): void
    {
        $mine = $this->movie($this->owner, 'Mine');
        $theirs = $this->movie($this->stranger, 'Theirs');

        $link = $this->create(['movie' => ['scope' => 'ids', 'ids' => [$mine->id, $theirs->id]]]);
        $this->assertSame([$mine->id], $link['domains']['movie']['ids']);

        $this->actingAs($this->owner)
            ->postJson('/api/share-links', ['domains' => ['movie' => ['scope' => 'ids', 'ids' => [$theirs->id]]]])
            ->assertStatus(422)
            ->assertJson(['message' => 'share_scope_incomplete']);
    }

    public function test_a_module_the_owner_does_not_have_cannot_be_shared(): void
    {
        $this->owner->modules()->detach(Module::where('key', 'anime')->value('id'));

        $this->actingAs($this->owner->refresh())
            ->postJson('/api/share-links', ['domains' => ['anime' => ['scope' => 'all']]])
            ->assertStatus(422)
            ->assertJson(['message' => 'share_domain_unavailable']);
    }

    public function test_preview_counts_the_private_records_it_would_reveal(): void
    {
        $this->movie($this->owner, 'Public', ['visibility' => 'public']);
        $this->movie($this->owner, 'Private one');
        $this->movie($this->owner, 'Private two');

        $this->actingAs($this->owner)
            ->getJson('/api/share-links/preview?'.http_build_query(['domains' => ['movie' => ['scope' => 'all']]]))
            ->assertOk()
            ->assertJson(['total' => 3, 'private' => 2]);

        $this->actingAs($this->owner)
            ->getJson('/api/share-links/preview?'.http_build_query(['domains' => ['movie' => ['scope' => 'all', 'public_only' => 1]]]))
            ->assertOk()
            ->assertJson(['total' => 1, 'private' => 0]);
    }

    /* ================= ნახვა ================= */

    public function test_a_stranger_sees_the_owners_records_both_signed_out_and_signed_in(): void
    {
        $this->movie($this->owner, 'Alien');
        $this->movie($this->owner, 'Heat');
        // მნახველის საკუთარი ფილმი ბმულში არ უნდა გამოჩნდეს
        $this->movie($this->stranger, 'Strangers own');

        $token = $this->tokenOf($this->create(['movie' => ['scope' => 'all']]));

        $anon = $this->anonymous("/api/public/shares/{$token}/movie")->assertOk()->json('data');
        $this->assertEqualsCanonicalizing(['Alien', 'Heat'], array_column($anon, 'title_en'));

        $signed = $this->actingAs($this->stranger)->getJson("/api/public/shares/{$token}/movie")->assertOk()->json('data');
        $this->assertEqualsCanonicalizing(['Alien', 'Heat'], array_column($signed, 'title_en'));
    }

    public function test_the_head_names_the_owner_and_the_sections(): void
    {
        $this->movie($this->owner, 'One');
        Series::create(['user_id' => $this->owner->id])->translations()->create(['locale' => 'en', 'title' => 'S']);

        $token = $this->tokenOf($this->create(['movie' => ['scope' => 'all'], 'series' => ['scope' => 'all']]));

        $res = $this->anonymous("/api/public/shares/{$token}")->assertOk();
        $res->assertJsonPath('owner.username', 'owner')
            ->assertJsonPath('viewer.signed_in', false)
            ->assertJsonPath('viewer.own', false);

        $sections = collect($res->json('sections'))->pluck('count', 'domain')->all();
        $this->assertSame(['movie' => 1, 'series' => 1], $sections);
        $this->assertArrayNotHasKey('anime', $sections);
    }

    public function test_only_public_hides_private_records_and_all_reveals_them(): void
    {
        $this->movie($this->owner, 'Open', ['visibility' => 'public']);
        $this->movie($this->owner, 'Secret');

        $all = $this->tokenOf($this->create(['movie' => ['scope' => 'all']]));
        $public = $this->tokenOf($this->create(['movie' => ['scope' => 'all', 'public_only' => true]]));

        $this->assertEqualsCanonicalizing(
            ['Open', 'Secret'],
            array_column($this->anonymous("/api/public/shares/{$all}/movie")->json('data'), 'title_en'),
        );
        $this->assertSame(
            ['Open'],
            array_column($this->anonymous("/api/public/shares/{$public}/movie")->json('data'), 'title_en'),
        );
    }

    public function test_each_scope_shows_only_its_records(): void
    {
        $drama = $this->genre('drama');
        $comedy = $this->genre('comedy');

        $watched = $this->movie($this->owner, 'Watched', [], 'watched');
        $todo = $this->movie($this->owner, 'Todo', ['is_favorite' => true], 'to_watch');
        $watched->genres()->attach($drama->id);
        $todo->genres()->attach($comedy->id);

        $cases = [
            [['scope' => 'status', 'statuses' => ['watched']], ['Watched']],
            [['scope' => 'favorite'], ['Todo']],
            [['scope' => 'genre', 'genres' => ['comedy']], ['Todo']],
            [['scope' => 'genre', 'genres' => ['comedy', 'drama'], 'genre_mode' => 'any'], ['Todo', 'Watched']],
            [['scope' => 'genre', 'genres' => ['comedy', 'drama'], 'genre_mode' => 'all'], []],
            [['scope' => 'ids', 'ids' => [$watched->id]], ['Watched']],
        ];

        foreach ($cases as [$spec, $expected]) {
            $token = $this->tokenOf($this->create(['movie' => $spec]));
            $titles = array_column($this->anonymous("/api/public/shares/{$token}/movie")->json('data'), 'title_en');
            sort($titles);
            $this->assertSame($expected, $titles, json_encode($spec));
        }
    }

    /** ⚠️ ცოცხალია (Q47) — ფარგალს მორგებული ახალი ჩანაწერი ბმულშიც ჩნდება; ურნაში მყოფი ქრება */
    public function test_the_scope_is_live_and_skips_the_trash(): void
    {
        $old = $this->movie($this->owner, 'Old');
        $token = $this->tokenOf($this->create(['movie' => ['scope' => 'all']]));

        $this->movie($this->owner, 'Added later');
        $this->actingAs($this->owner);
        $old->moveToTrash();

        $this->assertSame(
            ['Added later'],
            array_column($this->anonymous("/api/public/shares/{$token}/movie")->json('data'), 'title_en'),
        );
    }

    /** ⚠️ ბარათი ვიწროა — სრული რესურსის ველები არ გადის; სტატუსი მხოლოდ ნებით */
    public function test_the_card_is_narrow_and_hides_the_status_when_asked(): void
    {
        $this->movie($this->owner, 'Narrow', ['tmdb_id' => 603, 'sync_status' => 'partial'], 'watched');

        $shown = $this->tokenOf($this->create(['movie' => ['scope' => 'all']]));
        $hidden = $this->tokenOf($this->create(['movie' => ['scope' => 'all']], ['show_status' => false]));

        $card = $this->anonymous("/api/public/shares/{$shown}/movie")->json('data.0');
        foreach (['sync_status', 'tmdb_id', 'user_id', 'imdb_id', 'notes', 'visibility'] as $private) {
            $this->assertArrayNotHasKey($private, $card, "{$private} ბმულის ბარათზე გაჟონა");
        }
        $this->assertSame('watched', $card['status']['key']);

        $this->assertArrayNotHasKey('status', $this->anonymous("/api/public/shares/{$hidden}/movie")->json('data.0'));
    }

    public function test_genres_travel_on_the_card_and_as_a_facet(): void
    {
        $drama = $this->genre('drama');
        $a = $this->movie($this->owner, 'A');
        $b = $this->movie($this->owner, 'B');
        $a->genres()->attach($drama->id);
        $b->genres()->attach($drama->id);

        $token = $this->tokenOf($this->create(['movie' => ['scope' => 'all']]));

        $res = $this->anonymous("/api/public/shares/{$token}/movie?genre=drama")->assertOk();
        $this->assertSame('drama', $res->json('data.0.genres.0.slug'));
        $this->assertSame([['slug' => 'drama', 'name_ka' => null, 'name_en' => 'Drama', 'count' => 2]], $res->json('genres'));
    }

    public function test_search_finds_by_title(): void
    {
        $this->movie($this->owner, 'The Matrix');
        $this->movie($this->owner, 'Heat');

        $token = $this->tokenOf($this->create(['movie' => ['scope' => 'all']]));

        $this->assertSame(
            ['The Matrix'],
            array_column($this->anonymous("/api/public/shares/{$token}/movie?q=matr")->json('data'), 'title_en'),
        );
    }

    /** „უკვე გაქვს ✓" — იდენტობით; ურნაში მყოფიც ჩანს (40.1-ის გაკვეთილი) */
    public function test_a_signed_in_viewer_sees_what_is_already_in_the_library(): void
    {
        $this->movie($this->owner, 'Have it', ['tmdb_id' => 1]);
        $this->movie($this->owner, 'Trashed copy', ['tmdb_id' => 2]);
        $this->movie($this->owner, 'New to me', ['tmdb_id' => 3]);

        $have = $this->movie($this->stranger, 'Mine', ['tmdb_id' => 1]);
        $trashed = $this->movie($this->stranger, 'Mine in trash', ['tmdb_id' => 2]);
        $this->actingAs($this->stranger);
        $trashed->moveToTrash();

        $token = $this->tokenOf($this->create(['movie' => ['scope' => 'all']]));

        $cards = collect($this->actingAs($this->stranger)->getJson("/api/public/shares/{$token}/movie")->json('data'))
            ->keyBy('title_en');

        $this->assertSame(['id' => $have->id, 'trashed' => false], $cards['Have it']['in_library']);
        $this->assertSame(['id' => $trashed->id, 'trashed' => true], $cards['Trashed copy']['in_library']);
        $this->assertNull($cards['New to me']['in_library']);

        // ანონიმს ეს ველი საერთოდ არ აქვს
        $this->assertArrayNotHasKey('in_library', $this->anonymous("/api/public/shares/{$token}/movie")->json('data.0'));
    }

    /* ================= 404 · 410 ================= */

    public function test_unknown_is_404_and_expired_or_revoked_is_410(): void
    {
        $this->anonymous('/api/public/shares/'.str_repeat('a', 48))
            ->assertStatus(404)->assertJson(['message' => 'share_not_found']);

        $expired = $this->create(['movie' => ['scope' => 'all']], ['expires_days' => 7]);
        ShareLink::withoutGlobalScopes()->whereKey($expired['id'])->update(['expires_at' => now()->subMinute()]);
        $this->anonymous('/api/public/shares/'.$this->tokenOf($expired))
            ->assertStatus(410)->assertJson(['message' => 'share_expired']);

        $revoked = $this->create(['movie' => ['scope' => 'all']]);
        $this->actingAs($this->owner)->patchJson("/api/share-links/{$revoked['id']}", ['revoked' => true])->assertOk();
        $this->anonymous('/api/public/shares/'.$this->tokenOf($revoked))
            ->assertStatus(410)->assertJson(['message' => 'share_revoked']);
        $this->anonymous('/api/public/shares/'.$this->tokenOf($revoked).'/movie')->assertStatus(410);
    }

    public function test_a_disabled_owner_or_switched_off_mechanism_is_404(): void
    {
        $token = $this->tokenOf($this->create(['movie' => ['scope' => 'all']]));

        config(['mediary.share_links' => false]);
        $this->anonymous("/api/public/shares/{$token}")->assertStatus(404);
        config(['mediary.share_links' => true]);

        $this->owner->forceFill(['is_active' => false])->save();
        $this->anonymous("/api/public/shares/{$token}")->assertStatus(404)->assertJson(['message' => 'share_not_found']);
    }

    /** მოდული, რომელიც მფლობელს გაეთიშა, ბმულიდან ჩუმად ქრება */
    public function test_a_module_the_owner_lost_disappears_from_the_link(): void
    {
        $this->movie($this->owner, 'Gone');
        $token = $this->tokenOf($this->create(['movie' => ['scope' => 'all']]));

        $this->owner->modules()->detach(Module::where('key', 'movie')->value('id'));

        $this->assertSame([], $this->anonymous("/api/public/shares/{$token}")->assertOk()->json('sections'));
        $this->anonymous("/api/public/shares/{$token}/movie")->assertStatus(404);
    }

    /** ⚠️ `per_page` ორივე მხრიდან იზღუდება (§B4) — ავტორიზაციის გარეშე endpoint-ია */
    public function test_per_page_is_clamped_from_both_sides(): void
    {
        $this->movie($this->owner, 'A');
        $this->movie($this->owner, 'B');
        $token = $this->tokenOf($this->create(['movie' => ['scope' => 'all']]));

        $this->anonymous("/api/public/shares/{$token}/movie?per_page=-1")->assertOk()->assertJsonPath('meta.per_page', 1);
        $this->anonymous("/api/public/shares/{$token}/movie?per_page=100000")->assertOk()->assertJsonPath('meta.per_page', 100);
    }

    public function test_views_count_strangers_once_and_never_the_owner(): void
    {
        Cache::flush();
        $token = $this->tokenOf($this->create(['movie' => ['scope' => 'all']]));

        $this->actingAs($this->owner)->getJson("/api/public/shares/{$token}")->assertOk();
        $this->assertSame(0, (int) DB::table('share_links')->value('views'));

        $this->actingAs($this->stranger)->getJson("/api/public/shares/{$token}")->assertOk();
        $this->actingAs($this->stranger)->getJson("/api/public/shares/{$token}")->assertOk();
        $this->assertSame(1, (int) DB::table('share_links')->value('views'));
        $this->assertNotNull(DB::table('share_links')->value('last_opened_at'));
        // ⚠️ ნახვა ჟურნალში „განახლდა"-დ არ უნდა ჩაიწეროს
        $this->assertSame(0, AuditLog::where('subject_type', 'share_link')->where('action', 'update')->count());
    }

    /* ================= მართვა ================= */

    public function test_someone_elses_link_is_a_404_on_every_management_route(): void
    {
        $link = $this->create(['movie' => ['scope' => 'all']]);

        $this->actingAs($this->stranger)->patchJson("/api/share-links/{$link['id']}", ['name' => 'x'])->assertStatus(404);
        $this->actingAs($this->stranger)->deleteJson("/api/share-links/{$link['id']}")->assertStatus(404);
        $this->actingAs($this->stranger)->postJson("/api/share-links/{$link['id']}/regenerate")->assertStatus(404);
        $this->assertSame([], $this->actingAs($this->stranger)->getJson('/api/share-links')->assertOk()->json('data'));
    }

    public function test_regenerating_kills_the_old_link_and_keeps_a_trace(): void
    {
        $link = $this->create(['movie' => ['scope' => 'all']]);
        $old = $this->tokenOf($link);

        $fresh = $this->actingAs($this->owner)->postJson("/api/share-links/{$link['id']}/regenerate")->assertOk()->json('data');
        $new = $this->tokenOf($fresh);

        $this->assertNotSame($old, $new);
        $this->anonymous("/api/public/shares/{$old}")->assertStatus(404);
        $this->anonymous("/api/public/shares/{$new}")->assertOk();

        $log = AuditLog::where('subject_type', 'share_link')->where('action', 'update')->latest('id')->first();
        $this->assertTrue((bool) ($log?->new_values['regenerated'] ?? false), 'ახალი ბმული ჟურნალში კვალს არ ტოვებს');
    }

    /** რედაქტირება URL-ს არ ცვლის; ვადა „ახლიდან" ითვლება */
    public function test_editing_keeps_the_url(): void
    {
        $link = $this->create(['movie' => ['scope' => 'all']]);

        $edited = $this->actingAs($this->owner)
            ->patchJson("/api/share-links/{$link['id']}", [
                'name' => 'Renamed',
                'domains' => ['movie' => ['scope' => 'favorite'], 'anime' => ['scope' => 'all']],
                'expires_days' => null,
            ])
            ->assertOk()
            ->json('data');

        $this->assertSame($link['url'], $edited['url']);
        $this->assertSame('Renamed', $edited['name']);
        $this->assertNull($edited['expires_at']);
        $this->assertSame(['movie', 'anime'], array_keys($edited['domains']));
    }

    public function test_the_switch_stops_new_links(): void
    {
        config(['mediary.share_links' => false]);

        $this->actingAs($this->owner)
            ->postJson('/api/share-links', ['domains' => ['movie' => ['scope' => 'all']]])
            ->assertStatus(409)
            ->assertJson(['message' => 'share_links_disabled']);

        $this->actingAs($this->owner)->getJson('/api/share-links')->assertOk()->assertJsonPath('meta.enabled', false);
    }

    /** ანიმეც და სერიალიც — და არა მხოლოდ ფილმი */
    public function test_series_and_anime_are_shared_too(): void
    {
        Series::create(['user_id' => $this->owner->id])->translations()->create(['locale' => 'en', 'title' => 'A series']);
        Anime::create(['user_id' => $this->owner->id])->translations()->create(['locale' => 'en', 'title' => 'An anime']);

        $token = $this->tokenOf($this->create(['series' => ['scope' => 'all'], 'anime' => ['scope' => 'all']]));

        $this->assertSame('A series', $this->actingAs($this->stranger)->getJson("/api/public/shares/{$token}/series")->json('data.0.title_en'));
        $this->assertSame('An anime', $this->actingAs($this->stranger)->getJson("/api/public/shares/{$token}/anime")->json('data.0.title_en'));
        $this->actingAs($this->stranger)->getJson("/api/public/shares/{$token}/movie")->assertStatus(404);
    }
}
