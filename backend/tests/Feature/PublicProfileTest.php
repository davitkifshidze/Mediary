<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **Tasks §16.1 — საჯარო პროფილი.**
 *
 * ტესტი სამ ფენას იჭერს (პროფილი → მოდული → ჩანაწერი) და იმ ერთ ხაფანგს,
 * რომელიც `Tasks.md`-ში ⚠️-ით იყო ჩაწერილი: `BelongsToUser`-ის global scope
 * `owner` ავტორიზაციის გარეშე **საერთოდ არ მუშაობს**, ე.ი. საჯარო query-ს
 * `user_id` ცხადად უნდა ეწეროს — თორემ ერთი პროფილი ყველას ბიბლიოთეკას აჩვენებდა.
 */
class PublicProfileTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;

    private User $bob;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->alice = $this->makeUser('alice');
        $this->bob = $this->makeUser('bob');
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);

        $ids = Module::whereIn('key', ['movie', 'series', 'note'])
            ->pluck('id')
            ->mapWithKeys(fn ($id) => [$id => ['enabled_at' => now()]])
            ->all();
        $user->modules()->sync($ids);

        return $user->refresh();
    }

    private function makeMovie(User $owner, string $title, string $visibility = 'private'): Movie
    {
        $movie = Movie::create([
            'user_id' => $owner->id,
            'year' => 2020,
            'visibility' => $visibility,
        ]);
        $movie->setTranslation('en', ['title' => $title]);

        return $movie;
    }

    /** მოდულის გასაჯაროება — იმას აკეთებს, რასაც `PUT /modules/{key}/public` */
    private function publishModule(User $user, string $key): void
    {
        $id = Module::where('key', $key)->value('id');
        $user->modules()->syncWithoutDetaching([$id => ['is_public' => true]]);
    }

    /* ---------- §6.1 — ხილვადობის ცენტრალური მართვა ---------- */

    /**
     * სია მხოლოდ **საკუთარ** ჩანაწერებს აჩვენებს და ჯამებს ფილტრამდე თვლის.
     *
     * ⚠️ ეს იმ ხაფანგს იჭერს, რაც `PublicProfileService`-ს აქვს: ავტორიზებულ
     * კონტექსტში `owner` scope მუშაობს, მაგრამ თუ ვინმე ოდესმე
     * `withoutGlobalScope('owner')`-ს დაამატებს, სხვისი ჩანაწერიც გამოჩნდება.
     */
    public function test_visibility_list_shows_only_my_records(): void
    {
        $this->makeMovie($this->alice, 'Dune', 'public');
        $this->makeMovie($this->alice, 'Arrival');
        $this->makeMovie($this->bob, 'Theirs', 'public');

        $body = $this->actingAs($this->alice)
            ->getJson('/api/visibility/movie')
            ->assertOk()
            ->json();

        $titles = collect($body['data'])->pluck('title_en')->sort()->values()->all();

        $this->assertSame(['Arrival', 'Dune'], $titles);
        $this->assertSame(2, $body['meta']['total']);
        $this->assertSame(1, $body['meta']['public']);
        $this->assertSame(1, $body['meta']['private']);
    }

    /** ძებნა თარგმანების ცხრილში ეძებს (ფილმს სათაური ცალკე ცხრილში აქვს) */
    public function test_visibility_list_search_and_filter(): void
    {
        $this->makeMovie($this->alice, 'Dune', 'public');
        $this->makeMovie($this->alice, 'Arrival');

        $found = $this->actingAs($this->alice)
            ->getJson('/api/visibility/movie?q=dun')
            ->assertOk()
            ->json('data');
        $this->assertCount(1, $found);
        $this->assertSame('Dune', $found[0]['title_en']);

        $private = $this->actingAs($this->alice)
            ->getJson('/api/visibility/movie?only=private')
            ->assertOk()
            ->json('data');
        $this->assertCount(1, $private);
        $this->assertSame('Arrival', $private[0]['title_en']);
    }

    /**
     * მასობრივი გადართვა: `ids` — მხოლოდ მონიშნულებზე, `all` — მთელ დომენზე.
     * ⚠️ **ცარიელი მონიშვნა „ყველაფერს" არ ნიშნავს** — 422, და არაფერი იცვლება.
     */
    public function test_bulk_visibility_requires_an_explicit_scope(): void
    {
        $one = $this->makeMovie($this->alice, 'Dune');
        $two = $this->makeMovie($this->alice, 'Arrival');

        $this->actingAs($this->alice)
            ->patchJson('/api/visibility/movie', ['visibility' => 'public'])
            ->assertStatus(422);
        $this->assertSame('private', $one->refresh()->visibility);

        $this->actingAs($this->alice)
            ->patchJson('/api/visibility/movie', ['visibility' => 'public', 'ids' => [$one->id]])
            ->assertOk()
            ->assertJsonPath('updated', 1);
        $this->assertSame('public', $one->refresh()->visibility);
        $this->assertSame('private', $two->refresh()->visibility);

        $this->actingAs($this->alice)
            ->patchJson('/api/visibility/movie', ['visibility' => 'public', 'all' => true])
            ->assertOk()
            ->assertJsonPath('updated', 2);
        $this->assertSame('public', $two->refresh()->visibility);
    }

    /** სხვისი id მონიშვნაში ჩუმად გამოტოვდება და არა 404 — ციკლი არ უნდა გაწყდეს */
    public function test_bulk_visibility_never_touches_another_users_record(): void
    {
        $theirs = $this->makeMovie($this->bob, 'Theirs');

        $this->actingAs($this->alice)
            ->patchJson('/api/visibility/movie', ['visibility' => 'public', 'ids' => [$theirs->id]])
            ->assertOk()
            ->assertJsonPath('updated', 0);

        $this->assertSame('private', $theirs->refresh()->visibility);
    }

    /** `note` საერთოდ არ არის დომენი (§16.5) — არც სია და არც გადართვა */
    public function test_note_domain_has_no_visibility_endpoints(): void
    {
        $this->actingAs($this->alice)->getJson('/api/visibility/note')->assertNotFound();
        $this->actingAs($this->alice)
            ->patchJson('/api/visibility/note', ['visibility' => 'public', 'all' => true])
            ->assertNotFound();
    }

    /* ---------- ფენა 1: თვითონ პროფილი ---------- */

    public function test_private_profile_is_404_even_when_records_are_public(): void
    {
        $this->makeMovie($this->alice, 'Dune', 'public');
        $this->publishModule($this->alice, 'movie');

        $this->getJson('/api/public/profiles/alice')->assertStatus(404);
    }

    public function test_public_profile_is_readable_without_authentication(): void
    {
        $this->alice->forceFill(['profile_visibility' => 'public', 'bio' => 'ფილმების მოყვარული'])->save();

        $this->getJson('/api/public/profiles/alice')
            ->assertOk()
            ->assertJsonPath('profile.username', 'alice')
            ->assertJsonPath('profile.bio', 'ფილმების მოყვარული')
            // მოდული ჯერ არ გაუსაჯაროებია → არცერთი დომენი არ ჩანს
            ->assertJsonPath('domains', []);
    }

    public function test_inactive_account_is_hidden(): void
    {
        $this->alice->forceFill(['profile_visibility' => 'public', 'is_active' => false])->save();

        $this->getJson('/api/public/profiles/alice')->assertStatus(404);
    }

    /* ---------- ფენა 2: მოდული ---------- */

    public function test_module_must_be_public_for_the_domain_to_appear(): void
    {
        $this->alice->forceFill(['profile_visibility' => 'public'])->save();
        $this->makeMovie($this->alice, 'Dune', 'public');

        // მოდული ჯერ პირადია — დომენიც 404-ია
        $this->getJson('/api/public/profiles/alice/movie')->assertStatus(404);

        $this->publishModule($this->alice, 'movie');

        $this->getJson('/api/public/profiles/alice')
            ->assertOk()
            ->assertJsonPath('domains', ['movie'])
            ->assertJsonPath('counts.movie', 1);
    }

    /**
     * ⚠️ 16.5-ის მკაცრი წესი: `note` პირად დოკუმენტებს ინახავს და საჯარო
     * პროფილზე **საერთოდ არ ჩნდება** — `is_public = true`-საც კი არ აქვს ეფექტი.
     */
    public function test_note_module_can_never_become_public(): void
    {
        $this->alice->forceFill(['profile_visibility' => 'public'])->save();
        $this->publishModule($this->alice, 'note');

        NoteEntry::create([
            'user_id' => $this->alice->id,
            'title' => 'პასპორტის ნომერი',
            'visibility' => 'public',
        ]);

        $this->getJson('/api/public/profiles/alice')
            ->assertOk()
            ->assertJsonPath('domains', []);

        $this->getJson('/api/public/profiles/alice/note')->assertStatus(404);

        // endpoint-იც უარს ამბობს, რომ მდგომარეობა ჩუმად არ დარჩეს
        $this->actingAs($this->alice)
            ->putJson('/api/modules/note/public', ['is_public' => true])
            ->assertStatus(422)
            ->assertJsonPath('message', 'module_not_shareable');
    }

    /* ---------- ფენა 3: ჩანაწერი ---------- */

    public function test_only_public_records_are_listed(): void
    {
        $this->alice->forceFill(['profile_visibility' => 'public'])->save();
        $this->publishModule($this->alice, 'movie');

        $this->makeMovie($this->alice, 'Dune', 'public');
        $this->makeMovie($this->alice, 'ჩემი საიდუმლო', 'private');

        $res = $this->getJson('/api/public/profiles/alice/movie')->assertOk();

        $this->assertSame(1, $res->json('meta.total'));
        $this->assertSame('Dune', $res->json('data.0.title_en'));
    }

    /**
     * ⚠️ **ამ ტესტის გამო არსებობს `withoutGlobalScope('owner')` + ცხადი `user_id`.**
     * ავტორიზაციის გარეშე scope გამორთულია, ე.ი. ცხადი ფილტრის გარეშე ბობის
     * საჯარო ფილმი ელისის პროფილზე გამოჩნდებოდა.
     */
    public function test_another_users_records_never_leak_into_the_profile(): void
    {
        $this->alice->forceFill(['profile_visibility' => 'public'])->save();
        $this->publishModule($this->alice, 'movie');

        $this->makeMovie($this->alice, 'Dune', 'public');
        $this->makeMovie($this->bob, 'Bob Public', 'public');

        $res = $this->getJson('/api/public/profiles/alice/movie')->assertOk();

        $this->assertSame(1, $res->json('meta.total'));
        $this->assertSame('Dune', $res->json('data.0.title_en'));
    }

    /**
     * იგივე მეორე მხრიდან: **შესულ** user-ს სხვისი პროფილი უნდა უჩანდეს და
     * არა თავისი (scope სხვაგვარად მის ბიბლიოთეკაზე მოჭრიდა).
     */
    public function test_logged_in_visitor_sees_the_profile_owners_records(): void
    {
        $this->alice->forceFill(['profile_visibility' => 'public'])->save();
        $this->publishModule($this->alice, 'movie');
        $this->makeMovie($this->alice, 'Dune', 'public');
        $this->makeMovie($this->bob, 'Bob Public', 'public');

        $res = $this->actingAs($this->bob)
            ->getJson('/api/public/profiles/alice/movie')
            ->assertOk();

        $this->assertSame(1, $res->json('meta.total'));
        $this->assertSame('Dune', $res->json('data.0.title_en'));
    }

    /* ---------- გადამრთველები ---------- */

    public function test_owner_toggles_record_visibility(): void
    {
        $movie = $this->makeMovie($this->alice, 'Dune');

        $this->actingAs($this->alice)
            ->patchJson("/api/visibility/movie/{$movie->id}", ['visibility' => 'public'])
            ->assertOk()
            ->assertJsonPath('visibility', 'public');

        $this->assertSame('public', $movie->fresh()->visibility);
    }

    public function test_visibility_toggle_on_another_users_record_is_404(): void
    {
        $movie = $this->makeMovie($this->bob, 'Bob Movie');

        $this->actingAs($this->alice)
            ->patchJson("/api/visibility/movie/{$movie->id}", ['visibility' => 'public'])
            ->assertStatus(404);

        $this->assertSame('private', $movie->fresh()->visibility);
    }

    public function test_profile_visibility_is_saved_from_the_profile_form(): void
    {
        $this->actingAs($this->alice)
            ->patchJson('/api/auth/profile', [
                'profile_visibility' => 'public',
                'bio' => 'გამარჯობა',
            ])
            ->assertOk()
            ->assertJsonPath('data.profile_visibility', 'public')
            ->assertJsonPath('data.bio', 'გამარჯობა');
    }

    /** 1.3 (🔗 16) — abuse-ის შემთხვევაში ადმინს იძულებით დაპრივატება შეუძლია */
    public function test_admin_can_force_a_profile_private(): void
    {
        $admin = $this->makeUser('admin');
        $admin->assignRole('super_admin')->save();

        $this->alice->forceFill(['profile_visibility' => 'public'])->save();

        $this->actingAs($admin)
            ->patchJson("/api/admin/users/{$this->alice->id}", ['profile_visibility' => 'private'])
            ->assertOk();

        $this->assertSame('private', $this->alice->fresh()->profile_visibility);
        $this->getJson('/api/public/profiles/alice')->assertStatus(404);
    }

    /** ერთი ცვლადი მთელ მექანიზმს თიშავს (`PUBLIC_PROFILES=false`) */
    public function test_config_switch_disables_every_public_endpoint(): void
    {
        $this->alice->forceFill(['profile_visibility' => 'public'])->save();
        $this->publishModule($this->alice, 'movie');
        $this->makeMovie($this->alice, 'Dune', 'public');

        config(['mediary.public_profiles' => false]);

        $this->getJson('/api/public/profiles/alice')->assertStatus(404);
        $this->getJson('/api/public/profiles/alice/movie')->assertStatus(404);
    }

    /**
     * **§6 ფაზა 4 → §16 — per-field საჯაროობა.**
     *
     * ⚠️ წყვეტს **ჩანაწერის მფლობელი** და არა მნახველი: საჯარო პროფილზე
     * ჩემი ველი ჩემი არჩევანით ჩანს ან იმალება.
     */
    public function test_owner_can_hide_a_field_from_the_public_card(): void
    {
        $this->alice->forceFill(['profile_visibility' => 'public'])->save();
        $this->publishModule($this->alice, 'movie');

        $movie = $this->makeMovie($this->alice, 'Alien', 'public');
        $movie->forceFill(['rating' => 8.5])->save();

        // ჯერ ჩანს
        $card = $this->getJson('/api/public/profiles/alice/movie')
            ->assertOk()
            ->json('data.0');
        $this->assertArrayHasKey('rating', $card);

        // მფლობელი მალავს
        $this->actingAs($this->alice)
            ->putJson('/api/modules/movie/fields', ['fields' => ['rating' => ['public' => false]]])
            ->assertOk();

        $hidden = $this->getJson('/api/public/profiles/alice/movie')
            ->assertOk()
            ->json('data.0');

        $this->assertArrayNotHasKey('rating', $hidden);
        // ⚠️ `id`/`domain` არასდროს იმალება — ბარათი მათ გარეშე ვერ დაიხატება
        $this->assertArrayHasKey('id', $hidden);
        $this->assertArrayHasKey('title_en', $hidden);
    }
}
