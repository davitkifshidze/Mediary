<?php

namespace Tests\Feature;

use App\Models\DutyPattern;
use App\Models\DutyShift;
use App\Models\DutyShiftType;
use App\Models\DutyWorkplace;
use App\Models\Module;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **მორიგეობის რიტმი** — „ყოველ მე-4 დღეს": გაგრძელება პერიოდის ბოლომდე
 * ნამდვილი მორიგეობებით, თვის საზღვრის გადაკვეთა, დაკავებული დღის გამოტოვება,
 * უკვე გაგრძელებული შუალედის ხელშეუხებლობა, მონიშნულებიდან შექმნა და სხვისი 404.
 */
class DutyPatternTest extends TestCase
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
        $this->user->refresh();
        $this->actingAs($this->user);
    }

    /** 112 · 24 სთ = 250 */
    private function setup112(): array
    {
        $this->getJson('/api/duty/types')->assertOk();
        $h24 = (int) DutyShiftType::query()->where('key', 'h24')->value('id');

        $id = $this->postJson('/api/duty/workplaces', [
            'name' => '112',
            'short' => '112',
            'rates' => [['type_id' => $h24, 'pay' => 250]],
        ])->assertCreated()->json('data.id');

        return [DutyWorkplace::findOrFail($id), $h24];
    }

    /** @return list<string> */
    private function dates(int $workplaceId): array
    {
        return DutyShift::query()->where('workplace_id', $workplaceId)->orderBy('date')->get()
            ->map(fn (DutyShift $s) => $s->date->toDateString())->all();
    }

    public function test_continuing_a_rhythm_creates_real_shifts_up_to_the_period_end_across_the_month(): void
    {
        [$wp, $h24] = $this->setup112();

        $id = $this->postJson('/api/duty/patterns', [
            'workplace_id' => $wp->id,
            'type_id' => $h24,
            'interval_days' => 4,
            'anchor_date' => '2026-10-01',
            'start_time' => '09:00',
        ])->assertCreated()
            ->assertJsonPath('data.hours', 24)
            ->assertJsonPath('data.generated_until', null)
            ->json('data.id');

        $this->postJson("/api/duty/patterns/{$id}/continue", ['until' => '2026-10-31'])
            ->assertOk()
            ->assertJsonPath('created', 8)
            ->assertJsonPath('skipped', 0)
            ->assertJsonPath('generated_until', '2026-10-31');

        $this->assertSame(
            ['2026-10-01', '2026-10-05', '2026-10-09', '2026-10-13', '2026-10-17', '2026-10-21', '2026-10-25', '2026-10-29'],
            $this->dates($wp->id),
        );

        $shift = DutyShift::query()->where('date', '2026-10-05')->firstOrFail();
        $this->assertSame($id, $shift->pattern_id);
        $this->assertSame(250.0, (float) $shift->pay);
        $this->assertSame('09:00', substr((string) $shift->start_time, 0, 5));
        $this->getJson("/api/duty/shifts/{$shift->id}")->assertJsonPath('data.pattern_id', $id);

        // შემდეგი თვე — 29-ის შემდეგ 2 ნოემბერი (თვის საზღვარი თვითონ გადადის)
        $this->postJson("/api/duty/patterns/{$id}/continue", ['until' => '2026-11-10'])
            ->assertJsonPath('created', 3);
        $this->assertSame(['2026-11-02', '2026-11-06', '2026-11-10'], array_slice($this->dates($wp->id), 8));

        // უკვე გაგრძელებული — ხელახლა არაფერი
        $this->postJson("/api/duty/patterns/{$id}/continue", ['until' => '2026-11-10'])->assertJsonPath('created', 0);
    }

    public function test_a_taken_day_is_skipped_and_a_moved_shift_frees_nothing(): void
    {
        [$wp, $h24] = $this->setup112();

        // ჩემი ხელით დადგმული (გაუქმებულიც ითვლება) — რიტმი მას არ გადაწერს
        $this->postJson('/api/duty/shifts', ['date' => '2026-10-09', 'workplace_id' => $wp->id, 'type_id' => $h24, 'status' => 'cancelled'])
            ->assertCreated();

        $id = $this->postJson('/api/duty/patterns', [
            'workplace_id' => $wp->id, 'type_id' => $h24, 'interval_days' => 4, 'anchor_date' => '2026-10-01',
        ])->json('data.id');

        $this->postJson("/api/duty/patterns/{$id}/continue", ['until' => '2026-10-13'])
            ->assertJsonPath('created', 3)
            ->assertJsonPath('skipped', 1);
        $this->assertSame(1, DutyShift::query()->where('date', '2026-10-09')->count());

        // გაცვლა: 5 → 6; გაგრძელება გათავისუფლებულ 5-ს აღარ ავსებს
        $moved = DutyShift::query()->where('date', '2026-10-05')->firstOrFail();
        $this->patchJson("/api/duty/shifts/{$moved->id}", ['date' => '2026-10-06'])->assertOk()->assertJsonPath('data.pattern_id', $id);
        $this->postJson("/api/duty/patterns/{$id}/continue", ['until' => '2026-10-21'])->assertJsonPath('created', 2);
        $this->assertSame(0, DutyShift::query()->where('date', '2026-10-05')->count());
    }

    public function test_a_rhythm_is_made_from_shifts_already_set_and_continues_after_them(): void
    {
        [$wp, $h24] = $this->setup112();

        $ids = collect(['2026-10-01', '2026-10-05', '2026-10-09'])->map(fn ($date) => $this->postJson('/api/duty/shifts', [
            'date' => $date, 'workplace_id' => $wp->id, 'type_id' => $h24,
        ])->json('data.id'))->all();

        $id = $this->postJson('/api/duty/patterns', [
            'workplace_id' => $wp->id, 'type_id' => $h24, 'interval_days' => 4, 'anchor_date' => '2026-10-01', 'adopt_ids' => $ids,
        ])->assertCreated()
            ->assertJsonPath('data.generated_until', '2026-10-09')
            ->json('data.id');

        $this->assertSame(3, DutyShift::query()->where('pattern_id', $id)->count());

        $this->postJson("/api/duty/patterns/{$id}/continue", ['until' => '2026-10-17'])
            ->assertJsonPath('created', 2)
            ->assertJsonPath('skipped', 0);
    }

    public function test_custom_hours_need_hours_and_a_trashed_rhythm_keeps_its_shifts(): void
    {
        [$wp] = $this->setup112();

        $this->postJson('/api/duty/patterns', ['workplace_id' => $wp->id, 'interval_days' => 3, 'anchor_date' => '2026-10-01'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'duty_hours_required');

        $id = $this->postJson('/api/duty/patterns', [
            'workplace_id' => $wp->id, 'hours' => 6, 'interval_days' => 3, 'anchor_date' => '2026-10-01',
        ])->assertCreated()->assertJsonPath('data.type_id', null)->json('data.id');

        $this->postJson("/api/duty/patterns/{$id}/continue", ['until' => '2026-10-07'])->assertJsonPath('created', 3);
        $this->assertSame(6.0, (float) DutyShift::query()->where('pattern_id', $id)->value('hours'));

        $this->deleteJson("/api/duty/patterns/{$id}")->assertNoContent();
        $this->getJson('/api/duty/patterns')->assertJsonCount(0, 'data');
        $this->assertSame(3, DutyShift::query()->where('pattern_id', $id)->count(), 'რიტმი ურნაშია — მორიგეობები რჩება');

        // ერთ გაგრძელებაში წელიწადზე მეტი — 422
        $other = DutyPattern::create(['user_id' => $this->user->id, 'workplace_id' => $wp->id, 'hours' => 6, 'interval_days' => 3, 'anchor_date' => '2026-10-01']);
        $this->postJson("/api/duty/patterns/{$other->id}/continue", ['until' => '2028-01-01'])->assertStatus(422);
    }

    public function test_another_accounts_rhythm_is_a_404(): void
    {
        [$wp] = $this->setup112();
        $mine = DutyPattern::create(['user_id' => $this->user->id, 'workplace_id' => $wp->id, 'hours' => 24, 'interval_days' => 4, 'anchor_date' => '2026-10-01']);

        $other = User::create(['name' => 'gio', 'username' => 'gio', 'email' => 'gio@example.com', 'password' => 'password']);
        $other->modules()->sync(Module::where('key', 'duty')->pluck('id')->all());
        $this->actingAs($other->refresh());

        $this->postJson("/api/duty/patterns/{$mine->id}/continue", ['until' => '2026-10-31'])->assertNotFound();
        $this->patchJson("/api/duty/patterns/{$mine->id}", ['interval_days' => 2])->assertNotFound();
        $this->getJson('/api/duty/patterns')->assertJsonCount(0, 'data');
        // სხვისი სამსახური ვერ მიეთითება
        $this->postJson('/api/duty/patterns', ['workplace_id' => $wp->id, 'hours' => 24, 'interval_days' => 4, 'anchor_date' => '2026-10-01'])
            ->assertStatus(422);
    }
}
