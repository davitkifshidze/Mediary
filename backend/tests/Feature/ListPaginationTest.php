<?php

namespace Tests\Feature;

use App\Http\Controllers\Controller;
use App\Models\Bookmark;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use App\Models\Video;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * სიების გვერდებად დაყოფა (`Controller::paginated()`).
 *
 * ⚠️ **რატომ ცალკე ტესტი:** ცხრავე მოდული ერთ დამხმარეს იძახებს, ე.ი.
 * მისი გატეხვა ცხრავეს ჩუმად ტეხს — მოდულის საკუთარ ტესტებში კი 60-ზე
 * ნაკლები ჩანაწერი იქმნება და გვერდი **არასდროს ივსება**.
 */
class ListPaginationTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = User::create([
            'name' => 'pagi',
            'username' => 'pagi',
            'email' => 'pagi@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::whereIn('key', ['movie', 'video', 'bookmark'])->pluck('id')->all());
        $this->user = $this->user->refresh();
    }

    /** ნაგულისხმევი ჭრილი + `meta.total` მთელ სიას ასახელებს */
    public function test_a_list_is_cut_to_one_page_and_reports_the_real_total(): void
    {
        $total = Controller::LIST_PER_PAGE + 5;
        for ($i = 0; $i < $total; $i++) {
            Bookmark::create(['user_id' => $this->user->id, 'title' => "link {$i}", 'url' => "https://example.com/{$i}"]);
        }

        $res = $this->actingAs($this->user)->getJson('/api/bookmarks')->assertOk();

        $this->assertCount(Controller::LIST_PER_PAGE, $res->json('data'));
        // ⚠️ ჯამი **გაფილტრული სიისაა** და არა გვერდისა — „მეტის ჩვენება"
        // ღილაკი მხოლოდ ამით იცის, დარჩა თუ არა კიდევ რამე.
        $this->assertSame($total, $res->json('meta.total'));

        $second = $this->actingAs($this->user)->getJson('/api/bookmarks?per_page=60&page=2')->assertOk();
        $this->assertCount(5, $second->json('data'));
    }

    /** `all=1` — ცხადი გამონაკლისი (`/purge`, მასობრივი ცვლილება, ამრჩევები) */
    public function test_all_returns_the_whole_list(): void
    {
        $total = Controller::LIST_PER_PAGE + 5;
        for ($i = 0; $i < $total; $i++) {
            Bookmark::create(['user_id' => $this->user->id, 'title' => "link {$i}", 'url' => "https://example.com/{$i}"]);
        }

        $res = $this->actingAs($this->user)->getJson('/api/bookmarks?all=1')->assertOk();

        $this->assertCount($total, $res->json('data'));
        // მთელი სია გვერდი არაა — meta საერთოდ არ უნდა იყოს
        $this->assertNull($res->json('meta'));
    }

    /** ჭერი: `per_page` თვითნებურად დიდი რიცხვით სიას ვერ გახსნის */
    public function test_per_page_is_capped(): void
    {
        $total = Controller::LIST_PER_PAGE_MAX + 3;
        for ($i = 0; $i < $total; $i++) {
            Bookmark::create(['user_id' => $this->user->id, 'title' => "link {$i}", 'url' => "https://example.com/{$i}"]);
        }

        $res = $this->actingAs($this->user)->getJson('/api/bookmarks?per_page=100000')->assertOk();

        $this->assertCount(Controller::LIST_PER_PAGE_MAX, $res->json('data'));
    }

    /**
     * ⚠️ ვიდეოს ძებნა relevance-ს **PHP-ში** ითვლის, ე.ი. `paginated()`-ს
     * query-ს ნაცვლად `Collection` ხვდება — ეს სხვა შტოა და ცალკე უნდა
     * შემოწმდეს, თორემ ძებნის შედეგი უსასრულოდ გრძელი დარჩებოდა.
     */
    public function test_the_video_search_branch_is_paginated_too(): void
    {
        $total = Controller::LIST_PER_PAGE + 4;
        for ($i = 0; $i < $total; $i++) {
            Video::create([
                'user_id' => $this->user->id,
                'title' => "ჩანაწერი matrix {$i}",
                'url' => "https://www.youtube.com/watch?v=abcdefghi{$i}",
            ]);
        }

        $res = $this->actingAs($this->user)->getJson('/api/videos?q=matrix')->assertOk();

        $this->assertCount(Controller::LIST_PER_PAGE, $res->json('data'));
        $this->assertSame($total, $res->json('meta.total'));

        $all = $this->actingAs($this->user)->getJson('/api/videos?q=matrix&all=1')->assertOk();
        $this->assertCount($total, $all->json('data'));
    }

    /**
     * ⚠️ ფრანჩაიზის კლასტერი გვერდის შიგნით უნდა დარჩეს სრული: გვერდი
     * ჯერ ჩამოდის, კლასტერი მერე დგება — ე.ი. რაოდენობა არ უნდა შეიცვალოს.
     */
    public function test_franchise_clustering_keeps_the_page_size(): void
    {
        $total = Controller::LIST_PER_PAGE + 7;
        for ($i = 0; $i < $total; $i++) {
            Movie::create([
                'user_id' => $this->user->id,
                'year' => 2000 + ($i % 20),
                // ყოველი მესამე ერთსა და იმავე კოლექციაშია
                'tmdb_collection_id' => $i % 3 === 0 ? 77 : null,
            ]);
        }

        $res = $this->actingAs($this->user)->getJson('/api/movies')->assertOk();

        $this->assertCount(Controller::LIST_PER_PAGE, $res->json('data'));
        $this->assertSame($total, $res->json('meta.total'));

        $ids = array_column($res->json('data'), 'id');
        $this->assertSame(count($ids), count(array_unique($ids)), 'კლასტერმა ჩანაწერი არ უნდა გაასამაგროს');
    }
}
