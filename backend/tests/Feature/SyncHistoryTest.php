<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\CastMember;
use App\Models\CastMemberSyncPref;
use App\Models\Module;
use App\Models\Movie;
use App\Models\RecordLock;
use App\Models\Role;
use App\Models\Series;
use App\Models\SyncRun;
use App\Models\SyncRunItem;
use App\Models\TvEpisode;
use App\Models\User;
use App\Services\Cast\CastEnricher;
use App\Services\Sync\SyncFacts;
use App\Services\Sync\SyncHistory;
use App\Services\Translation\ItemTranslator;
use App\Support\BackgroundProcess;
use App\Support\NotificationType;
use App\Support\SyncOutcome;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * **სინქრონიზაციის ისტორია.**
 *
 * ⚠️ მოწმდება: ბრაუზერის რიგის გაშვება (`run` გასაღებით) და ფონური პარტია ერთსა და
 * იმავე ისტორიას წერენ — გაშვება, თითო ერთეულის შედეგი, მიზეზი და **რა შეიცვალა**
 * (ნამდვილი ცვლილების ველები); გასაღების გარეშე მოთხოვნა (ერთეულოვანი ღილაკი) არ
 * იწერება; ერთეულები იფილტრება შედეგით და იძებნება სათაურით; „აღარ გაეშვას"
 * მონიშნულებზე და ყველა ჩავარდნილზე ჩანაწერის გადამრთველს წერს და ბრუნდება;
 * ისტორია მხოლოდ მფლობელისაა, ჩაკეტილი ჩანაწერის ერთეული არსად ჩანს; 90 დღეზე
 * ძველი გაშვება იშლება.
 *
 * ⚠️ **„რა რით შეიცვალა"** (`details`): ყოველ შეცვლილ ველზე ძველი და ახალი
 * მნიშვნელობა — ცარიელიდან შევსებულზე ძველი `null`-ია, გადაწერილზე ორივე; ჟანრებზე —
 * რა დაემატა და რა მოაკლდა; თარგმანზე — რომელმა წყარომ შეავსო; სეზონებსა და სერიებზე —
 * რამდენი იყო ჩამოტვირთული და რამდენი გახდა. ორივე გზაზე (რიგი, ფონური პარტია);
 * უცვლელსა და ჩავარდნილს მნიშვნელობები არ აქვს, ჩაკეტილი ჩანაწერის მნიშვნელობა
 * პასუხში არ გამოდის.
 */
class SyncHistoryTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;

    private User $bob;

    /** @var array<int, array{0: array<string, mixed>, 1: int}> TMDB-ის id → [პასუხი, სტატუსი] */
    private array $tmdb = [];

    /** @var list<array<string, mixed>> TMDB-ის მსახიობების პასუხი — ყველა ფილმზე ერთი */
    private array $credits = [];

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
            'api.themoviedb.org/3/movie/*/credits*' => fn () => Http::response(['cast' => $this->credits]),
            'api.themoviedb.org/3/movie/*/videos*' => fn () => Http::response(['results' => []]),
            'api.themoviedb.org/3/movie/*' => function ($request) {
                preg_match('#/movie/(\d+)#', $request->url(), $m);
                [$body, $status] = $this->tmdb[(int) ($m[1] ?? 0)] ?? [[], 200];

                return Http::response($body, $status);
            },
        ]);

        $this->tmdb = [
            603 => [['id' => 603, 'title' => 'The Matrix', 'release_date' => '1999-03-31', 'vote_average' => 8.7], 200],
            604 => [['id' => 604, 'title' => 'Reloaded', 'release_date' => '2003-05-15', 'vote_average' => 7.0], 200],
            // 605: წყარო ცარიელს აბრუნებს; 606: წყარო ვარდება
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

    /** ბრაუზერის რიგის ერთი ნაბიჯი — იგივე მოთხოვნა, რასაც რიგი აგზავნის */
    private function step(Movie $movie, ?string $run, int $total = 4): array
    {
        return $this->postJson("/api/media/sync/movie/{$movie->id}", [
            'fields' => ['title', 'year', 'rating'],
            ...($run ? ['run' => $run, 'run_total' => $total] : []),
        ])->assertOk()->json();
    }

    /**
     * ერთეულები გასაღებით: ჩანაწერზე — მისი id, მსახიობზე — `actor:<id>` (ორი ცხრილის
     * id-ები ერთმანეთს ემთხვევა).
     *
     * @return array<int|string, array<string, mixed>>
     */
    private function items(string $run, string $query = ''): array
    {
        return collect($this->getJson("/api/sync/runs/{$run}/items{$query}")->assertOk()->json('data'))
            ->keyBy(fn (array $item) => $item['type'] === 'actor' ? 'actor:'.$item['record_id'] : $item['record_id'])
            ->all();
    }

    public function test_a_queue_run_leaves_each_result_with_what_really_changed(): void
    {
        $this->actingAs($this->alice);
        $updated = $this->movie(603);
        $unchanged = $this->movie(604);
        $empty = $this->movie(605);
        $failed = $this->movie(606);
        $run = (string) Str::uuid();

        // ერთეულოვანი ღილაკი გასაღებს არ აგზავნის — ისტორიაში არ იწერება
        $this->step($unchanged, null);
        $this->assertSame(0, SyncRun::count());

        $first = $this->step($updated, $run);
        $this->step($unchanged, $run);
        $this->step($empty, $run);
        $this->step($failed, $run);

        $list = $this->getJson('/api/sync/runs')->assertOk();
        $list->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.key', $run)
            ->assertJsonPath('data.0.kind', 'sync')
            ->assertJsonPath('data.0.source', 'queue')
            ->assertJsonPath('data.0.total', 4)
            ->assertJsonPath('data.0.done', 4)
            ->assertJsonPath('data.0.counts', ['updated' => 1, 'unchanged' => 1, 'skipped' => 1, 'failed' => 1])
            ->assertJsonPath('data.0.types', ['movie']);
        $this->getJson("/api/sync/runs/{$run}")->assertOk()->assertJsonPath('data.done', 4);

        $items = $this->items($run);
        $this->assertCount(4, $items);

        // „რა შეიცვალა" ზუსტად ის ველებია, რაც სინქრონმა მართლა შეცვალა
        $this->assertSame('updated', $items[$updated->id]['result']);
        $this->assertSame($first['changed'], $items[$updated->id]['changes']);
        // გამოსვლის თარიღი TMDB-ის ფაქტია — ყოველ სინქრონზე იწერება, არჩეული ველების მიუხედავად
        $this->assertEqualsCanonicalizing(['title_en', 'year', 'rating', 'release'], $items[$updated->id]['changes']);
        $this->assertSame('The Matrix', $updated->refresh()->title_en);
        $this->assertSame('The Matrix', $items[$updated->id]['title']);
        $this->assertTrue($items[$updated->id]['exists']);
        $this->assertFalse($items[$updated->id]['paused']);

        // „რა რით": ცარიელი ჩანაწერი შეივსო — ძველი მნიშვნელობა არ არსებობს, ახალი ისაა, რაც ახლა წერია
        $this->assertEqualsCanonicalizing([
            ['field' => 'title_en', 'from' => null, 'to' => 'The Matrix'],
            ['field' => 'year', 'from' => null, 'to' => '1999'],
            ['field' => 'rating', 'from' => null, 'to' => '8.7'],
            ['field' => 'release', 'from' => null, 'to' => '1999-03-31'],
        ], $items[$updated->id]['details']);
        // უცვლელს, ცარიელსა და ჩავარდნილს მნიშვნელობები არ აქვს
        foreach ([$unchanged, $empty, $failed] as $other) {
            $this->assertSame([], $items[$other->id]['details']);
        }

        $this->assertSame(['unchanged', [], null], [$items[$unchanged->id]['result'], $items[$unchanged->id]['changes'], $items[$unchanged->id]['reason']]);
        // ცარიელი პასუხი გამოტოვებაა მიზეზით — ჩანაწერი დამუშავებულად არ ითვლება
        $this->assertSame(['skipped', SyncOutcome::EMPTY], [$items[$empty->id]['result'], $items[$empty->id]['reason']]);
        $this->assertSame('failed', $items[$failed->id]['result']);
        $this->assertNotEmpty($items[$failed->id]['reason']);

        // ფილტრი შედეგით და ძებნა სათაურით
        $this->assertSame([$failed->id], array_keys($this->items($run, '?result=failed')));
        $this->assertSame([$updated->id], array_keys($this->items($run, '?q=matrix')));

        // იგივე ჩანაწერის ხელახლა გაშვება იმავე გაშვებაში ერთეულს აახლებს და არ აორმაგებს
        $this->step($updated, $run);
        $this->assertSame('unchanged', $this->items($run)[$updated->id]['result']);
        $this->assertSame(4, SyncRunItem::count());
        // ჟურნალში ისტორია არ იწერება
        $this->assertSame(0, AuditLog::whereIn('subject_type', ['sync_run', 'sync_run_item'])->count());
    }

    public function test_a_background_batch_writes_the_same_history_and_its_notice_opens_it(): void
    {
        $this->actingAs($this->alice);
        $good = $this->movie(603);
        $bad = $this->movie(606);
        $gone = $this->movie(604);
        $goneId = $gone->id;

        $id = $this->postJson('/api/batches', [
            'kind' => 'sync',
            'items' => [['type' => 'movie', 'id' => $good->id], ['type' => 'movie', 'id' => $bad->id], ['type' => 'movie', 'id' => $goneId]],
            'options' => ['fields' => ['title', 'year']],
        ])->assertStatus(202)->json('id');

        $gone->delete();
        Artisan::call('queue:work', ['--stop-when-empty' => true, '--max-time' => 20, '--tries' => 1, '--memory' => 0]);

        // გაშვების გასაღები პარტიის id-ია
        $this->getJson("/api/sync/runs/{$id}")->assertOk()
            ->assertJsonPath('data.source', 'batch')
            ->assertJsonPath('data.total', 3)
            ->assertJsonPath('data.counts', ['updated' => 1, 'unchanged' => 0, 'skipped' => 1, 'failed' => 1]);

        $items = $this->items($id);
        $this->assertEqualsCanonicalizing(['title_en', 'year', 'release'], $items[$good->id]['changes']);
        // ფონური პარტია იმავე „რა რით"-ს წერს, რასაც რიგი
        $this->assertEqualsCanonicalizing([
            ['field' => 'title_en', 'from' => null, 'to' => 'The Matrix'],
            ['field' => 'year', 'from' => null, 'to' => '1999'],
            ['field' => 'release', 'from' => null, 'to' => '1999-03-31'],
        ], $items[$good->id]['details']);
        $this->assertSame([], $items[$bad->id]['details']);
        $this->assertSame(['skipped', 'record_not_found', false], [$items[$goneId]['result'], $items[$goneId]['reason'], $items[$goneId]['exists']]);
        $this->assertSame('failed', $items[$bad->id]['result']);

        // პარტიის შეტყობინება ამ გაშვების შედეგებს ხსნის; გალერეის პარტიას ისტორია არ აქვს
        $notice = $this->alice->notifications()->where('type', NotificationType::BATCH_DONE)->firstOrFail();
        $this->assertSame("/sync/results/{$id}", NotificationType::route($notice->type, $notice->data));
        $this->assertNull(NotificationType::route(NotificationType::BATCH_DONE, ['kind' => 'gallery', 'run' => $id]));
    }

    public function test_translation_and_actor_steps_are_recorded_under_their_own_kind(): void
    {
        $this->actingAs($this->alice);
        $movie = $this->movie(603);
        $actor = CastMember::create(['tmdb_person_id' => 6384, 'name' => 'Keanu Reeves']);

        $movie->setTranslation('en', ['title' => 'The Matrix', 'description' => 'A hacker learns the truth.']);

        // თარჯიმანი და მსახიობის წყარო ყალბია, მაგრამ ჩანაწერს მართლა ცვლის — ისტორია ცვლილებას ბაზიდან კითხულობს
        $this->mock(ItemTranslator::class, function ($mock) {
            $mock->shouldReceive('translate')->andReturnUsing(function (Movie $item) {
                $item->setTranslation('ka', ['title' => 'მატრიცა', 'description' => 'ჰაკერი სიმართლეს იგებს.']);

                return [
                    'ok' => true, 'skipped' => false, 'changed' => ['title_ka', 'description_ka'],
                    'providers' => ['title_ka' => 'tmdb', 'description_ka' => 'gemini'], 'error' => null, 'result' => SyncOutcome::UPDATED,
                ];
            });
        });
        $this->mock(CastEnricher::class, function ($mock) {
            $mock->shouldReceive('configured')->andReturn(true);
            $mock->shouldReceive('run')->andReturnUsing(function (CastMember $member) {
                if ($member->tmdb_person_id !== 6384) {
                    return CastEnricher::EMPTY;
                }

                $member->forceFill(['birthday' => '1964-09-02', 'place_of_birth' => 'Beirut', 'photo_path' => 'cast/keanu.jpg'])->save();

                return CastEnricher::UPDATED;
            });
            $mock->shouldReceive('lastChanged')->andReturn(['details', 'photo']);
            $mock->shouldReceive('lastError')->andReturn(null);
        });

        $translate = (string) Str::uuid();
        $this->postJson("/api/translations/movie/{$movie->id}", ['sources' => ['gemini'], 'run' => $translate, 'run_total' => 1])->assertOk();

        $cast = (string) Str::uuid();
        $other = CastMember::create(['tmdb_person_id' => 6385, 'name' => 'Unknown']);
        $this->postJson("/api/cast/sync/{$actor->id}", ['run' => $cast, 'run_total' => 2])->assertOk();
        $this->postJson("/api/cast/sync/{$other->id}", ['run' => $cast, 'run_total' => 2])->assertOk();

        $this->getJson("/api/sync/runs/{$translate}")->assertJsonPath('data.kind', 'translate')->assertJsonPath('data.types', ['movie']);
        $this->assertSame(['title_ka', 'description_ka'], $this->items($translate)[$movie->id]['changes']);
        // რა ტექსტი ჩაიწერა და რომელმა წყარომ შეავსო
        $this->assertEqualsCanonicalizing([
            ['field' => 'title_ka', 'from' => null, 'to' => 'მატრიცა', 'by' => 'tmdb'],
            ['field' => 'description_ka', 'from' => null, 'to' => 'ჰაკერი სიმართლეს იგებს.', 'by' => 'gemini'],
        ], $this->items($translate)[$movie->id]['details']);
        // ქართული ტექსტი ბაზაში ასოებად წერია და არა `\u10d8`-ებად
        $this->assertStringContainsString('მატრიცა', (string) DB::table('sync_run_items')->where('record_id', $movie->id)->value('details'));

        $this->getJson("/api/sync/runs/{$cast}")->assertJsonPath('data.kind', 'cast')->assertJsonPath('data.types', ['actor'])
            ->assertJsonPath('data.counts.updated', 1)->assertJsonPath('data.counts.skipped', 1);
        $items = $this->items($cast);
        $this->assertSame(['actor', ['details', 'photo']], [$items["actor:{$actor->id}"]['type'], $items["actor:{$actor->id}"]['changes']]);
        $this->assertSame(CastEnricher::EMPTY, $items["actor:{$other->id}"]['reason']);
        // მსახიობზე — სვეტები; ფოტოზე მხოლოდ ფაქტი, ფაილის მისამართი არ იწერება
        $this->assertEqualsCanonicalizing([
            ['field' => 'birthday', 'from' => null, 'to' => '1964-09-02'],
            ['field' => 'place_of_birth', 'from' => null, 'to' => 'Beirut'],
            ['field' => 'photo', 'file' => true, 'replaced' => false],
        ], $items["actor:{$actor->id}"]['details']);
        $this->assertStringNotContainsString('keanu.jpg', (string) DB::table('sync_run_items')->where('type', 'actor')->where('record_id', $actor->id)->value('details'));
        $this->assertSame([], $items["actor:{$other->id}"]['details']);
    }

    public function test_an_overwriting_run_keeps_the_old_value_next_to_the_new_one(): void
    {
        $this->actingAs($this->alice);
        $movie = $this->movie(603);
        $overwrite = fn (string $run) => $this->postJson("/api/media/sync/movie/{$movie->id}", [
            'fields' => ['title', 'year', 'genres'], 'overwrite' => true, 'run' => $run, 'run_total' => 1,
        ])->assertOk();

        $this->tmdb[603][0]['genres'] = [['id' => 28, 'name' => 'Action'], ['id' => 878, 'name' => 'Science Fiction']];
        $overwrite($first = (string) Str::uuid());

        // წყარომ სათაური შეცვალა და ერთი ჟანრი სხვით ჩაანაცვლა
        $this->tmdb[603][0]['title'] = 'The Matrix Remastered';
        $this->tmdb[603][0]['genres'] = [['id' => 28, 'name' => 'Action'], ['id' => 53, 'name' => 'Thriller']];
        $overwrite($second = (string) Str::uuid());

        $before = collect($this->items($first)[$movie->id]['details'])->keyBy('field');
        $this->assertEqualsCanonicalizing(['Action', 'Science Fiction'], $before['genres']['added']);
        // ბაზაში ელემენტი id-თან ერთად წერია — წაკითხვისას ჩაკეტილი ამით იფილტრება
        $this->assertArrayHasKey('id', collect(SyncRunItem::where('record_id', $movie->id)->first()->details)->firstWhere('field', 'genres')['added'][0]);
        $this->assertSame([], $before['genres']['removed']);

        $after = collect($this->items($second)[$movie->id]['details'])->keyBy('field');
        $this->assertSame(['field' => 'title_en', 'from' => 'The Matrix', 'to' => 'The Matrix Remastered'], $after['title_en']);
        $this->assertSame(['field' => 'genres', 'added' => ['Thriller'], 'removed' => ['Science Fiction']], $after['genres']);
        // რაც არ შეცვლილა (წელი), მნიშვნელობებში არ ჩანს
        $this->assertSame(['title_en', 'genres'], $after->keys()->all());

        // იგივე მონაცემის ხელახლა გადაწერა: მწერალი ველებს ისევ „შეცვლილად" აბრუნებს, ისტორიაში კი ერთეული უცვლელია
        $third = (string) Str::uuid();
        $this->assertNotEmpty($overwrite($third)->json('changed'));
        $same = $this->items($third)[$movie->id];
        $this->assertSame(['unchanged', [], []], [$same['result'], $same['changes'], $same['details']]);
        $this->getJson("/api/sync/runs/{$third}")->assertJsonPath('data.counts.unchanged', 1)->assertJsonPath('data.counts.updated', 0);
    }

    public function test_facts_count_downloaded_episodes_and_cut_long_text(): void
    {
        $this->actingAs($this->alice);
        $series = Series::create(['user_id' => $this->alice->id, 'tmdb_id' => 1399])->refresh();
        TvEpisode::create(['tmdb_series_id' => 1399, 'season_number' => 1, 'episode_number' => 1]);

        $facts = SyncFacts::watch($series, SyncHistory::KIND_EPISODES);
        TvEpisode::create(['tmdb_series_id' => 1399, 'season_number' => 1, 'episode_number' => 2]);
        TvEpisode::create(['tmdb_series_id' => 1399, 'season_number' => 2, 'episode_number' => 1]);
        // სხვა სერიალის ეპიზოდი ამ რიცხვში არ ითვლება
        TvEpisode::create(['tmdb_series_id' => 1400, 'season_number' => 1, 'episode_number' => 1]);

        $this->assertSame([
            ['field' => 'seasons', 'from' => '1', 'to' => '2'],
            ['field' => 'episodes', 'from' => '1', 'to' => '3'],
        ], $facts->changes());

        // ახალი სერია არ ჩამოსულა — „განახლდა" ისტორიაში „უცვლელი" ხდება; ჩამოსულზე რიცხვიანი კოდები რჩება
        $totals = [SyncHistory::UPDATED, ['seasons:2', 'episodes:3'], null];
        $this->assertSame([[SyncHistory::UNCHANGED, [], null], []], SyncFacts::watch($series, SyncHistory::KIND_EPISODES)->settle($totals));
        $this->assertSame($totals, $facts->settle($totals)[0]);
        // ფაილის კოდსა და ფაქტის გარეშე კოდს მწერლის სიტყვა წყვეტს
        $kept = [SyncHistory::UPDATED, ['poster', 'photos'], null];
        $this->assertSame([$kept, []], SyncFacts::watch($this->movie(604), SyncHistory::KIND_SYNC)->settle($kept));

        // ისტორიაში არჩაწერილ გაშვებაზე ჩანაწერი საერთოდ არ იკითხება
        $this->assertSame([], SyncFacts::watch($series, SyncHistory::KIND_EPISODES, false)->changes());

        // გრძელი აღწერა იჭრება — სრული ტექსტი ჩანაწერის გვერდზეა
        $movie = $this->movie(603);
        $long = SyncFacts::watch($movie, SyncHistory::KIND_SYNC);
        $movie->setTranslation('en', ['description' => str_repeat('ა', SyncFacts::TEXT_MAX + 500)]);
        $cut = $long->changes()[0];
        $this->assertSame('description_en', $cut['field']);
        $this->assertSame(SyncFacts::TEXT_MAX + 1, mb_strlen($cut['to']));
        $this->assertStringEndsWith('…', $cut['to']);
    }

    public function test_items_can_be_paused_and_resumed_from_a_run(): void
    {
        $this->actingAs($this->alice);
        $good = $this->movie(603);
        $bad = $this->movie(606);
        $actor = CastMember::create(['tmdb_person_id' => 6384, 'name' => 'Keanu Reeves']);
        $run = (string) Str::uuid();
        $this->step($good, $run, 3);
        $this->step($bad, $run, 3);
        app(SyncHistory::class)->record($this->alice->id, $run, 'sync', 'queue', 3, 'actor', $actor->id, 'Keanu Reeves', SyncHistory::FAILED, [], 'tmdb_unavailable');

        // ყველა ჩავარდნილზე ერთად — ფილმზე გადამრთველი, მსახიობზე ჩემი პარამეტრი
        $this->postJson("/api/sync/runs/{$run}/pause", ['paused' => true, 'failed' => true])->assertOk()->assertJsonPath('changed', 2);
        $this->assertTrue((bool) $bad->refresh()->sync_paused);
        $this->assertFalse((bool) $good->refresh()->sync_paused);
        $this->assertTrue(CastMemberSyncPref::withoutGlobalScope('owner')->where('user_id', $this->alice->id)->where('cast_member_id', $actor->id)->exists());
        // ჩანაწერის გადამრთველი ჟურნალში ჩანს, როგორც მისი გვერდიდან
        $this->assertSame(1, AuditLog::where('action', AuditLog::ACTION_UPDATE)->where('subject_type', 'movie')->where('subject_id', $bad->id)->count());

        $items = $this->items($run);
        $this->assertTrue($items[$bad->id]['paused']);
        $this->assertTrue($items["actor:{$actor->id}"]['paused']);
        $this->assertFalse($items[$good->id]['paused']);

        // მონიშნულებზე: უკვე შეჩერებული არ ითვლება, ახალი — კი; მერე ისევ ჩართვა
        $picked = [$items[$good->id]['id'], $items[$bad->id]['id']];
        $this->postJson("/api/sync/runs/{$run}/pause", ['paused' => true, 'items' => $picked])->assertJsonPath('changed', 1);
        $this->postJson("/api/sync/runs/{$run}/pause", ['paused' => false, 'items' => [...$picked, $items["actor:{$actor->id}"]['id']]])->assertJsonPath('changed', 3);
        $this->assertFalse((bool) $bad->refresh()->sync_paused);
        $this->assertSame(0, CastMemberSyncPref::withoutGlobalScope('owner')->count());

        $this->postJson("/api/sync/runs/{$run}/pause", ['paused' => true])->assertStatus(422);

        // რედაქტირების უფლების გარეშე — 403, არაფერი იცვლება
        $role = Role::create(['key' => 'viewer', 'name_ka' => 'მკითხველი', 'name_en' => 'Viewer', 'permissions' => ['movie' => ['view']]]);
        $this->alice->forceFill(['role_id' => $role->id])->save();
        $this->actingAs($this->alice->refresh())->postJson("/api/sync/runs/{$run}/pause", ['paused' => true, 'items' => $picked])
            ->assertStatus(403)->assertJsonPath('permission', 'movie.update');
        $this->assertFalse((bool) $good->refresh()->sync_paused);
    }

    public function test_history_is_private_and_never_shows_a_locked_record(): void
    {
        $this->actingAs($this->alice);
        $open = $this->movie(603);
        $secret = $this->movie(604);
        $actor = CastMember::create(['tmdb_person_id' => 6384, 'name' => 'Keanu Reeves']);
        $run = (string) Str::uuid();
        $this->step($open, $run, 3);
        $this->step($secret, $run, 3);
        app(SyncHistory::class)->record($this->alice->id, $run, 'sync', 'queue', 3, 'actor', $actor->id, 'Keanu Reeves', SyncHistory::UPDATED, ['details']);
        $this->assertCount(3, $this->items($run));

        // გაშვების შემდეგ ჩაკეტილი ფილმი და მსახიობი: სათაური ისტორიიდან არ უნდა გაჟონოს
        foreach ([$secret, $actor] as $record) {
            RecordLock::create([
                'user_id' => $this->alice->id,
                'lockable_type' => $record->getMorphClass(),
                'lockable_id' => $record->getKey(),
                'password_hash' => Hash::make('secret1'),
            ]);
        }

        $this->assertSame([$open->id], array_keys($this->items($run)));
        $this->assertSame([], $this->items($run, '?q=reloaded'));
        // ჩაკეტილის არც სათაური გამოდის, არც ჩაწერილი მნიშვნელობა
        $this->assertStringNotContainsString('Reloaded', (string) $this->getJson("/api/sync/runs/{$run}/items")->getContent());
        $this->getJson("/api/sync/runs/{$run}")->assertJsonPath('data.done', 1)->assertJsonPath('data.types', ['movie']);
        $hidden = SyncRunItem::where('record_id', $secret->id)->value('id');
        $this->postJson("/api/sync/runs/{$run}/pause", ['paused' => true, 'items' => [$hidden]])->assertJsonPath('changed', 0);

        // სხვის გაშვებას ვერავინ ხედავს — 404 და არა 403
        $this->actingAs($this->bob);
        $this->getJson('/api/sync/runs')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/sync/runs/{$run}")->assertNotFound();
        $this->getJson("/api/sync/runs/{$run}/items")->assertNotFound();
        $this->postJson("/api/sync/runs/{$run}/pause", ['paused' => true, 'failed' => true])->assertNotFound();

        // იგივე გასაღებით სხვისი გაშვება ცალკე რიგია
        $mine = $this->movie(603, $this->bob);
        $this->step($mine, $run, 1);
        $this->assertSame(2, SyncRun::withoutGlobalScope('owner')->where('key', $run)->count());
        $this->assertSame([$mine->id], array_keys($this->items($run)));
    }

    public function test_an_actor_locked_after_the_run_leaves_the_cast_changes_of_a_record(): void
    {
        $this->actingAs($this->alice);
        $movie = $this->movie(603);
        $run = (string) Str::uuid();
        $this->credits = [
            ['id' => 6384, 'name' => 'Keanu Reeves', 'character' => 'Neo'],
            ['id' => 2975, 'name' => 'Laurence Fishburne', 'character' => 'Morpheus'],
        ];

        $this->postJson("/api/media/sync/movie/{$movie->id}", ['fields' => ['cast'], 'run' => $run, 'run_total' => 1])->assertOk();

        $cast = fn () => collect($this->items($run)[$movie->id]['details'])->firstWhere('field', 'cast');
        $this->assertSame(['field' => 'cast', 'added' => ['Keanu Reeves', 'Laurence Fishburne'], 'removed' => []], $cast());

        $lock = fn (int $tmdbId) => RecordLock::create([
            'user_id' => $this->alice->id,
            'lockable_type' => (new CastMember)->getMorphClass(),
            'lockable_id' => CastMember::where('tmdb_person_id', $tmdbId)->value('id'),
            'password_hash' => Hash::make('secret1'),
        ]);

        // ფილმის ერთეული რჩება, მაგრამ ჩაკეტილი მსახიობის სახელი მის ცვლილებებში აღარ ჩანს
        $lock(6384);
        $this->assertSame(['field' => 'cast', 'added' => ['Laurence Fishburne'], 'removed' => []], $cast());
        $this->assertStringNotContainsString('Keanu', (string) $this->getJson("/api/sync/runs/{$run}/items")->getContent());

        // ორივე რომ ჩაიკეტოს, „მსახიობები" ცვლილებებიდან მთლიანად ქრება
        $lock(2975);
        $this->assertNull($cast());
    }

    public function test_runs_older_than_ninety_days_are_pruned_with_their_items(): void
    {
        $this->actingAs($this->alice);
        $old = (string) Str::uuid();
        $fresh = (string) Str::uuid();
        $this->step($this->movie(603), $old, 1);
        $this->step($this->movie(604), $fresh, 1);

        DB::table('sync_runs')->where('key', $old)->update(['updated_at' => now()->subDays(SyncRun::KEEP_DAYS + 1)]);
        DB::table('sync_runs')->where('key', $fresh)->update(['updated_at' => now()->subDays(SyncRun::KEEP_DAYS - 1)]);

        Artisan::call('model:prune', ['--model' => [SyncRun::class]]);

        $this->assertSame([$fresh], SyncRun::pluck('key')->all());
        $this->assertSame(1, SyncRunItem::count());
    }
}
