<?php

namespace Tests\Feature;

use App\Models\Anime;
use App\Models\Genre;
use App\Models\HiddenSuggestion;
use App\Models\Module;
use App\Models\Movie;
use App\Models\RecordLock;
use App\Models\Series;
use App\Models\Status;
use App\Models\SuggestionSource;
use App\Models\SuggestionVector;
use App\Models\User;
use App\Services\Suggest\SuggestionBasis;
use App\Services\Suggest\SuggestionEngine;
use App\Services\Users\AccountEraser;
use App\Support\MediaDomain;
use App\Support\StatusDomain;
use Database\Seeders\ModulesSeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as SentRequest;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * **„შემოთავაზებები" — მსგავსი სათაურები ჩემი არჩევანის მიხედვით** (ფილმი · სერიალი · ანიმე).
 *
 * ⚠️ მოწმდება: საფუძველი იკრიბება სტატუსით, „რჩეულით", ხელით მონიშვნით და ფილტრით, დიდი
 * სტატუსი კი სწორი რიგით იჭრება; ახალი სათაურები წყაროების მითითებით მოდის, ჩემი —
 * ჩემი სიიდან; უკვე დამატებული „ახალში" არ ჩანს, ჩაკეტილი და ურნაში მყოფი — არსად;
 * „არ მაინტერესებს" ქრება და ბრუნდება; მეორე მოთხოვნა წყაროებზე არ გადის; გასაღების
 * გარეშე 409. დამატებითი წყარო გასაღების გარეშე გამოტოვებულია, მისი ჩავარდნა შედეგს არ
 * აფუჭებს, ერთი სათაური ორი წყაროდან ერთხელ ჩანს, TMDB-ზე ვერდაკავშირებული არ ჩანს.
 * Gemini-ის გარეშე გვერდი სხვა სიგნალებით მუშაობს; აღწერის ვექტორი ერთხელ ითვლება.
 *
 * ⚠️ წყაროები ერთი ყალბი კარით პასუხობენ (`fakeSources()`), პასუხები კი ტესტის ველებშია:
 * `Http::fake()` მეორე გამოძახებაზე ახალ პასუხს აღარ იღებს.
 */
class MediaSuggestionTest extends TestCase
{
    use RefreshDatabase;

    private const ANIMATION = 16;

    private User $user;

    /** მიმდინარე ტესტის მოდული — რიგების ფორმა (ფილმი თუ სერიალი, ანიმაცია თუ არა) მასზეა დამოკიდებული */
    private string $type = 'movie';

    /** TMDB: `[id => ['recommendations' => რიგები, 'similar' => რიგები, 'keywords' => [[id, name]], 'genres' => [id], 'overview' => ტექსტი]]` */
    private array $related = [];

    /** TMDB-ის დეტალები ერთ სათაურზე: `[id => რიგი]` */
    private array $details = [];

    /** TMDB `discover`: `[საკვანძო სიტყვის id => რიგები]` */
    private array $discover = [];

    /** TMDB-ის სერიალების ძებნა: `[სახელი => რიგები]` */
    private array $search = [];

    /** Trakt `related`: `[IMDb id ან slug => ელემენტები]` */
    private array $trakt = [];

    /** Trakt-ის ძებნა TMDB-ის id-ით: `[id => slug]` */
    private array $traktSlugs = [];

    /** AniList: `[სახელი => რეკომენდაციების კვანძები]` */
    private array $anilist = [];

