<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Status;
use App\Models\User;
use App\Support\StatusDomain;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **სტატუსის ფერი** (Tasks §16).
 *
 * მოწმდება: ფერი ინახება და ბრუნდება; მხოლოდ პალიტრის გასაღები ან `#rrggbb`
 * გადის; ნაგულისხმევებს თავისი ფერი აქვს და ერთი როლის ორი სტატუსი („წაკითხული“,
 * „არქივი“) სხვადასხვა ფერისაა; „ნაგულისხმევების აღდგენა“ ფერსაც ავსებს, თუ `NULL`-ია;
 * მიგრაცია იმავეს აკეთებს ერთჯერადად.
 */
class StatusColorTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = User::create(['name' => 'keto', 'username' => 'keto', 'email' => 'keto@example.com', 'password' => 'password']);
        $this->user->modules()->sync(Module::whereIn('key', ['movie', 'bookmark'])->pluck('id')->all());
        $this->user->refresh();
    }

    public function test_a_colour_is_stored_and_validated(): void
    {
        $created = $this->actingAs($this->user)
            ->postJson('/api/statuses/movie', ['name_ka' => 'მიტოვებული', 'name_en' => 'Abandoned', 'role' => 'done', 'color' => 'c12'])
            ->assertStatus(201)
            ->assertJsonPath('data.color', 'c12')
            ->json('data');

        $this->actingAs($this->user)
            ->patchJson("/api/statuses/movie/{$created['id']}", ['name_ka' => 'მიტოვებული', 'name_en' => 'Abandoned', 'role' => 'done', 'color' => '#AA0000'])
            ->assertOk()
            ->assertJsonPath('data.color', '#AA0000');

        foreach (['red', 'c13', '#abc', 'c0'] as $bad) {
            $this->actingAs($this->user)
                ->postJson('/api/statuses/movie', ['name_ka' => 'x'.$bad, 'name_en' => 'y'.$bad, 'role' => 'todo', 'color' => $bad])
                ->assertStatus(422)
                ->assertJsonValidationErrors(['color']);
        }
    }

    public function test_defaults_carry_distinct_colours_per_role(): void
    {
        $list = collect($this->actingAs($this->user)->getJson('/api/statuses/bookmark')->assertOk()->json('data'))->keyBy('key');

        $this->assertSame('c3', $list['to_read']['color']);
        $this->assertSame('c4', $list['read']['color']);
        $this->assertSame('c12', $list['archived']['color']);
        $this->assertNotSame($list['read']['color'], $list['archived']['color'], 'ორი `done` სტატუსი ერთ ფერში ჩანდა');

        foreach (array_keys(StatusDomain::DOMAINS) as $domain) {
            foreach (StatusDomain::defaults($domain) as $default) {
                $this->assertNotEmpty($default['color'] ?? null, "{$domain}.{$default['key']} ფერის გარეშეა");
            }
        }
    }

    public function test_restoring_defaults_fills_a_missing_colour_and_the_migration_does_the_same(): void
    {
        $this->actingAs($this->user)->getJson('/api/statuses/bookmark')->assertOk();

        $archived = Status::withoutGlobalScopes()->where('user_id', $this->user->id)->where('module', 'bookmark')->where('key', 'archived')->firstOrFail();
        Status::withoutGlobalScopes()->whereKey($archived->id)->update(['color' => null]);

        $this->actingAs($this->user)->postJson('/api/statuses/bookmark/restore-defaults')->assertOk();
        $this->assertSame('c12', $archived->fresh()->color);

        // მიგრაცია — იგივე ერთჯერადად, ხელით არჩეული ფერი ხელუხლებელი
        Status::withoutGlobalScopes()->whereKey($archived->id)->update(['color' => null]);
        $read = Status::withoutGlobalScopes()->where('user_id', $this->user->id)->where('module', 'bookmark')->where('key', 'read')->firstOrFail();
        Status::withoutGlobalScopes()->whereKey($read->id)->update(['color' => '#123456']);

        (require database_path('migrations/2026_10_03_000003_fill_default_status_colors.php'))->up();

        $this->assertSame('c12', $archived->fresh()->color);
        $this->assertSame('#123456', $read->fresh()->color);
    }
}
