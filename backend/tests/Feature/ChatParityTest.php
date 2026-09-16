<?php

namespace Tests\Feature;

use App\Models\Message;
use App\Models\User;
use App\Services\Chat\ChatService;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **Tasks §10 — ჩატი Messenger-ის დონემდე.**
 *
 * აქ ის წესებია ჩამაგრებული, რომელთა დარღვევაც **ჩუმია**:
 *  · დადუმება **ბეჯს აჩუმებს, რიცხვს კი არ ცვლის** (§10.5);
 *  · პინი და რეაქცია `scopeVisibleTo()`-ს ემორჩილება, ე.ი. წაშლილი თავისით ცვივა;
 *  · თითო კაცზე **ერთი** რეაქცია, იმავე ემოჯის ხელახლა დაჭერა — მოხსნა (§10.10);
 *  · ნიკნეიმი **მხოლოდ ჩემს ხედშია** და ნამდვილ სახელს არ შლის (§10.11);
 *  · `around_id` **წაკითხულად არ ნიშნავს** (§10.8).
 */
class ChatParityTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;

    private User $bob;

    private int $conversation;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        $this->alice = $this->makeUser('alice');
        $this->bob = $this->makeUser('bob');

        $this->conversation = $this->actingAs($this->alice)
            ->postJson('/api/chat/with/bob')
            ->assertOk()
            ->json('id');
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->forceFill(['profile_visibility' => 'public'])->save();

        return $user->refresh();
    }

    /** ბობი წერს alice-ს — ე.ი. alice-სთვის ეს წაუკითხავია */
    private function fromBob(string $body = 'გამარჯობა'): int
    {
        return $this->actingAs($this->bob)
            ->postJson("/api/chat/{$this->conversation}", ['body' => $body])
            ->assertStatus(201)
            ->json('data.id');
    }

    /* ---------- §10.5 დადუმება ---------- */

    public function test_muting_silences_the_badge_but_keeps_the_row_honest(): void
    {
        $this->fromBob();

        $this->actingAs($this->alice)->getJson('/api/chat/unread')
            ->assertOk()
            ->assertJsonPath('unread', 1);

        $this->actingAs($this->alice)
            ->putJson("/api/chat/{$this->conversation}/mute", ['muted' => true])
            ->assertOk()
            ->assertJsonPath('muted', true);

        // ბეჯი გაჩუმდა…
        $this->actingAs($this->alice)->getJson('/api/chat/unread')
            ->assertOk()
            ->assertJsonPath('unread', 0);

        // …რიგის რიცხვი კი პატიოსანი დარჩა
        $this->actingAs($this->alice)->getJson('/api/chat')
            ->assertOk()
            ->assertJsonPath('data.0.unread', 1)
            ->assertJsonPath('data.0.muted', true)
            ->assertJsonPath('unread_total', 0);
    }

    /** ⚠️ გასული ვადა ჩუმად ითვლება ჩართულად — cron-ი არ სჭირდება */
    public function test_an_expired_mute_counts_as_unmuted(): void
    {
        $this->fromBob();

        $this->actingAs($this->alice)
            ->putJson("/api/chat/{$this->conversation}/mute", [
                'muted' => true,
                'until' => now()->subHour()->toIso8601String(),
            ])
            ->assertOk()
            ->assertJsonPath('muted', false);

        $this->actingAs($this->alice)->getJson('/api/chat/unread')->assertJsonPath('unread', 1);
    }

    /* ---------- §10.7 პინები ---------- */

    public function test_either_participant_can_pin_and_deleted_messages_drop_out(): void
    {
        $id = $this->fromBob();

        // ⚠️ **ავტორობა არ სჭირდება** — პინი დესტრუქციული არაა
        $this->actingAs($this->alice)
            ->patchJson("/api/chat/messages/{$id}/pin", ['pinned' => true])
            ->assertOk()
            ->assertJsonPath('data.pinned', true);

        $this->actingAs($this->alice)->getJson("/api/chat/{$this->conversation}/pins")
            ->assertOk()
            ->assertJsonCount(1, 'data');

        // ⚠️ „მხოლოდ ჩემთან" დამალვა პინების სიიდანაც აგდებს — მეორე ჩაწერის გარეშე
        $this->actingAs($this->alice)
            ->deleteJson("/api/chat/messages/{$id}", ['scope' => 'self'])
            ->assertNoContent();

        $this->actingAs($this->alice)->getJson("/api/chat/{$this->conversation}/pins")
            ->assertOk()
            ->assertJsonCount(0, 'data');

        // …ბობთან კი ის ისევ დაპინულია
        $this->actingAs($this->bob)->getJson("/api/chat/{$this->conversation}/pins")
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_the_pin_limit_is_enforced(): void
    {
        for ($i = 0; $i < ChatService::PIN_LIMIT; $i++) {
            $id = $this->fromBob("წერილი {$i}");
            $this->actingAs($this->alice)->patchJson("/api/chat/messages/{$id}/pin", ['pinned' => true])->assertOk();
        }

        $extra = $this->fromBob('ზედმეტი');

        $this->actingAs($this->alice)
            ->patchJson("/api/chat/messages/{$extra}/pin", ['pinned' => true])
            ->assertStatus(422)
            ->assertJsonPath('message', 'pin_limit_reached');
    }

    /* ---------- §10.10 რეაქციები ---------- */

    public function test_one_reaction_per_person_and_the_same_emoji_removes_it(): void
    {
        $id = $this->fromBob();

        $this->actingAs($this->alice)
            ->putJson("/api/chat/messages/{$id}/reaction", ['emoji' => '❤️'])
            ->assertOk()
            ->assertJsonPath('data.my_reaction', '❤️')
            ->assertJsonPath('data.reactions.❤️', 1);

        // სხვა ემოჯი **ანაცვლებს** და არა ემატება
        $this->actingAs($this->alice)
            ->putJson("/api/chat/messages/{$id}/reaction", ['emoji' => '😂'])
            ->assertOk()
            ->assertJsonPath('data.my_reaction', '😂')
            ->assertJsonMissingPath('data.reactions.❤️');

        // იმავეს ხელახლა დაჭერა — მოხსნა
        $this->actingAs($this->alice)
            ->putJson("/api/chat/messages/{$id}/reaction", ['emoji' => '😂'])
            ->assertOk()
            ->assertJsonPath('data.my_reaction', null);
    }

    /* ---------- §10.11 ნიკნეიმები ---------- */

    public function test_a_nickname_is_only_my_own_view(): void
    {
        $this->actingAs($this->alice)
            ->putJson("/api/chat/{$this->conversation}/nickname", ['nickname' => 'ბიჭო'])
            ->assertOk()
            ->assertJsonPath('nickname', 'ბიჭო');

        $this->actingAs($this->alice)->getJson("/api/chat/{$this->conversation}")
            ->assertOk()
            ->assertJsonPath('nickname', 'ბიჭო')
            // ⚠️ ნამდვილი სახელი პასუხში რჩება — ვინაობა არ იკარგება
            ->assertJsonPath('profile.username', 'bob');

        // მეორე მხარე ამას ვერ ხედავს
        $this->actingAs($this->bob)->getJson("/api/chat/{$this->conversation}")
            ->assertOk()
            ->assertJsonPath('nickname', null);

        // ცარიელი მნიშვნელობა შლის და არ წერს ცარიელ სტრიქონს
        $this->actingAs($this->alice)
            ->putJson("/api/chat/{$this->conversation}/nickname", ['nickname' => '  '])
            ->assertOk()
            ->assertJsonPath('nickname', null);
    }

    /* ---------- §10.9 ძებნა ---------- */

    public function test_search_skips_hidden_messages_and_finds_file_names(): void
    {
        $visible = $this->fromBob('ინფორმაცია ფილმზე');
        $hidden = $this->fromBob('ინფორმაცია სხვაზე');

        Message::whereKey($hidden)->update(['attachment_name' => null]);

        $this->actingAs($this->alice)
            ->deleteJson("/api/chat/messages/{$hidden}", ['scope' => 'self'])
            ->assertNoContent();

        $response = $this->actingAs($this->alice)
            ->getJson("/api/chat/{$this->conversation}/search?q=".urlencode('ინფორმაცია'))
            ->assertOk()
            ->assertJsonPath('total', 1);

        $this->assertSame($visible, $response->json('data.0.id'));
        $this->assertStringContainsString('ინფორმაცია', (string) $response->json('data.0.snippet'));
    }

    /* ---------- §10.8 კურსორი და §10.3 „ნანახია" ---------- */

    public function test_older_messages_load_by_cursor_and_a_jump_does_not_mark_read(): void
    {
        $ids = [];
        for ($i = 0; $i < 5; $i++) {
            $ids[] = $this->fromBob("წერილი {$i}");
        }

        $first = $this->actingAs($this->alice)
            ->getJson("/api/chat/{$this->conversation}?per_page=2")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.has_more', true);

        $older = $this->actingAs($this->alice)
            ->getJson("/api/chat/{$this->conversation}?per_page=2&before_id=".$first->json('meta.oldest_id'))
            ->assertOk()
            ->assertJsonCount(2, 'data');

        // გვერდები არ იკვეთება — კურსორი სწორედ ამისთვისაა
        $this->assertEmpty(array_intersect(
            array_column($first->json('data'), 'id'),
            array_column($older->json('data'), 'id'),
        ));

        // §10.3 — ბობმა ჯერ არ წაუკითხავს, ე.ი. მისთვის alice-ის ნიშანი ცარიელია
        $this->assertNotNull(
            $this->actingAs($this->alice)->getJson("/api/chat/{$this->conversation}")->json('other_read_at'),
        );
    }

    /**
     * ⚠️ **ისტორიაში ჩახტომა „ყველაფერი წავიკითხე" არ არის** (§10.8).
     */
    public function test_a_jump_leaves_the_unread_count_alone(): void
    {
        $ids = [];
        for ($i = 0; $i < 3; $i++) {
            $ids[] = $this->fromBob("წერილი {$i}");
        }

        $this->actingAs($this->alice)
            ->getJson("/api/chat/{$this->conversation}?around_id={$ids[0]}")
            ->assertOk();

        $this->actingAs($this->alice)->getJson('/api/chat/unread')
            ->assertOk()
            ->assertJsonPath('unread', 3);
    }

    /* ---------- §10.6 თემა ---------- */

    public function test_the_theme_is_shared_by_both_sides(): void
    {
        $this->actingAs($this->alice)
            ->putJson("/api/chat/{$this->conversation}/theme", ['theme' => 'ocean'])
            ->assertOk()
            ->assertJsonPath('theme', 'ocean');

        $this->actingAs($this->bob)->getJson("/api/chat/{$this->conversation}")
            ->assertOk()
            ->assertJsonPath('theme', 'ocean');

        // უცნობი გასაღები — ვალიდაციის შეცდომა და არა ჩუმად ჩაწერა
        $this->actingAs($this->alice)
            ->putJson("/api/chat/{$this->conversation}/theme", ['theme' => '#ff0000'])
            ->assertStatus(422);
    }
}