    /** რომელი წყაროა ჩავარდნილი (`tmdb` · `trakt` · `anilist` · `gemini`) */
    private array $down = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('nino');
        $this->giveCredential($this->user, 'tmdb');
        $this->fakeSources();
    }

    private function makeUser(string $name): User
    {
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::whereIn('key', MediaDomain::TYPES)->pluck('id')->all());

        foreach (MediaDomain::TYPES as $type) {
            Status::ensureDefaults($user->id, $type);
        }

        return $user->refresh();
    }

    /** @return array<string, array{class-string<Model>, string, string}> */
    public static function modules(): array
    {
        return [
            'movie' => [Movie::class, '/api/movies', 'movie'],
            'series' => [Series::class, '/api/series', 'series'],
            'anime' => [Anime::class, '/api/anime', 'anime'],
        ];
    }

    /** @param  class-string<Model>  $model */
    private function record(string $model, string $title, int $tmdbId, string $status = 'watched', array $attributes = [], ?User $owner = null, ?string $description = null): Model
    {
        $record = new $model(['user_id' => ($owner ?? $this->user)->id, 'tmdb_id' => $tmdbId, 'year' => 2020, ...$attributes]);
        $record->applyStatusKey($status);
        $record->save();
        $record->setTranslation('en', ['title' => $title, 'description' => $description]);

        return $record;
    }

    /** TMDB-ის სიის რიგი მიმდინარე მოდულის ფორმით; `ka` — ქართული სახელი ლოკალიზებულ პასუხში */
    private function row(int $id, string $title, array $extra = []): array
    {
        $tv = MediaDomain::isTv($this->type);
        $genres = $extra['genre_ids'] ?? [];
        unset($extra['genre_ids']);

        return [
            'id' => $id,
            ($tv ? 'name' : 'title') => $title,
            ($tv ? 'first_air_date' : 'release_date') => '2020-05-01',
            'vote_average' => 7.0,
            'vote_count' => 100,
            'poster_path' => "/p{$id}.jpg",
            'overview' => "About {$title}",
            // ანიმეს მოდულში კანდიდატი იაპონური ანიმაციაა, სერიალებში — არა
            'genre_ids' => $this->type === 'anime' ? [self::ANIMATION, ...$genres] : $genres,
            ...($tv ? ['origin_country' => [$this->type === 'anime' ? 'JP' : 'US']] : []),
            ...$extra,
        ];
    }

    /**
     * ყველა გარე წყარო — ერთი ყალბი კარი; პასუხებს ტესტის ველები აწვდიან.
     */
    private function fakeSources(): void
    {
        Http::fake(function (SentRequest $request) {
            $url = $request->url();
            $path = (string) parse_url($url, PHP_URL_PATH);
            parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

            if (str_contains($url, 'api.themoviedb.org')) {
                return $this->tmdbResponse($path, $query);
            }

            if (str_contains($url, 'api.trakt.tv')) {
                return $this->traktResponse($path);
            }

            if (str_contains($url, 'graphql.anilist.co')) {
                if (in_array('anilist', $this->down, true)) {
                    return Http::response(['errors' => [['message' => 'Too Many Requests.']]], 429);
                }

                $nodes = $this->anilist[$request->data()['variables']['search'] ?? ''] ?? null;

                return $nodes === null
                    ? Http::response(['errors' => [['message' => 'Not Found.', 'status' => 404]], 'data' => ['Media' => null]], 404)
                    : Http::response(['data' => ['Media' => ['id' => 1, 'recommendations' => ['nodes' => $nodes]]]]);
            }

            if (str_contains($url, 'batchEmbedContents')) {
                if (in_array('gemini', $this->down, true)) {
                    return Http::response(['error' => ['message' => 'quota']], 429);
                }

                return Http::response(['embeddings' => array_map(
                    fn (array $one) => ['values' => $this->vector((string) $one['content']['parts'][0]['text'])],
                    $request->data()['requests'],
                )]);
            }

            return Http::response([], 404);
        });
    }

    private function tmdbResponse(string $path, array $query)
    {
        if (in_array('tmdb', $this->down, true)) {
            return Http::response(['status_message' => 'down'], 500);
        }

        $tv = MediaDomain::isTv($this->type);

        if (preg_match('~/3/discover/~', $path)) {
            return Http::response(['results' => $this->discover[(int) ($query['with_keywords'] ?? 0)] ?? [], 'total_pages' => 1]);
        }

        if (preg_match('~/3/search/tv~', $path)) {
            return Http::response(['results' => $this->search[$query['query'] ?? ''] ?? []]);
        }

        if (preg_match('~/3/(?:movie|tv)/(\d+)/videos~', $path)) {
            return Http::response(['results' => [['site' => 'YouTube', 'key' => 'abc12345678', 'type' => 'Trailer', 'official' => true]]]);
        }

        if (! preg_match('~/3/(?:movie|tv)/(\d+)$~', $path, $m)) {
            return Http::response([], 404);
        }

        $id = (int) $m[1];

        // მსგავსების მასალა (`append_to_response=recommendations,…`) — საფუძველზე
        if (str_contains((string) ($query['append_to_response'] ?? ''), 'recommendations')) {
            $data = $this->related[$id] ?? null;

            if ($data === null) {
                return Http::response(['status_message' => 'not found'], 404);
            }

            $ka = ($query['language'] ?? 'en-US') === 'ka';
            $rows = fn (array $list) => ['results' => array_map(function (array $row) use ($ka, $tv) {
                $name = $tv ? 'name' : 'title';
                $row[$name] = $ka ? ($row['ka'] ?? $row[$name]) : $row[$name];
                unset($row['ka']);

                return $row;
            }, $list)];

            return Http::response([
                'id' => $id,
                ($tv ? 'name' : 'title') => $data['title'] ?? "Base {$id}",
                'overview' => $data['overview'] ?? null,
                'genres' => array_map(fn (int $g) => ['id' => $g, 'name' => "g{$g}"], $data['genres'] ?? []),
                'recommendations' => $rows($data['recommendations'] ?? []),
                'similar' => $rows($data['similar'] ?? []),
                'keywords' => [($tv ? 'results' : 'keywords') => array_map(fn (array $k) => ['id' => $k[0], 'name' => $k[1]], $data['keywords'] ?? [])],
            ]);
        }

        // ერთი სათაურის დეტალები — რაც მხოლოდ დამატებითმა წყარომ მოიტანა
        $row = $this->details[$id] ?? null;

        if ($row === null) {
            return Http::response(['status_message' => 'not found'], 404);
        }

        $row['genres'] = array_map(fn (int $g) => ['id' => $g, 'name' => "g{$g}"], $row['genre_ids'] ?? []);
        unset($row['genre_ids']);

        return Http::response($row);
    }

    private function traktResponse(string $path)
    {
        if (in_array('trakt', $this->down, true)) {
            return Http::response(['error' => 'down'], 500);
        }

        if (preg_match('~/search/tmdb/(\d+)~', $path, $m)) {
            $slug = $this->traktSlugs[(int) $m[1]] ?? null;
            $kind = MediaDomain::isTv($this->type) ? 'show' : 'movie';

            return Http::response($slug ? [['type' => $kind, $kind => ['title' => 'x', 'ids' => ['slug' => $slug, 'trakt' => 1]]]] : []);
        }

        if (preg_match('~/(?:movies|shows)/([^/]+)/related~', $path, $m)) {
            return isset($this->trakt[$m[1]]) ? Http::response($this->trakt[$m[1]]) : Http::response([], 404);
        }

        return Http::response([], 404);
    }

    /** ყალბი ვექტორი: თითო განზომილება — ერთი სიტყვა; ბოლო — მუდმივი, რომ ნულოვანი არ გამოვიდეს */
    private function vector(string $text): array
    {
        $text = strtolower($text);

        return [...array_map(fn (string $word) => str_contains($text, $word) ? 1.0 : 0.0, ['space', 'war', 'love', 'story']), 0.01];
    }

    /** რამდენი მოთხოვნა წავიდა მისამართზე, რომელიც `$needle`-ს შეიცავს */
    private function sent(string $needle): int
    {
        return Http::recorded(fn (SentRequest $request) => str_contains($request->url(), $needle))->count();
    }

    /**
     * შედეგი — მოთხოვნა მეორდება, სანამ მასალა გროვდება (გვერდიც ასე იქცევა).
     * ⚠️ `refresh` მხოლოდ პირველ მოთხოვნას მიჰყვება, თორემ ყოველი გამეორება ქეშს თავიდან დაცლიდა.
     */
    private function suggest(string $uri, array $query = [], ?User $as = null): array
    {
        for ($attempt = 0; $attempt < 40; $attempt++) {
            $res = $this->actingAs($as ?? $this->user)->getJson("{$uri}/suggestions?".http_build_query($query))->assertOk()->json();

            if ($res['ready']) {
                return $res;
            }

            unset($query['refresh']);
        }

        $this->fail('შემოთავაზებები ვერ მომზადდა');
    }

    #[DataProvider('modules')]
    public function test_new_titles_come_from_what_the_sources_call_similar_to_mine(string $model, string $uri, string $type): void
    {
        $this->type = $type;
        $base = $this->record($model, 'Base', 10);
        $this->related[10] = [
            'recommendations' => [$this->row(101, 'Rec', ['vote_average' => 6.0]), $this->row(102, 'Both', ['vote_average' => 9.0, 'ka' => 'ორივე'])],
            'similar' => [$this->row(102, 'Both', ['vote_average' => 9.0, 'ka' => 'ორივე']), $this->row(103, 'Sim', ['vote_average' => 7.5])],
        ];

        $res = $this->suggest($uri, ['statuses' => 'watched']);

        $this->assertSame(['used' => 1, 'total' => 1, 'limit' => SuggestionBasis::LIMIT], collect($res['basis'])->except('records')->all());
        $this->assertSame([$base->id], array_column($res['basis']['records'], 'id'));

        /* რეკომენდაცია სრული ხმაა, მხოლოდ „similar" — ნახევარი (ის ჟანრებითა და საკვანძო
           სიტყვებით დგება), ამიტომ „Sim" მაღალი რეიტინგის მიუხედავად ბოლოა; ტოლ ხმებს რეიტინგი ყოფს */
        $this->assertSame(['Both', 'Rec', 'Sim'], array_column($res['data'], 'title'));
        $this->assertSame(['all' => 3, 'mine' => 0, 'new' => 3, 'hidden' => 0], $res['counts']);

        $first = $res['data'][0];
        $this->assertSame(102, $first['tmdb_id']);
        $this->assertSame('ორივე', $first['title_ka']);
        $this->assertSame(2020, $first['year']);
        $this->assertSame('https://image.tmdb.org/t/p/w342/p102.jpg', $first['poster']);
        $this->assertFalse($first['owned']);
        $this->assertNull($first['record']);

        // „რატომ" — რომელი ჩემი სათაურის გამო და რომელმა წყარომ მიუთითა
        $this->assertSame($base->id, $first['why']['bases'][0]['id']);
        $this->assertSame('Base', $first['why']['bases'][0]['title_en']);
        $this->assertSame(['tmdb'], $first['why']['bases'][0]['sources']);
        $this->assertSame(1, $first['why']['bases_total']);
    }

    #[DataProvider('modules')]
    public function test_what_i_already_have_is_never_new_and_a_locked_or_trashed_record_shows_nowhere(string $model, string $uri, string $type): void
    {
        $this->type = $type;
        $this->actingAs($this->user);

        $base = $this->record($model, 'Base', 10);
        $mine = $this->record($model, 'Unwatched', 101, 'to_watch');
        $this->record($model, 'Seen', 102, 'watched');
        $locked = $this->record($model, 'Locked', 103, 'to_watch');
        $trashed = $this->record($model, 'Trashed', 104, 'to_watch');
        // სხვისი ბიბლიოთეკა ჩემს „უკვე მაქვს"-ს არ ცვლის
        $this->record($model, 'Theirs', 105, 'to_watch', [], $this->makeUser('dato'));

        RecordLock::create([
            'user_id' => $this->user->id,
            'lockable_type' => $locked->getMorphClass(),
            'lockable_id' => $locked->getKey(),
            'password_hash' => Hash::make('secret1'),
        ]);
        $trashed->moveToTrash();

        $this->related[10] = ['recommendations' => array_map(fn (int $id) => $this->row($id, "T{$id}"), [101, 102, 103, 104, 105])];

        // ჩაკეტილი საფუძველშიც ვერ ხვდება — ხელით მონიშვნითაც
        $res = $this->suggest($uri, ['ids' => "{$base->id},{$locked->id}"]);

        $this->assertSame([$base->id], array_column($res['basis']['records'], 'id'));
        $this->assertEqualsCanonicalizing([101, 105], array_column($res['data'], 'tmdb_id'));
        $this->assertSame(['all' => 2, 'mine' => 1, 'new' => 1, 'hidden' => 0], $res['counts']);

        $own = collect($res['data'])->firstWhere('tmdb_id', 101);
        $this->assertTrue($own['owned']);
        $this->assertSame('Unwatched', $own['title']);
        $this->assertSame($mine->id, $own['record']['id']);
        $this->assertSame('to_watch', $own['record']['status']['key']);

        // ჭრილები
        $this->assertSame([101], array_column($this->suggest($uri, ['ids' => $base->id, 'cut' => 'mine'])['data'], 'tmdb_id'));
        $this->assertSame([105], array_column($this->suggest($uri, ['ids' => $base->id, 'cut' => 'new'])['data'], 'tmdb_id'));
    }

    #[DataProvider('modules')]
    public function test_the_basis_is_picked_by_status_favourite_hand_and_filter(string $model, string $uri, string $type): void
    {
        $this->type = $type;
        $action = Genre::create(['slug' => 'action', 'tmdb_id' => 28]);

        $a = $this->record($model, 'Alpha', 1, 'watched', ['year' => 2000, 'rating' => 8.0, 'my_rating' => 9]);
        $b = $this->record($model, 'Beta', 2, 'watching', ['year' => 2010, 'rating' => 6.0]);
        $c = $this->record($model, 'Gamma', 3, 'to_watch', ['year' => 2020, 'is_favorite' => true]);
        $d = $this->record($model, 'Delta', 4, 'to_watch', ['year' => 2021]);
        $this->record($model, 'No TMDB', 0, 'watched', ['tmdb_id' => null]);
        $b->genres()->attach($action->id);

        $ids = fn (array $query) => array_column(
            $this->actingAs($this->user)->getJson("{$uri}/suggestions?".http_build_query($query))->assertOk()->json('basis.records'),
            'id',
        );

        $this->assertSame([$a->id], $ids(['statuses' => 'watched']));
        $this->assertEqualsCanonicalizing([$a->id, $b->id], $ids(['statuses' => 'watched,watching']));
        $this->assertSame([$c->id], $ids(['favorite' => 1]));
        // სტატუსი და „რჩეული" ერთმანეთს ემატება; რჩეული წინ დგას
        $this->assertSame([$c->id, $a->id], $ids(['statuses' => 'watched', 'favorite' => 1]));
        // ხელით მონიშნული — ზუსტად ის, სტატუსის მიუხედავად
        $this->assertSame([$d->id], $ids(['statuses' => 'watched', 'ids' => $d->id]));

        // დავიწროება: ჟანრი, წელი (შებრუნებული ზღვარი თავისით სწორდება), ჩემი ქულა, TMDB-ის რეიტინგი
        $both = ['statuses' => 'watched,watching'];
        $this->assertSame([$b->id], $ids([...$both, 'b_genre' => 'action']));
        $this->assertSame([$b->id], $ids([...$both, 'b_year_min' => 2015, 'b_year_max' => 2005]));
        $this->assertSame([$a->id], $ids([...$both, 'b_my_rating_min' => 8]));
        $this->assertSame([$a->id], $ids([...$both, 'b_rating_min' => 7]));

        // არაფერია არჩეული — საფუძველი ცარიელია და შედეგიც
        $empty = $this->actingAs($this->user)->getJson("{$uri}/suggestions")->assertOk()->json();
        $this->assertTrue($empty['ready']);
        $this->assertSame(0, $empty['basis']['used']);
        $this->assertSame([], $empty['data']);

        // ამრჩევი: არჩეული სტატუსის ჩანაწერები, ძებნით
        $picker = $this->actingAs($this->user)->getJson("{$uri}/suggestions/basis?statuses=to_watch&q=Del")->assertOk()->json();
        $this->assertSame(2, $picker['total']);
        $this->assertSame([$d->id], array_column($picker['data'], 'id'));
        $this->assertSame('Delta', $picker['data'][0]['title_en']);
    }

    public function test_a_big_status_is_cut_to_the_limit_favourites_and_my_best_first(): void
    {
        $records = [];
        for ($i = 1; $i <= SuggestionBasis::LIMIT + 2; $i++) {
            $records[$i] = $this->record(Movie::class, "M{$i}", $i);
            $this->related[$i] = ['recommendations' => [$this->row(1000 + $i, "R{$i}")]];
        }
        $records[5]->update(['is_favorite' => true]);
        $records[9]->update(['my_rating' => 9]);
        $records[12]->update(['my_rating' => 7]);

        // პირველი პასუხი პროგრესია: ერთი მოთხოვნა ყველა საფუძველს წყაროს ვერ ჰკითხავს
        $first = $this->actingAs($this->user)->getJson('/api/movies/suggestions?statuses=watched')->assertOk()->json();

        $this->assertFalse($first['ready']);
        $this->assertSame('sources', $first['progress']['stage']);
        $this->assertSame(SuggestionBasis::LIMIT, $first['progress']['total']);
        $this->assertGreaterThan(0, $first['progress']['done']);
        $this->assertLessThan(SuggestionBasis::LIMIT, $first['progress']['done']);
        $this->assertLessThanOrEqual(SuggestionEngine::BUDGET + 1, $this->sent('api.themoviedb.org'));

        $this->assertSame(SuggestionBasis::LIMIT, $first['basis']['used']);
        $this->assertSame(SuggestionBasis::LIMIT + 2, $first['basis']['total']);
        $this->assertSame([$records[5]->id, $records[9]->id, $records[12]->id], array_slice(array_column($first['basis']['records'], 'id'), 0, 3));
        // დანარჩენი — ბოლოს დამატებულიდან; ორი ყველაზე ძველი გარეთ რჩება
        $this->assertNotContains($records[1]->id, array_column($first['basis']['records'], 'id'));
        $this->assertNotContains($records[2]->id, array_column($first['basis']['records'], 'id'));

        $res = $this->suggest('/api/movies', ['statuses' => 'watched', 'per_page' => 100]);

        $this->assertCount(SuggestionBasis::LIMIT, $res['data']);
        // თითო საფუძველზე ორი მოთხოვნა: მასალა და ქართული სახელები
        $this->assertSame(SuggestionBasis::LIMIT * 2, $this->sent('api.themoviedb.org'));
    }

    #[DataProvider('modules')]
    public function test_the_second_request_does_not_reach_the_sources_and_refresh_does(string $model, string $uri, string $type): void
    {
        $this->type = $type;
        $this->record($model, 'Base', 10);
        $this->related[10] = ['recommendations' => [$this->row(101, 'Old')]];

        $this->assertSame(['Old'], array_column($this->suggest($uri, ['statuses' => 'watched'])['data'], 'title'));
        $sent = Http::recorded()->count();
        $this->assertGreaterThan(0, $sent);

        // წყაროს პასუხი შეიცვალა, მაგრამ ქეში ძველს ინახავს
        $this->related[10] = ['recommendations' => [$this->row(102, 'Fresh')]];

        $this->assertSame(['Old'], array_column($this->suggest($uri, ['statuses' => 'watched'])['data'], 'title'));
        $this->assertSame($sent, Http::recorded()->count());

        // ქეში საერთოა: სხვა ანგარიში იმავე სათაურზე წყაროს აღარ ეკითხება
        $other = $this->makeUser('dato');
        $this->giveCredential($other, 'tmdb');
        $this->record($model, 'Base', 10, 'watched', [], $other);
        $this->assertSame(['Old'], array_column($this->suggest($uri, ['statuses' => 'watched'], $other)['data'], 'title'));
        $this->assertSame($sent, Http::recorded()->count());

        // „თავიდან"
        $this->assertSame(['Fresh'], array_column($this->suggest($uri, ['statuses' => 'watched', 'refresh' => 1])['data'], 'title'));
        $this->assertGreaterThan($sent, Http::recorded()->count());
    }

    #[DataProvider('modules')]
    public function test_not_interested_hides_a_title_and_the_hidden_list_brings_it_back(string $model, string $uri, string $type): void
    {
        $this->type = $type;
        $this->record($model, 'Base', 10);
        $this->related[10] = ['recommendations' => [$this->row(101, 'Keep'), $this->row(102, 'Drop', ['vote_average' => 9.0])]];

        $row = $this->suggest($uri, ['statuses' => 'watched'])['data'][0];
        $this->assertSame('Drop', $row['title']);

        $this->actingAs($this->user)->patchJson("{$uri}/suggestions/hidden", [
            'tmdb_id' => $row['tmdb_id'], 'hidden' => true, 'title' => $row['title'], 'year' => $row['year'], 'poster' => $row['poster'],
        ])->assertOk()->assertJson(['hidden' => true, 'count' => 1]);

        $res = $this->suggest($uri, ['statuses' => 'watched']);
        $this->assertSame(['Keep'], array_column($res['data'], 'title'));
        $this->assertSame(['all' => 1, 'mine' => 0, 'new' => 1, 'hidden' => 1], $res['counts']);

        // „დამალულები" — სია თავისი სათაურითა და პოსტერით, წყაროს გარეშე
        $hidden = $this->suggest($uri, ['statuses' => 'watched', 'hidden' => 1]);
        $this->assertSame(['Drop'], array_column($hidden['data'], 'title'));
        $this->assertTrue($hidden['data'][0]['hidden']);
        $this->assertSame('https://image.tmdb.org/t/p/w342/p102.jpg', $hidden['data'][0]['poster']);
        $this->assertSame('/p102.jpg', HiddenSuggestion::first()->tmdb_poster);

        // სხვის დამალულს ჩემი არ ეხება და პირიქით
        $other = $this->makeUser('dato');
        $this->giveCredential($other, 'tmdb');
        $this->record($model, 'Base', 10, 'watched', [], $other);
        $this->assertCount(2, $this->suggest($uri, ['statuses' => 'watched'], $other)['data']);

        $this->actingAs($this->user)->patchJson("{$uri}/suggestions/hidden", ['tmdb_id' => 102, 'hidden' => false])
            ->assertOk()->assertJson(['hidden' => false, 'count' => 0]);

        $this->assertSame(['Drop', 'Keep'], array_column($this->suggest($uri, ['statuses' => 'watched'])['data'], 'title'));
    }

    public function test_a_foreign_poster_address_is_not_stored_with_a_hidden_title(): void
    {
        $this->actingAs($this->user)->patchJson('/api/movies/suggestions/hidden', [
            'tmdb_id' => 5, 'hidden' => true, 'title' => 'X', 'poster' => 'https://evil.example/p.jpg',
        ])->assertOk();

        $this->assertNull(HiddenSuggestion::first()->tmdb_poster);

        // სათაურის გარეშე დამალვა არ იწერება
        $this->actingAs($this->user)->patchJson('/api/movies/suggestions/hidden', ['tmdb_id' => 6, 'hidden' => true])
            ->assertStatus(422);
    }

    #[DataProvider('modules')]
    public function test_without_the_tmdb_key_the_page_says_so(string $model, string $uri): void
    {
        $this->takeCredential($this->user, 'tmdb');

        $this->actingAs($this->user)->getJson("{$uri}/suggestions?statuses=watched")
            ->assertStatus(409)->assertJson(['message' => 'credential_missing', 'provider' => 'tmdb']);
        $this->actingAs($this->user)->getJson("{$uri}/suggestions/trailer?tmdb_id=5")
            ->assertStatus(409)->assertJson(['message' => 'credential_missing']);

        Http::assertNothingSent();
    }

    #[DataProvider('modules')]
    public function test_a_tmdb_failure_stops_the_page_with_its_own_code(string $model, string $uri, string $type): void
    {
        $this->type = $type;
        $this->record($model, 'Base', 10);
        $this->down = ['tmdb'];

        $this->actingAs($this->user)->getJson("{$uri}/suggestions?statuses=watched")
            ->assertStatus(503)->assertExactJson(['message' => 'tmdb_unavailable']);
    }

    public function test_a_title_tmdb_no_longer_knows_does_not_break_the_page(): void
    {
        $this->record(Movie::class, 'Gone', 10);
        $this->record(Movie::class, 'Base', 11);
        $this->related[11] = ['recommendations' => [$this->row(101, 'Rec')]];

        $this->assertSame(['Rec'], array_column($this->suggest('/api/movies', ['statuses' => 'watched'])['data'], 'title'));
    }

    /** @return array<string, array{class-string<Model>, string, string}> */
    public static function traktModules(): array
    {
        return array_diff_key(self::modules(), ['anime' => true]);
    }

    #[DataProvider('traktModules')]
    public function test_trakt_adds_titles_and_agreement_between_sources_ranks_higher(string $model, string $uri, string $type): void
    {
        $this->type = $type;
        $this->giveCredential($this->user, 'trakt');

        $base = $this->record($model, 'Base', 10, 'watched', ['imdb_id' => 'tt0000010']);
        $this->related[10] = ['recommendations' => [$this->row(101, 'Shared', ['vote_average' => 5.0]), $this->row(102, 'Only TMDB', ['vote_average' => 9.0])]];
        $this->trakt['tt0000010'] = [
            ['title' => 'Shared', 'year' => 2020, 'ids' => ['trakt' => 1, 'slug' => 'shared', 'tmdb' => 101]],
            ['title' => 'Only Trakt', 'year' => 2019, 'ids' => ['trakt' => 2, 'slug' => 'only-trakt', 'tmdb' => 201]],
            ['title' => 'Unknown to TMDB', 'year' => 2018, 'ids' => ['trakt' => 3, 'slug' => 'unknown', 'tmdb' => 202]],
            ['title' => 'No TMDB id', 'year' => 2017, 'ids' => ['trakt' => 4, 'slug' => 'none', 'tmdb' => null]],
        ];
        // Trakt-ს მხოლოდ id მოაქვს — პოსტერი და ჟანრები TMDB-ის დეტალებიდანაა; 202 TMDB-ზე არ არის
        $this->details[201] = $this->row(201, 'Only Trakt', ['vote_average' => 6.0]);

        $res = $this->suggest($uri, ['statuses' => 'watched']);

        // ორმა წყარომ მიუთითა — დაბალი რეიტინგის მიუხედავად პირველია და ერთხელ ჩანს
        $this->assertSame(['Shared', 'Only TMDB', 'Only Trakt'], array_column($res['data'], 'title'));
        $this->assertSame(['tmdb', 'trakt'], $res['data'][0]['why']['bases'][0]['sources']);
        $this->assertSame(['trakt'], $res['data'][2]['why']['bases'][0]['sources']);
        $this->assertSame('https://image.tmdb.org/t/p/w342/p201.jpg', $res['data'][2]['poster']);
        $this->assertSame('ok', $res['sources']['trakt']);
        $this->assertSame('off', $res['sources']['anilist']);
        $this->assertSame(1, $this->sent('/related'));

        // მეორე გახსნა Trakt-ს აღარ ეკითხება
        $this->suggest($uri, ['statuses' => 'watched']);
        $this->assertSame(1, $this->sent('api.trakt.tv'));

        $this->assertSame($base->id, $res['data'][0]['why']['bases'][0]['id']);
    }

    public function test_trakt_finds_a_title_without_an_imdb_id_through_its_tmdb_id(): void
    {
        $this->giveCredential($this->user, 'trakt');
        $this->record(Movie::class, 'Base', 10);
        $this->related[10] = [];
        $this->traktSlugs[10] = 'base-2020';
        $this->trakt['base-2020'] = [['title' => 'Found', 'year' => 2020, 'ids' => ['tmdb' => 201]]];
        $this->details[201] = $this->row(201, 'Found');

        $this->assertSame(['Found'], array_column($this->suggest('/api/movies', ['statuses' => 'watched'])['data'], 'title'));
        $this->assertSame(1, $this->sent('/search/tmdb/10'));
    }

    #[DataProvider('traktModules')]
    public function test_a_missing_or_failing_trakt_is_skipped_and_the_page_still_answers(string $model, string $uri, string $type): void
    {
        $this->type = $type;
        $this->record($model, 'Base', 10, 'watched', ['imdb_id' => 'tt0000010']);
        $this->related[10] = ['recommendations' => [$this->row(101, 'From TMDB')]];
        $this->trakt['tt0000010'] = [['title' => 'From Trakt', 'year' => 2020, 'ids' => ['tmdb' => 201]]];
        $this->details[201] = $this->row(201, 'From Trakt');

        // გასაღების გარეშე — წყარო გამოტოვებულია და პასუხი ამას ამბობს
        $res = $this->suggest($uri, ['statuses' => 'watched']);
        $this->assertSame(['From TMDB'], array_column($res['data'], 'title'));
        $this->assertSame('missing', $res['sources']['trakt']);
        $this->assertSame(0, $this->sent('api.trakt.tv'));

        // გასაღებით, მაგრამ წყარო ჩავარდნილია — შედეგი იგივეა, წყარო დროებით გამოთიშულია
        $this->giveCredential($this->user, 'trakt');
        $this->down = ['trakt'];

        $res = $this->suggest($uri, ['statuses' => 'watched']);
        $this->assertSame(['From TMDB'], array_column($res['data'], 'title'));
        $this->assertSame('failed', $res['sources']['trakt']);
        $this->assertSame(1, $this->sent('api.trakt.tv'));

        // გამოთიშვის განმავლობაში ხელახლა აღარ ეკითხება
        $this->suggest($uri, ['statuses' => 'watched']);
        $this->assertSame(1, $this->sent('api.trakt.tv'));
        $this->assertSame(0, SuggestionSource::where('source', SuggestionSource::TRAKT)->count());
    }

    public function test_anime_asks_anilist_instead_of_trakt_and_drops_what_tmdb_cannot_place(): void
    {
        $this->type = 'anime';
        $this->giveCredential($this->user, 'trakt');

        $this->record(Anime::class, 'Base Anime', 10);
        $this->related[10] = ['recommendations' => [$this->row(101, 'From TMDB', ['vote_average' => 9.0])]];

        $node = fn (string $title, ?int $year, string $format, int $rating, ?string $romaji = null) => [
            'rating' => $rating,
            'mediaRecommendation' => ['id' => 1, 'format' => $format, 'title' => ['english' => $title, 'romaji' => $romaji], 'startDate' => ['year' => $year]],
        ];
        $this->anilist['Base Anime'] = [
            $node('Linked Show', 2019, 'TV', 50),
            $node('By Romaji', 2021, 'TV', 45, 'Romaji Name'),
            $node('Not Anime On TMDB', 2020, 'TV', 40),
            $node('A Film', 2018, 'MOVIE', 30),
            $node('Disliked', 2017, 'TV', -5),
        ];
        $this->search['Linked Show'] = [$this->row(301, 'Linked Show', ['vote_average' => 6.0])];
        $this->search['Romaji Name'] = [$this->row(303, 'By Romaji', ['vote_average' => 5.0])];
        // იგივე სახელით ჩვეულებრივი სერიალი — სხვა სათაურია, არ ითვლება ნაპოვნად
        $this->search['Not Anime On TMDB'] = [['id' => 302, 'name' => 'Not Anime On TMDB', 'first_air_date' => '2020-01-01', 'poster_path' => '/p302.jpg', 'genre_ids' => [18], 'origin_country' => ['US']]];

        $res = $this->suggest('/api/anime', ['statuses' => 'watched']);

        $this->assertSame(['From TMDB', 'Linked Show', 'By Romaji'], array_column($res['data'], 'title'));
        $this->assertSame(['anilist'], $res['data'][1]['why']['bases'][0]['sources']);
        $this->assertSame(['trakt' => 'off', 'anilist' => 'ok', 'gemini' => 'missing'], $res['sources']);
        $this->assertSame(0, $this->sent('api.trakt.tv'));
        $this->assertSame(1, $this->sent('graphql.anilist.co'));
        // ფილმი და დაწუნებული წყვილი TMDB-ზე არც იძებნება
        $this->assertSame(0, Http::recorded(fn (SentRequest $r) => str_contains($r->url(), 'search/tv') && str_contains($r->url(), 'Film'))->count());

        // AniList-ის ჩავარდნა გვერდს არ აჩერებს
        $this->down = ['anilist'];
        $res = $this->suggest('/api/anime', ['statuses' => 'watched', 'refresh' => 1]);
        $this->assertSame(['From TMDB'], array_column($res['data'], 'title'));
        $this->assertSame('failed', $res['sources']['anilist']);
    }

    public function test_the_series_page_offers_no_anime_and_the_anime_page_only_anime(): void
    {
        $anime = ['id' => 101, 'name' => 'An Anime', 'first_air_date' => '2020-01-01', 'poster_path' => '/a.jpg', 'vote_average' => 8.0, 'genre_ids' => [self::ANIMATION], 'origin_country' => ['JP']];
        $drama = ['id' => 102, 'name' => 'A Drama', 'first_air_date' => '2020-01-01', 'poster_path' => '/d.jpg', 'vote_average' => 7.0, 'genre_ids' => [18], 'origin_country' => ['US']];
        // პოსტერის გარეშე სათაური არც ერთ გვერდზე არ ჩანს
        $bare = ['id' => 103, 'name' => 'No Poster', 'first_air_date' => '2020-01-01', 'vote_average' => 9.0, 'genre_ids' => [18], 'origin_country' => ['US']];

        $this->record(Series::class, 'Base Series', 10);
        $this->record(Anime::class, 'Base Anime', 10);
        $this->related[10] = ['recommendations' => [$anime, $drama, $bare]];

        $this->type = 'series';
        $this->assertSame(['A Drama'], array_column($this->suggest('/api/series', ['statuses' => 'watched'])['data'], 'title'));

        // იგივე TMDB-პასუხი ქეშიდან — ანიმეს გვერდი მას თავისებურად ჭრის
        $sent = $this->sent('api.themoviedb.org');
        $this->type = 'anime';
        $this->assertSame(['An Anime'], array_column($this->suggest('/api/anime', ['statuses' => 'watched'])['data'], 'title'));
        $this->assertSame($sent, $this->sent('api.themoviedb.org'));
    }

    #[DataProvider('modules')]
    public function test_plot_closeness_ranks_titles_and_each_vector_is_computed_once(string $model, string $uri, string $type): void
    {
        $this->type = $type;
        $base = $this->record($model, 'Base', 10);
        $near = $this->record($model, 'Mine near', 500, 'to_watch', [], null, 'A space war again');
        $this->record($model, 'Mine far', 501, 'to_watch', [], null, 'A quiet love story');
        $this->related[10] = [
            'overview' => 'An endless space war',
            'recommendations' => [
                $this->row(101, 'Far', ['vote_average' => 9.0, 'overview' => 'A love story']),
                $this->row(102, 'Near', ['vote_average' => 5.0, 'overview' => 'Space war in the future']),
            ],
        ];

        // Gemini-ის გასაღების გარეშე — სხვა სიგნალებით: რიგს რეიტინგი ადგენს, ჩემი სათაურები არ ჩანს
        $res = $this->suggest($uri, ['statuses' => 'watched']);
        $this->assertSame(['Far', 'Near'], array_column($res['data'], 'title'));
        $this->assertSame('missing', $res['sources']['gemini']);
        $this->assertNull($res['data'][0]['why']['plot']);
        $this->assertSame(0, $this->sent('batchEmbedContents'));

        $this->giveCredential($this->user, 'gemini');
        $res = $this->suggest($uri, ['statuses' => 'watched']);

        /* სიუჟეტით ახლო სათაური წინ გადადის. ჩემი სიიდან ჩანს ის, რომლის აღწერაც ჰგავს —
           არცერთ წყაროს მასზე არ მიუთითებია, ამიტომ მითითებულის შემდეგ დგას; შორეული არ ჩანს */
        $this->assertSame(['Near', 'Far', 'Mine near'], array_column($res['data'], 'title'));
        $this->assertSame('ok', $res['sources']['gemini']);
        $this->assertSame(['id' => $base->id, 'title_ka' => null, 'title_en' => 'Base', 'match' => 100], $res['data'][0]['why']['plot']);
        $this->assertSame($near->id, $res['data'][2]['record']['id']);
        $this->assertSame([], $res['data'][2]['why']['bases']);
        $this->assertSame($base->id, $res['data'][2]['why']['plot']['id']);
        $this->assertSame(['vectors' => 5, 'missing' => 0], $res['plot']);
        $this->assertSame(5, SuggestionVector::count());

        // ვექტორი ერთხელ ითვლება — მეორე გახსნა Gemini-ს აღარ ეკითხება
        $sent = $this->sent('batchEmbedContents');
        $this->assertSame(1, $sent);
        $this->suggest($uri, ['statuses' => 'watched']);
        $this->assertSame($sent, $this->sent('batchEmbedContents'));
    }

    public function test_a_gemini_failure_leaves_the_other_signals_working(): void
    {
        $this->giveCredential($this->user, 'gemini');
        $this->down = ['gemini'];
        $this->record(Movie::class, 'Base', 10);
        $this->related[10] = ['overview' => 'Space war', 'recommendations' => [$this->row(101, 'Rec')]];

        $res = $this->suggest('/api/movies', ['statuses' => 'watched']);

        $this->assertSame(['Rec'], array_column($res['data'], 'title'));
        $this->assertSame('failed', $res['sources']['gemini']);
        $this->assertSame(2, $res['plot']['missing']);

        // გამოთიშვის განმავლობაში ხელახლა აღარ ეკითხება
        $this->suggest('/api/movies', ['statuses' => 'watched']);
        $this->assertSame(1, $this->sent('batchEmbedContents'));

        // ლიმიტი წუთობრივია — წუთის შემდეგ ისევ ეკითხება და ვექტორები ივსება
        $this->down = [];
        $this->travel(71)->seconds();

        $res = $this->suggest('/api/movies', ['statuses' => 'watched']);
        $this->assertSame(2, $this->sent('batchEmbedContents'));
        $this->assertSame('ok', $res['sources']['gemini']);
        $this->assertSame(['vectors' => 2, 'missing' => 0], $res['plot']);
    }

    public function test_plot_vectors_are_computed_one_batch_a_minute(): void
    {
        $this->giveCredential($this->user, 'gemini');

        // 10 საფუძველი + 60 საუკეთესო ახალი + 36 ჩემი = 106 აღწერა — ერთ პარტიაში (100) არ ეტევა
        for ($i = 1; $i <= 10; $i++) {
            $this->record(Movie::class, "Base {$i}", $i);
            $this->related[$i] = [
                'overview' => "A space war {$i}",
                'recommendations' => array_map(fn (int $j) => $this->row(1000 + $i * 10 + $j, "R{$i}-{$j}"), range(1, 7)),
            ];
        }
        for ($i = 1; $i <= 40; $i++) {
            $this->record(Movie::class, "Mine {$i}", 5000 + $i, 'to_watch', [], null, "A love story {$i}");
        }

        $res = $this->suggest('/api/movies', ['statuses' => 'watched']);

        $this->assertSame(1, $this->sent('batchEmbedContents'));
        $this->assertSame(['vectors' => 100, 'missing' => 6], $res['plot']);
        // ეს ჩავარდნა არ არის — წყარო მუშაობს, დანარჩენი თავის რიგს ელოდება
        $this->assertSame('ok', $res['sources']['gemini']);
        // პარტია მონაცვლეობით ივსება: ახალსაც და ჩემსაც ვექტორი აქვს
        $this->assertGreaterThan(30, SuggestionVector::where('tmdb_id', '>', 5000)->count());
        $this->assertGreaterThan(30, SuggestionVector::whereBetween('tmdb_id', [1000, 2000])->count());

        // იმავე წუთში მეორე პარტია არ მიდის (ლიმიტზე ჩავარდებოდა)
        $this->suggest('/api/movies', ['statuses' => 'watched']);
        $this->assertSame(1, $this->sent('batchEmbedContents'));

        $this->travel(61)->seconds();

        $res = $this->suggest('/api/movies', ['statuses' => 'watched']);
        $this->assertSame(2, $this->sent('batchEmbedContents'));
        $this->assertSame(['vectors' => 106, 'missing' => 0], $res['plot']);
    }

    public function test_deleting_the_account_takes_its_hidden_titles_and_leaves_the_shared_cache(): void
    {
        $this->record(Movie::class, 'Base', 10);
        $this->related[10] = ['recommendations' => [$this->row(101, 'Rec')]];
        $this->suggest('/api/movies', ['statuses' => 'watched']);

        $this->actingAs($this->user)->patchJson('/api/movies/suggestions/hidden', ['tmdb_id' => 101, 'hidden' => true, 'title' => 'Rec'])->assertOk();
        $this->assertSame(1, HiddenSuggestion::count());

        app(AccountEraser::class)->erase($this->user);

        $this->assertSame(0, HiddenSuggestion::count());
        // წყაროს პასუხი ყველა ანგარიშისაა — ერთის წაშლა მას არ ეხება
        $this->assertSame(1, SuggestionSource::where('source', SuggestionSource::TMDB)->count());
    }

    #[DataProvider('modules')]
    public function test_shared_keywords_and_genres_bring_more_titles_and_explain_them(string $model, string $uri, string $type): void
    {
        $this->type = $type;
        $action = Genre::create(['slug' => 'action', 'tmdb_id' => 28]);
        $action->setTranslation('en', 'Action');
        $action->setTranslation('ka', 'მძაფრსიუჟეტიანი');

        $this->record($model, 'One', 10);
        $this->record($model, 'Two', 11);
        $this->related[10] = ['genres' => [28, 18], 'keywords' => [[5, 'heist'], [6, 'paris']], 'recommendations' => [$this->row(101, 'Rec', ['genre_ids' => [28]])]];
        $this->related[11] = ['genres' => [28], 'keywords' => [[5, 'heist'], [7, 'rome']]];
        $this->discover[5] = [$this->row(401, 'Heist Film', ['genre_ids' => [28], 'vote_average' => 3.0]), $this->row(101, 'Rec', ['genre_ids' => [28]])];

        $res = $this->suggest($uri, ['statuses' => 'watched']);

        $this->assertSame(['Rec', 'Heist Film'], array_column($res['data'], 'title'));
        // მხოლოდ საერთო სიტყვით ეშვება — ერთი საფუძვლის სიტყვა სათაურს არ ახასიათებს
        $this->assertSame(1, $this->sent('/discover/'));
        $this->assertSame(['heist'], $res['data'][1]['why']['keywords']);
        $this->assertSame([], $res['data'][1]['why']['bases']);
        $this->assertSame(['heist'], $res['data'][0]['why']['keywords']);
        $this->assertSame([['name_en' => 'Action', 'name_ka' => 'მძაფრსიუჟეტიანი']], $res['data'][0]['why']['genres']);

        $sentKeyword = Http::recorded(fn (SentRequest $r) => str_contains($r->url(), '/discover/'))->first()[0];
        $this->assertStringContainsString('with_keywords=5', $sentKeyword->url());
    }

    public function test_one_title_alone_starts_no_keyword_search(): void
    {
        $this->record(Movie::class, 'One', 10);
        $this->related[10] = ['keywords' => [[5, 'heist']], 'recommendations' => [$this->row(101, 'Rec')]];

        $this->suggest('/api/movies', ['statuses' => 'watched']);

        $this->assertSame(0, $this->sent('/discover/'));
    }

    #[DataProvider('modules')]
    public function test_the_result_is_filtered_and_paged(string $model, string $uri, string $type): void
    {
        $this->type = $type;
        Genre::create(['slug' => 'action', 'tmdb_id' => 28]);
        Genre::create(['slug' => 'drama', 'tmdb_id' => 18]);
        $date = MediaDomain::isTv($type) ? 'first_air_date' : 'release_date';

        $this->record($model, 'Base', 10);
        $this->related[10] = ['recommendations' => [
            $this->row(101, 'Old action', ['genre_ids' => [28], $date => '2001-01-01', 'vote_average' => 8.0]),
            $this->row(102, 'New drama', ['genre_ids' => [18], $date => '2015-01-01', 'vote_average' => 6.0]),
            $this->row(103, 'New action', ['genre_ids' => [28], $date => '2019-01-01', 'vote_average' => 4.0]),
            $this->row(104, 'Undated', ['genre_ids' => [18], $date => '', 'vote_average' => 0]),
        ]];

        $titles = fn (array $query) => array_column($this->suggest($uri, ['statuses' => 'watched', ...$query])['data'], 'title');

        $this->assertSame(['Old action', 'New action'], $titles(['genre' => 'action']));
        $this->assertSame(['Old action', 'New drama', 'New action'], $titles(['genre' => 'action,drama', 'rating_min' => 1]));
        // ზღვრის დასმისთანავე უწლო / ურეიტინგო სათაური შედეგიდან გადის
        $this->assertSame(['New drama', 'New action'], $titles(['year_min' => 2010]));
        $this->assertSame(['Old action'], $titles(['year_max' => 2005]));
        $this->assertSame(['Old action', 'New drama'], $titles(['rating_min' => 5]));

        $page = $this->suggest($uri, ['statuses' => 'watched', 'per_page' => 3, 'page' => 2]);
        $this->assertSame(['Undated'], array_column($page['data'], 'title'));
        $this->assertSame(['total' => 4, 'page' => 2, 'per_page' => 3, 'last_page' => 2], $page['meta']);
        // ჭრილების რიცხვები გვერდს არ მიჰყვება
        $this->assertSame(4, $page['counts']['all']);
    }

    #[DataProvider('modules')]
    public function test_a_trailer_is_fetched_on_demand_and_remembered(string $model, string $uri, string $type): void
    {
        $this->type = $type;

        $trailer = $this->actingAs($this->user)->getJson("{$uri}/suggestions/trailer?tmdb_id=101")->assertOk()->json('trailer');

        $this->assertSame('youtube', $trailer['platform']);
        $this->assertStringContainsString('abc12345678', $trailer['embed_url']);

        $this->actingAs($this->user)->getJson("{$uri}/suggestions/trailer?tmdb_id=101")->assertOk();
        $this->assertSame(1, $this->sent('/videos'));
    }

    public function test_suggestions_is_a_reserved_section_key(): void
    {
        $this->assertContains('suggestions', StatusDomain::RESERVED_KEYS);
    }

    public function test_the_page_is_closed_without_the_module_or_a_session(): void
    {
        $this->getJson('/api/movies/suggestions')->assertStatus(401);

        $outsider = User::create(['name' => 'gio', 'username' => 'gio', 'email' => 'gio@example.com', 'password' => 'password']);

        $this->actingAs($outsider)->getJson('/api/movies/suggestions')->assertStatus(403);
        $this->actingAs($outsider)->patchJson('/api/movies/suggestions/hidden', ['tmdb_id' => 1, 'hidden' => false])->assertStatus(403);
    }
}
