<?php

namespace Tests\Feature;

use App\Models\DutyShift;
use App\Models\Module;
use App\Models\User;
use App\Support\DutyPeriod;
use App\Support\DutySettings;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **მორიგეობის პერიოდი (Tasks §34.3, Q8)** — „15-დან 15-მდე“, „10-დან 9-მდე“,
 * თებერვალი, წლის ზღვარი და წესის ცვლილება მომავალზე (ძველი პერიოდები თავის
 * საზღვრებს ინახავს).
 */
class DutyPeriodTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: string, 1: string} */
    private function period(string $date, array $rules): array
    {
        $p = DutyPeriod::containing($date, $rules);

        return [$p['from']->toDateString(), $p['to']->toDateString()];
    }

    public function test_a_period_starting_on_the_fifteenth_runs_to_the_fourteenth(): void
    {
        $rules = [['since' => null, 'day' => 15]];

        $this->assertSame(['2026-09-15', '2026-10-14'], $this->period('2026-10-04', $rules));
        $this->assertSame(['2026-10-15', '2026-11-14'], $this->period('2026-10-15', $rules));
        $this->assertSame(['2026-09-15', '2026-10-14'], $this->period('2026-10-14', $rules));
    }

    public function test_ten_to_nine_and_the_plain_calendar_month(): void
    {
        $this->assertSame(['2026-09-10', '2026-10-09'], $this->period('2026-10-09', [['since' => null, 'day' => 10]]));
        $this->assertSame(['2026-10-01', '2026-10-31'], $this->period('2026-10-04', [['since' => null, 'day' => 1]]));
        // წესის გარეშე — კალენდარული თვე
        $this->assertSame(['2026-10-01', '2026-10-31'], $this->period('2026-10-04', []));
    }

    public function test_february_and_a_leap_year_never_lose_a_day(): void
    {
        $this->assertSame(['2026-01-28', '2026-02-27'], $this->period('2026-02-27', [['since' => null, 'day' => 28]]));
        $this->assertSame(['2026-02-28', '2026-03-27'], $this->period('2026-03-01', [['since' => null, 'day' => 28]]));
        $this->assertSame(['2028-02-01', '2028-02-29'], $this->period('2028-02-29', [['since' => null, 'day' => 1]]));
    }

    public function test_the_year_boundary(): void
    {
        $rules = [['since' => null, 'day' => 15]];

        $this->assertSame(['2026-12-15', '2027-01-14'], $this->period('2027-01-03', $rules));
        $this->assertSame(['2026-12-15', '2027-01-14'], $this->period('2026-12-31', $rules));
    }

    /** ⚠️ ცვლილება მომავალზე: ძველი თვე უცვლელია, გარდამავალი — მოკლე, მერე ახალი წესი */
    public function test_a_rule_change_keeps_old_periods_and_adds_an_honest_transition(): void
    {
        $rules = [['since' => null, 'day' => 1], ['since' => '2026-11-01', 'day' => 15]];

        $this->assertSame(['2026-10-01', '2026-10-31'], $this->period('2026-10-20', $rules));
        $this->assertSame(['2026-11-01', '2026-11-14'], $this->period('2026-11-05', $rules));
        $this->assertSame(['2026-11-15', '2026-12-14'], $this->period('2026-11-20', $rules));

        $previous = DutyPeriod::previous('2026-11-20', $rules);
        $this->assertSame(['2026-11-01', '2026-11-14'], [$previous['from']->toDateString(), $previous['to']->toDateString()]);

        $next = DutyPeriod::next('2026-10-20', $rules);
        $this->assertSame(['2026-11-01', '2026-11-14'], [$next['from']->toDateString(), $next['to']->toDateString()]);

        $last = array_map(
            fn (array $p) => $p['from']->toDateString(),
            DutyPeriod::lastPeriods('2026-12-01', $rules, 3),
        );
        $this->assertSame(['2026-10-01', '2026-11-01', '2026-11-15'], $last);
    }

    /* ---------- პარამეტრის შეცვლა ---------- */

    private function user(): User
    {
        $this->seed(ModulesSeeder::class);

        $user = User::create(['name' => 'nino', 'username' => 'nino', 'email' => 'nino@example.com', 'password' => 'password']);
        $user->modules()->sync(Module::where('key', 'duty')->pluck('id')->all());

        return $user->refresh();
    }

    public function test_without_any_shift_the_new_day_applies_at_once(): void
    {
        $this->travelTo('2026-10-04 12:00:00');
        $user = $this->user();

        $this->actingAs($user)->putJson('/api/duty/settings', ['period_start_day' => 15])
            ->assertOk()
            ->assertJsonPath('period_start_day', 15)
            ->assertJsonPath('pending', null)
            ->assertJsonPath('current.from', '2026-09-15')
            ->assertJsonPath('current.to', '2026-10-14');
    }

    public function test_with_recorded_shifts_the_change_waits_for_the_next_period(): void
    {
        $this->travelTo('2026-10-04 12:00:00');
        $user = $this->user();
        DutyShift::create(['user_id' => $user->id, 'date' => '2026-10-02', 'hours' => 24]);

        $this->actingAs($user)->putJson('/api/duty/settings', ['period_start_day' => 15])
            ->assertOk()
            ->assertJsonPath('period_start_day', 1)
            ->assertJsonPath('pending.since', '2026-11-01')
            ->assertJsonPath('pending.day', 15)
            ->assertJsonPath('current.from', '2026-10-01')
            ->assertJsonPath('current.to', '2026-10-31');

        // ⚠️ მეორე ცვლილება დაგეგმილს ცვლის და არ გროვდება
        $this->putJson('/api/duty/settings', ['period_start_day' => 10])->assertJsonPath('pending.day', 10);
        $this->assertCount(2, DutySettings::rules($user));

        // ძველ დღეზე დაბრუნება დაგეგმილს აუქმებს
        $this->putJson('/api/duty/settings', ['period_start_day' => 1])->assertJsonPath('pending', null);
        $this->assertCount(1, DutySettings::rules($user));

        $this->getJson('/api/duty/period?date=2026-10-04')
            ->assertOk()
            ->assertJsonPath('from', '2026-10-01')
            ->assertJsonPath('previous.from', '2026-09-01')
            ->assertJsonPath('next.from', '2026-11-01');
    }

    public function test_the_day_stays_between_1_and_28(): void
    {
        $user = $this->user();

        $this->actingAs($user)->putJson('/api/duty/settings', ['period_start_day' => 31])->assertStatus(422);
        $this->putJson('/api/duty/settings', ['period_start_day' => 0])->assertStatus(422);
    }
}
