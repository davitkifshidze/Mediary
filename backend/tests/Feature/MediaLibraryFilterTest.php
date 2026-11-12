<?php

namespace Tests\Feature;

use App\Models\Anime;
use App\Models\Genre;
use App\Models\Module;
use App\Models\Movie;
use App\Models\RecordLock;
use App\Models\Series;
use App\Models\User;
use App\Support\RecordLocks;
use Database\Seeders\ModulesSeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * **ფილმის, სერიალისა და ანიმეს სიის ფილტრი — ერთი წესი სამივეზე.**
 *
 * ⚠️ ყველა ტესტი სამივე მოდულზე გადის (`modules()`): ფილტრი ერთ ადგილას წერია
 * (`FiltersMediaLibrary`), მაგრამ კონტროლერი სამია — ერთ-ერთი რომ ძველ ასლს
 * დაუბრუნდეს, აქ გამოჩნდება.
 */
class MediaLibraryFilterTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = User::create(['name' => 'nino', 'username' => 'nino', 'email' => 'nino@example.com', 'password' => 'password']);
        $this->user->modules()->sync(Module::whereIn('key', ['movie', 'series', 'anime'])->pluck('id')->all());
        $this->user->refresh();
    }

    /** @return array<string, array{class-string<Model>, string}> */
    public static function modules(): array
    {
        return [
            'movie' => [Movie::class, '/api/movies'],
            'series' => [Series::class, '/api/series'],
            'anime' => [Anime::class, '/api/anime'],
        ];
    }

    /**
     * @param  class-string<Model>  $model
     * @param  list<Genre>  $genres
     */
    private function record(string $model, string $title, array $attributes = [], array $genres = []): Model
    {
        $record = $model::create(['user_id' => $this->user->id, 'year' => 2010, ...$attributes]);
        $record->setTranslation('en', ['title' => $title]);
        $record->genres()->sync(array_map(fn (Genre $genre) => $genre->id, $genres));

        return $record;
    }

    private function lock(Model $record): void
    {
        RecordLock::create([
            'user_id' => $this->user->id,
            'lockable_type' => $record->getMorphClass(),
            'lockable_id' => $record->getKey(),
            'password_hash' => Hash::make('secret1'),
        ]);
    }

    /** stateful მოთხოვნა — „გახსნილობას" სესია სჭირდება */
    private function spa()
    {
        return $this->actingAs($this->user)->withHeaders(['Referer' => 'http://localhost:5173']);
    }

    /** @return list<string> */
    private function titles(string $uri): array
    {
        return array_column($this->actingAs($this->user)->getJson($uri)->assertOk()->json('data'), 'title_en');
    }

    /**
     * ⚠️ ადრე რამდენიმე ჟანრი მხოლოდ „ყველა ერთად" მუშაობდა: ორი ჟანრი, რომლებშიც
     * ცალ-ცალკე ჩანაწერები არის, ცარიელ სიას აბრუნებდა.
     */
    #[DataProvider('modules')]
    public function test_several_genres_match_any_of_them_unless_all_are_asked(string $model, string $uri): void
    {
        $action = Genre::create(['slug' => 'action']);
        $drama = Genre::create(['slug' => 'drama']);
        Genre::create(['slug' => 'horror']);

        $this->record($model, 'Both', genres: [$action, $drama]);
        $this->record($model, 'Action only', genres: [$action]);
        $this->record($model, 'Drama only', genres: [$drama]);
        $this->record($model, 'Neither');

        $this->assertEqualsCanonicalizing(
            ['Both', 'Action only', 'Drama only'],
            $this->titles("{$uri}?genre=action,drama"),
        );
        $this->assertSame(['Both'], $this->titles("{$uri}?genre=action,drama&genre_mode=all"));
        // ერთ ჟანრზე ორივე რეჟიმი ერთსა და იმავეს ამბობს
        $this->assertCount(2, $this->titles("{$uri}?genre=action&genre_mode=all"));
        $this->assertSame([], $this->titles("{$uri}?genre=action,horror&genre_mode=all"));
    }

    /**
     * სიის ველი ეძებს ორივე ენის სათაურსა და IMDb id-ში — და დანარჩენ ფილტრებს
     * არ არღვევს (`or` ერთ ფრჩხილშია).
     */
    #[DataProvider('modules')]
    public function test_the_list_search_reads_both_titles_and_the_imdb_id(string $model, string $uri): void
    {
        $love = $this->record($model, 'Love', ['imdb_id' => 'tt0111161', 'year' => 1994]);
        $love->setTranslation('ka', ['title' => 'სიყვარული']);
        $this->record($model, 'Hate', ['imdb_id' => 'tt0068646', 'year' => 1972]);

        $this->assertSame(['Love'], $this->titles("{$uri}?q=lov"));
        $this->assertSame(['Love'], $this->titles("{$uri}?q=".urlencode('სიყვარ')));
        $this->assertSame(['Love'], $this->titles("{$uri}?q=tt0111161"));
        $this->assertEqualsCanonicalizing(['Love', 'Hate'], $this->titles("{$uri}?q=tt0"));
        // წელი ძებნასთან ერთად მოქმედებს
        $this->assertSame(['Hate'], $this->titles("{$uri}?q=tt0&year_max=1980"));
        $this->assertSame([], $this->titles("{$uri}?q=tt0111161&year_max=1980"));
    }

    /** „დან" > „მდე" — წყვილი გადაისმება და არა ცარიელი სია ბრუნდება */
    #[DataProvider('modules')]
    public function test_reversed_bounds_are_swapped(string $model, string $uri): void
    {
        $this->record($model, 'Old', ['year' => 1990, 'rating' => 5.0, 'my_rating' => 4]);
        $this->record($model, 'Middle', ['year' => 2005, 'rating' => 7.0, 'my_rating' => 7]);
        $this->record($model, 'New', ['year' => 2020, 'rating' => 9.0, 'my_rating' => 9]);

        $this->assertSame(['Middle'], $this->titles("{$uri}?year_min=2010&year_max=2000"));
        $this->assertSame(['Middle'], $this->titles("{$uri}?rating_min=8&rating_max=6"));
        $this->assertSame(['Middle'], $this->titles("{$uri}?my_rating_min=8&my_rating_max=6"));
        // სწორი წყვილი უცვლელია
        $this->assertEqualsCanonicalizing(['Middle', 'New'], $this->titles("{$uri}?year_min=2000&year_max=2020"));
    }

    /** ორი ქულა — ორი დიაპაზონი: TMDB-ისა და ჩემი ერთმანეთში არ ირევა */
    #[DataProvider('modules')]
    public function test_the_tmdb_rating_and_my_rating_are_separate_ranges(string $model, string $uri): void
    {
        $this->record($model, 'Critics love it', ['rating' => 9.0, 'my_rating' => 3]);
        $this->record($model, 'I love it', ['rating' => 4.0, 'my_rating' => 10]);

        $this->assertSame(['Critics love it'], $this->titles("{$uri}?rating_min=8"));
        $this->assertSame(['I love it'], $this->titles("{$uri}?my_rating_min=8"));
        $this->assertSame([], $this->titles("{$uri}?rating_min=8&my_rating_min=8"));
    }

    /** ზღვრის დასმისთანავე უწლო / ურეიტინგო ჩანაწერი სიიდან გადის; ზღვრის გარეშე — რჩება */
    #[DataProvider('modules')]
    public function test_a_record_without_a_year_or_rating_leaves_once_a_bound_is_set(string $model, string $uri): void
    {
        $this->record($model, 'Dated', ['year' => 2010, 'rating' => 7.0]);
        $this->record($model, 'Undated', ['year' => null, 'rating' => null]);

        $this->assertEqualsCanonicalizing(['Dated', 'Undated'], $this->titles($uri));
        $this->assertSame(['Dated'], $this->titles("{$uri}?year_min=1900"));
        $this->assertSame(['Dated'], $this->titles("{$uri}?year_max=2100"));
        $this->assertSame(['Dated'], $this->titles("{$uri}?rating_min=0"));
    }

    /**
     * ⚠️ „ჩაკეტილი" ჭრილი ადრე ყველა ფილტრს, ძებნასა და დალაგებას უგულებელყოფდა —
     * ყოველთვის ყველა ჩაკეტილს აბრუნებდა, `id desc`-ით.
     */
    #[DataProvider('modules')]
    public function test_the_locked_view_takes_the_same_filters_search_and_sort(string $model, string $uri): void
    {
        $action = Genre::create(['slug' => 'action']);

        $old = $this->record($model, 'Old Action', ['year' => 1990], [$action]);
        $new = $this->record($model, 'New Action', ['year' => 2020], [$action]);
        $plain = $this->record($model, 'Plain', ['year' => 2005]);
        $this->record($model, 'Unlocked Action', ['year' => 2000], [$action]);

        foreach ([$old, $new, $plain] as $record) {
            $this->lock($record);
        }

        // სამივე ამ სესიაში გახსნილია — შიგთავსი ჩანს და ფილტრს პასუხობს
        $open = [$old->getMorphClass() => [$old->id, $new->id, $plain->id]];
        $list = fn (string $query) => array_column(
            $this->spa()->withSession([RecordLocks::SESSION_KEY => $open])->getJson("{$uri}?locked=1{$query}")->assertOk()->json('data'),
            'title_en',
        );

        $this->assertSame(['Plain', 'New Action', 'Old Action'], $list(''));
        $this->assertSame(['New Action', 'Old Action'], $list('&genre=action'));
        $this->assertSame(['Old Action'], $list('&genre=action&year_max=2000'));
        $this->assertSame(['Plain'], $list('&q=plain'));
        $this->assertSame(['Old Action', 'Plain', 'New Action'], $list('&sort=year_asc'));
    }

    /**
     * **დამალული ჩანაწერი შიგთავსის ფილტრს არ პასუხობს.**
     *
     * ⚠️ ბოქლომიან ბარათზე მხოლოდ სათაურია. ჟანრით ან წლით გაფილტრული „ჩაკეტილი"
     * ჭრილი კი დამალულის ჟანრსა და წელს პაროლის გარეშე გაამხელდა — ამიტომ ასეთ
     * ფილტრზე დამალული საერთოდ გადის, შიგთავსით დალაგებაში კი ბოლოშია.
     */
    #[DataProvider('modules')]
    public function test_a_hidden_record_never_answers_a_content_filter(string $model, string $uri): void
    {
        $action = Genre::create(['slug' => 'action']);

        $hidden = $this->record($model, 'Hidden Action', ['year' => 1980], [$action]);
        $open = $this->record($model, 'Open Action', ['year' => 2020], [$action]);
        $this->lock($hidden);
        $this->lock($open);

        $session = [RecordLocks::SESSION_KEY => [$open->getMorphClass() => [$open->id]]];
        $rows = fn (string $query) => $this->spa()->withSession($session)->getJson("{$uri}?locked=1{$query}")->assertOk()->json('data');
        $ids = fn (string $query) => array_column($rows($query), 'id');

        // ფილტრის გარეშე ორივე ჩანს — დამალული ბოქლომიანი ბარათით
        $this->assertEqualsCanonicalizing([$hidden->id, $open->id], $ids(''));
        $card = collect($rows(''))->firstWhere('id', $hidden->id);
        $this->assertTrue($card['hidden']);
        $this->assertArrayNotHasKey('year', $card);

        // შიგთავსის ფილტრი: დამალული გადის — ემთხვევა თუ არა, არ ირკვევა
        $this->assertSame([$open->id], $ids('&genre=action'));
        $this->assertSame([$open->id], $ids('&year_max=2030'));
        $this->assertSame([], $ids('&year_max=1990'));

        // სათაური ბარათზე ისედაც წერია — ძებნა ყველა ჩაკეტილზე მუშაობს
        $this->assertSame([$hidden->id], $ids('&q=hidden'));

        // წლით დალაგება დამალულის წელს ვერ გაამხელს: ის ორივე მიმართულებით ბოლოშია
        $this->assertSame([$open->id, $hidden->id], $ids('&sort=year_asc'));
        $this->assertSame([$open->id, $hidden->id], $ids('&sort=year_desc'));
    }
}
