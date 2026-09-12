<?php

namespace Tests\Feature;

use App\Models\CastMember;
use App\Models\CastMemberTag;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * მსახიობის საძიებო ტეგები (Tasks §7.5).
 *
 * ⚠️ **მთავარი, რაც აქ იმოწმება:** `cast_members` გლობალური ლექსიკონია, ე.ი.
 * ტეგები **მომხმარებლისაა** და ორი ანგარიში ერთმანეთს არ უნდა ხედავდეს.
 * სწორედ ამიტომ არის ცალკე ცხრილი და არა სვეტი მსახიობზე.
 */
class ActorTagsTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $name): User
    {
        return User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
    }

    private function actor(): CastMember
    {
        return CastMember::create(['name' => 'Keanu Reeves', 'slug' => 'keanu-reeves']);
    }

    public function test_tags_are_saved_and_returned_on_the_actor_page(): void
    {
        $this->seed(ModulesSeeder::class);
        $user = $this->user('tagger');
        $actor = $this->actor();

        $this->actingAs($user)
            ->putJson("/api/cast/{$actor->id}/tags", ['tags' => ['პორტრეტი', 'John Wick']])
            ->assertOk()
            ->assertJsonPath('tags', ['პორტრეტი', 'John Wick']);

        $this->actingAs($user)
            ->getJson("/api/cast/{$actor->id}")
            ->assertOk()
            ->assertJsonPath('actor.tags', ['პორტრეტი', 'John Wick']);
    }

    /** ⚠️ ორი ანგარიში ერთსა და იმავე მსახიობზე — ორი სხვადასხვა ნაკრები */
    public function test_tags_are_per_user_not_global(): void
    {
        $this->seed(ModulesSeeder::class);
        $actor = $this->actor();
        $a = $this->user('one');
        $b = $this->user('two');

        $this->actingAs($a)->putJson("/api/cast/{$actor->id}/tags", ['tags' => ['red carpet']])->assertOk();
        $this->actingAs($b)->putJson("/api/cast/{$actor->id}/tags", ['tags' => ['black suit']])->assertOk();

        $this->actingAs($a)->getJson("/api/cast/{$actor->id}")->assertJsonPath('actor.tags', ['red carpet']);
        $this->actingAs($b)->getJson("/api/cast/{$actor->id}")->assertJsonPath('actor.tags', ['black suit']);

        // ორივე რიგი ცალ-ცალკე არსებობს — გადაწერა არ მომხდარა
        $this->assertSame(2, CastMemberTag::withoutGlobalScope('owner')->count());
    }

    /** დუბლი იჭრება იმავე წესით, რითაც ყველა სხვა მოდულის ტეგი */
    public function test_duplicate_tags_are_collapsed(): void
    {
        $this->seed(ModulesSeeder::class);
        $user = $this->user('dup');
        $actor = $this->actor();

        $this->actingAs($user)
            ->putJson("/api/cast/{$actor->id}/tags", ['tags' => ['Portrait', 'portrait', '  PORTRAIT ', 'suit']])
            ->assertOk()
            // ძველი რჩება, ახალი იშლება
            ->assertJsonPath('tags', ['Portrait', 'suit']);
    }

    /** ცარიელი სია რიგს შლის — „არ მაქვს" და „ცარიელი მაქვს" ერთი და იგივეა */
    public function test_an_empty_list_removes_the_row(): void
    {
        $this->seed(ModulesSeeder::class);
        $user = $this->user('empty');
        $actor = $this->actor();

        $this->actingAs($user)->putJson("/api/cast/{$actor->id}/tags", ['tags' => ['x']])->assertOk();
        $this->assertSame(1, CastMemberTag::withoutGlobalScope('owner')->count());

        $this->actingAs($user)->putJson("/api/cast/{$actor->id}/tags", ['tags' => []])->assertOk();
        $this->assertSame(0, CastMemberTag::withoutGlobalScope('owner')->count());
    }

    public function test_tags_require_a_session(): void
    {
        $actor = $this->actor();
        $this->putJson("/api/cast/{$actor->id}/tags", ['tags' => ['x']])->assertStatus(401);
    }
}
