<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Book;
use App\Models\BookGenre;
use App\Models\Goal;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use App\Services\Goals\GoalTransfer;
use Carbon\CarbonImmutable;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * **მიზნები** — მოდული · პერიოდი · რიცხვი · პირობა · სახელი.
 *
 * ⚠️ მოწმდება ის, რაც რიცხვს ჩუმად ამრუდებს: პერიოდის ბოლო დღე ითვლება, პირობა
 * მხოლოდ თავის კლასიფიკატორს ითვლის, მედიაზე წყარო ნახვების ჟურნალია, ტემპი
 * პერიოდის გასულ ნაწილს მიჰყვება, გასული პერიოდი ისტორიაა; სხვისი მიზანი 404-ია
 * და მიზანი ვერ დაისმება მოდულზე, რომელსაც დასრულების თარიღი არ აქვს.
 */
class GoalTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);
        // 2026 წლის 180-ე დღე: წლის 365 დღიდან 180 გასულია
        $this->travelTo(CarbonImmutable::parse('2026-06-29 12:00:00', config('app.timezone')));

        $this->user = $this->makeUser('gio');
        $this->actingAs($this->user);
    }

    private function makeUser(string $name): User
    {
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::whereIn('key', ['movie', 'book', 'board_game'])->pluck('id')->all());

        return $user->refresh();
    }

    private function genre(string $name): BookGenre
    {
        return BookGenre::create(['user_id' => $this->user->id, 'key' => strtolower($name), 'name_ka' => $name, 'name_en' => $name, 'sort_order' => 0]);
    }

    private function book(string $finished, ?int $genre = null): Book
    {
        return Book::create([
            'user_id' => $this->user->id, 'title' => 'Book '.uniqid(), 'status' => 'read', 'finished_at' => $finished, 'genre_id' => $genre,
        ]);
    }

    public function test_a_goal_counts_what_was_finished_inside_its_period_and_says_the_pace(): void
    {
        $this->book('2026-01-01');
        $this->book('2026-06-29');
        // პერიოდის ბოლო დღე ითვლება; წინა და მომდევნო წელი — არა
        $this->book('2026-12-31');
        $this->book('2025-12-31');
        $this->book('2027-01-01');

        $goal = $this->postJson('/api/goals', ['module' => 'book', 'period' => 'year', 'starts_on' => '2026-06-29', 'target' => 20, 'name' => 'წელს 20 წიგნი'])
            ->assertCreated()
            ->assertJsonPath('data.starts_on', '2026-01-01')
            ->assertJsonPath('data.ends_on', '2026-12-31')
            ->assertJsonPath('data.done', 3)
            ->assertJsonPath('data.state', 'active')
            ->assertJsonPath('data.days_total', 365)
            ->assertJsonPath('data.days_left', 185)
            // 20 × 180 / 365 ≈ 10 → 3 − 10 = −7: გრაფიკს 7-ით ჩამორჩება
            ->assertJsonPath('data.expected', 10)
            ->assertJsonPath('data.pace', -7)
            ->json('data');

        $this->getJson('/api/goals')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'წელს 20 წიგნი');
        $this->assertContains('book', $this->getJson('/api/goals')->json('modules'));

        // რედაქტირება: რიცხვი მცირდება და მიზანი შესრულებულია — ტემპი აღარ ითქმება
        $this->putJson("/api/goals/{$goal['id']}", ['module' => 'book', 'period' => 'year', 'starts_on' => '2026-01-01', 'target' => 3])
            ->assertOk()
            ->assertJsonPath('data.state', 'achieved')
            ->assertJsonPath('data.pace', null)
            ->assertJsonPath('data.name', null);

        $this->deleteJson("/api/goals/{$goal['id']}")->assertNoContent();
        $this->assertSame(0, Goal::count());
    }

    public function test_month_week_and_custom_periods_get_their_own_dates(): void
    {
        $month = $this->postJson('/api/goals', ['module' => 'book', 'period' => 'month', 'starts_on' => '2026-02-10', 'target' => 2])->assertCreated();
        $this->assertSame(['2026-02-01', '2026-02-28'], [$month->json('data.starts_on'), $month->json('data.ends_on')]);

        // კვირა ორშაბათით იწყება: 2026-06-29 ორშაბათია
        $week = $this->postJson('/api/goals', ['module' => 'book', 'period' => 'week', 'starts_on' => '2026-07-02', 'target' => 1])->assertCreated();
        $this->assertSame(['2026-06-29', '2026-07-05'], [$week->json('data.starts_on'), $week->json('data.ends_on')]);

        $custom = $this->postJson('/api/goals', ['module' => 'book', 'period' => 'custom', 'starts_on' => '2026-07-10', 'ends_on' => '2026-08-20', 'target' => 4])->assertCreated();
        $this->assertSame(['2026-07-10', '2026-08-20', 'upcoming'], [$custom->json('data.starts_on'), $custom->json('data.ends_on'), $custom->json('data.state')]);

        // საკუთარ პერიოდს ბოლო თარიღი სჭირდება და ის დასაწყისზე ადრე ვერ იქნება
        $this->postJson('/api/goals', ['module' => 'book', 'period' => 'custom', 'starts_on' => '2026-07-10', 'target' => 4])->assertStatus(422);
        $this->postJson('/api/goals', ['module' => 'book', 'period' => 'custom', 'starts_on' => '2026-07-10', 'ends_on' => '2026-07-01', 'target' => 4])->assertStatus(422);
        $this->postJson('/api/goals', ['module' => 'book', 'period' => 'year', 'starts_on' => '2026-01-01', 'target' => 0])->assertStatus(422);
    }

    public function test_a_condition_counts_only_its_own_classifier(): void
    {
        $fantasy = $this->genre('Fantasy');
        $history = $this->genre('History');
        $this->book('2026-03-01', $fantasy->id);
        $this->book('2026-04-01', $fantasy->id);
        $this->book('2026-05-01', $history->id);
        $this->book('2026-05-02');

        $this->getJson('/api/goals/classifiers?module=book')->assertOk()
            ->assertJsonFragment(['id' => $fantasy->id, 'name_ka' => 'Fantasy', 'name_en' => 'Fantasy']);

        $this->postJson('/api/goals', ['module' => 'book', 'period' => 'year', 'starts_on' => '2026-01-01', 'target' => 5, 'classifier_id' => $fantasy->id])
            ->assertCreated()
            ->assertJsonPath('data.done', 2)
            ->assertJsonPath('data.classifier.name_ka', 'Fantasy');

        // ერთ მოდულზე რამდენიმე მიზანი: უპირობო ოთხივეს ითვლის
        $this->postJson('/api/goals', ['module' => 'book', 'period' => 'year', 'starts_on' => '2026-01-01', 'target' => 5])
            ->assertCreated()->assertJsonPath('data.done', 4);

        // სხვა ანგარიშის ან გამოგონილი კლასიფიკატორი — 422 და არა ჩუმი ნული
        $this->postJson('/api/goals', ['module' => 'book', 'period' => 'year', 'starts_on' => '2026-01-01', 'target' => 5, 'classifier_id' => 99999])
            ->assertStatus(422)->assertJsonPath('message', 'goal_classifier_unknown');
    }

    public function test_media_goals_count_the_watch_log_like_the_statistics_do(): void
    {
        $movie = Movie::create(['user_id' => $this->user->id, 'year' => 2020]);
        foreach (['2026-02-01 20:00:00', '2026-03-01 20:00:00', '2025-03-01 20:00:00'] as $at) {
            DB::table('media_watches')->insert([
                'user_id' => $this->user->id, 'watchable_type' => 'movie', 'watchable_id' => $movie->id, 'watched_at' => $at,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        // ერთი ფილმი ორჯერ ნანახი წელს — ორი, როგორც `/stats`-ზე
        $this->postJson('/api/goals', ['module' => 'movie', 'period' => 'year', 'starts_on' => '2026-01-01', 'target' => 10])
            ->assertCreated()->assertJsonPath('data.done', 2);
    }

    public function test_a_past_period_is_history_achieved_or_failed(): void
    {
        $this->book('2025-05-01');
        $this->postJson('/api/goals', ['module' => 'book', 'period' => 'year', 'starts_on' => '2025-01-01', 'target' => 1])->assertCreated()->assertJsonPath('data.state', 'achieved');
        $this->postJson('/api/goals', ['module' => 'book', 'period' => 'month', 'starts_on' => '2026-05-01', 'target' => 3])->assertCreated()->assertJsonPath('data.state', 'failed');
        $this->postJson('/api/goals', ['module' => 'book', 'period' => 'year', 'starts_on' => '2026-01-01', 'target' => 9])->assertCreated();

        $active = $this->getJson('/api/goals?scope=active')->assertOk()->json('data');
        $this->assertSame(['2026-12-31'], array_column($active, 'ends_on'));

        // ისტორია ახლიდან ძველისკენ, ორივე შედეგით
        $history = $this->getJson('/api/goals?scope=history')->assertOk()->json('data');
        $this->assertSame([['2026-05-31', 'failed'], ['2025-12-31', 'achieved']], array_map(fn ($g) => [$g['ends_on'], $g['state']], $history));
        $this->assertSame([true, true], array_column($history, 'past'));
    }

    public function test_a_goal_needs_a_module_i_have_with_a_finish_date_and_is_never_someone_elses(): void
    {
        // სამაგიდოს დასრულების თარიღი არ აქვს; თამაში ამ ანგარიშს ჩართული არ აქვს
        foreach (['board_game', 'game', 'nonsense'] as $module) {
            $this->postJson('/api/goals', ['module' => $module, 'period' => 'year', 'starts_on' => '2026-01-01', 'target' => 5])
                ->assertStatus(422)->assertJsonValidationErrors('module');
        }

        $id = $this->postJson('/api/goals', ['module' => 'book', 'period' => 'year', 'starts_on' => '2026-01-01', 'target' => 5])->json('data.id');

        $this->actingAs($this->makeUser('otar'));
        $this->getJson('/api/goals')->assertOk()->assertJsonCount(0, 'data');
        $this->putJson("/api/goals/{$id}", ['module' => 'book', 'period' => 'year', 'starts_on' => '2026-01-01', 'target' => 1])->assertNotFound();
        $this->deleteJson("/api/goals/{$id}")->assertNotFound();
        $this->assertSame(5, Goal::withoutGlobalScopes()->findOrFail($id)->target);
    }

    /** SPA-ს პერიოდების სია სერვერისას იმეორებს */
    public function test_the_spa_mirrors_the_periods(): void
    {
        $source = file_get_contents(base_path('../frontend/src/api/goals.ts'));

        $this->assertSame(1, preg_match("/export const GOAL_PERIODS = \[([^\]]+)\]/", $source, $m));
        $this->assertSame(Goal::PERIODS, array_map(fn (string $v) => trim($v, " '"), explode(',', $m[1])));
    }

    public function test_changes_are_written_to_the_audit_log_and_the_account_delete_takes_the_goals(): void
    {
        $id = $this->postJson('/api/goals', ['module' => 'book', 'period' => 'year', 'starts_on' => '2026-01-01', 'target' => 5, 'name' => 'კითხვა'])->json('data.id');

        $log = AuditLog::where('subject_type', 'goal')->where('subject_id', $id)->latest('id')->firstOrFail();
        $this->assertSame($this->user->id, (int) $log->user_id);

        $this->user->delete();
        $this->assertSame(0, Goal::withoutGlobalScopes()->count());
    }

    public function test_the_old_yearly_goals_move_out_of_the_settings(): void
    {
        DB::table('goals')->delete();
        DB::table('users')->where('id', $this->user->id)->update(['settings' => json_encode([
            'theme' => 'dark',
            'goals' => ['book' => ['2026' => 24, '2025' => 12, 'x' => 5, '2024' => 0], 'movie' => ['2026' => 50]],
        ])]);

        $migration = require database_path('migrations/2026_11_12_000015_create_goals.php');
        DB::statement('drop table goals');
        $migration->up();

        $rows = Goal::withoutGlobalScopes()->orderBy('module')->orderBy('starts_on')->get();
        $this->assertSame(
            [['book', '2025-01-01', '2025-12-31', 12], ['book', '2026-01-01', '2026-12-31', 24], ['movie', '2026-01-01', '2026-12-31', 50]],
            $rows->map(fn (Goal $g) => [$g->module, $g->starts_on, $g->ends_on, $g->target])->all(),
        );
        $this->assertSame(['year'], $rows->pluck('period')->unique()->values()->all());

        // პარამეტრებში მიზნები აღარ არის, დანარჩენი ხელუხლებელია
        $settings = json_decode((string) DB::table('users')->where('id', $this->user->id)->value('settings'), true);
        $this->assertSame(['theme' => 'dark'], $settings);
    }

    public function test_goals_travel_in_the_module_export_and_are_merged_once(): void
    {
        $fantasy = $this->genre('Fantasy');
        $this->book('2026-03-01', $fantasy->id);
        $this->postJson('/api/goals', ['module' => 'book', 'period' => 'year', 'starts_on' => '2026-01-01', 'target' => 12, 'name' => 'ფენტეზი', 'classifier_id' => $fantasy->id])->assertCreated();
        $this->postJson('/api/goals', ['module' => 'book', 'period' => 'month', 'starts_on' => '2026-07-01', 'target' => 2])->assertCreated();

        $envelope = json_decode($this->get('/api/export/book?format=json')->assertOk()->streamedContent(), true);
        $this->assertCount(2, $envelope['goals']);
        $this->assertSame(['name_ka' => 'Fantasy', 'name_en' => 'Fantasy'], $envelope['goals'][0]['classifier']);
        $this->assertArrayNotHasKey('classifier_id', $envelope['goals'][0]);

        // სხვა ანგარიში: ჯერ კატეგორია არ აქვს — პირობიანი მიზანი გამოიტოვება, უპირობო შემოდის
        $other = $this->makeUser('otar');
        $transfer = app(GoalTransfer::class);
        $this->assertSame(1, $transfer->merge($other, 'book', $envelope['goals']));

        // კატეგორია გაჩნდა (ჩანაწერების იმპორტი ქმნის) — მიზანიც შემოდის; მეორედ არაფერი იწერება
        $genre = BookGenre::withoutGlobalScopes()->create(['user_id' => $other->id, 'key' => 'fantasy', 'name_ka' => 'Fantasy', 'name_en' => 'Fantasy', 'sort_order' => 0]);
        $this->assertSame(1, $transfer->merge($other, 'book', $envelope['goals']));
        $this->assertSame(0, $transfer->merge($other, 'book', $envelope['goals']));

        $mine = Goal::withoutGlobalScopes()->where('user_id', $other->id)->orderBy('target')->get();
        $this->assertSame([[2, null], [12, $genre->id]], $mine->map(fn (Goal $g) => [$g->target, $g->classifier_id])->all());
        // გაფუჭებული რიგები უბრალოდ გამოიტოვება
        $this->assertSame(0, $transfer->merge($other, 'book', [['period' => 'decade'], 'x', ['period' => 'year', 'starts_on' => '2026-13-45', 'ends_on' => '2026-12-31', 'target' => 3]]));
    }
}
