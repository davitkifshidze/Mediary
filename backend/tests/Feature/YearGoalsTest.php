<?php

namespace Tests\Feature;

use App\Models\Movie;
use App\Models\Status;
use App\Models\User;
use App\Services\Stats\LibraryStats;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * **წლიური მიზნები (FEAT-21).**
 *
 * მიზანი თვითონ `users.settings`-შია (მიგრაციის გარეშე), ე.ი. backend-ის
 * მხარეს შესამოწმებელი **პროგრესია**: „წელს რამდენი დავასრულე" მოდულებად.
 */
class YearGoalsTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->user = User::factory()->create();
        $this->user->assignRole('super_admin')->save();
        $this->actingAs($this->user);

        Status::ensureDefaults($this->user->id, 'movie');
    }

    private function watched(string $title, string $when): Movie
    {
        $movie = Movie::create(['user_id' => $this->user->id]);
        $movie->setTranslation('en', ['title' => $title]);

        // ⚠️ `applyStatusKey()` — `watched_at`-ს **მხოლოდ ის** წერს (§6.4)
        Carbon::setTestNow(Carbon::parse($when, 'UTC'));
        $movie->applyStatusKey('watched');
        $movie->save();
        Carbon::setTestNow();

        return $movie;
    }

    public function test_the_summary_counts_this_year_per_module(): void
    {
        $year = (int) now()->format('Y');

        $this->watched('A', "{$year}-02-10 12:00:00");
        $this->watched('B', "{$year}-05-01 12:00:00");
        $this->watched('C', ($year - 1).'-05-01 12:00:00');

        $body = $this->getJson('/api/stats/summary')->assertOk()->json();

        $this->assertSame(2, $body['done_by_module']['movie']);
        // ⚠️ იგივე რიცხვი ჯამშიც — ორი წყარო ერთი კითხვისთვის აკრძალულია
        $this->assertSame(2, $body['totals']['done_year']);
    }

    /**
     * **მოდული, რომელსაც „როდის დავასრულე" თარიღი არ აქვს, სიაში არ არის.**
     *
     * ⚠️ ეს ტესტის მთავარი აზრია: წიგნისა და თამაშის მიზანი ვერ იქნებოდა
     * გამოთვლილი, ხოლო `updated_at`-ით ჩანაცვლება ერთ სვეტში ორ ფაქტს
     * ჩადებდა (FEAT-08-ის ცხადი გადაწყვეტილება).
     */
    public function test_only_modules_with_a_completion_date_can_take_a_goal(): void
    {
        $goal = LibraryStats::goalModules(LibraryStats::modules());

        foreach (['movie', 'series', 'anime', 'video', 'song', 'bookmark'] as $key) {
            $this->assertContains($key, $goal);
        }

        foreach (['book', 'game', 'board_game', 'note'] as $key) {
            $this->assertNotContains($key, $goal, "`{$key}` has no completion date");
        }
    }

    /** ცარიელი მოდული სიაში მაინც დგას — ნულით და არა გამოტოვებული */
    public function test_a_module_with_nothing_done_still_reports_zero(): void
    {
        $body = $this->getJson('/api/stats/summary')->assertOk()->json();

        $this->assertArrayHasKey('movie', $body['done_by_module']);
        $this->assertSame(0, $body['done_by_module']['movie']);
        $this->assertContains('movie', $body['goal_modules']);
    }

    /** მიზნები `users.settings`-ში ინახება — ცალკე ცხრილის გარეშე */
    public function test_goals_survive_a_settings_round_trip(): void
    {
        $this->putJson('/api/auth/settings', [
            'settings' => ['goals' => ['movie' => ['2026' => 50]]],
        ])->assertOk();

        $this->assertSame(
            50,
            $this->user->fresh()->settings['goals']['movie']['2026'],
        );
    }
}
