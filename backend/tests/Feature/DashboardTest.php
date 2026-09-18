<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * დეშბორდის ბარათები (Tasks 2).
 *
 * ⚠️ **ამ ფაილს `/api/dashboard`-ზე ტესტი საერთოდ არ ჰქონია** — იყო მხოლოდ
 * `RegistryConsistencyTest`, რომელიც `COUNTERS`-ის **გასაღებებს** კითხულობს.
 * ის კი პასუხობს კითხვას „მოდული სიაშია თუ არა" და ვერ პასუხობს იმას, „რიცხვი
 * სწორია თუ არა" — ამიტომ გალერეის ცარიელი ბარათი ჩუმად იდგა.
 */
class DashboardTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->user = User::create([
            'name' => 'gia',
            'username' => 'gia',
            'email' => 'gia@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(
            Module::whereIn('key', ['movie', 'gallery'])->pluck('id')->all()
        );
        $this->user = $this->user->refresh();
    }

    /** ბარათების რუკა: key => count */
    private function cards(): array
    {
        return collect($this->actingAs($this->user)->getJson('/api/dashboard')->assertOk()->json('data'))
            ->pluck('count', 'key')
            ->all();
    }

    private function movie(): Movie
    {
        return Movie::create(['user_id' => $this->user->id, 'year' => 1999]);
    }

    /**
     * ⚠️ **ეს არის ის ხარვეზი, რომელსაც ეს ფაილი აჩერებს** (ნანახი 2026-09-14):
     * გალერეა ფოტოებით სავსე იყო, ბარათი კი `—`-ს აჩვენებდა, რადგან `gallery`
     * `COUNTERS`-ში არ ეწერა. მიზეზი დაშვება იყო, რომ მოდულს „საკუთარი ჩანაწერი
     * არ აქვს" — `gallery_images` სწორედ მისი ცხრილია.
     */
    public function test_the_gallery_card_counts_its_photos(): void
    {
        $movie = $this->movie();
        foreach (['backdrop', 'poster'] as $category) {
            $movie->galleryImages()->create([
                'user_id' => $this->user->id,
                'source' => 'tmdb',
                'category' => $category,
                'path' => 'gallery/images/'.$category.'.jpg',
                'size' => 1024,
            ]);
        }

        $this->assertSame(2, $this->cards()['gallery'] ?? null);
    }

    /**
     * ⚠️ **ვიდეოებიც ითვლება.** ისინი ცალკე ცხრილშია (§8.1) და მარტო ფოტოების
     * თვლისას მხოლოდ ვიდეოებიანი გალერეა „0"-ს აჩვენებდა — იგივე ჩუმი
     * ხარვეზი, უბრალოდ სხვა კუთხიდან.
     */
    public function test_the_gallery_card_counts_videos_too(): void
    {
        $this->movie()->galleryVideos()->create([
            'user_id' => $this->user->id,
            'url' => 'https://www.youtube.com/watch?v=abc12345678',
            'title' => 'trailer',
        ]);

        $this->assertSame(1, $this->cards()['gallery'] ?? null);
    }

    /** სხვისი ფოტო არ ითვლება — `owner` scope თვითონ ჭრის */
    public function test_another_users_photos_are_not_counted(): void
    {
        $other = User::create([
            'name' => 'nick', 'username' => 'nick',
            'email' => 'nick@example.com', 'password' => 'password',
        ]);
        $theirMovie = Movie::create(['user_id' => $other->id]);
        $theirMovie->galleryImages()->create([
            'user_id' => $other->id,
            'source' => 'tmdb',
            'category' => 'backdrop',
            'path' => 'gallery/images/theirs.jpg',
            'size' => 1024,
        ]);

        $this->assertSame(0, $this->cards()['gallery'] ?? null);
    }

    /** ჩაურთველი მოდული ბარათადაც არ ჩანს — ისევე, როგორც მენიუში */
    public function test_a_disabled_module_has_no_card(): void
    {
        $cards = $this->cards();

        $this->assertArrayHasKey('movie', $cards);
        $this->assertArrayNotHasKey('book', $cards);
    }

    /**
     * **მოდულის შემოწმება ერთ query-ს იხდის და არა თითოს** (Tasks PERF-01).
     *
     * ⚠️ `User::hasModule()` `$this->modules()`-ს — query-builder-ს — იყენებდა, ე.ი.
     * eager-loaded რელაციას იგნორირებდა და ყოველ გამოძახებაზე ბაზას ეკითხებოდა.
     * დეშბორდი კი ზუსტად `foreach ($modules as $m) { if (! $user->hasModule($m->key)) … }`
     * შაბლონია, ამიტომ ერთ გვერდზე **11** ზედმეტი query გამოდიოდა (გაზომილი).
     *
     * ⚠️ **მთლიანი რიცხვი განზრახ არ მოწმდება** — ის ყოველი ახალი მრიცხველით
     * იცვლება და ტესტი მყიფე გახდებოდა. `module_user`-ის რაოდენობა კი ზუსტად
     * ის ფაქტია, რომელზეც ეს ტასკია.
     */
    public function test_the_dashboard_asks_the_module_pivot_once(): void
    {
        DB::flushQueryLog();
        DB::enableQueryLog();

        $this->actingAs($this->user)->getJson('/api/dashboard')->assertOk();

        $pivot = collect(DB::getQueryLog())
            ->filter(fn (array $q) => str_contains($q['query'], 'module_user'))
            ->count();
        DB::disableQueryLog();

        $this->assertSame(1, $pivot, 'module_user უნდა წაიკითხოს ერთხელ');
    }

    /**
     * **ყველა მოდულის რიცხვი ერთ query-ში (Tasks PERF-05).**
     *
     * ⚠️ აქ მომხმარებელს **ყველა** მოდული ერთვება — სწორედ ეს არის ის
     * შემთხვევა, რომელზეც ტასკია: 11 ბარათი (გალერეა ორ ცხრილს ითვლის) ადრე
     * 12 ცალკე `SELECT COUNT(*)`-ს ნიშნავდა, სერიულად, აპის საწყის გვერდზე.
     *
     * ⚠️ **მთელი რიცხვი აქ განზრახ მოწმდება** (PERF-01-ის ტესტისგან
     * განსხვავებით, სადაც მხოლოდ `module_user`): ტასკის მიღების პირობა
     * ზუსტად „≤ 4 query"-ა, და ახალი მოდული მას **არ** უნდა ზრდიდეს — სწორედ
     * ესაა ის თვისება, რომლის დაკარგვაც ჩუმი იქნებოდა.
     */
    public function test_the_dashboard_counts_every_module_in_one_query(): void
    {
        $this->user->modules()->sync(Module::pluck('id')->all());
        $this->user = $this->user->refresh();

        DB::flushQueryLog();
        DB::enableQueryLog();

        $cards = collect($this->actingAs($this->user)->getJson('/api/dashboard')->assertOk()->json('data'));

        $log = collect(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertGreaterThan(1, $cards->count(), 'ბარათები უნდა დაიხატოს');
        $this->assertSame(
            [],
            $cards->filter(fn (array $card) => $card['count'] === null)->pluck('key')->all(),
            'ყველა ბარათს რიცხვი უნდა ჰქონდეს',
        );

        $counting = $log->filter(fn (array $q) => str_contains(strtolower($q['query']), 'count(*)'))->count();

        $this->assertSame(1, $counting, 'თვლა ერთ query-ში უნდა მოთავდეს');
        $this->assertLessThanOrEqual(
            4,
            $log->count(),
            "დეშბორდი ≤ 4 query უნდა იყოს, არის {$log->count()}: ".$log->pluck('query')->implode(' | '),
        );
    }
}
