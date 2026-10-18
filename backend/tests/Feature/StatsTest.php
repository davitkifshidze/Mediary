<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\CastMember;
use App\Models\Genre;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Series;
use App\Models\Song;
use App\Models\SongGenre;
use App\Models\Status;
use App\Models\User;
use Database\Seeders\GenresSeeder;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * **სტატისტიკა.**
 *
 * ⚠️ **ტესტი აგრეგატებს ამოწმებს და არა გვერდს.** ყველა ჭრილი SQL-შია,
 * ე.ი. სწორედ იქ შეიძლება ჩუმად აცდეს: `year()`/`strftime()` ორ
 * დრაივერზე სხვადასხვაა, სტატუსი ორ სხვადასხვა მექანიზმზე დგას და
 * ჟანრი სამ სხვადასხვა ფორმაში ინახება.
 */
class StatsTest extends TestCase
{
    use RefreshDatabase;

    private User $me;

    private User $other;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->me = $this->makeUser('stat');
        $this->other = $this->makeUser('nosy');
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', ['movie', 'song', 'book'])->pluck('id')->all());

        return $user->refresh();
    }

    private function movie(User $user, int $year, ?string $watchedAt = null, ?float $rating = null): Movie
    {
        // სტატისტიკა **ჩემს** ქულას ითვლის (`my_rating`), TMDB-ის საშუალოს არა
        $movie = Movie::create(['user_id' => $user->id, 'year' => $year, 'my_rating' => $rating]);

        if ($watchedAt) {
            $movie->forceFill(['watched_at' => $watchedAt])->save();
        }

        return $movie->refresh();
    }

    private function stats(?int $year = null): array
    {
        $url = '/api/stats'.($year ? "?year={$year}" : '');

        return $this->actingAs($this->me)->getJson($url)->assertOk()->json();
    }

    private function forModule(array $payload, string $key): array
    {
        foreach ($payload['data'] as $row) {
            if ($row['key'] === $key) {
                return $row;
            }
        }

        $this->fail("მოდული {$key} პასუხში არ არის");
    }

    /* ---------- დეშბორდის ჯამი (2026-09-19) ---------- */

    /**
     * ⚠️ **იგივე საფრთხე, რაც სრულ პასუხს აქვს** — სხვისი ბიბლიოთეკის
     * ჩათვლა. `summary()` ცხად `user_id`-ზე დგას და არა `owner` scope-ზე,
     * ე.ი. ტესტი სწორედ იმას ამოწმებს, რაც scope-ს რომ ენდობოდა, გატყდებოდა.
     */
    public function test_the_summary_counts_only_my_records(): void
    {
        $this->movie($this->me, 2001, '2026-03-04');
        $this->movie($this->me, 2002);
        $this->movie($this->other, 1999, '2026-03-04');

        $payload = $this->actingAs($this->me)->getJson('/api/stats/summary')->assertOk()->json();

        $this->assertSame(2, $payload['totals']['records']);
        $this->assertSame(1, $payload['totals']['done_year']);
    }

    /**
     * ⚠️ **თორმეტივე თვე ბრუნდება, ნულებიანიც** — თორემ გრაფიკის ღერძი
     * წელს არათანაბრად დაჭიმავდა და „მარტში არაფერი" იმ თვისგან ვერ
     * განირჩეოდა, რომელიც სიაში საერთოდ არ იყო.
     */
    public function test_the_summary_returns_every_month_of_the_current_year(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-05-10 12:00:00', 'UTC'));

        $this->movie($this->me, 2001, '2026-03-04');
        $this->movie($this->me, 2002, '2026-03-20');
        $this->movie($this->me, 2003, '2026-05-01');
        // ⚠️ სხვა წელი ჯამში არ უნდა შევიდეს
        $this->movie($this->me, 2004, '2025-03-04');

        $payload = $this->actingAs($this->me)->getJson('/api/stats/summary')->assertOk()->json();

        $this->assertCount(12, $payload['months']);
        $this->assertSame(2026, $payload['year']);
        $this->assertSame(2, $payload['months'][2]['count']);   // მარტი
        $this->assertSame(0, $payload['months'][3]['count']);   // აპრილი
        $this->assertSame(3, $payload['totals']['done_year']);
        $this->assertSame(1, $payload['totals']['done_month']); // მიმდინარე თვე — მაისი

        Carbon::setTestNow();
    }

    /** რჩეულები ყველა მოდულში ჯამდება */
    public function test_the_summary_sums_favorites_across_modules(): void
    {
        $this->movie($this->me, 2001)->update(['is_favorite' => true]);
        Song::create(['user_id' => $this->me->id, 'title' => 'a', 'url' => 'https://example.com/a', 'is_favorite' => true]);
        Song::create(['user_id' => $this->me->id, 'title' => 'b', 'url' => 'https://example.com/b']);

        $payload = $this->actingAs($this->me)->getJson('/api/stats/summary')->assertOk()->json();

        $this->assertSame(3, $payload['totals']['records']);
        $this->assertSame(2, $payload['totals']['favorites']);
    }

    /** ⚠️ ერთადერთი რამ, რაც აქ მართლა საშიშია: სხვისი ბიბლიოთეკის დათვლა */
    public function test_the_numbers_are_mine_only(): void
    {
        $this->movie($this->me, 2001);
        $this->movie($this->me, 2002);
        $this->movie($this->other, 2003);

        $movies = $this->forModule($this->stats(), 'movie');

        $this->assertSame(2, $movies['total']);
        $this->assertSame([2001, 2002], array_column($movies['years'], 'year'));
    }

    /**
     * თვეების ჭრილი — `watched_at`-ით, არჩეულ წელს.
     *
     * ⚠️ ეს ზუსტად ის ადგილია, სადაც `year()`/`strftime()` სხვაობა ჩუმად
     * ცარიელ ჯგუფს დააბრუნებდა — ე.ი. გრაფიკი ნულებით დაიხატებოდა და
     * არავითარი შეცდომა არ იქნებოდა.
     */
    public function test_months_are_counted_for_the_chosen_year(): void
    {
        $this->movie($this->me, 1999, '2025-02-11 10:00:00');
        $this->movie($this->me, 1999, '2025-02-20 10:00:00');
        $this->movie($this->me, 1999, '2024-07-01 10:00:00');

        $months = $this->forModule($this->stats(2025), 'movie')['months'];

        // ⚠️ თორმეტივე თვე ბრუნდება — ნულიანიც, თორემ წელი არათანაბრად დაიჭიმებოდა
        $this->assertCount(12, $months);
        $this->assertSame(2, $months[1]['count']);
        $this->assertSame(0, $months[6]['count']);

        $this->assertSame(1, $this->forModule($this->stats(2024), 'movie')['months'][6]['count']);
    }

    /** წლის ამომრჩევის სია — **აქტივობის** წლები და არა გამოშვების */
    public function test_the_year_list_comes_from_activity_not_from_release_years(): void
    {
        $this->movie($this->me, 1999, '2025-02-11 10:00:00');
        $this->movie($this->me, 1972);

        $payload = $this->stats();

        $this->assertSame([2025], $payload['years']);
        $this->assertSame(2025, $payload['year']);
    }

    /**
     * სტატუსი ორ მექანიზმზე დგას — ლექსიკონი და enum.
     *
     * ⚠️ ლექსიკონის სახელი **მფლობელის** რიგშია, ე.ი. სერვისმა ის
     * თვითონ უნდა ამოიკითხოს; `id`-ს ბრუნება გვერდს ვერაფერს ეტყოდა.
     */
    public function test_status_works_for_both_mechanisms(): void
    {
        Status::ensureDefaults($this->me->id, 'movie');
        $done = Status::withoutGlobalScope('owner')
            ->where('user_id', $this->me->id)->where('module', 'movie')->where('role', 'done')->firstOrFail();

        $movie = $this->movie($this->me, 2000);
        $movie->applyStatus($done);
        $movie->save();

        Book::create(['user_id' => $this->me->id, 'title_en' => 'Dune', 'status' => 'read']);

        $payload = $this->stats();

        $movieStatus = collect($this->forModule($payload, 'movie')['status'])->firstWhere('key', $done->key);
        $this->assertSame(1, $movieStatus['count']);
        $this->assertSame('done', $movieStatus['role']);
        $this->assertSame($done->name_ka, $movieStatus['name_ka']);

        // წიგნს ლექსიკონი არ აქვს — enum-ის გასაღები პირდაპირ მოდის
        $bookStatus = collect($this->forModule($payload, 'book')['status'])->firstWhere('key', 'read');
        $this->assertSame(1, $bookStatus['count']);
        $this->assertNull($bookStatus['role']);
    }

    /**
     * ⚠️ **სტატუსის ზოლის რიგი ლექსიკონისაა** — სეგმენტები ერთ
     * ზოლად იხატება, ე.ი. თანმიმდევრობა ინფორმაციაა. `groupBy`-ის რიგი
     * დრაივერზეა დამოკიდებული (პრაქტიკაში `status_id`-ისა), ამიტომ ტესტი
     * ლექსიკონს **ამოაბრუნებს** — `sort_order` `id`-ს აღარ ემთხვევა და
     * დალაგების გარეშე ტესტი წითლდება.
     */
    public function test_status_rows_follow_the_dictionary_order(): void
    {
        Status::ensureDefaults($this->me->id, 'movie');
        $ids = Status::withoutGlobalScope('owner')
            ->where('user_id', $this->me->id)->where('module', 'movie')->orderBy('sort_order')->pluck('id');
        foreach ($ids->reverse()->values() as $i => $id) {
            Status::withoutGlobalScope('owner')->whereKey($id)->update(['sort_order' => $i]);
        }

        $dictionary = Status::withoutGlobalScope('owner')
            ->where('user_id', $this->me->id)->where('module', 'movie')->orderByDesc('sort_order')->get();

        foreach ($dictionary as $status) {
            $movie = $this->movie($this->me, 2000);
            $movie->applyStatus($status);
            $movie->save();
        }

        // enum-ზე — მოდელის `STATUSES`-ის რიგი
        foreach (['abandoned', 'read', 'to_read'] as $status) {
            Book::create(['user_id' => $this->me->id, 'title_en' => $status, 'status' => $status]);
        }

        $payload = $this->stats();

        $this->assertSame(
            $dictionary->sortBy('sort_order')->pluck('key')->values()->all(),
            array_column($this->forModule($payload, 'movie')['status'], 'key'),
        );
        $this->assertSame(['to_read', 'read', 'abandoned'], array_column($this->forModule($payload, 'book')['status'], 'key'));
    }

    /** ჟანრი სამ ფორმაშია: გლობალური polymorphic · pivot · სვეტი */
    public function test_genres_are_counted_in_all_three_shapes(): void
    {
        $this->seed(GenresSeeder::class);
        $genre = Genre::firstOrFail();

        $movie = $this->movie($this->me, 2000);
        $movie->genres()->sync([$genre->id]);

        $rock = SongGenre::create(['user_id' => $this->me->id, 'key' => 'rock', 'name_ka' => 'როკი', 'name_en' => 'Rock']);
        $song = Song::create(['user_id' => $this->me->id, 'title' => 'One', 'url' => 'https://example.com/1']);
        $song->genres()->sync([$rock->id]);

        $payload = $this->stats();

        $movieGenres = $this->forModule($payload, 'movie')['genres'];
        $this->assertSame($genre->id, $movieGenres[0]['id']);
        $this->assertSame(1, $movieGenres[0]['count']);
        // გლობალური ჟანრი სახელს ცალკე ცხრილში ინახავს — აქსესორით უნდა წაიკითხოს
        $this->assertNotNull($movieGenres[0]['name_en']);

        $songGenres = $this->forModule($payload, 'song')['genres'];
        $this->assertSame('როკი', $songGenres[0]['name_ka']);
        $this->assertSame(1, $songGenres[0]['count']);
    }

    /**
     * ⚠️ **პოლიმორფული ჟანრი დომენით უნდა იჭრებოდეს.** `genreables` ერთი
     * ცხრილია სამივე მედია-დომენზე, ე.ი. `genreable_type`-ის გარეშე
     * სერიალის ჟანრები ფილმების ჭრილში აღმოჩნდებოდა.
     */
    public function test_a_polymorphic_genre_does_not_leak_between_domains(): void
    {
        $this->seed(GenresSeeder::class);
        $genre = Genre::firstOrFail();

        $this->me->modules()->syncWithoutDetaching(Module::where('key', 'series')->pluck('id')->all());

        $series = Series::create(['user_id' => $this->me->id, 'year' => 2010]);
        $series->genres()->sync([$genre->id]);

        $payload = $this->stats();

        $this->assertSame([], $this->forModule($payload, 'movie')['genres']);
        $this->assertSame(1, $this->forModule($payload, 'series')['genres'][0]['count']);
    }

    /** ქულები მთელ რიცხვებად იკრიბება (ბაზაში ისინი `decimal(3,1)`-ია) */
    public function test_ratings_are_bucketed_to_whole_scores(): void
    {
        $this->movie($this->me, 2000, null, 8.4);
        $this->movie($this->me, 2001, null, 8.5);
        $this->movie($this->me, 2002, null, 7.0);

        $ratings = $this->forModule($this->stats(), 'movie')['ratings'];

        $this->assertSame([['score' => 7, 'count' => 1], ['score' => 8, 'count' => 1], ['score' => 9, 'count' => 1]], $ratings);
    }

    /** გამორთული მოდული პასუხშიც არ არის — იგივე წესი, რაც საიდბარსა და ძებნაში */
    public function test_a_module_i_do_not_have_is_absent(): void
    {
        $keys = array_column($this->stats()['data'], 'key');

        $this->assertSame(['movie', 'song', 'book'], $keys);
    }

    /** ცარიელი ბიბლიოთეკა — ნულები და არა შეცდომა */
    public function test_an_empty_library_answers_with_zeroes(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-19 12:00:00', 'UTC'));

        $payload = $this->stats();
        $movies = $this->forModule($payload, 'movie');

        $this->assertSame(0, $movies['total']);
        $this->assertSame([], $movies['years']);
        $this->assertSame([], $payload['years']);
        $this->assertSame(2026, $payload['year']);

        Carbon::setTestNow();
    }

    /* ---------- „მედია" სამ ჩანართად, ზოლიდან სიაზე ---------- */

    private function withSeries(User $user): User
    {
        $user->modules()->syncWithoutDetaching(Module::where('key', 'series')->pluck('id')->all());

        return $user->refresh();
    }

    private function watch(Movie $movie, string $when): void
    {
        DB::table('media_watches')->insert([
            'user_id' => $movie->user_id,
            'watchable_type' => 'movie',
            'watchable_id' => $movie->id,
            'watched_at' => $when.' 12:00:00',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** @return list<int> */
    private function ids(string $url): array
    {
        return collect($this->actingAs($this->me)->getJson($url)->assertOk()->json('data'))->pluck('id')->sort()->values()->all();
    }

    /**
     * **ჟანრი თითო მედია-ჩანართში, `slug`-ით** — მედიის სია ჟანრით slug-ით
     * ფილტრავს, ე.ი. ზოლზე დაჭერას ის სჭირდება. ⚠️ სხვისი ბიბლიოთეკა არ ითვლება.
     */
    public function test_a_media_genre_row_carries_its_slug_in_its_own_tab(): void
    {
        $this->seed(GenresSeeder::class);
        $this->withSeries($this->me);
        $drama = Genre::where('slug', 'drama')->firstOrFail();

        Movie::create(['user_id' => $this->me->id, 'year' => 2001])->genres()->attach($drama->id);
        Movie::create(['user_id' => $this->me->id, 'year' => 2002])->genres()->attach($drama->id);
        Series::create(['user_id' => $this->me->id, 'year' => 2003])->genres()->attach($drama->id);
        Movie::create(['user_id' => $this->other->id, 'year' => 2004])->genres()->attach($drama->id);

        $payload = $this->stats();
        $movies = collect($this->forModule($payload, 'movie')['genres'])->firstWhere('id', $drama->id);
        $series = collect($this->forModule($payload, 'series')['genres'])->firstWhere('id', $drama->id);

        $this->assertSame(['slug' => 'drama', 'count' => 2], ['slug' => $movies['slug'], 'count' => $movies['count']]);
        $this->assertSame(1, $series['count']);
        // ლექსიკონის კატეგორიას slug არ აქვს — სია მას id-ით ფილტრავს
        $this->assertArrayHasKey('slug', $this->forModule($payload, 'movie')['genres'][0]);
    }

    /**
     * **ყველაზე ხშირი მსახიობი თითო მედია-ჩანართში** — წაშლილი ბმული
     * (`is_removed`) და სხვისი ჩანაწერი არ ითვლება; დომენები არ იკრიბება.
     */
    public function test_the_most_frequent_actors_are_counted_per_media_tab(): void
    {
        $this->withSeries($this->me);
        $star = CastMember::create(['name' => 'Star']);
        $extra = CastMember::create(['name' => 'Extra']);

        $a = Movie::create(['user_id' => $this->me->id, 'year' => 2001]);
        $b = Movie::create(['user_id' => $this->me->id, 'year' => 2002]);
        $c = Series::create(['user_id' => $this->me->id, 'year' => 2003]);
        $theirs = Movie::create(['user_id' => $this->other->id, 'year' => 2004]);

        $a->castLinks()->attach($star->id, ['billing_order' => 0]);
        $b->castLinks()->attach($star->id, ['billing_order' => 0]);
        $c->castLinks()->attach($star->id, ['billing_order' => 0]);
        $a->castLinks()->attach($extra->id, ['billing_order' => 1]);
        // ⚠️ წაშლილი ბმული და სხვისი ფილმი არ ითვლება
        $b->castLinks()->attach($extra->id, ['billing_order' => 1, 'is_removed' => true]);
        $theirs->castLinks()->attach($extra->id, ['billing_order' => 0]);

        $payload = $this->stats();
        $movies = $this->forModule($payload, 'movie')['actors'];

        $this->assertSame(['Star', 2], [$movies[0]['name'], $movies[0]['count']]);
        $this->assertSame(1, collect($movies)->firstWhere('name', 'Extra')['count']);
        $this->assertSame(1, $this->forModule($payload, 'series')['actors'][0]['count']);
        // მსახიობები მხოლოდ მედიას აქვს
        $this->assertSame([], $this->forModule($payload, 'song')['actors']);
    }

    /** წლის ერთი ხაზი: წელს და შარშან, ნახვების ჟურნალიდან */
    public function test_the_media_year_line_reads_the_watch_log(): void
    {
        $movie = Movie::create(['user_id' => $this->me->id, 'year' => 2001]);

        foreach (['2026-02-01', '2026-06-01', '2025-03-01'] as $when) {
            $this->watch($movie, $when);
        }

        $movies = $this->forModule($this->stats(2026), 'movie');

        $this->assertSame(2, $movies['this_year']);
        $this->assertSame(1, $movies['last_year']);
    }

    /** „მედიის" ბლოკი და კალენდარი აღარ არსებობს */
    public function test_the_media_block_and_the_calendar_are_gone(): void
    {
        $this->assertArrayNotHasKey('media', $this->stats());
        $this->actingAs($this->me)->getJson('/api/upcoming')->assertNotFound();
    }

    /**
     * **თვის ზოლი → იმ თვის სია**: სხვა მოდულებზე „როდის დავასრულე"
     * (`done=`), მედიაზე ნახვების ჟურნალი (`watched=`, ხელახლა ნახვაც);
     * დაზიანებული თვე უგულებელყოფილია.
     */
    public function test_a_month_bar_opens_the_list_of_that_month(): void
    {
        // ⚠️ `finished_at` სტატუსს მიჰყვება (`TracksCompletion`) — „წაკითხულის" გარეშე იშლება
        $march = Book::create(['user_id' => $this->me->id, 'title_en' => 'March', 'status' => 'read']);
        $march->forceFill(['finished_at' => '2026-03-10'])->save();
        $april = Book::create(['user_id' => $this->me->id, 'title_en' => 'April', 'status' => 'read']);
        $april->forceFill(['finished_at' => '2026-04-02'])->save();

        $this->assertSame([$march->id], $this->ids('/api/books?done=2026-03'));
        $this->assertSame([$march->id, $april->id], $this->ids('/api/books?done=2026-13'));
        $this->assertSame([$march->id, $april->id], $this->ids('/api/books?done=march'));

        $seen = Movie::create(['user_id' => $this->me->id, 'year' => 2001]);
        $again = Movie::create(['user_id' => $this->me->id, 'year' => 2002]);
        Movie::create(['user_id' => $this->me->id, 'year' => 2003]);
        $this->watch($seen, '2026-03-05');
        $this->watch($again, '2026-01-05');
        $this->watch($again, '2026-03-20');

        $this->assertSame([$seen->id, $again->id], $this->ids('/api/movies?watched=2026-03'));
        $this->assertSame([$again->id], $this->ids('/api/movies?watched=2026-01'));
    }

    /**
     * **წლის და ქულის ზოლი** — სიის რიცხვი ზოლს ემთხვევა: ქულის
     * კალათა `round()`-ია (6.5 → 7), ე.ი. 7-ის ზოლი 6.5…7.4-ია; მედიაზე ეს **შენი**
     * ქულაა (`my_rating`) და არა TMDB-ის.
     */
    public function test_year_and_rating_bars_open_the_matching_list(): void
    {
        $old = Song::create(['user_id' => $this->me->id, 'title' => 'Old', 'url' => 'https://youtu.be/old', 'year' => 2011, 'rating' => 7]);
        Song::create(['user_id' => $this->me->id, 'title' => 'New', 'url' => 'https://youtu.be/new', 'year' => 2012, 'rating' => 9]);

        $this->assertSame([$old->id], $this->ids('/api/songs?year_min=2011&year_max=2011'));
        $this->assertSame([$old->id], $this->ids('/api/songs?my_rating_min=6.5&my_rating_max=7.4'));

        $edge = $this->movie($this->me, 2001, rating: 6.5);
        $this->movie($this->me, 2002, rating: 7.5);
        $this->movie($this->me, 2003);

        $bucket = collect($this->forModule($this->stats(), 'movie')['ratings'])->firstWhere('score', 7);
        $this->assertSame(1, $bucket['count']);
        $this->assertSame([$edge->id], $this->ids('/api/movies?my_rating_min=6.5&my_rating_max=7.4'));
    }
}
