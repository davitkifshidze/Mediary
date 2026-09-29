<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **Tasks §34.5 — „მიწერე ადმინს".**
 *
 * ჩატი ორივე პროფილის საჯაროობას ითხოვს (409 `profile_not_public`), ე.ი.
 * დახურული პროფილით ადმინს ვერ მისწერდი — სწორედ მაშინ, როცა „ჩამირთე JPG"
 * უნდა ეთქვა. ახლა წყვილი „მომხმარებელი ↔ სუპერადმინი" ამ კარიბჭეს
 * **ორივე მიმართულებით** სცდება, დაბლოკვა კი მაინც მოქმედებს.
 */
class ChatSuperAdminTest extends TestCase
{
    use RefreshDatabase;

    private User $root;

    private User $alice;

    private User $bob;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        // სამივე **დახურული** პროფილით — ზუსტად ის მდგომარეობა, რომელსაც ხვრელი ეხებოდა
        $this->root = tap($this->makeUser('root'), fn (User $u) => $u->assignRole('super_admin')->save())->refresh();
        $this->alice = $this->makeUser('alice');
        $this->bob = $this->makeUser('bob');
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->forceFill(['profile_visibility' => 'private'])->save();

        return $user->refresh();
    }

    public function test_a_private_account_can_write_to_a_super_admin_and_get_an_answer(): void
    {
        $id = $this->actingAs($this->alice)->postJson('/api/chat/with/root')->assertOk()->json('id');

        $this->actingAs($this->alice)->postJson("/api/chat/{$id}", ['body' => 'მინდა ავტვირთო JPG — ჩამირთე'])
            ->assertCreated();

        // ⚠️ ორივე მიმართულებით — თორემ ადმინი ვერ უპასუხებდა
        $this->actingAs($this->root)->postJson("/api/chat/{$id}", ['body' => 'ჩაგირთე'])->assertCreated();

        // დახურული პროფილის სახელი ბმულად არ იხატება (404-ზე მიიყვანდა)
        $this->actingAs($this->root)->getJson("/api/chat/{$id}")
            ->assertOk()
            ->assertJsonPath('profile_public', false);
    }

    /** ⚠️ გამონაკლისი **მხოლოდ** სუპერადმინის წყვილია — ორ ჩვეულებრივს ისევ 409 */
    public function test_two_private_accounts_still_cannot_chat(): void
    {
        $this->actingAs($this->alice)->postJson('/api/chat/with/bob')
            ->assertStatus(409)
            ->assertJsonPath('message', 'profile_not_public');
    }

    /** ⚠️ დაბლოკვა მაინც მოქმედებს — ორივე მიმართულებით */
    public function test_blocking_still_applies_to_a_super_admin(): void
    {
        $id = $this->actingAs($this->alice)->postJson('/api/chat/with/root')->assertOk()->json('id');

        $this->actingAs($this->alice)->putJson('/api/chat/block/root', ['blocked' => true])->assertOk();

        $this->actingAs($this->root)->postJson("/api/chat/{$id}", ['body' => 'გამარჯობა'])
            ->assertStatus(403)
            ->assertJsonPath('message', 'chat_blocked');
        $this->actingAs($this->alice)->postJson("/api/chat/{$id}", ['body' => 'გამარჯობა'])
            ->assertStatus(403);
    }

    /**
     * ⚠️ **როლი გაგზავნის მომენტში მოწმდება** — როლს თუ დაკარგავს, ახალი
     * წერილი ჩვეულებრივ წესს ემორჩილება (ძველი მიმოწერა კი იკითხება).
     */
    public function test_the_exemption_ends_with_the_role(): void
    {
        $id = $this->actingAs($this->alice)->postJson('/api/chat/with/root')->assertOk()->json('id');
        $this->actingAs($this->alice)->postJson("/api/chat/{$id}", ['body' => 'პირველი'])->assertCreated();

        $this->root->assignRole('user')->save();

        $this->actingAs($this->alice->refresh())->postJson("/api/chat/{$id}", ['body' => 'მეორე'])
            ->assertStatus(409)
            ->assertJsonPath('message', 'profile_not_public');

        $this->assertCount(1, $this->actingAs($this->alice)->getJson("/api/chat/{$id}")->assertOk()->json('data'));
    }

    /** ვის მივწერო — აქტიური სუპერადმინები, ჩემს გარდა, ვიწრო ფორმით */
    public function test_the_admin_list_is_narrow_and_excludes_me(): void
    {
        $second = tap($this->makeUser('second'), fn (User $u) => $u->assignRole('super_admin')->save());
        $gone = tap($this->makeUser('gone'), fn (User $u) => $u->assignRole('super_admin')->save());
        $gone->forceFill(['is_active' => false])->save();

        $list = $this->actingAs($this->alice)->getJson('/api/chat/admins')->assertOk()->json('data');
        $this->assertSame(['root', 'second'], array_column($list, 'username'));
        $this->assertSame(['username', 'display_name', 'avatar_path'], array_keys($list[0]));

        $mine = $this->actingAs($this->root)->getJson('/api/chat/admins')->json('data');
        $this->assertSame(['second'], array_column($mine, 'username'));
        $this->assertNotNull($second);
    }
}
