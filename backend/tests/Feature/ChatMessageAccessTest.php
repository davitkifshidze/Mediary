<?php

namespace Tests\Feature;

use App\Models\Message;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **ჩატის წერილზე მოქმედებები: წაშლილი წერილი, დაბლოკილი წყვილი, გაზიარებული ბარათი.**
 *
 * ⚠️ „ორივესთვის წაშლა" რიგს ტოვებს (`removed_at`) — სია მას ფილტრავს, მაგრამ
 * რეაქცია, პინი, „დაამატე ჩემთანაც" და ფაილი მხოლოდ მონაწილეობას ამოწმებდა.
 *
 * ⚠️ გაზიარებული ბარათი ხილვადობის სამივე ფენას და მფლობელის დამალულ ველებს
 * ემორჩილება — როგორც საჯარო პროფილი.
 */
class ChatMessageAccessTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;

    private User $bob;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->alice = $this->makeUser('alice');
        $this->bob = $this->makeUser('bob');
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name, 'username' => $name,
            'email' => "{$name}@example.com", 'password' => 'password',
        ]);
        $user->forceFill(['profile_visibility' => 'public'])->save();
        $user->modules()->sync(Module::pluck('id')->all());

        return $user->refresh();
    }

    private function conversation(): int
    {
        return $this->actingAs($this->alice)->postJson('/api/chat/with/bob')->assertOk()->json('id');
    }

    public function test_a_message_removed_for_both_takes_no_reaction_pin_or_file(): void
    {
        Storage::fake('private');
        $id = $this->conversation();

        $text = $this->actingAs($this->alice)->postJson("/api/chat/{$id}", ['body' => 'hi'])->assertCreated()->json('data.id');
        $image = $this->actingAs($this->alice)
            ->post("/api/chat/{$id}", ['type' => 'image', 'file' => UploadedFile::fake()->image('cat.jpg')->size(10)])
            ->assertCreated()->json('data.id');

        // ჯერ ყველაფერი მუშაობს
        $this->actingAs($this->bob)->putJson("/api/chat/messages/{$text}/reaction", ['emoji' => 'like'])->assertOk();
        $this->actingAs($this->bob)->get("/api/chat/files/{$image}")->assertOk();

        foreach ([$text, $image] as $message) {
            $this->actingAs($this->alice)->deleteJson("/api/chat/messages/{$message}", ['scope' => 'both'])->assertSuccessful();
        }

        $this->actingAs($this->bob)->putJson("/api/chat/messages/{$text}/reaction", ['emoji' => 'love'])->assertNotFound();
        $this->actingAs($this->bob)->patchJson("/api/chat/messages/{$text}/pin", ['pinned' => true])->assertNotFound();
        $this->actingAs($this->bob)->get("/api/chat/files/{$image}")->assertNotFound();
        $this->actingAs($this->alice)->get("/api/chat/files/{$image}")->assertNotFound();
        $this->assertNull(Message::findOrFail($text)->pinned_at);
    }

    public function test_a_message_hidden_only_for_me_is_gone_for_me_alone(): void
    {
        $id = $this->conversation();
        $text = $this->actingAs($this->alice)->postJson("/api/chat/{$id}", ['body' => 'hi'])->assertCreated()->json('data.id');

        $this->actingAs($this->bob)->deleteJson("/api/chat/messages/{$text}", ['scope' => 'self'])->assertSuccessful();

        $this->actingAs($this->bob)->putJson("/api/chat/messages/{$text}/reaction", ['emoji' => 'like'])->assertNotFound();
        $this->actingAs($this->alice)->putJson("/api/chat/messages/{$text}/reaction", ['emoji' => 'like'])->assertOk();
    }

    public function test_a_shared_record_of_a_removed_message_cannot_be_saved(): void
    {
        $movie = Movie::create(['user_id' => $this->alice->id, 'tmdb_id' => 77, 'year' => 2000, 'visibility' => 'private']);
        $movie->translations()->create(['locale' => 'en', 'title' => 'Shared']);
        $id = $this->conversation();
        $message = $this->actingAs($this->alice)->postJson("/api/chat/{$id}", ['domain' => 'movie', 'record_id' => $movie->id])
            ->assertCreated()->json('data.id');

        $this->actingAs($this->alice)->deleteJson("/api/chat/messages/{$message}", ['scope' => 'both'])->assertSuccessful();

        $this->actingAs($this->bob)->postJson("/api/chat/messages/{$message}/save")->assertNotFound();
        $this->assertSame(0, Movie::withoutGlobalScopes()->where('user_id', $this->bob->id)->count());
    }

    public function test_a_blocked_pair_can_neither_react_pin_nor_change_the_theme(): void
    {
        $id = $this->conversation();
        $text = $this->actingAs($this->alice)->postJson("/api/chat/{$id}", ['body' => 'hi'])->assertCreated()->json('data.id');

        $this->actingAs($this->alice)->putJson('/api/chat/block/bob', ['blocked' => true])->assertOk();

        foreach ([$this->alice, $this->bob] as $user) {
            $this->actingAs($user)->putJson("/api/chat/messages/{$text}/reaction", ['emoji' => 'like'])
                ->assertForbidden()->assertJsonPath('message', 'chat_blocked');
            $this->actingAs($user)->patchJson("/api/chat/messages/{$text}/pin", ['pinned' => true])
                ->assertForbidden()->assertJsonPath('message', 'chat_blocked');
            $this->actingAs($user)->putJson("/api/chat/{$id}/theme", ['theme' => null])
                ->assertForbidden()->assertJsonPath('message', 'chat_blocked');
        }

        // ჩემი ხედის პარამეტრები (დადუმება) დაბლოკვას არ ეხება
        $this->actingAs($this->bob)->putJson("/api/chat/{$id}/mute", ['muted' => true])->assertOk();
    }

    public function test_a_shared_card_follows_the_profile_module_and_hidden_fields(): void
    {
        $movieModule = Module::where('key', 'movie')->value('id');
        $this->alice->modules()->updateExistingPivot($movieModule, ['is_public' => true]);

        $movie = Movie::create(['user_id' => $this->alice->id, 'tmdb_id' => 78, 'year' => 2001, 'visibility' => 'public', 'my_rating' => 9]);
        $movie->translations()->create(['locale' => 'en', 'title' => 'Public one']);
        $id = $this->conversation();
        $this->actingAs($this->alice)->postJson("/api/chat/{$id}", ['domain' => 'movie', 'record_id' => $movie->id])->assertCreated();

        $card = fn () => $this->actingAs($this->bob)->getJson("/api/chat/{$id}")->assertOk()->json('data.0.record.card');

        $this->assertEquals(9, $card()['my_rating']);

        // დამალული ველი — ბარათზეც დამალულია
        $this->actingAs($this->alice)->putJson('/api/modules/movie/fields', ['fields' => ['rating' => ['public' => false]]])->assertOk();
        $this->assertNull($card()['my_rating'] ?? null);

        // მოდული აღარ არის საჯარო — მხოლოდ სათაური
        $this->alice->modules()->updateExistingPivot($movieModule, ['is_public' => false]);
        $this->assertNull($card());

        // პროფილი დახურულია — მხოლოდ სათაური, თუნდაც მოდული საჯარო იყოს
        $this->alice->modules()->updateExistingPivot($movieModule, ['is_public' => true]);
        $this->assertNotNull($card());
        $this->alice->forceFill(['profile_visibility' => 'private'])->save();
        $this->assertNull($card());

        // ავტორი საკუთარ ბარათს ყოველთვის ხედავს
        $this->assertNotNull($this->actingAs($this->alice)->getJson("/api/chat/{$id}")->json('data.0.record.card'));
    }
}
