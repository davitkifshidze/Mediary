<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Genre;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Series;
use App\Models\TranslationUsage;
use App\Models\User;
use App\Services\Translation\ItemTranslator;
use App\Services\Translation\TranslationScanner;
use App\Services\Translation\Translator;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Mockery;
use Tests\TestCase;

/**
 * Tasks 7 — თარგმანები.
 *
 * ცოცხალ TMDB/Gemini-ს არ ვაკითხავთ: `TmdbClient` კონფიგურირებული არაა ტესტში
 * (გასაღები არ არის), `Translator` კი mock-დება — ე.ი. ვამოწმებთ **ლოგიკას**:
 * ვის რა აკლია, საიდან ივსება და კვოტა… ანუ მრიცხველი ნულზე ჯდება თუ არა.
 */
class TranslationTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->user = User::create([
            'name' => 'kate',
            'username' => 'kate',
            'email' => 'kate@example.com',
            'password' => 'password',
        ]);

        $ids = Module::whereIn('key', ['movie', 'series'])
            ->pluck('id')
            ->mapWithKeys(fn ($id) => [$id => ['enabled_at' => now()]])
            ->all();
        $this->user->modules()->sync($ids);
        $this->user->refresh();
    }

    private function movie(array $ka = [], array $en = []): Movie
    {
        $movie = Movie::create(['user_id' => $this->user->id, 'year' => 2020]);
        if ($ka) {
            $movie->setTranslation('ka', $ka);
        }
        if ($en) {
            $movie->setTranslation('en', $en);
        }

        return $movie->refresh();
    }

    /* ---------- სკანერი: „თარგმანს წყარო სჭირდება" ---------- */

    public function test_missing_needs_a_source_in_the_other_language(): void
    {
        // en სათაური არის, ka — არა → ka-ს თარგმნა შეიძლება
        $one = $this->movie([], ['title' => 'The Matrix']);
        $this->assertSame(['title_ka'], TranslationScanner::missing($one));

        // ორივე სათაური არის, აღწერა არც ერთზე → **არაფერია სათარგმნი**
        $two = $this->movie(['title' => 'მატრიცა'], ['title' => 'The Matrix']);
        $this->assertSame([], TranslationScanner::missing($two));

        // აღწერა მხოლოდ ka-ზეა → en უნდა ითარგმნოს
        $three = $this->movie(
            ['title' => 'მატრიცა', 'description' => 'აღწერა'],
            ['title' => 'The Matrix'],
        );
        $this->assertSame(['description_en'], TranslationScanner::missing($three));
    }

    public function test_summary_counts_only_translatable_records(): void
    {
        $this->movie([], ['title' => 'A']);                                  // ka სათაური აკლია
        $this->movie(['title' => 'ბ'], ['title' => 'B']);                    // სრულია
        Series::create(['user_id' => $this->user->id])->setTranslation('en', ['title' => 'S']);

        $res = $this->actingAs($this->user)->getJson('/api/translations/summary')->assertOk();

        $res->assertJsonPath('movie', 1)->assertJsonPath('series', 1);
        /* გასაღები არ არის → ინტერფეისმა უნდა თქვას, რომ თარჯიმანი არ მუშაობს.
           ⚠️ კლავიშს **ცხადად** ვანულებთ და `.env`-ს არ ვენდობით: ნამდვილი
           `GEMINI_API_KEY` ამ ტესტს დეველოპერის მანქანაზე ჩააგდებდა. */
        $res->assertJsonPath('translator_configured', false);

        config(['services.gemini.key' => 'test-key']);
        $this->actingAs($this->user)->getJson('/api/translations/summary')
            ->assertJsonPath('translator_configured', true);
    }

    public function test_summary_ignores_disabled_modules(): void
    {
        $this->movie([], ['title' => 'A']);
        $this->user->modules()->sync([]); // ორივე მოდული გამოირთო

        $this->actingAs($this->user->refresh())->getJson('/api/translations/summary')
            ->assertOk()
            ->assertJsonPath('movie', 0)
            ->assertJsonPath('series', 0);
    }

    /* ---------- გეგმა ---------- */

    public function test_plan_returns_only_records_with_gaps(): void
    {
        $gap = $this->movie([], ['title' => 'Needs KA']);
        $this->movie(['title' => 'სრული'], ['title' => 'Complete']);

        $this->actingAs($this->user)
            ->postJson('/api/translations/plan', ['types' => ['movie']])
            ->assertOk()
            ->assertJsonPath('count', 1)
            ->assertJsonPath('items.0.id', $gap->id)
            ->assertJsonPath('items.0.missing.0', 'title_ka');
    }

    public function test_plan_filters_by_status_and_favorite(): void
    {
        $watched = $this->movie([], ['title' => 'Watched']);
        // §6.4 — სტატუსი ლექსიკონის რიგია, ე.ი. `update()`-ით ვეღარ დაიწერება
        $watched->applyStatusKey('watched');
        $watched->save();
        $this->movie([], ['title' => 'Other']);

        $this->actingAs($this->user)
            ->postJson('/api/translations/plan', ['types' => ['movie'], 'status' => 'watched'])
            ->assertOk()
            ->assertJsonPath('count', 1)
            ->assertJsonPath('items.0.id', $watched->id);
    }

    /* ---------- ერთეულოვანი თარგმანი ---------- */

    public function test_item_translates_missing_side_from_the_other(): void
    {
        $movie = $this->movie([], ['title' => 'The Matrix']);

        $this->mockTranslator(['The Matrix' => 'მატრიცა']);

        $this->actingAs($this->user)
            ->postJson("/api/translations/movie/{$movie->id}")
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('skipped', false)
            ->assertJsonPath('changed.0', 'title_ka');

        $this->assertSame('მატრიცა', $movie->refresh()->title_ka);
    }

    /* ---------- წყაროს არჩევანი (2026-09-14) ---------- */

    public function test_item_rejects_an_empty_source_list(): void
    {
        $movie = $this->movie([], ['title' => 'The Matrix']);

        /* ⚠️ ცარიელი არჩევანი **422-ია და არა ჩუმად „ორივე"** —
           „თავისით არ უნდა ხდებოდეს" ზუსტად ამას ნიშნავს. */
        $this->actingAs($this->user)
            ->postJson("/api/translations/movie/{$movie->id}", ['sources' => []])
            ->assertStatus(422);
    }

    public function test_item_with_only_tmdb_never_calls_the_translator(): void
    {
        $movie = $this->movie([], ['title' => 'The Matrix']);

        // თარჯიმანს თარგმანი უნდა, მაგრამ არჩევანში არ არის — არ უნდა გამოიძახოს
        $this->mockTranslator(['The Matrix' => 'მატრიცა']);

        $this->actingAs($this->user)
            ->postJson("/api/translations/movie/{$movie->id}", ['sources' => ['tmdb']])
            ->assertOk()
            ->assertJsonPath('skipped', true);

        $this->assertNull($movie->refresh()->title_ka);
    }

    public function test_item_with_only_gemini_still_translates(): void
    {
        $movie = $this->movie([], ['title' => 'The Matrix']);

        $this->mockTranslator(['The Matrix' => 'მატრიცა']);

        $this->actingAs($this->user)
            ->postJson("/api/translations/movie/{$movie->id}", ['sources' => ['gemini']])
            ->assertOk()
            ->assertJsonPath('changed.0', 'title_ka')
            // „რა რითი ითარგმნა" — პასუხშიც და ლოგშიც
            ->assertJsonPath('providers.title_ka', 'gemini');

        $this->assertSame('მატრიცა', $movie->refresh()->title_ka);
    }

    public function test_a_translation_is_written_to_the_audit_log(): void
    {
        $movie = $this->movie([], ['title' => 'The Matrix']);
        $this->mockTranslator(['The Matrix' => 'მატრიცა']);

        $this->actingAs($this->user)
            ->postJson("/api/translations/movie/{$movie->id}")
            ->assertOk();

        /* ⚠️ `AuditObserver` ამას **ვერ დააფიქსირებდა**: ტექსტი
           `movie_translations`-ში ჯდება, რომელიც `AuditRegistry::MODELS`-ში არ არის. */
        $row = AuditLog::where('action', AuditLog::ACTION_TRANSLATE)->first();

        $this->assertNotNull($row);
        $this->assertSame($movie->id, $row->subject_id);
        $this->assertSame('gemini', $row->new_values['title_ka']);
    }

    public function test_usage_reports_our_own_ceiling(): void
    {
        config(['services.gemini.key' => 'test-key', 'services.gemini.daily_limit' => 10]);

        TranslationUsage::create(['provider' => 'gemini', 'target_lang' => 'ka', 'chars' => 5]);

        $this->actingAs($this->user)->getJson('/api/translations/usage')
            ->assertOk()
            ->assertJsonPath('gemini.used', 1)
            ->assertJsonPath('gemini.remaining', 9)
            ->assertJsonPath('gemini.exhausted', false);
    }

    public function test_an_exhausted_quota_never_reaches_gemini(): void
    {
        config(['services.gemini.key' => 'test-key', 'services.gemini.daily_limit' => 1]);
        TranslationUsage::create(['provider' => 'gemini', 'target_lang' => 'ka', 'chars' => 5]);

        Http::fake();

        /* ⚠️ ამოწურვა **ჩუმად არ გადიჭერბა**: რიგი დაწერდა
           „შესრულდა" და ბიბლიოთეკა უთარგმნელი დარჩებოდა. */
        $this->assertNull((new Translator)->toGeorgian('The Matrix'));
        Http::assertNothingSent();

        // დაბლოკილი მოთხოვნა მრიცხველს **არ** ემატება — ის არსად გასულა
        $this->assertSame(1, TranslationUsage::count());
    }

    public function test_tmdb_text_is_not_labelled_as_a_machine_translation(): void
    {
        config(['services.tmdb.key' => 'test-key']);

        Http::fake([
            'api.themoviedb.org/3/movie/*' => Http::response([
                'title' => 'მატრიცა',
                'overview' => 'ეს არის TMDB-ის ქართული აღწერა.',
            ]),
        ]);

        $movie = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 603]);
        $movie->setTranslation('en', ['title' => 'The Matrix', 'description' => 'A hacker learns the truth.']);

        $this->actingAs($this->user)
            ->postJson("/api/translations/movie/{$movie->id}", ['sources' => ['tmdb']])
            ->assertOk()
            ->assertJsonPath('providers.description_ka', 'tmdb');

        /* ⚠️ აქამდე აქ **ყოველთვის** `translation` ეწერა — მაშინაც,
           როცა ტექსტი TMDB-იდან იყო, ე.ი. ჩანაწერის გვერდზე ბარათი ცრუობდა. */
        $this->assertSame('tmdb', $movie->refresh()->translations()->where('locale', 'ka')->value('source'));
    }

    public function test_item_never_overwrites_existing_text(): void
    {
        $movie = $this->movie(['title' => 'ჩემი სათაური'], ['title' => 'The Matrix']);

        $this->actingAs($this->user)
            ->postJson("/api/translations/movie/{$movie->id}")
            ->assertOk()
            ->assertJsonPath('skipped', true);

        $this->assertSame('ჩემი სათაური', $movie->refresh()->title_ka);
    }

    public function test_item_rejects_non_georgian_result_for_ka(): void
    {
        $movie = $this->movie([], ['title' => 'The Matrix']);

        // თარჯიმანმა ორიგინალი დააბრუნა (ტიპური Google-ის ქცევა) — არ ვიღებთ
        $this->mockTranslator(['The Matrix' => 'The Matrix']);

        $this->actingAs($this->user)
            ->postJson("/api/translations/movie/{$movie->id}")
            ->assertOk()
            ->assertJsonPath('skipped', true);

        $this->assertNull($movie->refresh()->title_ka);
    }

    public function test_item_404_for_another_users_record(): void
    {
        $other = User::create([
            'name' => 'nick', 'username' => 'nick',
            'email' => 'nick@example.com', 'password' => 'password',
        ]);
        $movie = Movie::create(['user_id' => $other->id]);
        $movie->setTranslation('en', ['title' => 'Theirs']);

        $this->actingAs($this->user)
            ->postJson("/api/translations/movie/{$movie->id}")
            ->assertStatus(404);
    }

    public function test_item_rejects_unknown_type(): void
    {
        // route-ის `whereIn` ტიპს ფილტრავს — უცნობი დომენი საერთოდ არ ხვდება
        $this->actingAs($this->user)
            ->postJson('/api/translations/video/1')
            ->assertStatus(404);
    }

    /* ---------- ჟანრები ---------- */

    public function test_genres_endpoint_fills_the_missing_name(): void
    {
        $genre = Genre::create(['slug' => 'thriller']);
        $genre->setTranslation('en', 'Thriller');

        $this->mockTranslator(['Thriller' => 'თრილერი']);

        $this->actingAs($this->user)
            ->postJson('/api/translations/genres')
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('translated', 1);

        $this->assertSame('თრილერი', $genre->refresh()->name_ka);
    }

    public function test_genres_endpoint_is_idempotent(): void
    {
        $genre = Genre::create(['slug' => 'drama']);
        $genre->setTranslation('en', 'Drama');
        $genre->setTranslation('ka', 'დრამა');

        $this->actingAs($this->user)
            ->postJson('/api/translations/genres')
            ->assertOk()
            ->assertJsonPath('skipped', true)
            ->assertJsonPath('translated', 0);
    }

    /* ---------- უფლებები ---------- */

    public function test_item_requires_update_permission(): void
    {
        $movie = $this->movie([], ['title' => 'The Matrix']);

        // მხოლოდ ნახვის უფლება — თარგმანი ჩანაწერს ცვლის, ე.ი. უნდა აიკრძალოს
        // (⚠️ ადრე `'*'`-ით ეწერა; ნიღაბი მოიხსნა — იხ. `Role`)
        $this->user->role->update(['permissions' => ['movie' => ['view'], 'series' => ['view']]]);

        $this->actingAs($this->user->refresh())
            ->postJson("/api/translations/movie/{$movie->id}")
            ->assertStatus(403)
            ->assertJsonPath('permission', 'movie.update');
    }

    public function test_item_requires_the_module_of_the_url_not_movie(): void
    {
        $series = Series::create(['user_id' => $this->user->id]);
        $series->setTranslation('en', ['title' => 'S']);

        // მხოლოდ ფილმებზე გვაქვს update — სერიალის თარგმანი უნდა აიკრძალოს.
        // (ეს იჭერს `@type`-ის იმ ხარვეზს, როცა route-ის პარამეტრი არ იკითხებოდა.)
        $this->user->role->update(['permissions' => [
            'movie' => ['view', 'create', 'update', 'delete'],
            'series' => ['view'],
        ]]);

        $this->actingAs($this->user->refresh())
            ->postJson("/api/translations/series/{$series->id}")
            ->assertStatus(403)
            ->assertJsonPath('permission', 'series.update');
    }

    /* ---------- §7 — ტექსტის წყარო ---------- */

    /**
     * ⚠️ **ხელით გადაწერილი აღწერა `manual`-ია.** უამისოდ ჩანაწერი
     * „ავტომატურად ნათარგმნად" რჩებოდა მას შემდეგაც, რაც user თვითონ
     * გადაწერდა — ბარათზე მითითებული წყარო ტყუოდა.
     */
    public function test_manual_edit_marks_the_description_as_manual(): void
    {
        $movie = $this->movie(
            ka: ['title' => 'ფილმი', 'description' => 'ავტომატური თარგმანი', 'source' => 'translation'],
        );

        $this->actingAs($this->user)
            ->putJson("/api/movies/{$movie->id}", [
                'title_ka' => 'ფილმი',
                'description_ka' => 'ჩემი ტექსტი',
            ])
            ->assertOk()
            ->assertJsonPath('data.description_ka_source', 'manual');
    }

    /**
     * ⚠️ **უცვლელი ტექსტის შენახვა წყაროს არ ცვლის** — ფორმის უბრალო
     * გახსნა-შენახვა TMDB-ის აღწერას „ხელით დაწერილად" არ უნდა აქცევდეს.
     */
    public function test_saving_the_same_text_keeps_the_original_source(): void
    {
        $movie = $this->movie(
            en: ['title' => 'Movie', 'description' => 'From TMDB', 'source' => 'tmdb'],
        );

        $this->actingAs($this->user)
            ->putJson("/api/movies/{$movie->id}", [
                'title_en' => 'Movie',
                'description_en' => 'From TMDB',
            ])
            ->assertOk()
            ->assertJsonPath('data.description_en_source', 'tmdb');
    }

    /* ---------- Translator → Gemini (2026-09-14) ---------- */

    /**
     * ⚠️ გასაღების გარეშე **არც ერთი მოთხოვნა არ უნდა გავიდეს**.
     * ეს იმ წესის ტესტია, რამაც Claude და უფასო Google-ის fallback ამოაგდო:
     * ჩუმად ჩავარდნილი წყარო ინტერფეისს ატყუებინებს („ვთარგმნი"), ტექსტი კი
     * არ მოდის. `configured() === false` ერთადერთი პატიოსანი პასუხია.
     */
    public function test_translator_without_a_key_calls_nothing(): void
    {
        config(['services.gemini.key' => null]);
        Http::fake();

        $translator = new Translator;

        $this->assertFalse($translator->configured());
        $this->assertNull($translator->toGeorgian('The Matrix'));

        Http::assertNothingSent();
    }

    /** გასაღებით — Gemini-ს ვურეკავთ და პასუხის ტექსტს ვიღებთ */
    public function test_translator_calls_gemini_and_returns_the_text(): void
    {
        config(['services.gemini.key' => 'test-key', 'services.gemini.model' => 'gemini-3.5-flash']);
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [['content' => ['parts' => [['text' => 'მატრიცა']]]]],
            ]),
        ]);

        $this->assertSame('მატრიცა', (new Translator)->toGeorgian('The Matrix'));

        /* ⚠️ გასაღები ჰედერშია და არა მისამართში — `?key=` ლოგსა და
           გამონაკლისის ტექსტში ჩაჯდებოდა. */
        Http::assertSent(fn ($r) => str_contains($r->url(), 'models/gemini-3.5-flash:generateContent')
            && ! str_contains($r->url(), 'key=')
            && $r->hasHeader('X-goog-api-key', 'test-key')
            && str_contains($r['contents'][0]['parts'][0]['text'], 'The Matrix')
            /* ⚠️ ფიქრის გამორთვა მოთხოვნის ნაწილია და არა ოპტიმიზაცია:
               მის გარეშე გამოძახება 45+ წამს ჭიმავდა და timeout-ით ჩავარდა. */
            && $r['generationConfig']['thinkingConfig']['thinkingBudget'] === 0);
    }

    /**
     * ⚠️ `parts[0]` არ გამოდგება: 3.x მოდელები ფიქრის ბლოკსაც აბრუნებენ
     * (`thought: true`) — მისი წაკითხვა თარგმანის ნაცვლად მსჯელობას შეინახავდა.
     */
    public function test_translator_skips_a_thought_part(): void
    {
        config(['services.gemini.key' => 'test-key']);
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [['content' => ['parts' => [
                    ['text' => 'Let me think about this…', 'thought' => true],
                    ['text' => 'მატრიცა'],
                ]]]],
            ]),
        ]);

        $this->assertSame('მატრიცა', (new Translator)->toGeorgian('The Matrix'));
    }

    /**
     * ⚠️ `thoughtSignature` **იმავე ნაწილზე ზის, სადაც თარგმანია** (ცოცხლად
     * ნანახი 2026-09-14-ს) — მის მიხედვით გაფილტვრა პასუხს წაშლიდა.
     */
    public function test_translator_keeps_a_part_that_carries_a_thought_signature(): void
    {
        config(['services.gemini.key' => 'test-key']);
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [['content' => ['parts' => [
                    ['text' => 'მატრიცა', 'thoughtSignature' => 'EtIFCs8FARFNMg'],
                ]]]],
            ]),
        ]);

        $this->assertSame('მატრიცა', (new Translator)->toGeorgian('The Matrix'));
    }

    /**
     * ⚠️ დროებით 503-ზე **ხელახლა უნდა სცადოს**. Gemini მართლა აბრუნებს
     * „მოდელი გადატვირთულია"-ს; ერთი ცდის შემთხვევაში ველი ჩუმად შეუვსებელი
     * დარჩებოდა და რიგი დაწერდა „შესრულდა".
     */
    public function test_translator_retries_a_transient_failure(): void
    {
        config(['services.gemini.key' => 'test-key']);
        Sleep::fake();
        Http::fakeSequence()
            ->push(['error' => ['code' => 503]], 503)
            ->push(['candidates' => [['content' => ['parts' => [['text' => 'მატრიცა']]]]]], 200);

        $this->assertSame('მატრიცა', (new Translator)->toGeorgian('The Matrix'));
        Http::assertSentCount(2);
    }

    /**
     * ⚠️ 400 დროებითი არაა — სამჯერ გამეორება ფუჭი ხარჯია. ზუსტად **ორი**
     * გამოძახება უნდა იყოს: მეორე უკვე ფიქრის პარამეტრის გარეშე (იხ. ქვემოთ).
     */
    public function test_translator_does_not_retry_a_permanent_failure(): void
    {
        config(['services.gemini.key' => 'test-key']);
        Sleep::fake();
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['error' => ['code' => 400]], 400)]);

        $this->assertNull((new Translator)->toGeorgian('The Matrix'));
        Http::assertSentCount(2);
    }

    /**
     * ⚠️ **`*-flash-lite` მოდელები `thinkingBudget`-ს 400-ით უარყოფენ**
     * (ცოცხლად შემოწმებული 2026-09-14-ს). მოდელების სიის ნაცვლად ერთხელ
     * ვიმეორებთ ფიქრის პარამეტრის გარეშე — თორემ `.env`-ში lite-მოდელის ჩაწერა
     * თარგმანს **ჩუმად** კლავდა.
     */
    public function test_translator_retries_without_thinking_config_on_400(): void
    {
        config(['services.gemini.key' => 'test-key', 'services.gemini.model' => 'gemini-3.5-flash-lite']);
        Sleep::fake();
        Http::fakeSequence()
            ->push(['error' => ['code' => 400]], 400)
            ->push(['candidates' => [['content' => ['parts' => [['text' => 'მატრიცა']]]]]], 200);

        $this->assertSame('მატრიცა', (new Translator)->toGeorgian('The Matrix'));

        $sent = [];
        Http::assertSent(function ($r) use (&$sent) {
            $sent[] = $r['generationConfig'];

            return true;
        });
        $this->assertArrayHasKey('thinkingConfig', $sent[0]);
        $this->assertArrayNotHasKey('thinkingConfig', $sent[1]);
    }

    /** წყაროს მუდმივი ჩავარდნა null-ია და არა გამონაკლისი — შენახვა არ უნდა გაწყდეს */
    public function test_translator_failure_is_null_not_an_exception(): void
    {
        config(['services.gemini.key' => 'test-key']);
        Sleep::fake();
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response([], 503)]);

        $this->assertNull((new Translator)->toGeorgian('The Matrix'));
        // სამი ცდა — RETRY_TIMES; ამის მერე ჩუმად კი არა, უბრალოდ შეუვსებელი რჩება
        Http::assertSentCount(3);
    }

    /* ---------- `review` — არსებული თარგმანის გადამოწმება (2026-09-14) ---------- */

    /**
     * ⚠️ **ეს ერთადერთი ადგილია, სადაც არსებული ტექსტი გადაიწერება** — ამიტომაც
     * არის ცხადად ჩასართავი რეჟიმი. წყარო `translation` ხდება (შენი პასუხი):
     * ბარათზე ორი რამ უნდა ითქვას — „TMDB-ისაა" თუ „მანქანამ თარგმნა".
     */
    public function test_review_corrects_tmdb_georgian_and_restamps_the_source(): void
    {
        $movie = $this->movie(
            ['description' => 'ცუდი ქართული აღწერა', 'source' => 'tmdb'],
            ['description' => 'A hacker learns the truth.'],
        );

        $this->mockTranslator([], ['ცუდი ქართული აღწერა' => 'გასწორებული ქართული აღწერა']);

        $this->actingAs($this->user)
            ->postJson("/api/translations/movie/{$movie->id}", ['review' => true])
            ->assertOk()
            ->assertJsonPath('changed.0', 'description_ka')
            // „რა რითი" — ლოგისთვისაც და ინტერფეისისთვისაც ცალკე მნიშვნელობაა
            ->assertJsonPath('providers.description_ka', 'review');

        $movie->refresh();
        $this->assertSame('გასწორებული ქართული აღწერა', $movie->description_ka);
        $this->assertSame('translation', $movie->description_ka_source);
    }

    /** დროშის გარეშე იგივე ჩანაწერი **ხელუხლებელია** — ეს მზიდი წესია */
    public function test_without_the_review_flag_existing_text_is_untouched(): void
    {
        $movie = $this->movie(
            ['description' => 'ცუდი ქართული აღწერა', 'source' => 'tmdb'],
            ['description' => 'A hacker learns the truth.'],
        );

        $this->mockTranslator([], ['ცუდი ქართული აღწერა' => 'გასწორებული ქართული აღწერა']);

        $this->actingAs($this->user)
            ->postJson("/api/translations/movie/{$movie->id}")
            ->assertOk()
            ->assertJsonPath('skipped', true);

        $this->assertSame('ცუდი ქართული აღწერა', $movie->refresh()->description_ka);
    }

    /**
     * ⚠️ **ხელით დაწერილი ტექსტი გადამოწმებას არ ექვემდებარება.** `manual`
     * მომხმარებლის საკუთარი ტექსტია და მისი გადაწერა ყველაზე მძიმე ზიანია;
     * `translation` კი თავად Gemini-ის გამოსავალია — მისი იმავე მოდელით
     * „შემოწმება" ხარჯია და არა შემოწმება.
     */
    public function test_review_never_touches_manual_or_machine_text(): void
    {
        foreach (['manual', 'translation'] as $source) {
            $movie = $this->movie(
                ['description' => 'ჩემი ტექსტი '.$source, 'source' => $source],
                ['description' => 'The original.'],
            );

            $this->mockTranslator([], ['ჩემი ტექსტი '.$source => 'გადაწერილი']);

            $this->actingAs($this->user)
                ->postJson("/api/translations/movie/{$movie->id}", ['review' => true])
                ->assertOk()
                ->assertJsonPath('skipped', true);

            $this->assertSame('ჩემი ტექსტი '.$source, $movie->refresh()->description_ka);
        }
    }

    /** მოდელმა იგივე ტექსტი დააბრუნა → ცვლილება არაა, წყაროც არ იცვლება */
    public function test_review_keeps_the_source_when_nothing_changed(): void
    {
        $movie = $this->movie(
            ['description' => 'კარგი ქართული აღწერა', 'source' => 'tmdb'],
            ['description' => 'A good synopsis.'],
        );

        // `Translator::review()` „შესწორება არ დასჭირდა"-ს `null`-ით ამბობს
        $this->mockTranslator([], []);

        $this->actingAs($this->user)
            ->postJson("/api/translations/movie/{$movie->id}", ['review' => true])
            ->assertOk()
            ->assertJsonPath('skipped', true);

        $movie->refresh();
        $this->assertSame('კარგი ქართული აღწერა', $movie->description_ka);
        $this->assertSame('tmdb', $movie->description_ka_source);
    }

    /** ინგლისური ორიგინალის გარეშე შესადარებელი არაფერია — გადაწერაც არ ხდება */
    public function test_review_needs_the_original_to_compare_with(): void
    {
        $movie = $this->movie(['description' => 'მხოლოდ ქართული', 'source' => 'tmdb']);

        $this->mockTranslator([], ['მხოლოდ ქართული' => 'გადაწერილი']);

        $this->actingAs($this->user)
            ->postJson("/api/translations/movie/{$movie->id}", ['review' => true])
            ->assertOk();

        $this->assertSame('მხოლოდ ქართული', $movie->refresh()->description_ka);
    }

    /**
     * გეგმაში გადასამოწმებელი მხოლოდ დროშით ჩნდება — და **ჯამში (badge)
     * არასდროს**: თორემ ჰედერი სამუდამოდ ანთებული დარჩებოდა.
     */
    public function test_plan_includes_reviewable_records_only_with_the_flag(): void
    {
        $this->movie(
            ['description' => 'ქართული აღწერა', 'source' => 'tmdb'],
            ['description' => 'English synopsis.'],
        );

        $this->actingAs($this->user)
            ->postJson('/api/translations/plan', [])
            ->assertOk()
            ->assertJsonPath('count', 0);

        $this->actingAs($this->user)
            ->postJson('/api/translations/plan', ['review' => true])
            ->assertOk()
            ->assertJsonPath('count', 1)
            ->assertJsonPath('items.0.review', true);

        $this->actingAs($this->user)->getJson('/api/translations/summary')
            ->assertOk()
            ->assertJsonPath('reviewable', 1)
            ->assertJsonPath('total', 0);
    }

    /** გასაღების გარეშე გადამოწმება უბრალოდ არ ხდება (და არ ცდილობს) */
    public function test_review_does_nothing_without_a_gemini_key(): void
    {
        config(['services.gemini.key' => null]);
        Http::fake();

        $movie = $this->movie(
            ['description' => 'ქართული აღწერა', 'source' => 'tmdb'],
            ['description' => 'English synopsis.'],
        );

        $this->actingAs($this->user)
            ->postJson("/api/translations/movie/{$movie->id}", ['review' => true])
            ->assertOk()
            ->assertJsonPath('skipped', true);

        Http::assertNothingSent();
        $this->assertSame('tmdb', $movie->refresh()->description_ka_source);
    }

    /**
     * `Translator::review()` — **„შესწორება არ დასჭირდა" `null`-ია.** მოდელს
     * სპეციალურ მარკერს არ ვთხოვთ (ის ტექსტში აღმოჩნდებოდა), ამიტომ იგივე
     * ტექსტის დაბრუნება ცვლილების არქონას ნიშნავს.
     */
    public function test_translator_review_returns_null_when_the_text_is_unchanged(): void
    {
        config(['services.gemini.key' => 'test-key']);
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response([
            'candidates' => [['content' => ['parts' => [['text' => "  ქართული  აღწერა \n"]]]]],
        ])]);

        $translator = new Translator;

        // მხოლოდ გამოტოვებების სხვაობა ცვლილება არაა
        $this->assertNull($translator->review('ქართული აღწერა', 'English synopsis.', 'ka', 'movie synopsis'));
    }

    public function test_translator_review_sends_both_texts_and_counts_one_call(): void
    {
        config(['services.gemini.key' => 'test-key']);
        $reply = ['candidates' => [['content' => ['parts' => [['text' => 'გასწორებული აღწერა']]]]]];
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response($reply)]);

        $out = (new Translator)->review('ქართული აღწერა', 'English synopsis.', 'ka', 'movie synopsis');

        $this->assertSame('გასწორებული აღწერა', $out);

        // ორივე ტექსტი პრომპტში უნდა იყოს — თორემ ეს შემოწმება არაა, გადაწერაა
        Http::assertSent(function ($r) {
            $prompt = $r['contents'][0]['parts'][0]['text'];

            return str_contains($prompt, 'ქართული აღწერა') && str_contains($prompt, 'English synopsis.');
        });

        // ⚠️ გადამოწმებაც იმავე მრიცხველში ჯდება — ერთი გამოძახება, ერთი რიგი
        $this->assertSame(1, TranslationUsage::count());
        $this->assertSame('review movie synopsis', TranslationUsage::first()->context);
    }

    /* ---------- helpers ---------- */

    /**
     * @param  array<string, string>  $map  წყარო => თარგმანი
     * @param  array<string, string>  $review  არსებული ტექსტი => შესწორებული
     */
    private function mockTranslator(array $map, array $review = []): void
    {
        $mock = Mockery::mock(Translator::class);
        $mock->shouldReceive('configured')->andReturn(true);
        $mock->shouldReceive('translate')
            ->andReturnUsing(fn ($text, $to, $context = 'text') => $map[trim((string) $text)] ?? null);
        /* `review()` „შესწორება არ დასჭირდა"-ს `null`-ით ამბობს — ე.ი. რუკაში
           არმყოფი ტექსტი უცვლელია, ზუსტად როგორც ნამდვილი თარჯიმანი. */
        $mock->shouldReceive('review')
            ->andReturnUsing(fn ($text, $original, $to, $context = 'text') => $review[trim((string) $text)] ?? null);
        // „რატომ არ მოვიდა ტექსტი" — მოქმედ თარჯიმანზე მიზეზი არ არის
        $mock->shouldReceive('lastError')->andReturn(null);

        $this->app->instance(Translator::class, $mock);
        // ItemTranslator-ს კონსტრუქტორში უკვე შეყვანილი ასლი აქვს — თავიდან ავაწყოთ
        $this->app->forgetInstance(ItemTranslator::class);
    }
}
