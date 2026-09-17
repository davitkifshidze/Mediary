<?php

namespace Tests\Feature;

use App\Jobs\RunBatchItem;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Role;
use App\Models\User;
use App\Services\Gallery\GalleryFetcher;
use App\Services\Sync\ItemSyncer;
use App\Services\Translation\ItemTranslator;
use App\Support\BackgroundProcess;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

/**
 * **ფონური პარტია (აუდიტი 2026-09-14, §D1).**
 *
 * ⚠️ **რას ხსნის:** სინქრონი/გალერეა/თარგმანი ბრაუზერის ტაბში ტრიალებდა და
 * ტაბის დახურვაზე ჩერდებოდა. აქ იგივე გეგმა სერვერს გადაეცემა.
 *
 * ⚠️ **`Bus::fake()` არ გამოიყენება ყველგან**: ის job-ს **არ უშვებს**, ე.ი.
 * ყველაზე მნიშვნელოვანი წესი — „job-მა მომხმარებელი უნდა ჩაიცვას" —
 * დაუფარავი დარჩებოდა. ის ტესტი `handle()`-ს პირდაპირ იძახებს.
 */
class BatchQueueTest extends TestCase
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

        // ⚠️ ნამდვილი პროცესი ტესტში არ ეშვება — `queue:work` მანქანაზე დაიწყებდა
        $this->fakeWorker(true);

        /* ⚠️ **`database` და არა `sync`.** `phpunit.xml` `QUEUE_CONNECTION=sync`-ს
           აყენებს, ე.ი. `dispatch()` job-ს **მაშინვე** ასრულებდა — პარტია
           დაბადებისთანავე „დასრულებული" იყო და პროგრესის ტესტი უაზრო.
           `database` ზუსტად პროდაქშენის ქცევაა: job-ი რიგში წერია და
           worker-ს ელოდება. */
        config(['queue.default' => 'database']);
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::pluck('id')->all());

        return $user->refresh();
    }

    private function fakeWorker(bool $ok): void
    {
        $this->app->bind(BackgroundProcess::class, fn () => new class($ok) extends BackgroundProcess
        {
            public function __construct(private bool $ok) {}

            public function dispatch(array $command): bool
            {
                return $this->ok;
            }
        });
    }

    private function makeMovie(User $owner, string $title): Movie
    {
        $movie = Movie::create(['user_id' => $owner->id, 'year' => 2020]);
        $movie->setTranslation('en', ['title' => $title]);

        return $movie->refresh();
    }

    /* ================= გაშვება ================= */

    public function test_a_plan_becomes_a_batch_of_one_job_per_record(): void
    {
        Bus::fake();

        $a = $this->makeMovie($this->alice, 'A');
        $b = $this->makeMovie($this->alice, 'B');

        $this->actingAs($this->alice)->postJson('/api/batches', [
            'kind' => 'sync',
            'items' => [
                ['type' => 'movie', 'id' => $a->id],
                ['type' => 'movie', 'id' => $b->id],
            ],
            'options' => ['fields' => ['title'], 'media' => true],
        ])->assertStatus(202);

        Bus::assertBatched(fn ($batch) => $batch->jobs->count() === 2 && $batch->name === 'sync');
    }

    /**
     * ⚠️ **worker რომ ვერ გაეშვა, პარტია უქმდება** — ჩაწერილი, მაგრამ
     * არასდროს გაშვებული რიგი „მუშაობს"-ად გამოჩნდებოდა და სამუდამოდ
     * 0%-ზე იდგებოდა (`ytdlp_unavailable`-ის იგივე წესი).
     */
    public function test_a_missing_worker_is_a_503_and_not_a_silent_stall(): void
    {
        $this->fakeWorker(false);

        $movie = $this->makeMovie($this->alice, 'A');

        $this->actingAs($this->alice)->postJson('/api/batches', [
            'kind' => 'sync',
            'items' => [['type' => 'movie', 'id' => $movie->id]],
        ])->assertStatus(503)->assertJson(['message' => 'worker_unavailable']);
    }

    public function test_an_unknown_kind_is_refused(): void
    {
        $movie = $this->makeMovie($this->alice, 'A');

        $this->actingAs($this->alice)->postJson('/api/batches', [
            'kind' => 'purge',
            'items' => [['type' => 'movie', 'id' => $movie->id]],
        ])->assertStatus(422)->assertJsonValidationErrors(['kind']);
    }

    /**
     * ⚠️ **უფლება გაშვებამდე მოწმდება და არა job-ში**: job-ში გვიანია —
     * პასუხი უკვე გაცემულია და უარი არსად ჩანს. სამივე ოპერაცია არსებულ
     * ჩანაწერს ცვლის, ე.ი. `update` სჭირდება (§A4-ის იგივე წესი).
     */
    public function test_creating_a_batch_needs_update_permission(): void
    {
        $role = Role::create([
            'key' => 'viewer',
            'name_ka' => 'მკითხველი',
            'name_en' => 'Viewer',
            'permissions' => ['movie' => ['view', 'create']],
        ]);
        $this->alice->forceFill(['role_id' => $role->id])->save();

        $movie = $this->makeMovie($this->alice, 'A');

        $this->actingAs($this->alice->refresh())->postJson('/api/batches', [
            'kind' => 'sync',
            'items' => [['type' => 'movie', 'id' => $movie->id]],
        ])->assertStatus(403)->assertJsonPath('permission', 'movie.update');
    }

    public function test_the_endpoint_requires_a_session(): void
    {
        $this->postJson('/api/batches', ['kind' => 'sync', 'items' => []])->assertStatus(401);
    }

    /* ================= მდგომარეობა ================= */

    public function test_the_batch_reports_its_progress(): void
    {
        $movie = $this->makeMovie($this->alice, 'A');

        $id = $this->actingAs($this->alice)->postJson('/api/batches', [
            'kind' => 'sync',
            'items' => [['type' => 'movie', 'id' => $movie->id]],
        ])->assertStatus(202)->json('id');

        $this->actingAs($this->alice)->getJson("/api/batches/{$id}")
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('kind', 'sync')
            ->assertJsonPath('finished', false);
    }

    public function test_a_batch_can_be_cancelled(): void
    {
        $movie = $this->makeMovie($this->alice, 'A');

        $id = $this->actingAs($this->alice)->postJson('/api/batches', [
            'kind' => 'sync',
            'items' => [['type' => 'movie', 'id' => $movie->id]],
        ])->json('id');

        $this->actingAs($this->alice)->deleteJson("/api/batches/{$id}")
            ->assertOk()
            ->assertJsonPath('cancelled', true);
    }

    public function test_an_unknown_batch_is_a_404(): void
    {
        $this->actingAs($this->alice)->getJson('/api/batches/no-such-batch')->assertStatus(404);
    }

    /**
     * **ჩავარდნილი ერთეული ჩავარდნილად ითვლება** (Tasks BUG-08).
     *
     * ⚠️ აქამდე `handle()` ყველა გამონაკლისს ყლაპავდა, ე.ი. `failedJobs`
     * **ყოველთვის 0** იყო და `processedJobs == totalJobs`: SPA „300/300
     * დასრულდა"-ს აჩვენებდა იმ გაშვებაზეც, სადაც ყველა TMDB call 401-ს
     * აბრუნებდა — უხმო გამოტოვება, რომელსაც ეს პროექტი ყველაზე მძიმე
     * ბაგად თვლის.
     *
     * ⚠️ ტესტი **ნამდვილ worker-ს** უშვებს (`queue:work --stop-when-empty`)
     * და არა `handle()`-ს პირდაპირ: `failed_jobs`-ის ჩანაწერსა და პარტიის
     * მრიცხველს მხოლოდ რიგის მანქანერია წერს, ე.ი. პირდაპირი გამოძახება
     * სწორედ იმას ვერ ამოწმებდა, რაზეც ტასქია.
     */
    public function test_a_failed_item_is_counted_and_the_rest_still_run(): void
    {
        $bad = $this->makeMovie($this->alice, 'Bad');
        $good = $this->makeMovie($this->alice, 'Good');
        $ran = 0;

        $this->mock(ItemSyncer::class, function ($mock) use ($bad, &$ran) {
            $mock->shouldReceive('sync')->andReturnUsing(function ($record) use ($bad, &$ran) {
                $ran++;

                if ((int) $record->id === (int) $bad->id) {
                    throw new RuntimeException('boom');
                }

                return ['ok' => true];
            });
        });

        $id = $this->actingAs($this->alice)->postJson('/api/batches', [
            'kind' => 'sync',
            'items' => [
                ['type' => 'movie', 'id' => $bad->id],
                ['type' => 'movie', 'id' => $good->id],
            ],
            'options' => ['fields' => ['title']],
        ])->assertStatus(202)->json('id');

        Artisan::call('queue:work', ['--stop-when-empty' => true, '--max-time' => 20, '--tries' => 1]);

        $this->assertSame(1, DB::table('failed_jobs')->count(), 'ჩავარდნა `failed_jobs`-ში უნდა ჩაიწეროს');

        // ⚠️ დანარჩენი მაინც გაეშვა — `allowFailures()` სწორედ ამისთვისაა
        $this->assertSame(2, $ran, 'ჩავარდნილმა ერთეულმა პარტია არ უნდა გააჩეროს');

        /* ⚠️ **ჩავარდნილი ერთეულის მქონე პარტია Laravel-ისთვის არასდროს
           მთავრდება**: `incrementFailedJobs()` `pending_jobs`-ს არ ამცირებს,
           `markAsFinished()` კი მხოლოდ `pendingJobs === 0`-ზე ეშვება. ე.ი.
           გასწორების გარეშე ეს პასუხი „მიმდინარეობს, 50%"-ს აჩვენებდა
           სამუდამოდ — იგივე უხმო ჩაკიდება, რაც `download_status = running`-ს
           ჰქონდა. `payload()` სწორედ ამიტომ ითვლის `pending − failed`-ს. */
        $this->actingAs($this->alice)->getJson("/api/batches/{$id}")
            ->assertOk()
            ->assertJsonPath('total', 2)
            ->assertJsonPath('failed', 1)
            ->assertJsonPath('pending', 0)
            ->assertJsonPath('progress', 100)
            ->assertJsonPath('finished', true);
    }

    /* ================= job-ის მფლობელობა ================= */

    /**
     * **ამ ფაილის ყველაზე მნიშვნელოვანი ტესტი.**
     *
     * ⚠️ worker-ს **სესია არ აქვს**, ე.ი. `BelongsToUser`-ის `owner` scope
     * გამორთულია. ავტორიზაციის დაყენების გარეშე job **ყველა მომხმარებლის**
     * ჩანაწერს დაინახავდა — ე.ი. სხვისი id-ით გაშვებული სინქრონი სხვის
     * ფილმს გადააწერდა. `Auth::setUser()` სწორედ ამას ხურავს.
     */
    public function test_a_job_never_touches_another_users_record(): void
    {
        $bobs = $this->makeMovie($this->bob, 'Bob movie');
        $before = $bobs->title_en;

        // alice-ის job bob-ის ჩანაწერზე — ჩანაწერი **ვერ უნდა მოიძებნოს**
        $job = new RunBatchItem(
            userId: (int) $this->alice->getKey(),
            kind: 'sync',
            type: 'movie',
            recordId: (int) $bobs->getKey(),
            options: ['fields' => ['title'], 'overwrite' => true],
        );

        $job->handle(
            app(ItemSyncer::class),
            app(ItemTranslator::class),
            app(GalleryFetcher::class),
        );

        $this->assertSame($before, $bobs->refresh()->title_en);
    }

    /** წაშლილი მომხმარებლის job ჩუმად სრულდება და არა გამონაკლისით */
    public function test_a_job_for_a_deleted_user_is_a_no_op(): void
    {
        $job = new RunBatchItem(
            userId: 9999,
            kind: 'sync',
            type: 'movie',
            recordId: 1,
        );

        $job->handle(
            app(ItemSyncer::class),
            app(ItemTranslator::class),
            app(GalleryFetcher::class),
        );

        $this->assertTrue(true, 'გამონაკლისი არ ამოვარდა');
    }

    /**
     * **სხვისი პარტია 404-ია — არც პროგრესი და არც გაუქმება** (Tasks SEC-09).
     *
     * ⚠️ `Illuminate\Bus\Batch` **Eloquent-მოდელი არ არის**, ე.ი. არც
     * `EnsureRecordOwnership` ხედავს მას და არც `BelongsToUser`-ის `owner`
     * scope ეხება — ორივე მეთოდი მხოლოდ `Bus::findBatch()`-ს აკეთებდა.
     * UUID-ის გაგება საკმარისი იყო სხვისი მიმდინარე სინქრონიზაციის
     * გასაუქმებლად.
     *
     * ⚠️ პასუხი **404-ია და არა 403**: „ეს პარტია არსებობს" თვითონაც
     * ინფორმაციაა — და 403 ზუსტად იმას ადასტურებდა, რაც უნდა დაიმალოს.
     */
    public function test_a_batch_belongs_to_the_account_that_started_it(): void
    {
        $movie = $this->makeMovie($this->alice, 'A');

        $id = $this->actingAs($this->alice)->postJson('/api/batches', [
            'kind' => 'sync',
            'items' => [['type' => 'movie', 'id' => $movie->id]],
        ])->assertStatus(202)->json('id');

        $this->actingAs($this->bob)->getJson("/api/batches/{$id}")->assertStatus(404);
        $this->actingAs($this->bob)->deleteJson("/api/batches/{$id}")->assertStatus(404);

        // ⚠️ და გაუქმება **მართლა არ მომხდარა** — 404 ჩუმი წარმატება არ ყოფილა
        $this->actingAs($this->alice)->getJson("/api/batches/{$id}")
            ->assertOk()
            ->assertJsonPath('cancelled', false);
    }
}
