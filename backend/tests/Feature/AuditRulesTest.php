<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\AuditRule;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use App\Support\AppTime;
use App\Support\AuditRegistry;
use App\Support\AuditRules;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * **„ჟურნალის წესები"** — გლობალურად, მოდულზე, მომხმარებელზე.
 *
 * ⚠️ რა მოწმდება: ნაგულისხმევად ყველაფერი იწერება; ოთხი დონიდან უფრო
 * კონკრეტული იმარჯვებს (მომხმარებელი + მოდული → მომხმარებელი → მოდული →
 * გლობალური); კარიბჭე `AuditLogger`-შია, ე.ი. observer-იც და SPA-ს სიგნალებიც
 * ემორჩილება; დროებითი გამორთვა ვადის გასვლისას თავისით იხსნება; წესები
 * მოთხოვნაზე ერთხელ იკითხება; წესის ცვლილება ყოველთვის იწერება; ჩატის წაშლა
 * ვერ გამოირთვება; გვერდი მხოლოდ მთავარი ადმინისაა; `/auth/me` SPA-ს ეუბნება,
 * რა და სად არის ჩართული.
 */
class AuditRulesTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $alice;

    private User $bob;

    protected function setUp(): void
    {
        parent::setUp();
        AuditRules::flush();

        $this->seed(ModulesSeeder::class);

        $this->alice = $this->makeUser('alice');
        $this->bob = $this->makeUser('bob');
        $this->admin = $this->makeUser('root');
        $this->admin->assignRole('super_admin')->save();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::pluck('id')->mapWithKeys(fn ($id) => [$id => ['enabled_at' => now()]])->all());

        return $user->refresh();
    }

    /** @param  list<array<string, mixed>>  $rules */
    private function save(array $rules)
    {
        return $this->actingAs($this->admin)->putJson('/api/admin/audit/rules', ['rules' => $rules]);
    }

    public function test_everything_is_written_by_default_and_the_page_describes_the_cells(): void
    {
        $data = $this->actingAs($this->admin)->getJson('/api/admin/audit/rules')->assertOk()->json('data');
        $kinds = collect($data['kinds'])->keyBy('key');

        $this->assertSame(array_keys(AuditRules::KINDS), $kinds->keys()->all());
        $this->assertTrue($kinds['chat_delete']['protected']);
        $this->assertFalse($kinds['click']['protected']);
        $this->assertTrue($kinds['login']['moduleless']);
        $this->assertFalse($kinds['create']['moduleless']);
        $this->assertSame([], $data['rules']);
        $this->assertSame(AuditRules::UNTIL, $data['until']);

        $modules = array_column($data['modules'], 'key');
        $this->assertContains('movie', $modules);
        $this->assertContains('admin', $modules);
        $this->assertContains('alice', array_column($data['users'], 'username'));

        foreach (array_keys(AuditRules::KINDS) as $kind) {
            $this->assertTrue(AuditRules::decide($kind, 'movie', $this->alice->id), $kind);
        }
    }

    public function test_the_most_specific_of_the_four_levels_wins(): void
    {
        $alice = $this->alice->id;
        $bob = $this->bob->id;

        // გლობალური გამორთვა ყველას და ყველგან ეხება; მოდულის წესი მას ამ მოდულში ფარავს
        AuditRules::apply([
            ['kind' => 'click', 'state' => 'off'],
            ['kind' => 'click', 'module' => 'movie', 'state' => 'on'],
        ]);
        $this->assertFalse(AuditRules::decide('click', 'book', $alice));
        $this->assertFalse(AuditRules::decide('click'));
        $this->assertTrue(AuditRules::decide('click', 'movie', $alice));
        $this->assertTrue(AuditRules::enabled(AuditLog::ACTION_CLICK, 'movie'));

        // ერთ მომხმარებელს ყველგან გამორთული აქვს, მაგრამ ფილმებში — ჩართული
        AuditRules::apply([
            ['kind' => 'create', 'user_id' => $alice, 'state' => 'off'],
            ['kind' => 'create', 'module' => 'movie', 'user_id' => $alice, 'state' => 'on'],
        ]);
        $this->assertFalse(AuditRules::decide('create', 'book', $alice));
        $this->assertFalse(AuditRules::decide('create', null, $alice));
        $this->assertTrue(AuditRules::decide('create', 'movie', $alice));
        $this->assertTrue(AuditRules::decide('create', 'book', $bob));

        // მომხმარებლის წესი მოდულის წესზე ძლიერია
        AuditRules::apply([
            ['kind' => 'update', 'module' => 'book', 'state' => 'off'],
            ['kind' => 'update', 'user_id' => $bob, 'state' => 'on'],
        ]);
        $this->assertFalse(AuditRules::decide('update', 'book', $alice));
        $this->assertTrue(AuditRules::decide('update', 'book', $bob));
        $this->assertTrue(AuditRules::decide('update', 'movie', $alice));

        // „როგორც ზემოთ" რიგს შლის — პასუხი ზედა დონეზე ბრუნდება
        AuditRules::apply([['kind' => 'update', 'user_id' => $bob, 'state' => 'inherit']]);
        $this->assertFalse(AuditRules::decide('update', 'book', $bob));
        $this->assertSame(0, AuditRule::where('kind', 'update')->where('user_id', $bob)->count());

        // გლობალური „ჩართული" ნაგულისხმევია — რიგი არ ინახება
        AuditRules::apply([['kind' => 'click', 'state' => 'on']]);
        $this->assertSame(0, AuditRule::where('kind', 'click')->whereNull('module')->whereNull('user_id')->count());
        $this->assertTrue(AuditRules::decide('click', 'book', $alice));
    }

    public function test_a_moduleless_kind_ignores_the_module(): void
    {
        AuditRules::apply([['kind' => 'login', 'user_id' => $this->alice->id, 'state' => 'off']]);

        // შესვლა `account`-ით იწერება, მაგრამ წესი მას მოდულის გარეშე ეძებს
        $this->assertFalse(AuditRules::enabled(AuditLog::ACTION_LOGIN, 'account', $this->alice->id));
        $this->assertTrue(AuditRules::enabled(AuditLog::ACTION_LOGIN, 'account', $this->bob->id));
    }

    public function test_the_logger_obeys_the_rules_per_module_and_per_user(): void
    {
        $this->save([
            ['kind' => 'visit', 'module' => 'movie', 'state' => 'off'],
            ['kind' => 'create', 'module' => 'movie', 'state' => 'off'],
        ])->assertOk()->assertJsonCount(2, 'data.rules');
        $from = (int) AuditLog::max('id');

        $this->actingAs($this->alice)->postJson('/api/audit/visit', ['path' => '/movies'])->assertNoContent();
        $this->actingAs($this->alice)->postJson('/api/audit/visit', ['path' => '/books'])->assertNoContent();
        // observer-იც ემორჩილება: ფილმის დამატება არ იწერება, რედაქტირება — კი
        $movie = Movie::create(['year' => 2021]);
        $movie->update(['year' => 2022]);

        $after = fn () => AuditLog::where('id', '>', $from);
        $this->assertSame(['books'], $after()->where('action', AuditLog::ACTION_VISIT)->pluck('route')->all());
        $this->assertSame(0, $after()->where('action', AuditLog::ACTION_CREATE)->count());
        $this->assertSame(1, $after()->where('action', AuditLog::ACTION_UPDATE)->where('subject_type', 'movie')->count());

        // ერთ ანგარიშზე ყველგან გამორთული, წიგნებში კი ჩართული
        $this->save([
            ['kind' => 'visit', 'user_id' => $this->alice->id, 'state' => 'off'],
            ['kind' => 'visit', 'module' => 'book', 'user_id' => $this->alice->id, 'state' => 'on'],
        ])->assertOk();
        $from = (int) AuditLog::max('id');

        $this->actingAs($this->alice)->postJson('/api/audit/visit', ['path' => '/series'])->assertNoContent();
        $this->actingAs($this->alice)->postJson('/api/audit/visit', ['path' => '/books/7'])->assertNoContent();
        $this->actingAs($this->bob)->postJson('/api/audit/visit', ['path' => '/series'])->assertNoContent();

        $visits = AuditLog::where('id', '>', $from)->where('action', AuditLog::ACTION_VISIT)->get(['user_id', 'route']);
        $this->assertEqualsCanonicalizing(
            [[$this->alice->id, 'books/7'], [$this->bob->id, 'series']],
            $visits->map(fn (AuditLog $row) => [$row->user_id, $row->route])->all(),
        );
    }

    public function test_a_temporary_rule_carries_its_deadline_and_expires_on_its_own(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-13 10:15:00', AppTime::zone()));

        AuditRules::apply([
            ['kind' => 'click', 'state' => 'off', 'until' => 'hour'],
            ['kind' => 'visit', 'state' => 'off', 'until' => 'day'],
            ['kind' => 'open', 'state' => 'off', 'until' => 'week'],
            ['kind' => 'refresh', 'state' => 'off'],
        ]);

        $deadline = fn (string $kind) => AuditRule::where('kind', $kind)->first()->expires_at?->format('Y-m-d H:i:s');
        $this->assertSame('2026-11-13 11:15:00', $deadline('click'));
        $this->assertSame('2026-11-13 23:59:59', $deadline('visit'));
        $this->assertSame('2026-11-20 10:15:00', $deadline('open'));
        $this->assertNull($deadline('refresh'));
        $this->assertFalse(AuditRules::decide('click'));

        // საათის შემდეგ ჩაწერა თავისით ბრუნდება — რიგი ჯერ ბაზაშია, მაგრამ აღარ მოქმედებს
        Carbon::setTestNow(Carbon::parse('2026-11-13 11:15:01', AppTime::zone()));
        AuditRules::flush();
        $this->assertTrue(AuditRules::decide('click'));
        $this->assertFalse(AuditRules::decide('visit'));
        $this->assertSame(1, AuditRule::where('kind', 'click')->count());

        // გვერდის გახსნა ვადაგასულს შლის; ხელით ჩართვამდე გამორთული რჩება
        $kinds = array_column($this->actingAs($this->admin)->getJson('/api/admin/audit/rules')->assertOk()->json('data.rules'), 'kind');
        $this->assertEqualsCanonicalizing(['visit', 'open', 'refresh'], $kinds);
        $this->assertSame(0, AuditRule::where('kind', 'click')->count());

        Carbon::setTestNow(Carbon::parse('2026-12-01 00:00:00', AppTime::zone()));
        AuditRules::flush();
        $this->assertTrue(AuditRules::decide('visit'));
        $this->assertTrue(AuditRules::decide('open'));
        $this->assertFalse(AuditRules::decide('refresh'));
    }

    public function test_the_rules_are_read_once_per_request(): void
    {
        AuditRules::apply([['kind' => 'click', 'module' => 'movie', 'state' => 'off']]);

        DB::enableQueryLog();
        DB::flushQueryLog();

        $this->actingAs($this->alice)->postJson('/api/audit/events', ['events' => [
            ['action' => 'click', 'path' => '/books', 'role' => 'button'],
            ['action' => 'click', 'path' => '/movies', 'role' => 'button'],
            ['action' => 'click', 'path' => '/series', 'role' => 'link'],
            ['action' => 'refresh', 'path' => '/books'],
        ]])->assertOk()->assertJsonPath('written', 3);

        $reads = collect(DB::getQueryLog())->filter(fn (array $query) => str_contains($query['query'], 'audit_rules'));
        DB::disableQueryLog();

        $this->assertCount(1, $reads);
    }

    public function test_a_rule_change_is_always_logged(): void
    {
        $this->assertSame(AuditRules::SUBJECT, AuditRegistry::typeFor(new AuditRule));

        // ჯერ თვითონ ცვლილებების ჩაწერა ითიშება — გლობალურადაც და ადმინის ჭრილშიც
        $this->save([
            ['kind' => 'create', 'state' => 'off'],
            ['kind' => 'update', 'state' => 'off'],
            ['kind' => 'delete', 'state' => 'off'],
            ['kind' => 'create', 'module' => 'admin', 'state' => 'off'],
        ])->assertOk();
        $from = (int) AuditLog::max('id');

        $this->save([['kind' => 'click', 'user_id' => $this->alice->id, 'state' => 'off', 'until' => 'hour']])->assertOk();
        $this->save([['kind' => 'click', 'user_id' => $this->alice->id, 'state' => 'on']])->assertOk();
        $this->save([['kind' => 'click', 'user_id' => $this->alice->id, 'state' => 'inherit']])->assertOk();

        $rows = AuditLog::where('id', '>', $from)->where('subject_type', AuditRules::SUBJECT)->orderBy('id')->get();
        $this->assertSame(
            [AuditLog::ACTION_CREATE, AuditLog::ACTION_UPDATE, AuditLog::ACTION_DELETE],
            $rows->pluck('action')->all(),
        );
        $this->assertSame('admin', $rows[0]->module);
        $this->assertSame('click · * · @alice', $rows[0]->subject_label);
        $this->assertSame($this->admin->id, $rows[0]->user_id);
        $this->assertFalse($rows[0]->new_values['enabled']);
        $this->assertNotNull($rows[0]->new_values['expires_at']);

        // სხვა ჩანაწერის ცვლილება კი ისევ გამორთულია
        Movie::create(['year' => 2020]);
        $this->assertSame(0, AuditLog::where('id', '>', $from)->where('subject_type', 'movie')->count());
    }

    public function test_the_protected_kind_and_impossible_cells_are_rejected(): void
    {
        $bad = [
            ['kind' => 'chat_delete', 'state' => 'off'],
            ['kind' => 'nonsense', 'state' => 'off'],
            ['kind' => 'click', 'state' => 'sometimes'],
            ['kind' => 'click', 'module' => 'nowhere', 'state' => 'off'],
            ['kind' => 'click', 'user_id' => 999999, 'state' => 'off'],
            // შესვლას მოდული არ აქვს; ვადა მხოლოდ გამორთვას ეკუთვნის
            ['kind' => 'login', 'module' => 'account', 'state' => 'off'],
            ['kind' => 'click', 'state' => 'on', 'until' => 'hour'],
            ['kind' => 'click', 'state' => 'off', 'until' => 'forever'],
        ];

        foreach ($bad as $rule) {
            $this->save([$rule])->assertStatus(422);
        }

        $this->assertSame(0, AuditRule::count());
        $this->assertTrue(AuditRules::enabled(AuditLog::ACTION_CHAT_DELETE, 'chat', $this->alice->id));

        // ხელით შეცვლილი ბაზაც ვერ გამორთავს დაცულს
        AuditRule::create(['kind' => 'chat_delete', 'enabled' => false]);
        AuditRules::flush();
        $this->assertTrue(AuditRules::enabled(AuditLog::ACTION_CHAT_DELETE, 'chat', $this->alice->id));
    }

    public function test_only_the_super_admin_manages_the_rules(): void
    {
        $this->actingAs($this->alice)->getJson('/api/admin/audit/rules')->assertForbidden();
        $this->actingAs($this->alice)->putJson('/api/admin/audit/rules', ['rules' => [['kind' => 'click', 'state' => 'off']]])
            ->assertForbidden();

        $this->assertTrue(AuditRules::enabled(AuditLog::ACTION_CLICK));
    }

    public function test_me_tells_the_spa_what_is_on_and_where_it_differs(): void
    {
        $this->actingAs($this->alice)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('data.audit_kinds', ['visit', 'refresh', 'open', 'click'])
            ->assertJsonPath('data.audit_paths', []);

        AuditRules::apply([
            ['kind' => 'click', 'state' => 'off'],
            ['kind' => 'click', 'module' => 'movie', 'user_id' => $this->alice->id, 'state' => 'on'],
            ['kind' => 'refresh', 'user_id' => $this->alice->id, 'state' => 'off'],
            ['kind' => 'visit', 'module' => 'book', 'state' => 'off'],
            ['kind' => 'visit', 'module' => 'admin', 'state' => 'off'],
            // სხვისი წესი ამ ანგარიშის პასუხს არ ცვლის
            ['kind' => 'open', 'module' => 'movie', 'user_id' => $this->bob->id, 'state' => 'off'],
        ]);

        $me = $this->actingAs($this->alice)->getJson('/api/auth/me')->assertOk()->json('data');
        $this->assertSame(['visit', 'open'], $me['audit_kinds']);
        $this->assertSame(['movies' => true], $me['audit_paths']['click']);
        $this->assertEqualsCanonicalizing(
            ['books', 'users', 'roles', 'requests', 'purge', 'audit'],
            array_keys($me['audit_paths']['visit']),
        );
        $this->assertSame([false], array_values(array_unique($me['audit_paths']['visit'])));
        $this->assertArrayNotHasKey('open', $me['audit_paths']);

        $this->assertSame(['movies' => false], $this->actingAs($this->bob)->getJson('/api/auth/me')->json('data.audit_paths.open'));
    }

    public function test_a_deleted_module_takes_its_rules_with_it(): void
    {
        AuditRules::apply([
            ['kind' => 'click', 'module' => 'personal', 'state' => 'off'],
            ['kind' => 'click', 'module' => 'movie', 'state' => 'off'],
        ]);

        Module::where('key', 'personal')->firstOrFail()->delete();

        $this->assertSame(['movie'], AuditRule::pluck('module')->all());
        $this->assertTrue(AuditRules::decide('click', 'personal'));
    }
}
