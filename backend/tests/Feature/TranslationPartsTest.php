<?php

namespace Tests\Feature;

use App\Jobs\RunBatchItem;
use App\Models\Anime;
use App\Models\CastMember;
use App\Models\CastMemberSyncPref;
use App\Models\CastMemberTranslation;
use App\Models\Module;
use App\Models\Movie;
use App\Models\RecordLock;
use App\Models\Series;
use App\Models\SyncRun;
use App\Models\User;
use App\Services\Export\RecordExtras;
use App\Services\Search\GlobalSearch;
use App\Services\Sync\SyncHistory;
use App\Services\Translation\ItemTranslator;
use App\Services\Translation\TranslationScanner;
use App\Services\Translation\Translator;
use App\Support\BackgroundProcess;
use App\Support\StatusDomain;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Mockery;
use Tests\TestCase;

/**
 * **თარგმანი ნაწილებად და მსახიობის ქართული სახელი და ბიოგრაფია.**
 *
 * ⚠️ მოწმდება: ჩაშლილი რიცხვები (`/translations/parts`) ემთხვევა გეგმას — მთელ
 * ბიბლიოთეკაზეც და ერთ მოდულზეც (ანიმე ცალკე); ერთი ნაწილის გაშვება მხოლოდ თავის ველს
 * ავსებს; მსახიობის ქართულ სახელს ჯერ TMDB წერს, სადაც არ არის — Gemini, და მხოლოდ
 * მანქანური სახელი ინიშნება გადასამოწმებლად; არსებული ქართული სახელი და ბიოგრაფია არ
 * გადაიწერება; ჩაკეტილი და შეჩერებული („აღარ განაახლო") მსახიობი გეგმაში არ არის;
 * მსახიობის გვერდი ქართულ ბიოგრაფიას აბრუნებს და ნიშანი დადასტურებით ან გასწორებით
 * იხსნება; ძებნა ქართულ ბიოგრაფიაშიც ეძებს; ლიმიტზე გაჩერებული გაშვება ერთეულს
 * ჩავარდნილად არ წერს და დარჩენილზე გრძელდება; ქვემენიუს გასაღები დაჯავშნილია.
 */
class TranslationPartsTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;

    /** @var array<int, array<string, mixed>> TMDB-ის პიროვნება ქართულად: id → პასუხი */
    private array $people = [];

    /** @var array<string, string|null> Gemini-ს პასუხები: წყაროს ტექსტი → შედეგი */
    private array $gemini = [];

    /** დღიური ლიმიტი ამოიწურა — ყოველი შემდეგი მოთხოვნა პასუხის გარეშე ბრუნდება */
    private bool $exhausted = false;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        $this->alice = User::create(['name' => 'alice', 'username' => 'alice', 'email' => 'alice@example.com', 'password' => 'password']);
        $this->alice->modules()->sync(Module::pluck('id')->all());
        $this->alice->refresh();
        $this->giveCredential($this->alice, 'tmdb');
        $this->giveCredential($this->alice, 'gemini', ['key' => 'test-key']);

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
            'api.themoviedb.org/3/person/*' => function ($request) {
                preg_match('#/person/(\d+)#', $request->url(), $m);

                return Http::response($this->people[(int) ($m[1] ?? 0)] ?? ['name' => 'Latin Name', 'biography' => '']);
            },
            // ჩანაწერებზე TMDB-ს თარგმანი არ აქვს — ყველაფერი თარჯიმანზე მიდის
            'api.themoviedb.org/*' => Http::response([]),
        ]);

        $mock = Mockery::mock(Translator::class);
        $mock->shouldReceive('configured')->andReturn(true);
        $mock->shouldReceive('usage')->andReturnUsing(fn () => ['configured' => true, 'limit' => 10, 'remaining' => 4, 'exhausted' => $this->exhausted]);
        $answer = fn ($text) => $this->exhausted ? null : ($this->gemini[trim((string) $text)] ?? null);
        $mock->shouldReceive('translate')->andReturnUsing(fn ($text, $to, $context = 'text') => $answer($text));
        $mock->shouldReceive('transliterate')->andReturnUsing(fn ($name) => $answer($name));
        $mock->shouldReceive('review')->andReturn(null);
        $mock->shouldReceive('lastError')->andReturnUsing(fn () => $this->exhausted ? 'gemini_quota_exceeded' : null);
        $this->app->instance(Translator::class, $mock);
        $this->app->forgetInstance(ItemTranslator::class);
    }

    /**
     * @param  class-string<Movie|Series|Anime>  $model
     * @param  array<string, string>  $ka
     * @param  array<string, string>  $en
     */
    private function record(string $model, array $ka = [], array $en = [], array $extra = []): Movie|Series|Anime
    {
        $record = $model::create(['user_id' => $this->alice->id, ...$extra]);
        if ($ka) {
            $record->setTranslation('ka', $ka);
        }
        if ($en) {
            $record->setTranslation('en', $en);
        }

        return $record->refresh();
    }

    /** მსახიობი ამ ბიბლიოთეკაში — ფილმის მსახიობებში */
    private function actor(Movie|Series|Anime $record, array $attributes): CastMember
    {
        $member = CastMember::create(['name' => Str::random(8), ...$attributes]);
        $record->cast()->syncWithoutDetaching([$member->id => ['character' => 'X', 'billing_order' => $member->id]]);

        return $member;
    }

    /** @return array<string, int> ნაწილი → რიცხვი */
    private function counts(string $query = ''): array
    {
        return collect($this->getJson('/api/translations/parts'.$query)->assertOk()->json('parts'))->map(fn (array $part) => $part['count'])->all();
    }

    /** @return array<string, mixed> */
    private function plan(array $body): array
    {
        return $this->postJson('/api/translations/plan', $body)->assertOk()->json();
    }

    public function test_part_numbers_match_what_each_part_would_run(): void
    {
        $this->actingAs($this->alice);

        // ფილმები: სათაური ქართულად ×2, აღწერა ქართულად ×1, აღწერა ინგლისურად ×1
        $this->record(Movie::class, [], ['title' => 'The Matrix', 'description' => 'A hacker.']);
        $this->record(Movie::class, [], ['title' => 'Heat']);
        $this->record(Movie::class, ['title' => 'სიცხე', 'description' => 'ორი კაცი.'], ['title' => 'Heat']);
        // სრულად ნათარგმნი; „აღარ განაახლო"; ჩაკეტილი — რიცხვში არ არის
        $this->record(Movie::class, ['title' => 'ა'], ['title' => 'A']);
        $this->record(Movie::class, [], ['title' => 'Paused'], ['sync_paused' => true]);
        $locked = $this->record(Movie::class, [], ['title' => 'Secret']);
        RecordLock::create(['user_id' => $this->alice->id, 'lockable_type' => $locked->getMorphClass(), 'lockable_id' => $locked->id, 'password_hash' => Hash::make('secret1')]);
        // სერიალი და ანიმე ცალ-ცალკე ითვლება
        $this->record(Series::class, ['title' => 'სერიალი'], []);
        $this->record(Anime::class, [], ['title' => 'Bebop']);
        // გადასამოწმებელი: TMDB-ის ქართული აღწერა და ინგლისური ორიგინალი
        $this->record(Series::class, ['title' => 'ს', 'description' => 'აღწერა', 'source' => 'tmdb'], ['title' => 'S', 'description' => 'Synopsis']);

        $parts = $this->getJson('/api/translations/parts')->assertOk()->json('parts');
        $this->assertSame(['movie' => 2, 'series' => 0, 'anime' => 1], $parts['title_ka']['by_type']);
        $this->assertSame(['count' => 1, 'by_type' => ['movie' => 0, 'series' => 1, 'anime' => 0]], $parts['title_en']);
        $this->assertSame(['count' => 1, 'by_type' => ['movie' => 1, 'series' => 0, 'anime' => 0]], $parts['description_ka']);
        $this->assertSame(1, $parts['description_en']['count']);
        $this->assertSame(['movie' => 0, 'series' => 1, 'anime' => 0], $parts['review']['by_type']);

        // ყოველი ნაწილის რიცხვი ზუსტად ის არის, რასაც მისი გეგმა გაუშვებს — სხვა ნაწილის ჩანაწერის გარეშე
        foreach (TranslationScanner::FIELDS as $field) {
            $plan = $this->plan(['parts' => [$field]]);
            $this->assertSame($parts[$field]['count'], $plan['count'], $field);
            $this->assertSame([[$field]], array_values(array_unique(array_column($plan['items'], 'missing'), SORT_REGULAR)), $field);
        }
        $review = $this->plan(['parts' => ['review']]);
        $this->assertSame($parts['review']['count'], $review['count']);
        $this->assertSame([[]], array_values(array_unique(array_column($review['items'], 'missing'), SORT_REGULAR)));

        // მოდულის გვერდი: მხოლოდ ამ მოდულის ჩანაწერები
        $this->assertSame(2, $this->counts('?type=movie')['title_ka']);
        $this->assertSame(1, $this->counts('?type=anime')['title_ka']);
        $this->assertSame(0, $this->counts('?type=series')['title_ka']);
        $this->getJson('/api/translations/parts?type=book')->assertStatus(422);

        // „ყველაფერი" ყველა ნაწილს უშვებს; ნაწილის გარეშე გეგმა ცარიელია
        $this->assertSame(6, $this->plan(['parts' => [...TranslationScanner::FIELDS, 'review']])['count']);
        $this->assertSame(0, $this->plan(['parts' => []])['count']);
    }

    public function test_running_one_part_fills_only_its_own_field(): void
    {
        $this->actingAs($this->alice);
        $movie = $this->record(Movie::class, [], ['title' => 'The Matrix', 'description' => 'A hacker.']);
        $this->gemini = ['The Matrix' => 'მატრიცა', 'A hacker.' => 'ჰაკერი.'];
        $run = (string) Str::uuid();

        $this->postJson("/api/translations/movie/{$movie->id}", ['fields' => ['title_ka'], 'run' => $run, 'run_total' => 1])
            ->assertOk()->assertJsonPath('changed', ['title_ka']);

        $movie->refresh();
        $this->assertSame('მატრიცა', $movie->title_ka);
        $this->assertSame('', (string) $movie->description_ka);
        // ისტორიაში — მხოლოდ ეს ველი, რით ითარგმნა და რა ტექსტი ჩაიწერა
        $item = $this->getJson("/api/sync/runs/{$run}/items")->json('data.0');
        $this->assertSame([['field' => 'title_ka', 'from' => null, 'to' => 'მატრიცა', 'by' => 'gemini']], $item['details']);

        // დარჩენილი ნაწილი თავის რიცხვში რჩება და ცალკე ეშვება
        $this->assertSame([0, 1], [$this->counts()['title_ka'], $this->counts()['description_ka']]);
        $this->postJson("/api/translations/movie/{$movie->id}", ['fields' => ['description_ka']])->assertJsonPath('changed', ['description_ka']);
        $this->assertSame('ჰაკერი.', $movie->refresh()->description_ka);

        // ცარიელი სია — არცერთი ველი (მხოლოდ გადამოწმება): არაფერი ივსება
        $other = $this->record(Movie::class, [], ['title' => 'Heat']);
        $this->gemini['Heat'] = 'სიცხე';
        $this->postJson("/api/translations/movie/{$other->id}", ['fields' => []])->assertJsonPath('skipped', true);
        $this->assertSame('', (string) $other->refresh()->title_ka);
        $this->postJson("/api/translations/movie/{$other->id}", ['fields' => ['nonsense']])->assertStatus(422);
    }

    public function test_actor_names_come_from_tmdb_first_and_a_machine_name_is_marked(): void
    {
        $this->actingAs($this->alice);
        $movie = $this->record(Movie::class, ['title' => 'ა'], ['title' => 'A']);
        $series = $this->record(Series::class, ['title' => 'ს'], ['title' => 'S']);

        $onTmdb = $this->actor($movie, ['name' => 'Keanu Reeves', 'tmdb_person_id' => 6384, 'biography' => 'Born in Beirut.']);
        $machine = $this->actor($movie, ['name' => 'Carrie-Anne Moss', 'tmdb_person_id' => 530]);
        $manual = $this->actor($series, ['name' => 'Local Actor']);
        $named = $this->actor($movie, ['name' => 'Hugo Weaving', 'tmdb_person_id' => 1331, 'biography' => 'An actor.']);
        $named->setTranslation('ka', 'ჰიუგო უივინგი');
        $named->setGeorgian('biography', 'ჩემი ტექსტი.', CastMemberTranslation::SOURCE_MANUAL);
        // გეგმაში არ არის: ჩემი „აღარ განაახლო", ჩემი ლოკი და სხვისი ბიბლიოთეკის მსახიობი
        $paused = $this->actor($movie, ['name' => 'Paused One', 'biography' => 'Text.']);
        CastMemberSyncPref::withoutGlobalScope('owner')->create(['user_id' => $this->alice->id, 'cast_member_id' => $paused->id, 'paused_at' => now()]);
        $locked = $this->actor($movie, ['name' => 'Locked One', 'biography' => 'Text.']);
        RecordLock::create(['user_id' => $this->alice->id, 'lockable_type' => $locked->getMorphClass(), 'lockable_id' => $locked->id, 'password_hash' => Hash::make('secret1')]);
        CastMember::create(['name' => 'Elsewhere', 'biography' => 'Text.']);

        $this->people[6384] = ['name' => 'კიანუ რივზი', 'biography' => 'Born in Beirut.'];
        $this->gemini = ['Carrie-Anne Moss' => 'კერი-ენ მოსი', 'Local Actor' => 'ლოკალ აქტორი', 'Born in Beirut.' => 'დაიბადა ბეირუთში.'];

        // --- რიცხვები და გეგმა: სახელი აკლია სამს, ბიოგრაფია — ერთს; მოდულის გვერდზე მხოლოდ მისი მსახიობები ---
        $this->assertSame([3, 1], [$this->counts()['cast_names'], $this->counts()['cast_bios']]);
        $this->assertSame([2, 1], [$this->counts('?type=movie')['cast_names'], $this->counts('?type=series')['cast_names']]);

        $names = $this->plan(['parts' => ['cast_names']]);
        $this->assertSame([0, 3], [$names['count'], $names['cast_count']]);
        $this->assertEqualsCanonicalizing([$onTmdb->id, $machine->id, $manual->id], array_column($names['cast'], 'id'));
        $this->assertSame([['name']], array_values(array_unique(array_column($names['cast'], 'missing'), SORT_REGULAR)));
        $both = $this->plan(['parts' => ['cast_names', 'cast_bios']]);
        $this->assertSame(['name', 'biography'], collect($both['cast'])->firstWhere('id', $onTmdb->id)['missing']);
        // ხარჯი გაშვებამდე: ოთხი მოთხოვნა (სამი სახელი + ერთი ბიოგრაფია), დღეს ოთხივე ეტევა
        $this->assertSame(['requests' => 4, 'limit' => 10, 'remaining' => 4, 'days' => 1], $both['gemini']);

        // --- სახელების ნაწილი: TMDB-ის სახელი სუფთაა, მანქანური — გადასამოწმებელი; ბიოგრაფიას არ ეხება ---
        $run = (string) Str::uuid();
        $step = fn (CastMember $member, array $fields) => $this->postJson("/api/translations/actor/{$member->id}", ['fields' => $fields, 'run' => $run, 'run_total' => 3])->assertOk();

        $step($onTmdb, ['name'])->assertJsonPath('providers', ['name_ka' => 'tmdb']);
        $step($machine, ['name'])->assertJsonPath('providers', ['name_ka' => 'gemini']);
        $step($manual, ['name'])->assertJsonPath('changed', ['name_ka']);

        $this->assertSame(['კიანუ რივზი', false], [$onTmdb->refresh()->name_ka, $onTmdb->georgianUnverified('name')]);
        $this->assertSame(['კერი-ენ მოსი', true], [$machine->refresh()->name_ka, $machine->georgianUnverified('name')]);
        $this->assertNull($onTmdb->biography_ka);
        $this->assertSame(0, $this->counts()['cast_names']);

        // ისტორია: სახეობა „თარგმანი", ერთეული მსახიობია, ჩანს რით და რა ჩაიწერა
        $this->getJson("/api/sync/runs/{$run}")->assertJsonPath('data.kind', 'translate')->assertJsonPath('data.types', ['actor']);
        $items = collect($this->getJson("/api/sync/runs/{$run}/items")->json('data'))->keyBy('record_id');
        $this->assertSame([['field' => 'name_ka', 'from' => null, 'to' => 'კერი-ენ მოსი', 'by' => 'gemini']], $items[$machine->id]['details']);

        // --- არსებული ქართული სახელი და ბიოგრაფია არ გადაიწერება ---
        $this->postJson("/api/translations/actor/{$named->id}")->assertJsonPath('skipped', true);
        $this->assertSame(['ჰიუგო უივინგი', 'ჩემი ტექსტი.'], [$named->refresh()->name_ka, $named->biography_ka]);

        // --- ბიოგრაფიის ნაწილი: თარგმანი გადასამოწმებელია ---
        $this->postJson("/api/translations/actor/{$onTmdb->id}", ['fields' => ['biography']])->assertJsonPath('providers', ['biography_ka' => 'gemini']);
        $this->assertSame(['დაიბადა ბეირუთში.', true], [$onTmdb->refresh()->biography_ka, $onTmdb->georgianUnverified('biography')]);
        $this->assertSame(0, $this->counts()['cast_bios']);

        // --- „აღარ განაახლო" მსახიობზე თარგმანსაც აჩერებს; ჩაკეტილი 423-ია ---
        $this->postJson("/api/translations/actor/{$paused->id}")->assertJsonPath('skipped', true);
        $this->assertNull($paused->refresh()->name_ka);

        // --- მსახიობის გვერდი: ქართული ბიოგრაფია და ნიშნები ---
        $this->getJson("/api/cast/{$onTmdb->id}")->assertOk()
            ->assertJsonPath('actor.biography', 'Born in Beirut.')
            ->assertJsonPath('actor.biography_ka', 'დაიბადა ბეირუთში.')
            ->assertJsonPath('actor.biography_ka_unverified', true)
            ->assertJsonPath('actor.name_ka_unverified', false);
        $this->getJson("/api/cast/{$named->id}")->assertJsonPath('actor.biography_ka', 'ჩემი ტექსტი.')->assertJsonPath('actor.biography_ka_unverified', false);

        // --- ნიშანი იხსნება დადასტურებით ან ხელით გასწორებით; სუფთა ტექსტი ხელით არ იცვლება ---
        $this->patchJson("/api/cast/{$onTmdb->id}/georgian", ['field' => 'biography'])->assertOk()
            ->assertJsonPath('actor.biography_ka', 'დაიბადა ბეირუთში.')->assertJsonPath('actor.biography_ka_unverified', false);
        $this->patchJson("/api/cast/{$machine->id}/georgian", ['field' => 'name', 'text' => ' კერი-ენ მოსსი '])->assertOk()
            ->assertJsonPath('actor.name_ka', 'კერი-ენ მოსსი')->assertJsonPath('actor.name_ka_unverified', false);
        $this->patchJson("/api/cast/{$onTmdb->id}/georgian", ['field' => 'name', 'text' => 'სხვა'])->assertStatus(409)->assertJsonPath('message', 'cast_text_not_pending');
        $this->patchJson("/api/cast/{$machine->id}/georgian", ['field' => 'name', 'text' => ''])->assertStatus(422);
        $this->assertSame('კიანუ რივზი', $onTmdb->refresh()->name_ka);

        // --- ძებნა ქართულ ბიოგრაფიაშიც ეძებს ---
        $found = collect(app(GlobalSearch::class)->search($this->alice, 'ბეირუთში')['groups'])->firstWhere('key', 'cast');
        $this->assertSame([$onTmdb->id], array_column($found['items'] ?? [], 'id'));
    }

    public function test_a_run_stopped_by_the_daily_limit_continues_on_what_is_left(): void
    {
        $this->actingAs($this->alice);
        $movie = $this->record(Movie::class, ['title' => 'ა'], ['title' => 'A']);
        $first = $this->actor($movie, ['name' => 'First', 'biography' => 'One.']);
        $second = $this->actor($movie, ['name' => 'Second', 'biography' => 'Two.']);
        $third = $this->actor($movie, ['name' => 'Third', 'biography' => 'Three.']);
        $this->gemini = ['One.' => 'ერთი.', 'Two.' => 'ორი.', 'Three.' => 'სამი.'];

        // რიგმა გაშვება გახსნა (რაზე და რით) და პირველი მსახიობი თარგმნა
        $run = (string) Str::uuid();
        $this->postJson('/api/sync/runs', [
            'key' => $run,
            'kind' => 'translate',
            'items' => array_map(fn (CastMember $actor) => ['type' => 'actor', 'id' => $actor->id], [$first, $second, $third]),
            'params' => ['sources' => ['gemini'], 'cast' => ['biography'], 'fields' => []],
        ])->assertCreated()->assertJsonPath('data.params', ['sources' => ['gemini'], 'review' => false, 'fields' => [], 'cast' => ['biography']]);
        $body = ['fields' => ['biography'], 'sources' => ['gemini'], 'run' => $run, 'run_total' => 3];
        $this->postJson("/api/translations/actor/{$first->id}", $body)->assertJsonPath('ok', true);

        // ლიმიტი ამოიწურა: ერთეული ჩავარდნილად არ იწერება — შედეგის გარეშე რჩება
        $this->exhausted = true;
        $this->postJson("/api/translations/actor/{$second->id}", $body)->assertOk()
            ->assertJsonPath('ok', false)->assertJsonPath('error', 'gemini_quota_exceeded');
        $this->postJson("/api/sync/runs/{$run}/stop")->assertOk()
            ->assertJsonPath('data.state', SyncRun::INTERRUPTED)
            ->assertJsonPath('data.counts', ['updated' => 1, 'unchanged' => 0, 'skipped' => 0, 'failed' => 0])
            ->assertJsonPath('data.left', 2)
            ->assertJsonPath('data.resumable', true);
        // თარგმანის გვერდი გაწყვეტილ გაშვებას სთავაზობს; სინქრონიზაციის გვერდი — არა
        $this->getJson('/api/sync/unfinished?kind=translate')->assertOk()->assertJsonPath('runs', 1)->assertJsonPath('unfinished.0.key', $run)->assertJsonPath('latest.key', $run);
        $this->getJson('/api/sync/overview')->assertJsonCount(0, 'unfinished');

        // იმავე დღეს გაგრძელება: პარტია პირველივე ერთეულზე ისევ ლიმიტს ეჯახება და წყდება
        $this->postJson("/api/sync/runs/{$run}/resume")->assertStatus(202);
        $jobs = DB::table('jobs')->orderBy('id')->get()->map(fn ($job) => unserialize(json_decode($job->payload, true)['data']['command']))->all();
        $this->assertSame([['translate', 'actor', $second->id], ['translate', 'actor', $third->id]], array_map(fn (RunBatchItem $job) => [$job->kind, $job->type, $job->recordId], $jobs));
        $this->assertSame(['sources' => ['gemini'], 'review' => false, 'fields' => [], 'cast' => ['biography'], 'delay_ms' => 0], $jobs[0]->options);
        Artisan::call('queue:work', ['--stop-when-empty' => true, '--max-time' => 20, '--tries' => 1, '--memory' => 0]);

        $stuck = $this->getJson("/api/sync/runs/{$run}")->json('data');
        $this->assertSame([SyncRun::INTERRUPTED, 2, 0, true], [$stuck['state'], $stuck['left'], $stuck['counts']['failed'], $stuck['resumable']]);
        $this->assertNull($second->refresh()->biography_ka);

        // მეორე დღეს: დარჩენილი ორი ითარგმნება — იმავე გაშვებაში
        $this->exhausted = false;
        $this->postJson("/api/sync/runs/{$run}/resume")->assertStatus(202);
        Artisan::call('queue:work', ['--stop-when-empty' => true, '--max-time' => 20, '--tries' => 1, '--memory' => 0]);

        $done = $this->getJson("/api/sync/runs/{$run}")->json('data');
        $this->assertSame([SyncRun::FINISHED, 0, 3], [$done['state'], $done['left'], $done['counts']['updated']]);
        $this->assertSame(['ორი.', 'სამი.'], [$second->refresh()->biography_ka, $third->refresh()->biography_ka]);
        $this->assertSame(1, SyncRun::count());
        $this->getJson('/api/sync/unfinished?kind=translate')->assertJsonCount(0, 'unfinished');
    }

    public function test_the_submenu_key_is_reserved_and_the_biography_travels_with_the_export(): void
    {
        // ქვემენიუს „თარგმანი" ფსევდო-სექციაა — სტატუსი ამ გასაღებს ვერ იღებს
        $this->assertContains('translations', StatusDomain::RESERVED_KEYS);

        $this->actingAs($this->alice);
        $movie = $this->record(Movie::class, ['title' => 'ა'], ['title' => 'A']);
        $actor = $this->actor($movie, ['name' => 'Keanu Reeves', 'tmdb_person_id' => 6384, 'biography' => 'Born in Beirut.']);
        $actor->setGeorgian('biography', 'დაიბადა ბეირუთში.', CastMemberTranslation::SOURCE_TRANSLATION);

        $cast = collect(app(RecordExtras::class)->value($movie->refresh(), 'cast'))->firstWhere('tmdb_person_id', 6384);
        $this->assertSame(['დაიბადა ბეირუთში.', true], [$cast['biography_ka'], $cast['biography_ka_unverified']]);

        // ისტორიის მწერალი მსახიობის ერთეულს თარგმანის სახეობით იღებს
        $this->assertContains(SyncHistory::KIND_TRANSLATE, SyncHistory::KINDS);
    }
}
