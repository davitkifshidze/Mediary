<?php

namespace Tests\Feature;

use App\Models\DutyShift;
use App\Models\DutyShiftType;
use App\Models\DutyWorkplace;
use App\Models\Module;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **მორიგეობა** — სამსახურები და ტარიფები, ტიპები, მორიგეობები,
 * ერთიანი მონიშვნა, მასობრივი შეცვლა, ჯამები, წაშლა და რეესტრები.
 */
class DutyModuleTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        $this->travelTo('2026-10-04 12:00:00');

        $this->user = $this->makeUser('nino');
        $this->actingAs($this->user);
    }

    private function makeUser(string $name): User
    {
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::where('key', 'duty')->pluck('id')->all());

        return $user->refresh();
    }

    /** @return array<string, int> ნაგულისხმევი ტიპები key → id */
    private function types(): array
    {
        $this->getJson('/api/duty/types')->assertOk();

        return DutyShiftType::query()->pluck('id', 'key')->map(fn ($id) => (int) $id)->all();
    }

    private function workplace(string $name, array $rates = [], ?float $hourly = null): DutyWorkplace
    {
        $id = $this->postJson('/api/duty/workplaces', [
            'name' => $name,
            'short' => mb_substr($name, 0, 1),
            'hourly_rate' => $hourly,
            'rates' => collect($rates)->map(fn ($pay, $type) => ['type_id' => $type, 'pay' => $pay])->values()->all(),
        ])->assertCreated()->json('data.id');

        return DutyWorkplace::findOrFail($id);
    }

    /* ---------- ნაგულისხმევები ---------- */

    public function test_one_workplace_and_three_types_appear_on_first_read(): void
    {
        $this->getJson('/api/duty/workplaces?locale=ka')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'სამსახური');

        $types = $this->getJson('/api/duty/types')->assertOk()->json('data');
        $this->assertSame([8.0, 12.0, 24.0], array_map(fn ($t) => (float) $t['hours'], $types));

        // მეორე წაკითხვა ახალს არ ქმნის
        $this->getJson('/api/duty/workplaces')->assertJsonCount(1, 'data');
        $this->getJson('/api/duty/types')->assertJsonCount(3, 'data');
    }

    /* ---------- სამსახურის ნაგულისხმევები და დასრულება ---------- */

    public function test_a_workplace_keeps_its_default_type_and_start_time(): void
    {
        $t = $this->types();

        $id = $this->postJson('/api/duty/workplaces', [
            'name' => '112',
            'short' => '112',
            'rates' => [['type_id' => $t['h24'], 'pay' => 250]],
            'default_type_id' => $t['h24'],
            'default_start_time' => '09:00',
        ])->assertCreated()
            ->assertJsonPath('data.default_type_id', $t['h24'])
            ->assertJsonPath('data.default_start_time', '09:00')
            ->assertJsonPath('data.hourly_rate', null)
            ->json('data.id');

        // საათზე: ტარიფები ცარიელია, ნაგულისხმევები მოიხსნება
        $this->patchJson("/api/duty/workplaces/{$id}", [
            'hourly_rate' => 15,
            'rates' => [],
            'default_type_id' => null,
            'default_start_time' => null,
        ])->assertOk()
            ->assertJsonPath('data.rates', [])
            ->assertJsonPath('data.hourly_rate', 15)
            ->assertJsonPath('data.default_type_id', null)
            ->assertJsonPath('data.default_start_time', null);

        // სხვისი ან არარსებული ტიპი და არასწორი დრო — 422
        $this->patchJson("/api/duty/workplaces/{$id}", ['default_type_id' => 999999])->assertStatus(422);
        $this->patchJson("/api/duty/workplaces/{$id}", ['default_start_time' => '9am'])->assertStatus(422);
    }

    public function test_a_shift_ends_hours_after_it_starts(): void
    {
        $t = $this->types();
        $wp = $this->workplace('112', [$t['h24'] => 250]);

        $this->postJson('/api/duty/shifts', ['date' => '2026-10-02', 'workplace_id' => $wp->id, 'type_id' => $t['h24'], 'start_time' => '09:00'])
            ->assertCreated()
            ->assertJsonPath('data.end_time', '09:00')
            ->assertJsonPath('data.end_day', 1)
            ->assertJsonPath('data.pay', 250);

        $this->postJson('/api/duty/shifts', ['date' => '2026-10-03', 'workplace_id' => $wp->id, 'type_id' => null, 'hours' => 4.5, 'start_time' => '20:30'])
            ->assertJsonPath('data.end_time', '01:00')
            ->assertJsonPath('data.end_day', 1);

        $this->postJson('/api/duty/shifts', ['date' => '2026-10-04', 'workplace_id' => $wp->id, 'type_id' => null, 'hours' => 5, 'start_time' => '08:00'])
            ->assertJsonPath('data.end_time', '13:00')
            ->assertJsonPath('data.end_day', 0);

        // დაწყების გარეშე დასრულებაც არ არის
        $this->postJson('/api/duty/shifts', ['date' => '2026-10-05', 'workplace_id' => $wp->id, 'type_id' => $t['h24']])
            ->assertJsonPath('data.end_time', null)
            ->assertJsonPath('data.end_day', null);
    }

    /* ---------- ტარიფი ---------- */

    public function test_two_workplaces_pay_differently_for_the_same_type(): void
    {
        $t = $this->types();
        $a = $this->workplace('A', [$t['h24'] => 220, $t['h12'] => 120]);
        $b = $this->workplace('B', [$t['h24'] => 300], hourly: 15);

        $first = $this->postJson('/api/duty/shifts', ['date' => '2026-10-02', 'workplace_id' => $a->id, 'type_id' => $t['h24']])
            ->assertCreated()
            ->assertJsonPath('data.hours', 24)
            ->assertJsonPath('data.pay', 220)
            ->assertJsonPath('data.workplace.short', 'A');

        $this->postJson('/api/duty/shifts', ['date' => '2026-10-02', 'workplace_id' => $b->id, 'type_id' => $t['h24']])
            ->assertCreated()
            ->assertJsonPath('data.pay', 300);

        // ქასთომ საათები — საათობრივი განაკვეთით (10 × 15)
        $this->postJson('/api/duty/shifts', ['date' => '2026-10-03', 'workplace_id' => $b->id, 'type_id' => null, 'hours' => 10])
            ->assertCreated()
            ->assertJsonPath('data.type_id', null)
            ->assertJsonPath('data.pay', 150);

        // ⚠️ ქასთომი საათების გარეშე — 422
        $this->postJson('/api/duty/shifts', ['date' => '2026-10-03', 'workplace_id' => $b->id, 'type_id' => null])
            ->assertStatus(422)
            ->assertJsonPath('message', 'duty_hours_required');

        // ტარიფის გარეშე და საათობრივის გარეშე — თანხა უცნობია (null და არა 0)
        $this->postJson('/api/duty/shifts', ['date' => '2026-10-05', 'workplace_id' => $a->id, 'type_id' => $t['h8']])
            ->assertJsonPath('data.pay', null);

        // ხელით გადაწერა — ცხადი `pay`
        $this->postJson('/api/duty/shifts', ['date' => '2026-10-06', 'workplace_id' => $a->id, 'type_id' => $t['h24'], 'pay' => 250])
            ->assertJsonPath('data.pay', 250);

        // ⚠️ ტარიფის შეცვლა ძველ მორიგეობას არ ეხება
        $this->patchJson("/api/duty/workplaces/{$a->id}", ['rates' => [['type_id' => $t['h24'], 'pay' => 999]]])->assertOk();
        $this->assertSame('220.00', (string) DutyShift::findOrFail($first->json('data.id'))->pay);
        $this->assertSame(1, $a->rates()->count(), 'სიაში არმყოფი ტარიფი (12 სთ) მოიხსნა');
    }

    public function test_changing_the_type_recomputes_hours_and_pay_unless_pay_is_given(): void
    {
        $t = $this->types();
        $a = $this->workplace('A', [$t['h24'] => 220, $t['h12'] => 120]);

        $id = $this->postJson('/api/duty/shifts', ['date' => '2026-10-02', 'workplace_id' => $a->id, 'type_id' => $t['h12']])->json('data.id');

        $this->patchJson("/api/duty/shifts/{$id}", ['type_id' => $t['h24']])
            ->assertOk()
            ->assertJsonPath('data.hours', 24)
            ->assertJsonPath('data.pay', 220);

        $this->patchJson("/api/duty/shifts/{$id}", ['type_id' => $t['h12'], 'pay' => 100])
            ->assertJsonPath('data.hours', 12)
            ->assertJsonPath('data.pay', 100);

        // მხოლოდ შენიშვნა — თანხა ხელუხლებელია
        $this->patchJson("/api/duty/shifts/{$id}", ['note' => 'შემცვლელი'])
            ->assertJsonPath('data.pay', 100)
            ->assertJsonPath('data.note', 'შემცვლელი');
    }

    public function test_another_accounts_shift_is_a_404(): void
    {
        $other = $this->makeUser('luka');
        $shift = DutyShift::create(['user_id' => $other->id, 'date' => '2026-10-02', 'hours' => 24]);

        $this->getJson("/api/duty/shifts/{$shift->id}")->assertNotFound();
        $this->patchJson("/api/duty/shifts/{$shift->id}", ['note' => 'x'])->assertNotFound();
        $this->deleteJson("/api/duty/shifts/{$shift->id}")->assertNotFound();
        $this->assertSame([], $this->getJson('/api/duty/shifts')->json('data'));
    }

    /* ---------- ერთიანი მონიშვნა და მასობრივი შეცვლა ---------- */

    public function test_a_batch_creates_many_days_each_with_its_own_type(): void
    {
        $t = $this->types();
        $a = $this->workplace('A', [$t['h24'] => 220, $t['h12'] => 120]);

        $this->postJson('/api/duty/shifts/batch', [
            'workplace_id' => $a->id,
            'type_id' => $t['h24'],
            'items' => [
                ['date' => '2026-10-02'],
                ['date' => '2026-10-05', 'type_id' => $t['h12']],
                ['date' => '2026-10-08', 'type_id' => null, 'hours' => 6, 'pay' => 60],
            ],
        ])->assertCreated()->assertJsonCount(3, 'data');

        $shifts = DutyShift::query()->orderBy('date')->get();
        $this->assertSame([24.0, 12.0, 6.0], $shifts->map(fn ($s) => (float) $s->hours)->all());
        $this->assertSame([220.0, 120.0, 60.0], $shifts->map(fn ($s) => (float) $s->pay)->all());
        $this->assertNull($shifts[2]->type_id);
    }

    /** ⚠️ ერთი ცუდი დღე — არაფერი იქმნება (ტრანზაქცია) */
    public function test_a_batch_with_one_bad_day_creates_nothing(): void
    {
        $t = $this->types();
        $a = $this->workplace('A');

        $this->postJson('/api/duty/shifts/batch', [
            'workplace_id' => $a->id,
            'type_id' => $t['h24'],
            'items' => [
                ['date' => '2026-10-02'],
                ['date' => '2026-10-03', 'type_id' => null],
            ],
        ])->assertStatus(422)->assertJsonPath('message', 'duty_hours_required');

        $this->assertSame(0, DutyShift::query()->count());
    }

    public function test_a_bulk_change_moves_shifts_and_recomputes_their_pay(): void
    {
        $t = $this->types();
        $a = $this->workplace('A', [$t['h24'] => 220, $t['h12'] => 120]);
        $b = $this->workplace('B', [$t['h24'] => 300, $t['h12'] => 150]);

        $ids = collect($this->postJson('/api/duty/shifts/batch', [
            'workplace_id' => $a->id,
            'type_id' => $t['h12'],
            'items' => [['date' => '2026-10-02'], ['date' => '2026-10-03']],
        ])->json('data'))->pluck('id')->all();

        $this->patchJson('/api/duty/shifts', ['ids' => $ids, 'workplace_id' => $b->id])->assertOk()->assertJsonPath('updated', 2);
        $this->assertSame([150.0, 150.0], DutyShift::query()->pluck('pay')->map(fn ($p) => (float) $p)->all());

        $this->patchJson('/api/duty/shifts', ['ids' => $ids, 'type_id' => $t['h24']])->assertOk();
        $this->assertSame([24.0, 24.0], DutyShift::query()->pluck('hours')->map(fn ($h) => (float) $h)->all());
        $this->assertSame([300.0, 300.0], DutyShift::query()->pluck('pay')->map(fn ($p) => (float) $p)->all());

        $this->patchJson('/api/duty/shifts', ['ids' => $ids])->assertStatus(422)->assertJsonPath('message', 'nothing_to_change');

        $this->deleteJson('/api/duty/shifts', ['ids' => $ids])->assertOk()->assertJsonPath('trashed', 2);
        $this->assertSame(0, DutyShift::query()->count());
        $this->postJson("/api/trash/duty/{$ids[0]}/restore")->assertOk();
        $this->assertSame(1, DutyShift::query()->count());
    }

    /* ---------- ჯამები ---------- */

    public function test_totals_by_workplace_and_type_with_the_previous_period(): void
    {
        $t = $this->types();
        $a = $this->workplace('A', [$t['h24'] => 200]);
        $b = $this->workplace('B', [$t['h12'] => 100]);

        $this->postJson('/api/duty/shifts', ['date' => '2026-10-02', 'workplace_id' => $a->id, 'type_id' => $t['h24']]);
        $this->postJson('/api/duty/shifts', ['date' => '2026-10-02', 'workplace_id' => $b->id, 'type_id' => $t['h12']]);
        $this->postJson('/api/duty/shifts', ['date' => '2026-10-10', 'workplace_id' => $a->id, 'type_id' => $t['h8']]);
        // წინა პერიოდი (სექტემბერი)
        $this->postJson('/api/duty/shifts', ['date' => '2026-09-20', 'workplace_id' => $a->id, 'type_id' => $t['h24']]);

        $summary = $this->getJson('/api/duty/summary')->assertOk();

        $summary->assertJsonPath('from', '2026-10-01')
            ->assertJsonPath('to', '2026-10-31')
            ->assertJsonPath('is_period', true)
            ->assertJsonPath('totals.shifts', 3)
            ->assertJsonPath('totals.hours', 44)
            ->assertJsonPath('totals.pay', 300)
            ->assertJsonPath('totals.unpaid', 1)
            ->assertJsonPath('previous.shifts', 1)
            ->assertJsonPath('previous.pay', 200);

        $byWorkplace = collect($summary->json('workplaces'))->keyBy('workplace_id');
        $this->assertSame(2, $byWorkplace[$a->id]['shifts']);
        $this->assertEquals(32, $byWorkplace[$a->id]['hours']);
        $this->assertEquals(100, $byWorkplace[$b->id]['pay']);

        // ერთი სამსახურით ჭრა
        $this->getJson("/api/duty/summary?workplace_id[]={$b->id}")->assertJsonPath('totals.shifts', 1);

        // ნებისმიერი შუალედი (კალკულატორი) — წინა პერიოდის შედარების გარეშე
        $this->getJson('/api/duty/summary?from=2026-09-01&to=2026-10-31')
            ->assertJsonPath('is_period', false)
            ->assertJsonPath('totals.shifts', 4)
            ->assertJsonMissingPath('previous');

        $this->getJson('/api/duty/summary?from=2020-01-01&to=2026-10-31')->assertStatus(422)->assertJsonPath('message', 'duty_range_too_long');

        $periods = $this->getJson('/api/duty/summary/periods?count=2')->assertOk()->json('data');
        $this->assertSame(['2026-09-01', '2026-10-01'], array_column($periods, 'from'));
        $this->assertSame(1, $periods[0]['totals']['shifts']);
        $this->assertSame(3, $periods[1]['totals']['shifts']);
    }

    public function test_the_list_reads_the_current_period_by_default(): void
    {
        $this->types();
        DutyShift::create(['user_id' => $this->user->id, 'date' => '2026-10-02', 'hours' => 24, 'note' => 'ღამე']);
        DutyShift::create(['user_id' => $this->user->id, 'date' => '2026-11-02', 'hours' => 24]);

        $this->getJson('/api/duty/shifts')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('range.from', '2026-10-01');

        $this->getJson('/api/duty/shifts?from=2026-10-01&to=2026-11-30')->assertJsonCount(2, 'data');
        $this->getJson('/api/duty/shifts?from=2026-10-01&to=2026-11-30&q='.urlencode('ღამ'))->assertJsonCount(1, 'data');
    }

    /* ---------- სამსახურისა და ტიპის წაშლა ---------- */

    public function test_deleting_a_workplace_moves_its_shifts_and_the_trash_remembers_them(): void
    {
        $t = $this->types();
        $a = $this->workplace('A');
        $b = $this->workplace('B');
        $shift = DutyShift::create(['user_id' => $this->user->id, 'workplace_id' => $a->id, 'type_id' => $t['h24'], 'date' => '2026-10-02', 'hours' => 24]);

        $this->deleteJson("/api/duty/workplaces/{$a->id}", [])->assertStatus(422)->assertJsonPath('message', 'move_target_required');

        $this->deleteJson("/api/duty/workplaces/{$a->id}", ['move_to' => $b->id])->assertOk()->assertJsonPath('moved', 1);

        $this->assertSame($b->id, $shift->refresh()->workplace_id);
        $this->assertNotNull(DutyWorkplace::onlyTrashed()->find($a->id)?->trashed_at);
        $this->assertSame(['ids' => [$shift->id], 'to' => $b->id], DutyWorkplace::onlyTrashed()->find($a->id)->trash_meta);

        $kinds = collect($this->getJson('/api/trash')->json('data'))->pluck('kind');
        $this->assertContains('duty_workplace', $kinds);
    }

    public function test_deleting_a_type_can_leave_its_shifts_as_custom_hours(): void
    {
        $t = $this->types();
        $shift = DutyShift::create(['user_id' => $this->user->id, 'type_id' => $t['h12'], 'date' => '2026-10-02', 'hours' => 12, 'pay' => 120]);

        $this->deleteJson("/api/duty/types/{$t['h12']}", ['clear_records' => true])->assertOk();

        $shift->refresh();
        $this->assertNull($shift->type_id);
        $this->assertSame('12.0', (string) $shift->hours);
        $this->assertSame('120.00', (string) $shift->pay);
    }

    /* ---------- რეესტრები ---------- */

    public function test_the_dashboard_counts_the_current_period_only(): void
    {
        DutyShift::create(['user_id' => $this->user->id, 'date' => '2026-10-02', 'hours' => 24]);
        DutyShift::create(['user_id' => $this->user->id, 'date' => '2026-10-20', 'hours' => 12]);
        DutyShift::create(['user_id' => $this->user->id, 'date' => '2026-09-30', 'hours' => 12]);

        $card = collect($this->getJson('/api/dashboard')->assertOk()->json('data'))->firstWhere('key', 'duty');
        $this->assertSame(2, $card['count']);
    }

    public function test_search_export_and_audit_know_the_shift(): void
    {
        $t = $this->types();
        $a = $this->workplace('კლინიკა', [$t['h24'] => 220]);
        $id = $this->postJson('/api/duty/shifts', ['date' => '2026-10-02', 'workplace_id' => $a->id, 'type_id' => $t['h24'], 'note' => 'შემცვლელი ექიმი'])->json('data.id');

        $group = collect($this->getJson('/api/search?q='.urlencode('შემცვლ'))->assertOk()->json('groups'))->firstWhere('key', 'duty');
        $this->assertSame($id, $group['items'][0]['id']);
        $this->assertSame('2026-10-02 · კ · 24 სთ', $group['items'][0]['title']);
        $this->assertSame('კლინიკა', $group['items'][0]['subtitle']);

        $csv = $this->get('/api/export/duty?format=csv')->assertOk()->streamedContent();
        $this->assertStringContainsString('კლინიკა', $csv);
        $this->assertStringContainsString('24 სთ', $csv);

        $this->assertDatabaseHas('audit_logs', ['subject_type' => 'duty', 'subject_id' => $id, 'subject_label' => '2026-10-02 · კ · 24 სთ']);
    }
}
