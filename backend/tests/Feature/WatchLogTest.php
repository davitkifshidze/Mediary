<?php

namespace Tests\Feature;

use App\Models\MediaWatch;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Status;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * **ხელახლა ნახვის ჟურნალი (FEAT-14).**
 *
 * ⚠️ **ორი ფაქტი იცავს ამ ფუნქციას:** მეორედ ნახვა **პირველს არ შლის**
 * (სწორედ ეს იკარგებოდა ჩუმად), და `watched_at` **ერთადერთი წყაროდან**
 * იწერება — თორემ „ბოლო ნახვა" და ჟურნალი ერთმანეთს დაშორდებოდა.
 */
class WatchLogTest extends TestCase
{
    use RefreshDatabase;

    private User $me;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->me = User::create([
            'name' => 'watcher', 'username' => 'watcher',
            'email' => 'watcher@example.com', 'password' => 'password',
        ]);
        $this->me->modules()->sync(Module::pluck('id')->all());
        $this->me->refresh();

        Status::ensureDefaults($this->me->id, 'movie');
    }

    private function movie(): Movie
    {
        return Movie::create(['user_id' => $this->me->id, 'year' => 2001])->refresh();
    }

    /** ⚠️ „ნანახად მოვნიშნე" უკვე ნახვაა — ჟურნალი ღილაკს არ ელოდება */
    public function test_marking_watched_writes_the_first_row(): void
    {
        $movie = $this->movie();

        $this->actingAs($this->me)
            ->patchJson("/api/movies/{$movie->id}/status", ['status' => 'watched'])
            ->assertOk();

        $this->assertSame(1, MediaWatch::withoutGlobalScope('owner')->count());
        $this->assertNotNull($movie->refresh()->watched_at);
    }

    /** მეორედ ნახვა პირველს ინარჩუნებს, `watched_at` კი ბოლოზე დგება */
    public function test_a_second_watch_keeps_the_first_date(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-01-10 12:00:00', 'UTC'));

        $movie = $this->movie();
        $this->actingAs($this->me)->patchJson("/api/movies/{$movie->id}/status", ['status' => 'watched'])->assertOk();

        Carbon::setTestNow(Carbon::parse('2026-09-19 12:00:00', 'UTC'));

        $this->actingAs($this->me)
            ->postJson("/api/media/watches/movie/{$movie->id}", ['note' => 'კინოში'])
            ->assertCreated();

        $rows = $this->actingAs($this->me)
            ->getJson("/api/media/watches/movie/{$movie->id}")
            ->assertOk()
            ->json('data');

        $this->assertCount(2, $rows, 'პირველი ნახვა დაიკარგა');
        // სია ახლიდან ძველისკენ
        $this->assertStringStartsWith('2026-09-19', $rows[0]['watched_at']);
        $this->assertStringStartsWith('2026-01-10', $rows[1]['watched_at']);
        $this->assertSame('კინოში', $rows[0]['note']);

        $this->assertSame('2026-09-19', $movie->refresh()->watched_at?->format('Y-m-d'));

        Carbon::setTestNow();
    }

    /**
     * ⚠️ **ბოლო ნახვის წაშლა `watched_at`-ს წინა რიგზე აბრუნებს** — ორი
     * წყარო ერთი ფაქტისა სწორედ აქ დაშორდებოდა ერთმანეთს.
     */
    public function test_deleting_the_latest_watch_moves_the_date_back(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-01-10 12:00:00', 'UTC'));
        $movie = $this->movie();
        $this->actingAs($this->me)->patchJson("/api/movies/{$movie->id}/status", ['status' => 'watched'])->assertOk();

        Carbon::setTestNow(Carbon::parse('2026-09-19 12:00:00', 'UTC'));
        $latest = $this->actingAs($this->me)
            ->postJson("/api/media/watches/movie/{$movie->id}")
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($this->me)->deleteJson("/api/media-watches/{$latest}")->assertNoContent();

        $this->assertSame('2026-01-10', $movie->refresh()->watched_at?->format('Y-m-d'));

        Carbon::setTestNow();
    }

    /** ცარიელ ჟურნალზე „ბოლო ნახვა" აღარ არსებობს */
    public function test_deleting_every_watch_clears_the_date(): void
    {
        $movie = $this->movie();
        $this->actingAs($this->me)->patchJson("/api/movies/{$movie->id}/status", ['status' => 'watched'])->assertOk();

        $only = MediaWatch::withoutGlobalScope('owner')->sole();
        $this->actingAs($this->me)->deleteJson("/api/media-watches/{$only->id}")->assertNoContent();

        $this->assertNull($movie->refresh()->watched_at);
    }

    /**
     * ⚠️ **ერთი და იმავე წამის ორჯერ ჩაწერა „ორჯერ ვნახე"-ს გამოიგონებდა.**
     * სტატუსის ხელახლა მინიჭება (ფორმის მეორედ შენახვა, მასობრივი ცვლილება)
     * ზუსტად ასე ხდება.
     */
    public function test_the_same_moment_is_not_logged_twice(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-19 12:00:00', 'UTC'));

        $movie = $this->movie();
        $this->actingAs($this->me)->patchJson("/api/movies/{$movie->id}/status", ['status' => 'watched'])->assertOk();
        $this->actingAs($this->me)->postJson("/api/media/watches/movie/{$movie->id}")->assertCreated();

        $this->assertSame(1, MediaWatch::withoutGlobalScope('owner')->count());

        Carbon::setTestNow();
    }

    /**
     * ⚠️ **სტატისტიკა გამეორებებს ითვლის** — ზუსტად ეს არის ის, რაც
     * FEAT-08-ს აკლდა: „წელს რამდენი ვნახე" ერთსა და იმავე ფილმს
     * ერთხელ ითვლიდა, რამდენჯერაც არ უნდა გენახა.
     */
    public function test_the_month_cut_counts_a_rewatch_separately(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-03-04 12:00:00', 'UTC'));
        $movie = $this->movie();
        $this->actingAs($this->me)->patchJson("/api/movies/{$movie->id}/status", ['status' => 'watched'])->assertOk();

        Carbon::setTestNow(Carbon::parse('2026-03-20 12:00:00', 'UTC'));
        $this->actingAs($this->me)->postJson("/api/media/watches/movie/{$movie->id}")->assertCreated();

        Carbon::setTestNow(Carbon::parse('2026-09-19 12:00:00', 'UTC'));

        $payload = $this->actingAs($this->me)->getJson('/api/stats?year=2026')->assertOk()->json();
        $movies = collect($payload['data'])->firstWhere('key', 'movie');

        // მარტი — ორი ნახვა ერთ ფილმზე
        $this->assertSame(2, $movies['months'][2]['count']);

        $summary = $this->actingAs($this->me)->getJson('/api/stats/summary')->assertOk()->json();
        $this->assertSame(2, $summary['totals']['done_year'], 'დეშბორდი გვერდს აცდა');

        Carbon::setTestNow();
    }

    /** მომავალი თარიღი 422-ია — ჟურნალი წარსულის ჩანაწერია */
    public function test_a_future_watch_is_rejected(): void
    {
        $movie = $this->movie();

        $this->actingAs($this->me)
            ->postJson("/api/media/watches/movie/{$movie->id}", ['watched_at' => now()->addDay()->toIso8601String()])
            ->assertStatus(422);
    }

    /** სხვისი ჩანაწერის ჟურნალი 404-ია */
    public function test_another_users_record_is_a_404(): void
    {
        $other = User::create([
            'name' => 'nosy', 'username' => 'nosy',
            'email' => 'nosy@example.com', 'password' => 'password',
        ]);
        $other->modules()->sync(Module::pluck('id')->all());

        $movie = $this->movie();

        $this->actingAs($other->refresh())
            ->getJson("/api/media/watches/movie/{$movie->id}")
            ->assertStatus(404);
    }

    /**
     * ⚠️ **არსებული `watched_at` მიგრაციამ პირველ რიგად უნდა გადმოიტანოს** —
     * უამისოდ ჟურნალი ყველასთვის ცარიელი დაიბადებოდა და „ერთხელ ვნახე"
     * ნულად წაიკითხებოდა.
     */
    public function test_an_existing_watched_at_became_the_first_row(): void
    {
        // მიგრაცია ტესტში უკვე გავლილია, ამიტომ იმავე ლოგიკას ვამოწმებთ
        // მოდელის გზით: `watched_at`-ის შევსება რიგს თვითონ ბადებს
        $movie = $this->movie();
        $movie->forceFill(['watched_at' => '2020-05-05 10:00:00'])->save();

        $this->assertSame(
            '2020-05-05',
            MediaWatch::withoutGlobalScope('owner')->sole()->watched_at?->format('Y-m-d'),
        );
    }
}
