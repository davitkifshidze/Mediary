<?php

namespace Tests\Feature;

use App\Models\Genre;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use App\Services\Enrichment\MovieEnricher;
use App\Services\Sync\ItemSyncer;
use App\Services\Translation\TranslationScanner;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * **გამამდიდრებელი ქართულს TMDB-დან იღებს და არა Gemini-დან** (Tasks BUG-17).
 *
 * ⚠️ ეს კვოტის საკითხია და არა სტილის: `from-tmdb`/`resync`/`/lookup` თითო
 * ჩანაწერზე **ორ** Gemini-გამოძახებას ხარჯავდნენ (სათაური + აღწერა), ე.ი.
 * discover-იდან 20 ჩანაწერის ერთი დაჭერით დამატება 40 გამოძახებაა 15/წთ
 * ბიუჯეტიდან — მაშინ, როცა TMDB-ს ქართული უფასოდ აქვს.
 *
 * ⚠️ და მეორე ნახევარი: `source = 'translated'` აპს არსად ეცნობოდა, ე.ი.
 * ბარათი „ტექსტის წყარო უცნობია"-ს ხატავდა.
 */
class EnrichmentLanguageTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        config()->set('services.tmdb.key', 'test-key');
        // ⚠️ გასაღები **ჩაწერილია** — თორემ „Gemini არ იძახება" ტესტი
        // იმიტომაც გაიარებდა, რომ თარჯიმანი საერთოდ გამორთულია
        config()->set('services.gemini.key', 'test-gemini-key');

        $this->user = User::create([
            'name' => 'enrich',
            'username' => 'enrich',
            'email' => 'enrich@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::where('key', 'movie')->pluck('id')->all());
        $this->user->refresh();
    }

    /** TMDB — ინგლისური და ქართული პასუხი, `language=ka`-ს მიხედვით */
    private function fakeTmdb(?string $kaTitle = 'მატრიცა', ?string $kaOverview = 'ქართული აღწერა.', array $genres = []): void
    {
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response(['error' => 'must not be called'], 500),
            'api.themoviedb.org/3/movie/*/credits*' => Http::response(['cast' => []]),
            'api.themoviedb.org/3/movie/*/videos*' => Http::response(['results' => []]),
            'api.themoviedb.org/3/movie/*' => function ($request) use ($kaTitle, $kaOverview, $genres) {
                $ka = str_contains($request->url(), 'language=ka');

                return Http::response([
                    'id' => 603,
                    'title' => $ka ? ($kaTitle ?? 'The Matrix') : 'The Matrix',
                    'overview' => $ka ? ($kaOverview ?? 'A hacker learns the truth.') : 'A hacker learns the truth.',
                    'genres' => $genres,
                ]);
            },
        ]);
    }

    public function test_enrichment_takes_georgian_from_tmdb_and_never_calls_gemini(): void
    {
        $this->fakeTmdb();

        $movie = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 603]);
        app(MovieEnricher::class)->enrichMovie($movie);

        $movie->refresh();
        $this->assertSame('მატრიცა', $movie->title_ka);
        $this->assertSame('ქართული აღწერა.', $movie->description_ka);
        // ⚠️ `'tmdb'`, და არა `'translated'`: ტექსტი მართლაც TMDB-ისაა
        $this->assertSame('tmdb', $movie->description_ka_source);

        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'generativelanguage.googleapis.com'));
    }

    public function test_a_draft_takes_georgian_from_tmdb_and_never_calls_gemini(): void
    {
        $this->fakeTmdb();

        $draft = app(MovieEnricher::class)->draftFromId(603);

        $this->assertSame('მატრიცა', $draft['title_ka']);
        $this->assertSame('ქართული აღწერა.', $draft['description_ka']);
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'generativelanguage.googleapis.com'));
    }

    /**
     * ⚠️ TMDB ქართულის უქონლობაზე **ორიგინალ ენას აბრუნებს**, ე.ი.
     * `Lang::georgian()`-ის გარეშე ინგლისური ტექსტი `title_ka`-ში ჩაჯდებოდა.
     */
    public function test_a_latin_answer_is_not_stored_as_georgian(): void
    {
        $this->fakeTmdb(kaTitle: null, kaOverview: null);

        $movie = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 603]);
        app(MovieEnricher::class)->enrichMovie($movie);

        $movie->refresh();
        $this->assertNull($movie->title_ka);
        $this->assertNull($movie->description_ka);
        $this->assertNull($movie->description_ka_source);
    }

    /* ============================================================
       ჟანრის ქართული სახელი (BUG-23)
       ============================================================ */

    /**
     * **ახალ ჟანრს ინგლისური სახელი `name_ka`-ში აღარ ეწერება.**
     *
     * ⚠️ ეს ჩუმი ხარვეზი იყო და სწორედ იმიტომ, რომ ველი **შევსებული**
     * რჩებოდა: `TranslationScanner::genreMissing()` მას სათარგმნად ვეღარ
     * ხედავდა, ე.ი. `/translations` „დრამას" **არასდროს** გადათარგმნიდა და
     * ქართულ ინტერფეისში ინგლისური სახელი იდგა „ქართულად".
     * `TmdbClient::genreList('ka')` ნამდვილ ქართულს უფასოდ იძლევა.
     */
    public function test_a_new_genre_is_left_untranslated_instead_of_taking_the_english_name(): void
    {
        $this->fakeTmdb(genres: [['id' => 28, 'name' => 'Action']]);

        $movie = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 603]);
        app(MovieEnricher::class)->enrichMovie($movie);

        $genre = Genre::where('slug', 'action')->firstOrFail();
        $this->assertSame('Action', $genre->name_en);
        $this->assertNull($genre->name_ka);
        // და სწორედ ამიტომ ხედავს სკანერი მას სათარგმნად
        $this->assertSame(['name_ka'], TranslationScanner::genreMissing($genre));
    }

    /** ⚠️ იგივე ბილიკი ბულკ-სინქრონიზაციაზე — სამივე ადგილს ერთი წესი აქვს */
    public function test_bulk_sync_also_leaves_a_new_genre_untranslated(): void
    {
        $this->fakeTmdb(genres: [['id' => 18, 'name' => 'Drama']]);

        $movie = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 603]);
        app(ItemSyncer::class)->sync($movie, ['fields' => ['genres'], 'overwrite' => true]);

        $genre = Genre::where('slug', 'drama')->firstOrFail();
        $this->assertSame('Drama', $genre->name_en);
        $this->assertNull($genre->name_ka);
    }
}
