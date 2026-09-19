<?php

namespace Tests\Feature;

use App\Models\Book;
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
use Tests\TestCase;

/**
 * **FEAT-08 — სტატისტიკა.**
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
        $movie = Movie::create(['user_id' => $user->id, 'year' => $year, 'rating' => $rating]);

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
     * სტატუსი ორ მექანიზმზე დგას (§6.4) — ლექსიკონი და enum.
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
}
