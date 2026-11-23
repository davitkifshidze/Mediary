<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Movie;
use App\Models\Status;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **მოთხოვნების ჭერი: მიზნები და ურნის გვერდი.**
 *
 * ⚠️ `/goals?scope=active` ადრე ისტორიის მიზნებსაც ტვირთავდა და თითოზე COUNT-ს
 * უშვებდა; ურნის ყოველი გვერდი (სტატუსის, ნახვისაც) ანგარიშის მთელ ფაილურ
 * ინვენტარს კითხულობდა. რიცხვი აქ არ უნდა იზრდებოდეს იმით, რაც გვერდზე არ ჩანს.
 */
class QueryCeilingTest extends TestCase
{
    use RefreshDatabase;

    private User $me;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->me = User::create(['name' => 'q', 'username' => 'q', 'email' => 'q@example.com', 'password' => 'password']);
        $this->me->modules()->sync(Module::pluck('id')->all());
        $this->me->refresh();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function queries(callable $run): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $run();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    }

    private function goal(string $starts): void
    {
        $this->actingAs($this->me)
            ->postJson('/api/goals', ['module' => 'book', 'period' => 'month', 'starts_on' => $starts, 'target' => 2])
            ->assertCreated();
    }

    public function test_active_goals_do_not_pay_for_the_history(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-15 12:00:00'));
        $this->goal('2026-07-01');
        $this->goal('2026-01-01');

        $active = fn () => $this->actingAs($this->me)->getJson('/api/goals?scope=active')->assertOk()->assertJsonCount(1, 'data');
        $before = $this->queries($active);

        foreach (['2025-01-01', '2025-02-01', '2025-03-01', '2025-04-01', '2025-05-01', '2025-06-01'] as $month) {
            $this->goal($month);
        }

        $this->assertSame($before, $this->queries($active), 'ისტორიის მიზნები აქტიურ სიას ზედმეტ მოთხოვნებს უმატებს');

        // ისტორია — ახლიდან ძველისკენ, აქტიურის გარეშე
        $history = $this->actingAs($this->me)->getJson('/api/goals?scope=history')->assertOk()->json('data');
        $this->assertCount(7, $history);
        $this->assertSame('2026-01-01', $history[0]['starts_on']);
    }

    public function test_a_trash_page_without_record_sizes_reads_no_file_inventory(): void
    {
        Storage::fake('public');
        Status::ensureDefaults($this->me->id, 'movie');
        $this->actingAs($this->me);

        $movie = Movie::create(['user_id' => $this->me->id, 'year' => 2001]);
        $watch = $movie->logWatch(now()->subDay());
        $watch->moveToTrash();

        $page = fn () => $this->actingAs($this->me)->getJson('/api/trash/media_watch/items')->assertOk()->assertJsonCount(1, 'data');
        $count = $this->queries($page);

        // ჩანაწერის მოცულობას ფაილური ინვენტარი სჭირდება (ათეულობით მოთხოვნა) — ნახვის გვერდს არა
        $binned = Movie::create(['user_id' => $this->me->id, 'year' => 2002]);
        $binned->moveToTrash();
        $records = $this->queries(fn () => $this->actingAs($this->me)->getJson('/api/trash/movie/items')->assertOk());

        $this->assertLessThan($records, $count);
        $this->assertLessThanOrEqual(20, $count, "ნახვის ურნის გვერდი {$count} მოთხოვნას აკეთებს");
    }
}
