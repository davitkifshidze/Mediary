<?php

namespace Tests\Feature;

use App\Models\Genre;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **ფრანჩაიზი ფილმების სიაში ერთი ერთეულია — გვერდებად დაჭრამდე.**
 *
 * ⚠️ ნაწილები ადრე მხოლოდ **ერთი გვერდის შიგნით** იკვრებოდა: სია ჯერ იჭრებოდა და
 * მერე ჯგუფდებოდა, ე.ი. სხვადასხვა გვერდზე მოხვედრილი ნაწილები ვერასდროს
 * ერთდებოდა. ამ ფაილის ყველა ტესტი პატარა გვერდს ითხოვს (`per_page`), რომ
 * ნაწილები ძველი წესით აუცილებლად სხვადასხვა გვერდზე აღმოჩნდეს.
 */
class MovieFranchiseListTest extends TestCase
{
    use RefreshDatabase;

    private const MATRIX = 2344;

    private const ALIEN = 8091;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = User::create(['name' => 'nino', 'username' => 'nino', 'email' => 'nino@example.com', 'password' => 'password']);
        $this->user->modules()->sync(Module::where('key', 'movie')->pluck('id')->all());
        $this->user->refresh();
    }

    private function movie(string $title, int $year, ?int $collection = null, array $extra = []): Movie
    {
        $movie = Movie::create(['user_id' => $this->user->id, 'year' => $year, 'tmdb_collection_id' => $collection, ...$extra]);
        $movie->setTranslation('en', ['title' => $title]);

        return $movie;
    }

    /**
     * დამატების რიგით: მატრიცის სამი ნაწილი ერთმანეთისგან შორს, შუაში — სხვა ფილმები.
     *
     * @return array<string, Movie> სათაური => ფილმი
     */
    private function seedLibrary(): array
    {
        $library = [];

        foreach ([
            ['Matrix 1', 1999, self::MATRIX],
            ['Solo A', 2001, null],
            ['Alien 1', 1979, self::ALIEN],
            ['Solo B', 2005, null],
            ['Matrix 2', 2003, self::MATRIX],
            ['Solo C', 2010, null],
            ['Alien 2', 1986, self::ALIEN],
            ['Solo D', 2015, null],
            ['Matrix 3', 2003, self::MATRIX],
        ] as [$title, $year, $collection]) {
            $library[$title] = $this->movie($title, $year, $collection);
        }

        return $library;
    }

    private function page(string $query)
    {
        return $this->actingAs($this->user)->getJson('/api/movies?'.$query)->assertOk();
    }

    /** @return list<string> */
    private function titles(string $query): array
    {
        return $this->page($query)->json('data.*.title_en');
    }

    public function test_parts_that_fall_on_different_pages_come_together(): void
    {
        $this->seedLibrary();

        // ახალი ზემოთ: ერთეულები — Matrix (3) · Solo D · Alien (2) · Solo C · Solo B · Solo A
        $this->assertSame(['Matrix 3', 'Matrix 2', 'Matrix 1', 'Solo D'], $this->titles('per_page=2&page=1'));
        $this->assertSame(['Alien 2', 'Alien 1', 'Solo C'], $this->titles('per_page=2&page=2'));
        $this->assertSame(['Solo B', 'Solo A'], $this->titles('per_page=2&page=3'));
    }

    /** გვერდის ზომა და ბოლო გვერდი ერთეულებს ითვლის, „სულ N ფილმი" კი — ფილმებს */
    public function test_the_page_counts_units_and_reports_the_number_of_films(): void
    {
        $this->seedLibrary();

        $first = $this->page('per_page=2&page=1');

        $first->assertJsonPath('meta.total', 6)      // ერთეული: 2 ფრანჩაიზი + 4 ცალკე ფილმი
            ->assertJsonPath('meta.last_page', 3)
            ->assertJsonPath('meta.per_page', 2)
            ->assertJsonPath('meta.records', 9);     // ფილმი
        // გვერდზე ორი ერთეულია, ფილმი კი ოთხი — ჯგუფი შუაზე არ იჭრება
        $first->assertJsonCount(4, 'data');

        // ყველა გვერდი ერთად ზუსტად მთელი ბიბლიოთეკაა, გამეორების გარეშე
        $all = array_merge(...array_map(fn (int $page) => $this->titles("per_page=2&page={$page}"), [1, 2, 3]));
        $this->assertCount(9, $all);
        $this->assertCount(9, array_unique($all));
    }

    /** ჯგუფის ადგილს მისი პირველი ნაწილი განსაზღვრავს, შიგნით კი ნაწილები წლითაა */
    public function test_the_group_follows_the_chosen_sort(): void
    {
        $this->seedLibrary();

        $this->assertSame(
            ['Alien 1', 'Alien 2', 'Matrix 1', 'Matrix 2', 'Matrix 3', 'Solo A'],
            $this->titles('sort=year_asc&per_page=3&page=1'),
        );
        $this->assertSame(
            ['Solo D', 'Solo C', 'Solo B'],
            $this->titles('sort=year_desc&per_page=3&page=1'),
        );
        $this->assertSame(
            ['Matrix 3', 'Matrix 2', 'Matrix 1', 'Solo A', 'Alien 2', 'Alien 1'],
            $this->titles('sort=year_desc&per_page=3&page=2'),
        );
    }

    /** ფილტრი და ძებნა ჯერ სიას ავიწროებს, ერთეულები მერე იკვრება — რაც არ ემთხვევა, ჯგუფშიც არ ჩანს */
    public function test_grouping_works_together_with_filters_and_search(): void
    {
        $library = $this->seedLibrary();

        $action = Genre::create(['slug' => 'action']);
        foreach (['Matrix 1', 'Matrix 3', 'Solo C'] as $title) {
            $library[$title]->genres()->sync([$action->id]);
        }

        // ჟანრი: მატრიცის ორი ნაწილი (მეორე — არა) და ერთი ცალკე ფილმი → ორი ერთეული
        $this->page('genre=action&per_page=1&page=1')->assertJsonPath('meta.total', 2)->assertJsonPath('meta.records', 3);
        $this->assertSame(['Matrix 3', 'Matrix 1'], $this->titles('genre=action&per_page=1&page=1'));
        $this->assertSame(['Solo C'], $this->titles('genre=action&per_page=1&page=2'));

        // ძებნა
        $this->assertSame(['Alien 2', 'Alien 1'], $this->titles('q=alien&per_page=1'));

        // წლის დიაპაზონი
        $this->assertSame(['Matrix 3', 'Matrix 2'], $this->titles('year_min=2003&year_max=2003&per_page=1'));
    }

    /** `group=0` — სუფთა დალაგება: გვერდი ისევ ფილმებს ითვლის */
    public function test_switching_grouping_off_pages_by_films_again(): void
    {
        $this->seedLibrary();

        $page = $this->page('group=0&per_page=2&page=1');

        $page->assertJsonPath('meta.total', 9)->assertJsonCount(2, 'data');
        $this->assertSame(['Matrix 3', 'Solo D'], $page->json('data.*.title_en'));
    }

    /** `all=1` — მთელი სია ერთად, ნაწილები აქაც გვერდიგვერდ */
    public function test_the_whole_list_keeps_the_groups_together(): void
    {
        $this->seedLibrary();

        $this->assertSame(
            ['Matrix 3', 'Matrix 2', 'Matrix 1', 'Solo D', 'Alien 2', 'Alien 1', 'Solo C', 'Solo B', 'Solo A'],
            $this->titles('all=1'),
        );
    }
}
