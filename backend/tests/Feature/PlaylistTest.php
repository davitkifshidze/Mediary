<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Playlist;
use App\Models\Song;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * პლეილისტები — `song` მოდულის ნაწილი (2026-09-03-მდე ვიდეოებს იკრებდა).
 *
 * ტესტები ნაკრებსა და **ორივე დონის თანმიმდევრობას** ამოწმებს, პლუს მფლობელობას.
 */
class PlaylistTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private User $other;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('mona', ['song']);
        $this->other = $this->makeUser('otto', ['song']);
    }

    private function makeUser(string $name, array $modules): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', $modules)->pluck('id')->all());

        return $user->refresh();
    }

    private function song(User $owner, string $title, string $id): Song
    {
        return Song::create([
            'user_id' => $owner->id,
            'title' => $title,
            'url' => "https://youtu.be/{$id}",
            'platform' => 'youtube',
            'external_id' => $id,
        ]);
    }

    public function test_module_gate_and_crud(): void
    {
        $outsider = $this->makeUser('nomodule', []);
        $this->actingAs($outsider)->getJson('/api/playlists')->assertStatus(403);

        $created = $this->actingAs($this->user)
            ->postJson('/api/playlists', ['name' => 'გზაში'])
            ->assertStatus(201)
            ->assertJsonPath('data.name', 'გზაში')
            // 16.5 — ხილვადობა default-ად პირადია
            ->assertJsonPath('data.visibility', 'private')
            ->assertJsonPath('data.songs_count', 0)
            ->json('data.id');

        $this->actingAs($this->user)
            ->patchJson("/api/playlists/{$created}", ['name' => 'გზაში 2', 'visibility' => 'public'])
            ->assertOk()
            ->assertJsonPath('data.name', 'გზაში 2')
            ->assertJsonPath('data.visibility', 'public');

        $this->actingAs($this->user)->deleteJson("/api/playlists/{$created}")->assertNoContent();
        $this->assertSame(0, Playlist::withoutGlobalScope('owner')->count());
    }

    /** ერთ ანგარიშზე ორი ერთნაირი სახელი — 422, სხვა ანგარიშზე კი დასაშვებია */
    public function test_name_is_unique_per_account(): void
    {
        $this->actingAs($this->user)->postJson('/api/playlists', ['name' => 'Rock'])->assertStatus(201);

        $this->actingAs($this->user)
            ->postJson('/api/playlists', ['name' => 'Rock'])
            ->assertStatus(422);

        // სხვისი პლეილისტი იმავე სახელით სრულიად ნორმალურია
        $this->actingAs($this->other)->postJson('/api/playlists', ['name' => 'Rock'])->assertStatus(201);
    }

    /** სიმღერების სია ერთი `PUT`-ია: დამატება, მოშორება და გადალაგება ერთად */
    public function test_songs_are_set_with_their_order(): void
    {
        $a = $this->song($this->user, 'A', 'aaaaaaaaaaa');
        $b = $this->song($this->user, 'B', 'bbbbbbbbbbb');
        $c = $this->song($this->user, 'C', 'ccccccccccc');

        $id = $this->actingAs($this->user)
            ->postJson('/api/playlists', ['name' => 'Mix'])
            ->json('data.id');

        $this->actingAs($this->user)
            ->putJson("/api/playlists/{$id}/songs", ['song_ids' => [$c->id, $a->id, $b->id]])
            ->assertOk()
            ->assertJsonPath('data.songs.0.id', $c->id)
            ->assertJsonPath('data.songs.1.id', $a->id)
            ->assertJsonPath('data.songs.2.id', $b->id);

        // გადალაგება + ერთის მოშორება იმავე რექვესთით
        $this->actingAs($this->user)
            ->putJson("/api/playlists/{$id}/songs", ['song_ids' => [$b->id, $c->id]])
            ->assertOk()
            ->assertJsonCount(2, 'data.songs')
            ->assertJsonPath('data.songs.0.id', $b->id)
            ->assertJsonPath('data.songs.1.id', $c->id);

        // ცარიელი სია პლეილისტს ასუფთავებს, სიმღერებს კი არ შლის
        $this->actingAs($this->user)
            ->putJson("/api/playlists/{$id}/songs", ['song_ids' => []])
            ->assertOk()
            ->assertJsonCount(0, 'data.songs');

        $this->assertSame(3, Song::withoutGlobalScope('owner')->count());
    }

    /** დუბლი ერთ პლეილისტში ერთხელაა (pivot-ის unique) */
    public function test_duplicate_ids_are_collapsed(): void
    {
        $a = $this->song($this->user, 'A', 'aaaaaaaaaaa');

        $id = $this->actingAs($this->user)->postJson('/api/playlists', ['name' => 'Mix'])->json('data.id');

        $this->actingAs($this->user)
            ->putJson("/api/playlists/{$id}/songs", ['song_ids' => [$a->id, $a->id]])
            ->assertOk()
            ->assertJsonCount(1, 'data.songs');
    }

    /** ⚠️ სხვისი სიმღერის id ჩუმად გამოვარდება, სხვისი პლეილისტი კი 404-ია */
    public function test_ownership_is_enforced_on_both_sides(): void
    {
        $mine = $this->song($this->user, 'Mine', 'aaaaaaaaaaa');
        $theirs = $this->song($this->other, 'Theirs', 'bbbbbbbbbbb');

        $id = $this->actingAs($this->user)->postJson('/api/playlists', ['name' => 'Mix'])->json('data.id');

        $this->actingAs($this->user)
            ->putJson("/api/playlists/{$id}/songs", ['song_ids' => [$mine->id, $theirs->id]])
            ->assertOk()
            ->assertJsonCount(1, 'data.songs')
            ->assertJsonPath('data.songs.0.id', $mine->id);

        $this->actingAs($this->other)->getJson("/api/playlists/{$id}")->assertStatus(404);
        $this->actingAs($this->other)->deleteJson("/api/playlists/{$id}")->assertStatus(404);
    }

    /** პლეილისტების რიგი — `sort_order` მოწოდებული თანმიმდევრობით */
    public function test_playlists_can_be_reordered(): void
    {
        $first = $this->actingAs($this->user)->postJson('/api/playlists', ['name' => 'One'])->json('data.id');
        $second = $this->actingAs($this->user)->postJson('/api/playlists', ['name' => 'Two'])->json('data.id');

        // ახალი ბოლოში დგება
        $this->actingAs($this->user)
            ->getJson('/api/playlists')
            ->assertJsonPath('data.0.id', $first)
            ->assertJsonPath('data.1.id', $second);

        $this->actingAs($this->user)
            ->postJson('/api/playlists/reorder', ['ids' => [$second, $first]])
            ->assertOk()
            ->assertJsonPath('data.0.id', $second)
            ->assertJsonPath('data.1.id', $first);
    }

    /**
     * მეორე მიმართულება — ერთი სიმღერა რამდენიმე პლეილისტში.
     * ახალ პლეილისტში ბოლოში მიდგება, სადაც უკვე იყო — პოზიციას ინარჩუნებს.
     */
    public function test_a_song_can_belong_to_several_playlists(): void
    {
        $a = $this->song($this->user, 'A', 'aaaaaaaaaaa');
        $b = $this->song($this->user, 'B', 'bbbbbbbbbbb');

        $rock = $this->actingAs($this->user)->postJson('/api/playlists', ['name' => 'Rock'])->json('data.id');
        $chill = $this->actingAs($this->user)->postJson('/api/playlists', ['name' => 'Chill'])->json('data.id');

        // Rock-ში უკვე არის ერთი სიმღერა — `b` მეორე პოზიციაზე უნდა დაჯდეს
        $this->actingAs($this->user)
            ->putJson("/api/playlists/{$rock}/songs", ['song_ids' => [$a->id]])
            ->assertOk();

        $this->actingAs($this->user)
            ->putJson("/api/songs/{$b->id}/playlists", ['playlist_ids' => [$rock, $chill]])
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->actingAs($this->user)
            ->getJson("/api/playlists/{$rock}")
            ->assertJsonPath('data.songs.0.id', $a->id)
            ->assertJsonPath('data.songs.1.id', $b->id);

        // მოშორება იმავე endpoint-ით — ცარიელი სია ყველგან ხსნის
        $this->actingAs($this->user)
            ->putJson("/api/songs/{$b->id}/playlists", ['playlist_ids' => []])
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->actingAs($this->user)
            ->getJson("/api/playlists/{$chill}")
            ->assertJsonCount(0, 'data.songs');
    }

    /** სიმღერის წაშლა პლეილისტიდანაც ხსნის (FK cascade), პლეილისტი რჩება */
    public function test_deleting_a_song_removes_it_from_playlists(): void
    {
        $a = $this->song($this->user, 'A', 'aaaaaaaaaaa');

        $id = $this->actingAs($this->user)->postJson('/api/playlists', ['name' => 'Mix'])->json('data.id');
        $this->actingAs($this->user)
            ->putJson("/api/playlists/{$id}/songs", ['song_ids' => [$a->id]])
            ->assertOk();

        $this->actingAs($this->user)->deleteJson("/api/songs/{$a->id}")->assertNoContent();

        $this->actingAs($this->user)
            ->getJson("/api/playlists/{$id}")
            ->assertOk()
            ->assertJsonCount(0, 'data.songs');
    }
}
