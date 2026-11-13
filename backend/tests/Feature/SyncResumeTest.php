<?php

namespace Tests\Feature;

use App\Jobs\RunBatchItem;
use App\Models\CastMember;
use App\Models\Module;
use App\Models\Movie;
use App\Models\RecordLock;
use App\Models\Role;
use App\Models\Series;
use App\Models\SyncRun;
use App\Models\SyncRunItem;
use App\Models\User;
use App\Models\UserCredential;
use App\Services\Credentials\CredentialStore;
use App\Services\Sync\SyncHistory;
use App\Services\Sync\SyncResume;
use App\Support\BackgroundProcess;
use App\Support\NotificationType;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * **გაწყვეტილი სინქრონიზაციის გაგრძელება.**
 *
 * ⚠️ მოწმდება: გაშვება ინახავს, რაზე და რით გაეშვა (დაგეგმილი სია და პარამეტრები) —
 * ბრაუზერის რიგზეც (`POST /sync/runs`) და ფონურ პარტიაზეც; მდგომარეობა სამია
 * (მიმდინარეობს · გაწყდა · დასრულდა) და „გაწყდა" დგება გაჩერებით, პარტიის გაუქმებით ან
 * დუმილით; „გაგრძელება" უშვებს **მხოლოდ იმას, რასაც შედეგი არ აქვს** — იმავე
 * პარამეტრებით და **იმავე გაშვებაში** (ახალი გაშვება არ იქმნება); წაშლილი და შეჩერებული
 * ჩანაწერი გამოიტოვება მიზეზით; დასრულებულ, მიმდინარე და ძველ (გეგმის გარეშე) გაშვებას
 * გაგრძელება არ აქვს; „ჩავარდნილების თავიდან გაშვება" მხოლოდ ჩავარდნილებს უშვებს;
 * უფლება და წყაროს გასაღები მოწმდება; სხვისი გაშვება 404-ია; სინქრონიზაციის გვერდი
 * გაწყვეტილ გაშვებას სთავაზობს; რიგიდან სერვერზე გადაცემული ნაწილი იმავე გაშვებას ავსებს.
 */
class SyncResumeTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;

    private User $bob;

    /** @var array<int, array{0: array<string, mixed>, 1: int}> TMDB-ის id → [პასუხი, სტატუსი] */
    private array $tmdb = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        $this->alice = $this->makeUser('alice');
        $this->bob = $this->makeUser('bob');
        $this->giveCredential($this->alice, 'tmdb');
        $this->giveCredential($this->bob, 'tmdb');

        // ნამდვილი პროცესი ტესტში არ ეშვება; job-ი რიგში უნდა ეწეროს და არა მაშინვე შესრულდეს
        $this->app->bind(BackgroundProcess::class, fn () => new class extends BackgroundProcess
        {
            public function __construct() {}

            public function dispatch(array $command): bool
            {
                return true;
            }
        });
        config(['queue.default' => 'database']);

        // ⚠️ ერთი stub ცვლადი პასუხით — `Http::fake()` stub-ებს ამატებს და არა ცვლის
        Http::fake([
            'api.themoviedb.org/3/movie/*/credits*' => fn () => Http::response(['cast' => []]),
            'api.themoviedb.org/3/movie/*/videos*' => fn () => Http::response(['results' => []]),
            'api.themoviedb.org/3/movie/*' => function ($request) {
                preg_match('#/movie/(\d+)#', $request->url(), $m);
                [$body, $status] = $this->tmdb[(int) ($m[1] ?? 0)] ?? [[], 200];

                return Http::response($body, $status);
            },
        ]);

        $this->tmdb = [
            603 => [['id' => 603, 'title' => 'The Matrix', 'release_date' => '1999-03-31'], 200],
            604 => [['id' => 604, 'title' => 'Reloaded', 'release_date' => '2003-05-15'], 200],
            607 => [['id' => 607, 'title' => 'Revolutions', 'release_date' => '2003-11-05'], 200],
            608 => [['id' => 608, 'title' => 'Resurrections', 'release_date' => '2021-12-22'], 200],
            // 606: წყარო ვარდება
            606 => [['status_message' => 'boom'], 500],
        ];
    }

    private function makeUser(string $name): User
    {
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::pluck('id')->all());

        return $user->refresh();
    }

    private function movie(int $tmdbId, ?User $owner = null): Movie
    {
        return Movie::create(['user_id' => ($owner ?? $this->alice)->id, 'tmdb_id' => $tmdbId])->refresh();
    }

    /** გაშვების პარამეტრები — ერთი და იგივე მთელ ტესტში: გადაწერა ჩართულია */
    private const PARAMS = ['fields' => ['title', 'year'], 'overwrite' => true];

    /**
     * ბრაუზერის რიგის გაშვების დასაწყისი — რასაც რიგი ერთეულებამდე აგზავნის.
     *
     * @param  list<Movie>  $movies
     */
    private function open(array $movies, ?string $key = null): string
    {
        $key ??= (string) Str::uuid();

        $this->postJson('/api/sync/runs', [
            'key' => $key,
            'kind' => 'sync',
            'items' => array_map(fn (Movie $movie) => ['type' => 'movie', 'id' => $movie->id], $movies),
            'params' => self::PARAMS,
        ])->assertCreated();

        return $key;
    }

    /** რიგის ერთი ნაბიჯი — იგივე მოთხოვნა, რასაც რიგი აგზავნის */
    private function step(Movie $movie, string $run, int $total): void
    {
        $this->postJson("/api/media/sync/movie/{$movie->id}", [...self::PARAMS, 'run' => $run, 'run_total' => $total])->assertOk();
    }

    /** @return array<string, mixed> */
    private function runData(string $key): array
    {
        return $this->getJson("/api/sync/runs/{$key}")->assertOk()->json('data');
    }

    /** @return array<int, array<string, mixed>> ჩანაწერის id → ერთეული */
    private function items(string $run): array
    {
        return collect($this->getJson("/api/sync/runs/{$run}/items?per_page=100")->assertOk()->json('data'))->keyBy('record_id')->all();
    }

    /** რიგში ჩაწერილი ერთეულები — რაზე და რით გაეშვება პარტია */
    private function queued(): array
    {
        return DB::table('jobs')->orderBy('id')->get()
            ->map(fn ($job) => unserialize(json_decode($job->payload, true)['data']['command']))
            ->filter(fn ($job) => $job instanceof RunBatchItem)
            ->values()
            ->all();
    }

    private function work(bool $once = false): void
    {
        Artisan::call('queue:work', [...($once ? ['--once' => true] : ['--stop-when-empty' => true]), '--max-time' => 20, '--tries' => 1, '--memory' => 0]);
    }

    private function silence(string $run, int $seconds): void
    {
        DB::table('sync_runs')->where('key', $run)->update(['updated_at' => now()->subSeconds($seconds)]);
    }

    public function test_a_stopped_queue_run_continues_with_only_what_is_left_in_the_same_run(): void
    {
        $this->actingAs($this->alice);
        $done = $this->movie(603);
        $failed = $this->movie(606);
        $gone = $this->movie(604);
        $paused = $this->movie(607);
        $left = $this->movie(608);
        $goneId = $gone->id;

        // --- გაშვება ინახავს, რაზე და რით გაეშვა; უცნობი პარამეტრი არ ინახება ---
        $run = (string) Str::uuid();
        $this->postJson('/api/sync/runs', [
            'key' => $run,
            'kind' => 'sync',
            'items' => array_map(fn (Movie $movie) => ['type' => 'movie', 'id' => $movie->id], [$done, $failed, $gone, $paused, $left]),
            'params' => [...self::PARAMS, 'delay_ms' => 900, 'anything' => 'else'],
        ])->assertCreated()
            ->assertJsonPath('data.total', 5)
            ->assertJsonPath('data.left', 5)
            ->assertJsonPath('data.state', SyncRun::RUNNING)
            ->assertJsonPath('data.resumable', false)
            ->assertJsonPath('data.params', ['fields' => ['title', 'year'], 'media' => false, 'only_missing' => false, 'overwrite' => true]);
        $this->assertSame(['movie' => [$done->id, $failed->id, $goneId, $paused->id, $left->id]], SyncRun::firstOrFail()->plan);

        // --- რიგმა ორი ერთეული გაუშვა და გაჩერდა ---
        $this->step($done, $run, 5);
        $this->step($failed, $run, 5);
        // რიგით მიმდინარე გაშვებას სერვერი ვერ აჩერებს და სინქრონიზაციის გვერდზეც არ ჩანს — ის რიგის პანელშია
        $this->assertSame([SyncRun::RUNNING, false], [$this->runData($run)['state'], $this->runData($run)['stoppable']]);
        $this->getJson('/api/sync/overview')->assertJsonCount(0, 'unfinished');

        $this->postJson("/api/sync/runs/{$run}/stop")->assertOk()
            ->assertJsonPath('data.state', SyncRun::INTERRUPTED)
            ->assertJsonPath('data.done', 2)
            ->assertJsonPath('data.left', 3)
            ->assertJsonPath('data.resumable', true)
            ->assertJsonPath('data.retryable', true);
        // სიაშიც იგივე — პარამეტრების გარეშე
        $this->getJson('/api/sync/runs')->assertJsonPath('data.0.state', SyncRun::INTERRUPTED)->assertJsonPath('data.0.resumable', true)->assertJsonMissingPath('data.0.params');
        // სინქრონიზაციის გვერდი გაწყვეტილ გაშვებას თვითონ სთავაზობს; სხვა მოდულის გვერდი — არა
        $this->getJson('/api/sync/overview')->assertJsonCount(1, 'unfinished')->assertJsonPath('unfinished.0.key', $run)->assertJsonPath('unfinished.0.resumable', true);
        $this->getJson('/api/sync/overview?type=movie')->assertJsonPath('unfinished.0.key', $run);
        $this->getJson('/api/sync/overview?type=series')->assertJsonCount(0, 'unfinished');

        // --- გაწყვეტის შემდეგ ერთი ჩანაწერი წაიშალა, მეორეზე „აღარ განაახლო" ჩაირთო ---
        $gone->delete();
        $paused->forceFill(['sync_paused' => true])->save();
        $left->setTranslation('en', ['title' => 'Old title']);

        // --- გაგრძელება: მხოლოდ ის, რასაც შედეგი არ აქვს — იმავე პარამეტრებით ---
        $this->postJson("/api/sync/runs/{$run}/resume", ['delay_ms' => 150])->assertStatus(202)
            ->assertJsonPath('data.key', $run)
            ->assertJsonPath('data.state', SyncRun::RUNNING)
            ->assertJsonPath('data.resumable', false)
            ->assertJsonPath('data.stoppable', true);

        $jobs = $this->queued();
        $this->assertSame([$goneId, $paused->id, $left->id], array_map(fn (RunBatchItem $job) => $job->recordId, $jobs));
        foreach ($jobs as $job) {
            $this->assertSame(['sync', 'movie'], [$job->kind, $job->type]);
            // პაუზა გაგრძელების მოთხოვნიდანაა — გაშვების პარამეტრი არ არის
            $this->assertSame(['fields' => ['title', 'year'], 'media' => false, 'only_missing' => false, 'overwrite' => true, 'delay_ms' => 150], $job->options);
        }

        // მიმდინარე გაშვება მეორედ არ გრძელდება; სინქრონიზაციის გვერდზე ის რჩება — უკვე „მიმდინარედ"
        $this->postJson("/api/sync/runs/{$run}/resume")->assertStatus(409)->assertJsonPath('message', 'sync_run_running');
        $this->postJson("/api/sync/runs/{$run}/resume", ['only' => 'failed'])->assertStatus(409)->assertJsonPath('message', 'sync_run_running');
        $this->getJson('/api/sync/overview')->assertJsonCount(1, 'unfinished')
            ->assertJsonPath('unfinished.0.state', SyncRun::RUNNING)
            ->assertJsonPath('unfinished.0.resumable', false)
            ->assertJsonPath('unfinished.0.stoppable', true);
        $this->assertSame(3, count($this->queued()));

        $this->work();

        // --- იგივე გაშვება შეივსო: ახალი გაშვება არ შექმნილა ---
        $this->assertSame(1, SyncRun::count());
        $after = $this->runData($run);
        $this->assertSame([5, 5, 0, SyncRun::FINISHED], [$after['total'], $after['done'], $after['left'], $after['state']]);
        $this->assertSame(['updated' => 2, 'unchanged' => 0, 'skipped' => 2, 'failed' => 1], $after['counts']);
        $this->assertSame([false, false], [$after['resumable'], $after['stoppable']]);
        // დასრულებული გაშვება სინქრონიზაციის გვერდიდან ქრება
        $this->getJson('/api/sync/overview')->assertJsonCount(0, 'unfinished');

        $items = $this->items($run);
        // წაშლილი და შეჩერებული გამოიტოვა — მიზეზით; წაშლილს ბმული არ აქვს
        $this->assertSame(['skipped', 'record_not_found', false], [$items[$goneId]['result'], $items[$goneId]['reason'], $items[$goneId]['exists']]);
        $this->assertSame(['skipped', 'sync_paused'], [$items[$paused->id]['result'], $items[$paused->id]['reason']]);
        // პარამეტრები იგივეა: „გადაწერა" ჩართული იყო — არსებული სათაური წყაროსით შეიცვალა
        $this->assertSame('updated', $items[$left->id]['result']);
        $this->assertSame('Resurrections', $left->refresh()->title_en);
        $this->assertContains(['field' => 'title_en', 'from' => 'Old title', 'to' => 'Resurrections'], $items[$left->id]['details']);
        // ადრე გაშვებულს გაგრძელება არ შეხებია
        $this->assertSame('updated', $items[$done->id]['result']);

        // პარტიის შეტყობინება იმავე გაშვებას ხსნის (გასაღები პარტიის id არ არის)
        $notice = $this->alice->notifications()->where('type', NotificationType::BATCH_DONE)->firstOrFail();
        $this->assertSame("/sync/results/{$run}", NotificationType::route($notice->type, $notice->data));

        // --- დასრულებულ გაშვებას „გაგრძელება" არ აქვს ---
        $this->postJson("/api/sync/runs/{$run}/resume")->assertStatus(409)->assertJsonPath('message', 'sync_run_nothing_left');
        $this->assertSame(0, count($this->queued()));

        // --- „ჩავარდნილების თავიდან გაშვება": მხოლოდ ჩავარდნილი, იმავე გაშვებაში ---
        $this->assertTrue($after['retryable']);
        $this->tmdb[606] = [['id' => 606, 'title' => 'Fixed', 'release_date' => '2010-01-01'], 200];
        $this->postJson("/api/sync/runs/{$run}/resume", ['only' => 'failed'])->assertStatus(202)->assertJsonPath('data.state', SyncRun::RUNNING);
        $this->assertSame([$failed->id], array_map(fn (RunBatchItem $job) => $job->recordId, $this->queued()));

        $this->work();

        $retried = $this->runData($run);
        $this->assertSame(['updated' => 3, 'unchanged' => 0, 'skipped' => 2, 'failed' => 0], $retried['counts']);
        $this->assertSame([SyncRun::FINISHED, false, false], [$retried['state'], $retried['resumable'], $retried['retryable']]);
        $this->assertSame('Fixed', $failed->refresh()->title_en);
        $this->assertSame([1, 5], [SyncRun::count(), SyncRunItem::count()]);
        $this->postJson("/api/sync/runs/{$run}/resume", ['only' => 'failed'])->assertStatus(409)->assertJsonPath('message', 'sync_run_nothing_left');
    }

    public function test_a_cancelled_background_batch_continues_under_its_own_run(): void
    {
        $this->actingAs($this->alice);
        $movies = [$this->movie(603), $this->movie(604), $this->movie(607)];

        $id = $this->postJson('/api/batches', [
            'kind' => 'sync',
            'items' => array_map(fn (Movie $movie) => ['type' => 'movie', 'id' => $movie->id], $movies),
            'options' => [...self::PARAMS, 'delay_ms' => 0],
        ])->assertStatus(202)->json('id');

        // პარტიამ თვითონ ჩაწერა, რაზე და რით გაეშვა — გასაღები და პარტია ერთია
        $run = SyncRun::where('key', $id)->firstOrFail();
        $this->assertSame([$id, ['movie' => array_map(fn (Movie $movie) => $movie->id, $movies)]], [$run->batch_id, $run->plan]);
        $this->assertSame(['fields' => ['title', 'year'], 'media' => false, 'only_missing' => false, 'overwrite' => true], $run->params);
        $this->assertSame([SyncRun::RUNNING, 3, false], [$this->runData($id)['state'], $this->runData($id)['left'], $this->runData($id)['resumable']]);

        // ერთი ერთეული დამუშავდა და პარტია შეწყდა
        $this->work(once: true);
        $this->deleteJson("/api/batches/{$id}")->assertOk();
        $this->work();

        $stopped = $this->runData($id);
        $this->assertSame([SyncRun::INTERRUPTED, 1, 2, true], [$stopped['state'], $stopped['done'], $stopped['left'], $stopped['resumable']]);

        // გაგრძელება ახალი პარტიაა, გაშვება კი იგივე
        $this->postJson("/api/sync/runs/{$id}/resume")->assertStatus(202)->assertJsonPath('data.state', SyncRun::RUNNING);
        $this->assertSame([$movies[1]->id, $movies[2]->id], array_map(fn (RunBatchItem $job) => $job->recordId, $this->queued()));
        $next = SyncRun::where('key', $id)->value('batch_id');
        $this->assertNotSame($id, $next);
        $this->assertSame($id, Bus::findBatch($next)->options['run']);

        // „შეჩერება" გაშვების გვერდიდან პარტიას აუქმებს
        $this->postJson("/api/sync/runs/{$id}/stop")->assertOk()->assertJsonPath('data.state', SyncRun::INTERRUPTED);
        $this->assertTrue(Bus::findBatch($next)->cancelled());
        $this->work();
        $this->assertSame(1, $this->runData($id)['done']);

        // ისევ გაგრძელება — ბოლომდე
        $this->postJson("/api/sync/runs/{$id}/resume")->assertStatus(202);
        $this->work();

        $finished = $this->runData($id);
        $this->assertSame([SyncRun::FINISHED, 3, 0, false], [$finished['state'], $finished['done'], $finished['left'], $finished['resumable']]);
        $this->assertSame(['updated' => 3, 'unchanged' => 0, 'skipped' => 0, 'failed' => 0], $finished['counts']);
        $this->assertSame(1, SyncRun::count());
    }

    public function test_silence_turns_a_run_into_an_interrupted_one(): void
    {
        $this->actingAs($this->alice);
        $movies = [$this->movie(603), $this->movie(604)];

        // --- ბრაუზერის რიგი: ჩანართი დაიხურა, „შეჩერება" არავის დაუჭერია ---
        $queue = $this->open($movies);
        $this->step($movies[0], $queue, 2);
        $this->silence($queue, SyncResume::QUEUE_SILENCE - 20);
        $this->assertSame(SyncRun::RUNNING, $this->runData($queue)['state']);
        $this->silence($queue, SyncResume::QUEUE_SILENCE + 5);
        $this->assertSame([SyncRun::INTERRUPTED, true], [$this->runData($queue)['state'], $this->runData($queue)['resumable']]);

        // --- ფონური პარტია: სერვერი გაითიშა — პარტია „მომლოდინეა", მაგრამ შედეგი აღარ მოდის ---
        $batch = $this->postJson('/api/batches', [
            'kind' => 'sync',
            'items' => array_map(fn (Movie $movie) => ['type' => 'movie', 'id' => $movie->id], $movies),
            'options' => self::PARAMS,
        ])->json('id');
        $this->silence($batch, SyncResume::QUEUE_SILENCE + 5);
        $this->assertSame(SyncRun::RUNNING, $this->runData($batch)['state']);
        $this->silence($batch, SyncResume::BATCH_SILENCE + 5);
        $this->assertSame([SyncRun::INTERRUPTED, 2, true], [$this->runData($batch)['state'], $this->runData($batch)['left'], $this->runData($batch)['resumable']]);

        // გაგრძელება ძველ პარტიას აუქმებს — მისი ნარჩენი ერთეულები ახლის გვერდით აღარ გაეშვება
        $this->postJson("/api/sync/runs/{$batch}/resume")->assertStatus(202);
        $this->assertTrue(Bus::findBatch($batch)->cancelled());
        $this->work();
        $this->assertSame([SyncRun::FINISHED, 2], [$this->runData($batch)['state'], $this->runData($batch)['done']]);
        $this->assertSame(2, SyncRunItem::where('sync_run_id', SyncRun::where('key', $batch)->value('id'))->count());
    }

    public function test_a_run_without_a_stored_plan_cannot_be_continued(): void
    {
        $this->actingAs($this->alice);
        $good = $this->movie(603);
        $bad = $this->movie(606);

        // გაშვება, რომელსაც დასაწყისი არ გამოუგზავნია: იცის მხოლოდ რიცხვი (3) და შედეგები
        $run = (string) Str::uuid();
        $this->step($good, $run, 3);
        $this->step($bad, $run, 3);
        $this->silence($run, SyncResume::QUEUE_SILENCE + 5);

        $old = $this->runData($run);
        $this->assertSame([SyncRun::INTERRUPTED, 1, false, false, null], [$old['state'], $old['left'], $old['resumable'], $old['retryable'], $old['params']]);
        $this->postJson("/api/sync/runs/{$run}/resume")->assertStatus(409)->assertJsonPath('message', 'sync_run_not_resumable');
        $this->postJson("/api/sync/runs/{$run}/resume", ['only' => 'failed'])->assertStatus(409)->assertJsonPath('message', 'sync_run_not_resumable');
        $this->getJson('/api/sync/overview')->assertJsonCount(0, 'unfinished');
        $this->assertSame(0, count($this->queued()));

        // დასაწყისი პირველ ერთეულზე გვიან მოვიდა — გეგმა ივსება; მეორედ გამოგზავნილი მას აღარ ცვლის
        $late = (string) Str::uuid();
        $this->step($good, $late, 2);
        $this->open([$good, $bad], $late);
        $this->open([$good], $late);
        $this->assertSame(['movie' => [$good->id, $bad->id]], SyncRun::where('key', $late)->firstOrFail()->plan);
        $this->postJson("/api/sync/runs/{$late}/stop");
        $this->assertSame([SyncRun::INTERRUPTED, 1, true], [$this->runData($late)['state'], $this->runData($late)['left'], $this->runData($late)['resumable']]);

        $this->postJson('/api/sync/runs', ['key' => 'not-a-uuid', 'kind' => 'sync', 'items' => [['type' => 'movie', 'id' => 1]]])->assertStatus(422);
        $this->postJson('/api/sync/runs', ['key' => (string) Str::uuid(), 'kind' => 'sync', 'items' => [['type' => 'book', 'id' => 1]]])->assertStatus(422);
        $this->postJson("/api/sync/runs/{$late}/resume", ['only' => 'everything'])->assertStatus(422);
    }

    public function test_continuing_needs_the_right_the_key_and_the_owner(): void
    {
        $this->actingAs($this->alice);
        $movies = [$this->movie(603), $this->movie(604)];
        $run = $this->open($movies);
        $this->step($movies[0], $run, 2);
        $this->postJson("/api/sync/runs/{$run}/stop")->assertOk();

        // სხვისი გაშვება — 404, არა 403
        $this->actingAs($this->bob);
        $this->postJson("/api/sync/runs/{$run}/resume")->assertNotFound();
        $this->postJson("/api/sync/runs/{$run}/stop")->assertNotFound();
        // იგივე გასაღებით სხვისი გაშვება ცალკე რიგია
        $this->open([$this->movie(603, $this->bob)], $run);
        $this->assertSame(2, SyncRun::withoutGlobalScope('owner')->where('key', $run)->count());

        // წყაროს გასაღების გარეშე — 409, პარტია არ იწერება
        $this->actingAs($this->alice);
        UserCredential::where('user_id', $this->alice->id)->delete();
        CredentialStore::forget((int) $this->alice->id);
        $this->postJson("/api/sync/runs/{$run}/resume")->assertStatus(409)->assertJsonPath('message', 'credential_missing');
        $this->giveCredential($this->alice, 'tmdb');

        // რედაქტირების უფლების გარეშე — 403
        $role = Role::create(['key' => 'viewer', 'name_ka' => 'მკითხველი', 'name_en' => 'Viewer', 'permissions' => ['movie' => ['view']]]);
        $this->alice->forceFill(['role_id' => $role->id])->save();
        $this->actingAs($this->alice->refresh())->postJson("/api/sync/runs/{$run}/resume")
            ->assertStatus(403)->assertJsonPath('permission', 'movie.update');

        $this->assertSame(0, count($this->queued()));
        $this->assertSame(SyncRun::INTERRUPTED, $this->runData($run)['state']);
    }

    public function test_a_locked_record_neither_keeps_a_run_open_nor_shows_in_it(): void
    {
        $this->actingAs($this->alice);
        $open = $this->movie(603);
        $secret = $this->movie(604);
        $run = $this->open([$open, $secret]);
        $this->step($open, $run, 2);
        $this->step($secret, $run, 2);

        RecordLock::create([
            'user_id' => $this->alice->id,
            'lockable_type' => $secret->getMorphClass(),
            'lockable_id' => $secret->getKey(),
            'password_hash' => Hash::make('secret1'),
        ]);

        // ჩაკეტილის ერთეული არ ჩანს და რიცხვშიც არ არის, მაგრამ გაშვება დასრულებულია — გასაშვები არაფერი დარჩა
        $data = $this->runData($run);
        $this->assertSame([1, 0, SyncRun::FINISHED, false], [$data['done'], $data['left'], $data['state'], $data['resumable']]);
        $this->assertSame([$open->id], array_keys($this->items($run)));
    }

    public function test_what_the_queue_hands_to_the_server_fills_the_same_run(): void
    {
        $this->actingAs($this->alice);
        $movies = [$this->movie(603), $this->movie(604), $this->movie(607)];
        $run = $this->open($movies);
        $this->step($movies[0], $run, 3);

        // რიგი დარჩენილს სერვერს გადასცემს — თავისი გაშვების გასაღებით
        $batch = $this->postJson('/api/batches', [
            'kind' => 'sync',
            'items' => [['type' => 'movie', 'id' => $movies[1]->id], ['type' => 'movie', 'id' => $movies[2]->id]],
            'options' => self::PARAMS,
            'run' => $run,
        ])->assertStatus(202)->json('id');

        $this->assertSame($batch, SyncRun::where('key', $run)->value('batch_id'));
        $this->assertSame(SyncRun::RUNNING, $this->runData($run)['state']);
        $this->work();

        $this->assertSame(1, SyncRun::count());
        $this->assertSame([SyncRun::FINISHED, 3], [$this->runData($run)['state'], $this->runData($run)['done']]);

        // სხვა სახეობის ან სხვისი გაშვების გასაღები არაფერს აგრძელებს — პარტია ახალი გაშვებაა
        $series = Series::create(['user_id' => $this->alice->id, 'tmdb_id' => 1399]);
        $other = $this->postJson('/api/batches', ['kind' => 'episodes', 'items' => [['type' => 'series', 'id' => $series->id]], 'run' => $run])->assertStatus(202)->json('id');
        $this->assertSame([$other, 'episodes', []], [SyncRun::where('key', $other)->value('batch_id'), SyncRun::where('key', $other)->value('kind'), SyncRun::where('key', $other)->firstOrFail()->params]);
        $this->assertSame($batch, SyncRun::where('key', $run)->value('batch_id'));
    }

    public function test_an_actor_run_keeps_its_plan_and_fields(): void
    {
        $this->actingAs($this->alice);
        $actors = [
            CastMember::create(['tmdb_person_id' => 6384, 'name' => 'Keanu Reeves']),
            CastMember::create(['tmdb_person_id' => 2975, 'name' => 'Laurence Fishburne']),
        ];
        $this->movie(603)->cast()->sync([$actors[0]->id => ['character' => 'Neo', 'billing_order' => 0], $actors[1]->id => ['character' => 'Morpheus', 'billing_order' => 1]]);

        $run = (string) Str::uuid();
        $this->postJson('/api/sync/runs', [
            'key' => $run,
            'kind' => 'cast',
            'items' => array_map(fn (CastMember $actor) => ['type' => 'actor', 'id' => $actor->id], $actors),
            'params' => ['fields' => ['biography', 'nonsense'], 'overwrite_photo' => true],
        ])->assertCreated()->assertJsonPath('data.params', ['fields' => ['biography'], 'overwrite_photo' => true]);

        app(SyncHistory::class)->record($this->alice->id, $run, 'cast', 'queue', 2, 'actor', $actors[0]->id, 'Keanu Reeves', SyncHistory::UPDATED, ['biography']);
        $this->postJson("/api/sync/runs/{$run}/stop")->assertOk();
        $this->postJson("/api/sync/runs/{$run}/resume")->assertStatus(202);

        $jobs = $this->queued();
        $this->assertCount(1, $jobs);
        $this->assertSame(['cast', 'actor', $actors[1]->id], [$jobs[0]->kind, $jobs[0]->type, $jobs[0]->recordId]);
        $this->assertSame(['fields' => ['biography'], 'overwrite_photo' => true, 'delay_ms' => 0], $jobs[0]->options);
    }
}
