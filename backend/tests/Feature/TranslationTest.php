<?php

namespace Tests\Feature;

use App\Models\Genre;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Series;
use App\Models\User;
use App\Services\Translation\ItemTranslator;
use App\Services\Translation\TranslationScanner;
use App\Services\Translation\Translator;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

/**
 * Tasks 7 — თარგმანები.
 *
 * ცოცხალ TMDB/Claude-ს არ ვაკითხავთ: `TmdbClient` კონფიგურირებული არაა ტესტში
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
        // გასაღები არ არის → ინტერფეისმა უნდა თქვას, რომ თარჯიმანი არ მუშაობს
        $res->assertJsonPath('translator_configured', false);
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
        $this->user->role->update(['permissions' => ['*' => ['view']]]);

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

    /* ---------- helpers ---------- */

    /** @param  array<string, string>  $map  წყარო => თარგმანი */
    private function mockTranslator(array $map): void
    {
        $mock = Mockery::mock(Translator::class);
        $mock->shouldReceive('configured')->andReturn(true);
        $mock->shouldReceive('translate')
            ->andReturnUsing(fn ($text, $to, $context = 'text') => $map[trim((string) $text)] ?? null);

        $this->app->instance(Translator::class, $mock);
        // ItemTranslator-ს კონსტრუქტორში უკვე შეყვანილი ასლი აქვს — თავიდან ავაწყოთ
        $this->app->forgetInstance(ItemTranslator::class);
    }
}
