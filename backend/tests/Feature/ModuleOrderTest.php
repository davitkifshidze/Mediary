<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Module;
use App\Models\Role;
use App\Models\User;
use App\Support\ModuleOrder;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **მოდულების რიგი — თითო მომხმარებელზე** (Tasks §36, Q27).
 *
 * პირადი რიგი `users.settings.module_order`-შია, საერთო (სუპერადმინის)
 * `modules.sort_order`-ში; ვისაც პირადი არ აქვს, საერთოს მიჰყვება. ტესტი
 * სამ ადგილს ერთად ამოწმებს — `GET /modules` (საიდბარი და `/modules`),
 * `GET /dashboard` (ბარათები) და ადმინის სია — რადგან §36.2-ის ხარვეზი
 * სწორედ ისაა, რომ ერთი სია სხვა რიგით იხატებოდა.
 */
class ModuleOrderTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $member;

    private User $other;

    /** ModulesSeeder-ის საერთო რიგი (`sort_order`, მერე `id`) */
    private const SEEDED = [
        'movie', 'series', 'anime', 'video', 'song', 'book', 'board_game',
        'game', 'gallery', 'note', 'bookmark', 'course', 'place',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->admin = User::factory()->create([
            'role_id' => Role::where('key', 'super_admin')->value('id'),
        ]);

        $enabled = Module::whereIn('key', ['movie', 'series', 'video', 'note'])->pluck('id')->all();
        $this->member = User::factory()->create();
        $this->member->modules()->sync($enabled);
        $this->other = User::factory()->create();
        $this->other->modules()->sync($enabled);
    }

    /** @return list<string> */
    private function modules(User $user): array
    {
        return $this->actingAs($user)->getJson('/api/modules')->assertOk()->json('data.*.key');
    }

    /** @return list<string> */
    private function cards(User $user): array
    {
        return $this->actingAs($user)->getJson('/api/dashboard')->assertOk()->json('data.*.key');
    }

    public function test_without_a_personal_order_the_shared_order_applies(): void
    {
        $this->assertSame(self::SEEDED, $this->modules($this->member));
        $this->assertSame(['movie', 'series', 'video', 'note'], $this->cards($this->member));
    }

    /**
     * ⚠️ **ერთი მოთხოვნა სამივე სიას ცვლის** და მხოლოდ ამ მომხმარებლისთვის.
     */
    public function test_a_personal_order_reaches_the_list_and_the_cards_of_that_user_only(): void
    {
        $order = ['note', 'video', ...array_values(array_diff(self::SEEDED, ['note', 'video']))];

        $this->actingAs($this->member)
            ->putJson('/api/modules/order', ['keys' => $order])
            ->assertOk()
            ->assertJsonPath('order', $order);

        $this->assertSame($order, $this->modules($this->member));
        $this->assertSame(['note', 'video', 'movie', 'series'], $this->cards($this->member));

        // მეორე ანგარიში ისევ საერთო რიგზეა
        $this->assertSame(self::SEEDED, $this->modules($this->other));
        $this->assertSame(['movie', 'series', 'video', 'note'], $this->cards($this->other));
    }

    /**
     * ⚠️ **რიგში არმყოფი მოდული ბოლოს ემატება და არ იკარგება** — მოგვიანებით
     * გააქტიურებული ან §37-ით შექმნილი; მათ შორის კი საერთო რიგი მოქმედებს.
     */
    public function test_a_module_missing_from_the_order_goes_last_and_is_not_lost(): void
    {
        $this->actingAs($this->member)
            ->putJson('/api/modules/order', ['keys' => ['note', 'movie']])
            ->assertOk();

        $list = $this->modules($this->member);

        $this->assertSame(['note', 'movie'], array_slice($list, 0, 2));
        $this->assertSame(array_values(array_diff(self::SEEDED, ['note', 'movie'])), array_slice($list, 2));
        $this->assertCount(count(self::SEEDED), $list);
    }

    /**
     * ⚠️ **უცნობი ან ამ ანგარიშისთვის უხილავი გასაღები ჩუმად იშლება** —
     * გამორთული მოდული `/modules`-ზე მხოლოდ სუპერადმინს უჩანს, ე.ი. სხვისთვის
     * მისი ჩაწერა (და `422`-ით „ასეთი არსებობს" პასუხი) აზრს მოკლებულია.
     */
    public function test_unknown_and_invisible_keys_are_dropped(): void
    {
        Module::where('key', 'anime')->update(['is_active' => false]);

        $this->actingAs($this->member)
            ->putJson('/api/modules/order', ['keys' => ['anime', 'nope', 'video', 'movie']])
            ->assertOk()
            ->assertJsonPath('order', ['video', 'movie']);

        // სუპერადმინი გამორთულსაც ხედავს — მისთვის რიგში რჩება
        $this->actingAs($this->admin)
            ->putJson('/api/modules/order', ['keys' => ['anime', 'nope', 'video']])
            ->assertOk()
            ->assertJsonPath('order', ['anime', 'video']);
    }

    public function test_duplicates_and_an_empty_list_are_refused(): void
    {
        $this->actingAs($this->member)
            ->putJson('/api/modules/order', ['keys' => ['video', 'video']])
            ->assertStatus(422);

        $this->actingAs($this->member)
            ->putJson('/api/modules/order', ['keys' => []])
            ->assertStatus(422);
    }

    /**
     * ⚠️ **ეს არის ის ხაფანგი, რომელსაც `ModuleOrder::preserve()` ხურავს**:
     * SPA-ს `SettingsProvider` შესვლისას მთელ ბლობს იღებს და `/settings`-ზე
     * შენახვისას **მთლიანად** აბრუნებს — ე.ი. მასში შესვლის მომენტის (ან
     * საერთოდ არანაირი) რიგი ზის.
     */
    public function test_saving_the_settings_blob_never_overwrites_the_order(): void
    {
        $this->actingAs($this->member)
            ->putJson('/api/modules/order', ['keys' => ['note', 'video']])
            ->assertOk();

        // ძველი ასლი — სხვა რიგით
        $this->actingAs($this->member)
            ->putJson('/api/auth/settings', ['settings' => ['cardSize' => 'large', 'module_order' => ['movie']]])
            ->assertOk()
            ->assertJsonPath('settings.module_order', ['note', 'video']);

        // რიგის გარეშე ბლობიც მას არ შლის
        $this->actingAs($this->member)
            ->putJson('/api/auth/settings', ['settings' => ['cardSize' => 'compact']])
            ->assertOk();

        $this->assertSame(['note', 'video'], ModuleOrder::of($this->member->refresh()));
        $this->assertSame('compact', $this->member->settings['cardSize']);
    }

    /** ვისაც რიგი არ ჰქონია, ბლობით ვერ „გაუჩნდება" — ჩამწერი ერთია */
    public function test_the_settings_blob_cannot_create_an_order_either(): void
    {
        $this->actingAs($this->member)
            ->putJson('/api/auth/settings', ['settings' => ['module_order' => ['note', 'video']]])
            ->assertOk();

        $this->assertSame([], ModuleOrder::of($this->member->refresh()));
        $this->assertSame(self::SEEDED, $this->modules($this->member));
    }

    public function test_resetting_returns_to_the_shared_order(): void
    {
        $this->actingAs($this->member)
            ->putJson('/api/modules/order', ['keys' => ['note', 'video']])
            ->assertOk();

        $this->actingAs($this->member)->deleteJson('/api/modules/order')->assertOk();

        $this->assertSame(self::SEEDED, $this->modules($this->member));
        $this->assertArrayNotHasKey(ModuleOrder::SETTING, $this->member->refresh()->settings ?? []);
    }

    /**
     * ⚠️ **რიგი ინტერფეისის არჩევანია და ლოგში არ იწერება** — სტატუსებისა და
     * ლექსიკონების `reorder`-ის პრეცედენტი; ყოველი გადათრევა `settings`-ის
     * სრულ ბლობს ჩაწერდა ძველ/ახალ მნიშვნელობად.
     */
    public function test_the_personal_order_writes_no_audit_rows(): void
    {
        $before = AuditLog::count();

        $this->actingAs($this->member)
            ->putJson('/api/modules/order', ['keys' => ['note', 'video']])
            ->assertOk();

        $this->assertSame($before, AuditLog::count());
    }

    /**
     * **„ეს რიგი ყველასთვის ნაგულისხმევად"** — პირადი რიგის უქონელი (ახალი
     * ანგარიშიც) მიჰყვება, პირადი რიგის მქონე თავისას ინარჩუნებს.
     */
    public function test_the_super_admin_sets_the_default_for_everyone_without_a_personal_order(): void
    {
        $this->actingAs($this->other)
            ->putJson('/api/modules/order', ['keys' => ['series', 'movie']])
            ->assertOk();

        $default = ['place', 'note', ...array_values(array_diff(self::SEEDED, ['place', 'note']))];

        $this->actingAs($this->admin)
            ->putJson('/api/admin/modules/order', ['keys' => ['place', 'note']])
            ->assertOk()
            ->assertJsonPath('order', $default);

        $this->assertSame($default, $this->modules($this->member));
        $this->assertSame(['note', 'movie', 'series', 'video'], $this->cards($this->member));

        // ახალი ანგარიშიც
        $this->assertSame($default, $this->modules(User::factory()->create()));

        // პირადი რიგი ხელუხლებელია
        $this->assertSame(['series', 'movie'], array_slice($this->modules($this->other), 0, 2));

        // ერთი ლოგის რიგი და არა თითო მოდულზე
        $this->assertSame(1, AuditLog::where('subject_label', 'sort_order')->count());
    }

    public function test_only_a_super_admin_sets_the_default_and_unknown_keys_are_refused(): void
    {
        $this->actingAs($this->member)
            ->putJson('/api/admin/modules/order', ['keys' => ['note']])
            ->assertForbidden();

        $this->actingAs($this->admin)
            ->putJson('/api/admin/modules/order', ['keys' => ['note', 'nope']])
            ->assertStatus(422);

        $this->assertSame(self::SEEDED, $this->modules($this->member));
    }

    /**
     * ⚠️ **ადმინის სია მისი პირადი რიგითაა** — `/modules` მას ხატავს, ე.ი.
     * საერთო რიგით დალაგებული მის გადათრევას ყოველ ჩატვირთვაზე „უკან
     * დააბრუნებდა".
     */
    public function test_the_admin_list_follows_the_admins_own_order(): void
    {
        Module::where('key', 'anime')->update(['is_active' => false]);

        $this->actingAs($this->admin)
            ->putJson('/api/modules/order', ['keys' => ['anime', 'place']])
            ->assertOk();

        $keys = $this->actingAs($this->admin)->getJson('/api/admin/modules')->assertOk()->json('data.*.key');

        $this->assertSame(['anime', 'place'], array_slice($keys, 0, 2));
        $this->assertCount(count(self::SEEDED), $keys);
    }

    /**
     * ⚠️ **reseed საერთო რიგს აღარ აბრუნებს** (`COLORS`-ის წესი) — თორემ
     * ყველას ნაგულისხმევი რიგი ერთ `db:seed`-ზე ჩუმად იკარგებოდა.
     */
    public function test_reseeding_keeps_the_shared_order(): void
    {
        $this->actingAs($this->admin)
            ->putJson('/api/admin/modules/order', ['keys' => ['place', 'note']])
            ->assertOk();

        $this->seed(ModulesSeeder::class);

        $this->assertSame(['place', 'note'], array_slice($this->modules($this->member), 0, 2));
    }
}
