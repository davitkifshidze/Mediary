<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Module;
use App\Models\User;
use App\Support\AppSettings;
use App\Support\AuditSettings;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **დაჭერები და განახლება პაკეტად**.
 *
 * ⚠️ რა მოწმდება: პაკეტის თითო მოვლენა თავის რიგად იწერება (წარწერა, როლი,
 * გვერდი, მოდული); 50-ზე მეტი და უცნობი ტიპი 422-ია; ზედმეტი ველი (მნიშვნელობა)
 * ჩაწერამდე ვერ აღწევს; გაზიარების ტოკენი გზაში იფარება; გამორთული ტიპი არ
 * იწერება; სტუმარს ეს კარი არ აქვს.
 */
class AuditEventsTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        AppSettings::flush();

        $this->seed(ModulesSeeder::class);

        $this->user = User::create([
            'name' => 'alice',
            'username' => 'alice',
            'email' => 'alice@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::pluck('id')->mapWithKeys(fn ($id) => [$id => ['enabled_at' => now()]])->all());
    }

    private function events()
    {
        return AuditLog::query()->whereIn('action', AuditLog::EVENT_ACTIONS)->orderBy('id');
    }

    public function test_a_batch_writes_one_row_per_event(): void
    {
        $this->actingAs($this->user)->postJson('/api/audit/events', ['events' => [
            ['action' => 'click', 'path' => '/books', 'label' => 'რედაქტირება', 'role' => 'button'],
            ['action' => 'click', 'path' => '/books', 'label' => str_repeat('ა', 300), 'role' => 'tab'],
            ['action' => 'refresh', 'path' => '/movies'],
        ]])->assertOk()->assertJsonPath('written', 3);

        $rows = $this->events()->get();
        $this->assertCount(3, $rows);

        $this->assertSame('click', $rows[0]->action);
        $this->assertSame('books', $rows[0]->route);
        $this->assertSame('book', $rows[0]->module);
        $this->assertSame(['label' => 'რედაქტირება', 'role' => 'button'], $rows[0]->context);
        $this->assertNull($rows[0]->method);
        $this->assertSame((int) $this->user->id, (int) $rows[0]->user_id);

        // წარწერა 120 სიმბოლოზე იჭრება
        $this->assertSame(120, mb_strlen($rows[1]->context['label']));

        $this->assertSame('refresh', $rows[2]->action);
        $this->assertSame('movie', $rows[2]->module);
        $this->assertNull($rows[2]->context);
    }

    public function test_the_batch_limit_and_unknown_kinds_are_rejected(): void
    {
        $many = array_fill(0, 51, ['action' => 'click', 'path' => '/books', 'role' => 'button']);
        $this->actingAs($this->user)->postJson('/api/audit/events', ['events' => $many])->assertStatus(422);

        $this->actingAs($this->user)->postJson('/api/audit/events', ['events' => [['action' => 'create', 'path' => '/books']]])
            ->assertStatus(422);
        $this->actingAs($this->user)->postJson('/api/audit/events', ['events' => [['action' => 'click', 'path' => '/x', 'role' => 'textbox']]])
            ->assertStatus(422);

        $this->assertSame(0, $this->events()->count());
    }

    public function test_a_field_value_never_reaches_the_log_and_share_tokens_are_masked(): void
    {
        $this->actingAs($this->user)->postJson('/api/audit/events', ['events' => [
            ['action' => 'click', 'path' => '/share/abcDEF123secret/movies', 'label' => 'გახსნა', 'role' => 'link', 'value' => 'hunter2', 'password' => 'hunter2'],
        ]])->assertOk();

        $row = $this->events()->firstOrFail();
        $this->assertSame('share/•••/movies', $row->route);
        $this->assertStringNotContainsString('hunter2', json_encode($row->getAttributes()));
        $this->assertStringNotContainsString('abcDEF123secret', json_encode($row->getAttributes()));
    }

    public function test_a_disabled_kind_is_dropped_on_the_server_too(): void
    {
        AuditSettings::save(['click']);

        $this->actingAs($this->user)->postJson('/api/audit/events', ['events' => [
            ['action' => 'click', 'path' => '/books', 'role' => 'button'],
            ['action' => 'refresh', 'path' => '/books'],
        ]])->assertOk()->assertJsonPath('written', 1);

        $this->assertSame(['refresh'], $this->events()->pluck('action')->all());
    }

    public function test_a_guest_has_no_event_door(): void
    {
        $this->postJson('/api/audit/events', ['events' => [['action' => 'click', 'path' => '/books']]])->assertUnauthorized();
    }
}
