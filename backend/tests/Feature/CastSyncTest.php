<?php

namespace Tests\Feature;

use App\Jobs\RunBatchItem;
use App\Models\AuditLog;
use App\Models\CastMember;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Series;
use App\Models\User;
use App\Services\Cast\CastEnricher;
use App\Services\Gallery\GalleryFetcher;
use App\Services\Sync\ItemSyncer;
use App\Services\Translation\ItemTranslator;
use App\Support\BackgroundProcess;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * **მსახიობების მონაცემების მასობრივი სინქრონიზაცია** (Tasks §39).
 *
 * ⚠️ **`Http::fake()` ერთხელ და ერთი stub-ით** — FEAT-10-ის გაკვეთილი:
 * fake **ამატებს** stub-ებს და პირველი დამთხვეული იმარჯვებს, ე.ი. მეორე
 * `Http::fake()` ჩუმად არაფერს ცვლიდა. პასუხი `$this->people`-დან მოდის და
 * ტესტი მხოლოდ ამ მასივს ცვლის.
 */
class CastSyncTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;

    private User $bob;

    /** @var array<int, array<string, mixed>|null> TMDB-ის `/person/{id}` პასუხი (null → 404) */
    private array $people = [];

    /** @var array<int, int> სპეციალური სტატუსი (მაგ. 500) */
    private array $statuses = [];

    /** რამდენჯერ ითხოვა TMDB-მ პიროვნება */
    private int $personCalls = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        Storage::fake('public');

        $this->alice = $this->makeUser('alice', ['movie', 'series']);
        $this->bob = $this->makeUser('bob', ['movie']);

        // Tasks §30 — გასაღები ანგარიშისაა: ორივეს თავისი
        $this->giveCredential($this->alice, 'tmdb');
        $this->giveCredential($this->bob, 'tmdb');

        Http::fake([
            'image.tmdb.org/*' => fn () => Http::response('jpeg-bytes', 200, ['Content-Type' => 'image/jpeg']),
            'api.themoviedb.org/3/person/*' => function ($request) {
                $this->personCalls++;
                preg_match('#/person/(\d+)#', $request->url(), $m);
                $id = (int) ($m[1] ?? 0);

                if (isset($this->statuses[$id])) {
                    return Http::response(['status_message' => 'boom'], $this->statuses[$id]);
                }

                $person = $this->people[$id] ?? null;

                if ($person === null) {
                    return Http::response(['status_message' => 'not found'], 404);
                }

                // ქართული პასუხი — მხოლოდ სახელი, ისიც თუ ტესტმა მისცა
                if (str_contains($request->url(), 'language=ka')) {
                    return Http::response(['id' => $id, 'name' => $person['name_ka'] ?? $person['name'] ?? '']);
                }

                return Http::response($person);
            },
        ]);
    }

    private function makeUser(string $name, array $modules): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', $modules)->pluck('id')->all());

        return $user->refresh();
    }

    private function movie(User $owner, string $title, array $cast): Movie
    {
        $movie = Movie::create(['user_id' => $owner->id, 'tmdb_id' => random_int(1, 99999), 'year' => 2000]);
        $movie->translations()->create(['locale' => 'en', 'title' => $title]);
        $movie->cast()->sync(collect($cast)->mapWithKeys(fn (CastMember $m, int $i) => [
            $m->id => ['character' => 'X', 'billing_order' => $i],
        ])->all());

        return $movie;
    }

    private function actor(?int $tmdbId, string $name, array $extra = []): CastMember
    {
        return CastMember::create(['tmdb_person_id' => $tmdbId, 'name' => $name, ...$extra]);
    }

    private function person(int $id, array $extra = []): array
    {
        return [
            'id' => $id,
            'name' => "Person {$id}",
            'birthday' => '1974-10-28',
            'place_of_birth' => 'Tbilisi',
            'biography' => "Bio {$id}",
            'known_for_department' => 'Acting',
            'popularity' => 12.5,
            'homepage' => null,
            'profile_path' => "/p{$id}.jpg",
            'external_ids' => ['imdb_id' => "nm{$id}", 'instagram_id' => "insta{$id}"],
            ...$extra,
        ];
    }

    private function plan(User $user, array $body = []): TestResponse
    {
        return $this->actingAs($user)->postJson('/api/cast/sync/plan', $body);
    }

    private function ids(TestResponse $res): array
    {
        return collect($res->json('items'))->pluck('id')->sort()->values()->all();
    }

    /* ================= ფარგლები და გეგმა (§39.1) ================= */

    public function test_the_default_scope_is_the_actors_that_were_never_synced(): void
    {
        $fresh = $this->actor(11, 'Fresh');
        $done = $this->actor(22, 'Done', ['details_synced_at' => now()->subDay()]);
        $noId = $this->actor(null, 'Hand added');
        $this->movie($this->alice, 'A', [$fresh, $done, $noId]);

        $res = $this->plan($this->alice)->assertOk();

        $this->assertSame([$fresh->id], $this->ids($res));
        // ⚠️ TMDB-ის id-ის გარეშე — ჩუმად არ ქრება, ითვლება
        $res->assertJsonPath('skipped_without_tmdb', 1)
            ->assertJsonPath('pool_total', 3)
            ->assertJsonPath('never_synced', 2)
            ->assertJsonPath('items.0.type', 'actor');
    }

    public function test_the_stale_scope_takes_old_and_never_synced_actors(): void
    {
        $never = $this->actor(11, 'Never');
        $old = $this->actor(22, 'Old', ['details_synced_at' => now()->subDays(40)]);
        $recent = $this->actor(33, 'Recent', ['details_synced_at' => now()->subDays(5)]);
        $this->movie($this->alice, 'A', [$never, $old, $recent]);

        $res = $this->plan($this->alice, ['scope' => 'stale', 'days' => 30])->assertOk();

        $this->assertSame([$never->id, $old->id], $this->ids($res));

        $all = $this->plan($this->alice, ['scope' => 'all'])->assertOk();
        $this->assertCount(3, $all->json('items'));
    }

    /**
     * ⚠️ **სხვისი ჩანაწერის მსახიობი ჩემს ფარგლებში ვერ ხვდება** (§39.7) —
     * `cast_members` გლობალურია, ე.ი. უფილტრო სია სხვის ბიბლიოთეკასაც
     * გამოაჩენდა; კონკრეტული id-ითაც კი.
     */
    public function test_another_accounts_actor_never_enters_my_scope(): void
    {
        $mine = $this->actor(11, 'Mine');
        $theirs = $this->actor(22, 'Theirs');
        $this->movie($this->alice, 'Mine', [$mine]);
        $this->movie($this->bob, 'Theirs', [$theirs]);

        $this->assertSame([$mine->id], $this->ids($this->plan($this->alice, ['scope' => 'all'])));

        $res = $this->plan($this->alice, ['scope' => 'ids', 'ids' => [$mine->id, $theirs->id]])->assertOk();
        $this->assertSame([$mine->id], $this->ids($res));
        $this->assertNotContains($theirs->id, collect($res->json('cast'))->pluck('id')->all());
    }

    public function test_an_empty_selection_is_nothing_and_not_everyone(): void
    {
        $this->movie($this->alice, 'A', [$this->actor(11, 'One')]);

        $this->plan($this->alice, ['scope' => 'ids', 'ids' => []])
            ->assertOk()
            ->assertJsonPath('count', 0);
    }

    public function test_the_domain_narrows_the_pool(): void
    {
        $filmActor = $this->actor(11, 'Film');
        $showActor = $this->actor(22, 'Show');
        $this->movie($this->alice, 'Film', [$filmActor]);

        $series = Series::create(['user_id' => $this->alice->id, 'tmdb_id' => 5]);
        $series->translations()->create(['locale' => 'en', 'title' => 'Show']);
        $series->cast()->sync([$showActor->id => ['character' => 'X', 'billing_order' => 0]]);

        $this->assertSame([$filmActor->id], $this->ids($this->plan($this->alice, ['types' => ['movie']])));
        $this->assertCount(2, $this->plan($this->alice)->json('items'));
    }

    public function test_the_plan_needs_an_enabled_media_module(): void
    {
        $nobody = $this->makeUser('nobody', ['note']);

        $this->plan($nobody)->assertStatus(403)->assertJsonPath('message', 'module_disabled');
    }

    /* ================= ერთი ნაბიჯი (§39.2, §39.4) ================= */

    public function test_a_step_fills_the_chosen_fields_and_stamps_the_actor(): void
    {
        $actor = $this->actor(11, 'One');
        $this->people[11] = $this->person(11, ['name_ka' => 'ერთი']);

        $this->actingAs($this->alice)->postJson("/api/cast/sync/{$actor->id}")
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('skipped', false)
            ->assertJsonPath('result', CastEnricher::UPDATED);

        $actor->refresh();
        $this->assertSame('Bio 11', $actor->biography);
        $this->assertSame('1974-10-28', $actor->birthday?->toDateString());
        $this->assertSame('nm11', $actor->imdb_id);
        $this->assertSame('insta11', $actor->profile_links['instagram_id'] ?? null);
        $this->assertSame('ერთი', $actor->name_ka);
        // ნაგულისხმევი ოთხივე ჯგუფია — ფოტოც ჩამოვიდა
        $this->assertSame('cast/photos/11.jpg', $actor->photo_path);
        Storage::disk('public')->assertExists('cast/photos/11.jpg');
        $this->assertNotNull($actor->details_synced_at);
    }

    /** ⚠️ ცარიელი პასუხი არსებულს არ შლის — ლექსიკონი ყველა ანგარიშისაა (§39.4) */
    public function test_an_empty_answer_never_clears_an_existing_value(): void
    {
        $actor = $this->actor(11, 'One', ['biography' => 'Old bio', 'place_of_birth' => 'Kutaisi']);
        $this->people[11] = $this->person(11, ['biography' => '', 'place_of_birth' => null, 'birthday' => '']);

        $this->actingAs($this->alice)->postJson("/api/cast/sync/{$actor->id}", ['fields' => ['details', 'biography']])
            ->assertOk();

        $actor->refresh();
        $this->assertSame('Old bio', $actor->biography);
        $this->assertSame('Kutaisi', $actor->place_of_birth);
        $this->assertNotNull($actor->details_synced_at);
    }

    public function test_only_the_chosen_groups_are_written(): void
    {
        $actor = $this->actor(11, 'One');
        $this->people[11] = $this->person(11);

        $this->actingAs($this->alice)->postJson("/api/cast/sync/{$actor->id}", ['fields' => ['links']])
            ->assertOk();

        $actor->refresh();
        $this->assertSame('insta11', $actor->profile_links['instagram_id'] ?? null);
        $this->assertNull($actor->biography, 'ბიოგრაფია არჩეული არ იყო');
        $this->assertNull($actor->imdb_id, 'პირადი მონაცემები არჩეული არ იყო');
        $this->assertNull($actor->photo_path, 'ფოტო არჩეული არ იყო');
    }

    /**
     * ⚠️ **მეორე გაშვებაზე „ვისაც ჯერ არ განახლებია" ცარიელია** (§39.7) —
     * თორემ რიგი იმავე მსახიობებს უსასრულოდ ჩაყრიდა. 404-იც ითვლება:
     * „ვკითხეთ და TMDB-მ არ იცის".
     */
    public function test_never_synced_is_empty_on_the_second_run_even_after_a_404(): void
    {
        $known = $this->actor(11, 'Known');
        $gone = $this->actor(22, 'Gone');
        $this->movie($this->alice, 'A', [$known, $gone]);
        $this->people[11] = $this->person(11);

        foreach ($this->plan($this->alice)->json('items') as $item) {
            $this->actingAs($this->alice)->postJson("/api/cast/sync/{$item['id']}")->assertOk();
        }

        $this->assertSame(CastEnricher::EMPTY, $this->actingAs($this->alice)
            ->postJson("/api/cast/sync/{$gone->id}")->json('result'));
        $this->assertNotNull($gone->refresh()->details_synced_at);

        $this->plan($this->alice)->assertOk()->assertJsonPath('count', 0);
    }

    /** ⚠️ წყაროს ჩავარდნა დროებითია — ნიშანი არ იწერება და რიგი ამას ჩავარდნად ხედავს */
    public function test_a_source_failure_is_a_failure_and_leaves_no_stamp(): void
    {
        $actor = $this->actor(11, 'One');
        $this->statuses[11] = 500;

        $this->actingAs($this->alice)->postJson("/api/cast/sync/{$actor->id}")
            ->assertOk()
            ->assertJsonPath('ok', false)
            ->assertJsonPath('error', 'tmdb_unavailable');

        $this->assertNull($actor->refresh()->details_synced_at);
    }

    public function test_an_unchanged_actor_is_skipped_and_popularity_is_not_a_change(): void
    {
        $actor = $this->actor(11, 'One');
        $this->people[11] = $this->person(11);
        $this->actingAs($this->alice)->postJson("/api/cast/sync/{$actor->id}")->assertJsonPath('result', CastEnricher::UPDATED);

        // TMDB-ის პოპულარობა ყოველდღე იცვლება — ეს „განახლებად" არ ითვლება
        $this->people[11]['popularity'] = 99.9;

        $this->actingAs($this->alice)->postJson("/api/cast/sync/{$actor->id}")
            ->assertOk()
            ->assertJsonPath('result', CastEnricher::UNCHANGED)
            ->assertJsonPath('skipped', true);
        $this->assertSame(99.9, $actor->refresh()->popularity);
    }

    public function test_the_photo_is_downloaded_only_when_missing_unless_overwritten(): void
    {
        $actor = $this->actor(11, 'One');
        $this->people[11] = $this->person(11);

        $this->actingAs($this->alice)->postJson("/api/cast/sync/{$actor->id}", ['fields' => ['photo']])
            ->assertJsonPath('result', CastEnricher::UPDATED);
        $this->assertSame('cast/photos/11.jpg', $actor->refresh()->photo_path);
        // ⚠️ ფოტო ფაქტი არაა — „ვისაც ჯერ არ განახლებია"-დან ის მსახიობს არ ამოაგდებს
        $this->assertNull($actor->details_synced_at);

        $this->actingAs($this->alice)->postJson("/api/cast/sync/{$actor->id}", ['fields' => ['photo']])
            ->assertJsonPath('result', CastEnricher::UNCHANGED);

        $this->actingAs($this->alice)->postJson("/api/cast/sync/{$actor->id}", ['fields' => ['photo'], 'overwrite_photo' => true])
            ->assertJsonPath('result', CastEnricher::UPDATED);
    }

    public function test_an_actor_without_a_tmdb_id_is_skipped(): void
    {
        $actor = $this->actor(null, 'Hand added');

        $this->actingAs($this->alice)->postJson("/api/cast/sync/{$actor->id}")
            ->assertOk()
            ->assertJsonPath('result', CastEnricher::NO_ID)
            ->assertJsonPath('skipped', true);
        $this->assertSame(0, $this->personCalls);
    }

    public function test_an_empty_field_list_is_a_422(): void
    {
        $actor = $this->actor(11, 'One');

        $this->actingAs($this->alice)->postJson("/api/cast/sync/{$actor->id}", ['fields' => []])
            ->assertStatus(422);
    }

    /* ================= ჟურნალი (§39.6) ================= */

    /**
     * ⚠️ **ერთი რიგი გაშვებაზე** — 300 მსახიობი ჟურნალში 300 `update`-ად
     * ჩაიწერებოდა. ცალკე ღილაკი კი ჩვეულებრივ `update`-ს წერს.
     */
    public function test_a_run_writes_one_audit_row_and_the_steps_write_none(): void
    {
        $one = $this->actor(11, 'One');
        $two = $this->actor(22, 'Two');
        $this->movie($this->alice, 'A', [$one, $two]);
        $this->people[11] = $this->person(11);
        $this->people[22] = $this->person(22);

        // გადახედვა ჟურნალს არ ეხება — მხოლოდ გაშვება
        $this->plan($this->alice)->assertOk();
        $this->assertSame(0, AuditLog::where('action', AuditLog::ACTION_CAST_SYNC)->count());

        $items = $this->plan($this->alice, ['start' => true, 'fields' => ['details', 'biography']])->json('items');
        $before = AuditLog::count();

        foreach ($items as $item) {
            $this->actingAs($this->alice)->postJson("/api/cast/sync/{$item['id']}", ['fields' => ['details', 'biography']])
                ->assertJsonPath('result', CastEnricher::UPDATED);
        }

        $this->assertSame($before, AuditLog::count(), 'ნაბიჯებმა ჟურნალში არაფერი უნდა დაწერონ');

        $row = AuditLog::where('action', AuditLog::ACTION_CAST_SYNC)->sole();
        $this->assertSame('cast', $row->module);
        $this->assertSame($this->alice->id, $row->user_id);
        $this->assertSame(2, $row->new_values['count']);
        $this->assertSame('details, biography', $row->new_values['fields']);

        // ცალკე ღილაკი — ჩვეულებრივი რედაქტირება, ერთი რიგი
        $this->people[11]['biography'] = 'New bio';
        $this->actingAs($this->alice)->postJson("/api/cast/{$one->id}/resync")->assertOk()->assertJsonPath('updated', true);
        $this->assertSame($before + 1, AuditLog::count());
    }

    /* ================= ერთი ღილაკი და ჭერი ================= */

    public function test_the_single_button_keeps_its_old_shape_and_leaves_the_photo_alone(): void
    {
        $actor = $this->actor(11, 'One');
        $this->people[11] = $this->person(11);

        $this->actingAs($this->alice)->postJson("/api/cast/{$actor->id}/resync")
            ->assertOk()
            ->assertJsonPath('updated', true)
            ->assertJsonPath('actor.biography', 'Bio 11');

        $this->assertNull($actor->refresh()->photo_path, 'ღილაკი ფოტოს არასდროს ეხებოდა');
    }

    /** §39.5 — ორივე გზა TMDB-ის საერთო ბიუჯეტზე დგას */
    public function test_both_person_routes_are_throttled(): void
    {
        foreach (['api/cast/sync/{castMember}', 'api/cast/{castMember}/resync'] as $uri) {
            $route = collect(Route::getRoutes()->getRoutes())
                ->first(fn ($r) => $r->uri() === $uri && in_array('POST', $r->methods(), true));

            $this->assertNotNull($route, $uri);
            $this->assertContains('throttle:tmdb-person', $route->gatherMiddleware(), $uri);
        }
    }

    /* ================= სერვერზე გადაცემა (§39.3) ================= */

    public function test_a_cast_batch_is_accepted_with_actor_items_only(): void
    {
        Bus::fake();
        config(['queue.default' => 'database']);
        $this->app->bind(BackgroundProcess::class, fn () => new class extends BackgroundProcess
        {
            public function __construct() {}

            public function dispatch(array $command): bool
            {
                return true;
            }
        });

        $actor = $this->actor(11, 'One');

        $this->actingAs($this->alice)->postJson('/api/batches', [
            'kind' => 'cast',
            'items' => [['type' => 'actor', 'id' => $actor->id]],
            'options' => ['fields' => ['biography']],
        ])->assertStatus(202);

        Bus::assertBatched(fn ($batch) => $batch->name === 'cast' && $batch->jobs->count() === 1);

        // მედია-დომენი მსახიობის პარტიაში არ ჯდება — და პირიქით
        $this->actingAs($this->alice)->postJson('/api/batches', [
            'kind' => 'cast',
            'items' => [['type' => 'movie', 'id' => 1]],
        ])->assertStatus(422);
        $this->actingAs($this->alice)->postJson('/api/batches', [
            'kind' => 'sync',
            'items' => [['type' => 'actor', 'id' => $actor->id]],
        ])->assertStatus(422);
    }

    public function test_the_cast_job_updates_the_actor_quietly(): void
    {
        $actor = $this->actor(11, 'One');
        $this->people[11] = $this->person(11);
        $before = AuditLog::count();

        $job = new RunBatchItem(
            userId: (int) $this->alice->getKey(),
            kind: RunBatchItem::KIND_CAST,
            type: RunBatchItem::ACTOR,
            recordId: (int) $actor->getKey(),
            options: ['fields' => ['biography']],
        );

        $job->handle(
            app(ItemSyncer::class),
            app(ItemTranslator::class),
            app(GalleryFetcher::class),
        );

        $this->assertSame('Bio 11', $actor->refresh()->biography);
        $this->assertSame($before, AuditLog::count(), 'ფონური ნაბიჯიც ჟურნალს არ ეხება');
    }
}
