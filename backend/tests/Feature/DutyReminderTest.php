<?php

namespace Tests\Feature;

use App\Models\DutyShift;
use App\Models\DutyWorkplace;
use App\Models\Module;
use App\Models\User;
use App\Services\Duty\DutyReminder;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * **მორიგეობის შეხსენება წინა დღეს** — დროზე ადრე არაფერი,
 * დროზე — ხვალინდელები ერთხელ (ტელეგრამი), ღია აპის polling, თარიღის შეცვლა
 * შეხსენებას ანულებს.
 */
class DutyReminderTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        $this->travelTo('2026-10-04 12:00:00');

        $this->user = User::create(['name' => 'nino', 'username' => 'nino', 'email' => 'nino@example.com', 'password' => 'password']);
        $this->user->modules()->sync(Module::where('key', 'duty')->pluck('id')->all());
        $this->user = $this->user->refresh();

        Http::fake(['api.telegram.org/*' => Http::response(['ok' => true])]);
    }

    private function shift(string $date, array $extra = []): DutyShift
    {
        return DutyShift::create(['user_id' => $this->user->id, 'date' => $date, 'hours' => 24, ...$extra]);
    }

    private function remindAt(string $time, bool $telegram = true): void
    {
        $this->actingAs($this->user)
            ->putJson('/api/duty/settings', ['remind_at' => $time, 'remind_telegram' => $telegram])
            ->assertOk()
            ->assertJsonPath('remind_at', $time)
            ->assertJsonPath('remind_telegram', $telegram);
    }

    public function test_tomorrows_shifts_are_reminded_once_after_the_chosen_time(): void
    {
        $this->giveCredential($this->user, 'telegram');
        $workplace = DutyWorkplace::create(['user_id' => $this->user->id, 'name' => 'კლინიკა', 'sort_order' => 1]);

        $this->shift('2026-10-04');
        $tomorrow = $this->shift('2026-10-05', ['workplace_id' => $workplace->id, 'start_time' => '08:00']);
        $this->shift('2026-10-06');
        $this->remindAt('20:00');

        $reminder = app(DutyReminder::class);

        $this->travelTo('2026-10-04 19:59:00');
        $this->assertCount(0, $reminder->run());
        Http::assertNothingSent();

        $this->travelTo('2026-10-04 20:00:00');
        $claimed = $reminder->run();

        $this->assertSame([$tomorrow->id], $claimed->pluck('id')->all());
        $this->assertNotNull($tomorrow->refresh()->reminded_at);

        Http::assertSentCount(1);
        Http::assertSent(fn (HttpRequest $request) => str_contains((string) $request['text'], 'კლინიკა')
            && str_contains((string) $request['text'], '08:00'));

        // ⚠️ მეორე გაშვება (cron ან ღია ტაბი) აღარაფერს აგზავნის
        $this->travelTo('2026-10-04 20:01:00');
        $this->assertCount(0, $reminder->run());
        Http::assertSentCount(1);
    }

    public function test_reminders_are_off_until_a_time_is_chosen(): void
    {
        $this->shift('2026-10-05');
        $this->travelTo('2026-10-04 23:00:00');

        $this->assertCount(0, app(DutyReminder::class)->run());
        $this->assertNull(DutyShift::query()->first()->reminded_at);
    }

    /** ღია აპის polling — cron-ის გარეშეც; ტელეგრამის გარეშე მხოლოდ ბრაუზერი */
    public function test_the_open_app_polls_and_receives_tomorrows_shifts(): void
    {
        $tomorrow = $this->shift('2026-10-05');
        $this->remindAt('09:00', telegram: false);

        $this->travelTo('2026-10-04 09:30:00');

        $this->actingAs($this->user)->getJson('/api/duty/reminders/due')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $tomorrow->id);

        // ⚠️ განმეორებით იგივე მოდის — ჩვენებას ბრაუზერი თვითონ იმახსოვრებს
        $this->getJson('/api/duty/reminders/due')->assertJsonCount(1, 'data');
        Http::assertNothingSent();
    }

    public function test_moving_a_shift_to_another_day_resets_its_reminder(): void
    {
        $shift = $this->shift('2026-10-05', ['reminded_at' => now()]);

        $this->actingAs($this->user)->patchJson("/api/duty/shifts/{$shift->id}", ['date' => '2026-10-09'])->assertOk();
        $this->assertNull($shift->refresh()->reminded_at);

        // სხვა ველის შეცვლა შეხსენებას ხელს არ ახლებს
        $other = $this->shift('2026-10-05', ['reminded_at' => now()]);
        $this->patchJson("/api/duty/shifts/{$other->id}", ['note' => 'შემცვლელი'])->assertOk();
        $this->assertNotNull($other->refresh()->reminded_at);
    }

    /** ⚠️ პერიოდის ბოლო დღე ჯამსა და სიაში ხვდება (თარიღი `Y-m-d`-ით ინახება) */
    public function test_the_last_day_of_the_period_is_counted(): void
    {
        $this->shift('2026-10-31');
        $this->shift('2026-10-01');

        $this->actingAs($this->user)->getJson('/api/duty/summary')->assertJsonPath('totals.shifts', 2);
        $this->getJson('/api/duty/shifts')->assertJsonCount(2, 'data');
        $this->assertSame('2026-10-31', DutyShift::query()->orderByDesc('date')->first()->getRawOriginal('date'));
    }
}
