<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **ვიდეოს ტიპის ფერი** (Tasks §19.2) — სტატუსის ფერის იგივე ფორმატი.
 */
class VideoTypeColorTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        $this->user = User::create([
            'name' => 'vera',
            'username' => 'vera',
            'email' => 'vera@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::where('key', 'video')->pluck('id')->all());
        $this->actingAs($this->user->refresh());
    }

    /** ნაგულისხმევ ტიპებს ფერი თან მოჰყვება: ინფორმაციული — ლურჯი, გასართობი — იისფერი */
    public function test_default_types_carry_their_colours(): void
    {
        $types = $this->getJson('/api/video-types')->assertOk()->json('data');
        $byKey = array_column($types, 'color', 'key');

        $this->assertSame('c7', $byKey['info']);
        $this->assertSame('c8', $byKey['fun']);
    }

    /** ფერი იწერება და იკითხება; პალიტრის გასაღებიც და hex-იც */
    public function test_a_colour_can_be_chosen_and_changed(): void
    {
        $id = $this->postJson('/api/video-types', ['name_ka' => 'ლექცია', 'name_en' => 'Lecture', 'icon' => 'BookOpen', 'color' => 'c3'])
            ->assertCreated()
            ->assertJsonPath('data.color', 'c3')
            ->json('data.id');

        $this->putJson("/api/video-types/{$id}", ['name_ka' => 'ლექცია', 'name_en' => 'Lecture', 'color' => '#2f6b8f'])
            ->assertOk()
            ->assertJsonPath('data.color', '#2f6b8f');

        // ფერის გარეშე — ნაცრისფერი ბეჯი
        $this->putJson("/api/video-types/{$id}", ['name_ka' => 'ლექცია', 'name_en' => 'Lecture', 'color' => null])
            ->assertOk()
            ->assertJsonPath('data.color', null);
    }

    /** უცნობი ფორმატი — 422 */
    public function test_an_unknown_colour_is_rejected(): void
    {
        $this->postJson('/api/video-types', ['name_ka' => 'ა', 'name_en' => 'A', 'color' => 'red'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('color');
    }
}
