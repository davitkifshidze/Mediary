<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **ჟანრის ფერი და ხატულა** (Tasks §24.3) — ოთხივე ლექსიკონი ერთი წესით.
 */
class GenreColorTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $user = User::create([
            'name' => 'gio',
            'username' => 'gio',
            'email' => 'gio@example.com',
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', ['game', 'book', 'song', 'board_game'])->pluck('id')->all());
        $this->actingAs($user->refresh());
    }

    /** თამაშის ნაგულისხმევ ჟანრებს ხატულა და ფერი თან მოჰყვება */
    public function test_default_game_genres_carry_an_icon_and_a_colour(): void
    {
        $genres = collect($this->getJson('/api/game-genres')->assertOk()->json('data'))->keyBy('key');

        $this->assertSame('Swords', $genres['rpg']['icon']);
        $this->assertSame('c8', $genres['rpg']['color']);
        $this->assertSame('Crosshair', $genres['shooter']['icon']);
        $this->assertSame('Castle', $genres['strategy']['icon']);
        $this->assertNotNull($genres['horror']['color']);
    }

    /** ფერი იწერება და იკითხება ოთხივე ლექსიკონზე */
    public function test_a_colour_round_trips_on_every_genre_dictionary(): void
    {
        foreach (['/api/game-genres', '/api/book-genres', '/api/song-genres', '/api/board-game-genres'] as $base) {
            $id = $this->postJson($base, ['name_ka' => 'ახალი', 'name_en' => 'New', 'icon' => 'Star', 'color' => 'c3'])
                ->assertCreated()
                ->assertJsonPath('data.color', 'c3')
                ->json('data.id');

            $this->putJson("{$base}/{$id}", ['name_ka' => 'ახალი', 'name_en' => 'New', 'color' => '#2f6b8f'])
                ->assertOk()
                ->assertJsonPath('data.color', '#2f6b8f');

            $this->putJson("{$base}/{$id}", ['name_ka' => 'ახალი', 'name_en' => 'New', 'color' => null])
                ->assertOk()
                ->assertJsonPath('data.color', null);
        }
    }

    /** უცნობი ფორმატი — 422 */
    public function test_an_unknown_colour_is_rejected(): void
    {
        $this->postJson('/api/song-genres', ['name_ka' => 'ა', 'name_en' => 'A', 'color' => 'blue'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('color');
    }
}
