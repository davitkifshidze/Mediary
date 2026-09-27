<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Message;
use App\Models\MessageHide;
use App\Models\TrashedMessage;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * **ჩატის წერილი ურნაში (Tasks §29, ეტაპი 5).**
 *
 * ⚠️ მოწმდება ის, რაც აქ ჩუმად ტყდება: **ორივე სკოუპი წამშლელის ურნაშია**
 * (და მხოლოდ მისაში), **საბოლოო წაშლა მხოლოდ ურნის რიგს შლის** — წერილი
 * დამალული და ბაზაში რჩება (§4.6), ხოლო **ელემენტი თავის წერილთან ერთად
 * ქრება** (FK-ის კასკადი — `trash_entries`-ით ობლად დარჩებოდა).
 */
class TrashChatTest extends TestCase
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
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->forceFill(['profile_visibility' => 'public'])->save();

        return $user->refresh();
    }

    /** @return array{0: int, 1: int} საუბრისა და წერილის id */
    private function sent(string $body = 'გამარჯობა'): array
    {
        $conversation = $this->actingAs($this->alice)->postJson('/api/chat/with/bob')->assertOk()->json('id');
        $message = $this->actingAs($this->alice)->postJson("/api/chat/{$conversation}", ['body' => $body])->assertStatus(201)->json('data.id');

        return [$conversation, $message];
    }

    /** @return array<string, mixed>|null ჩატის წერილების ჯგუფი ამ ადამიანის ურნაში */
    private function chatGroup(User $user): ?array
    {
        return collect($this->actingAs($user)->getJson('/api/trash')->assertOk()->json('data'))
            ->firstWhere('kind', 'chat_message');
    }

    /** „მხოლოდ ჩემთან" — დამმალავის ურნაშია, აღდგენა წერილს მასთან აბრუნებს */
    public function test_a_message_hidden_for_me_goes_to_my_trash_and_back(): void
    {
        [$conversation, $message] = $this->sent();

        $this->actingAs($this->bob)->deleteJson("/api/chat/messages/{$message}", ['scope' => 'self'])->assertNoContent();

        $group = $this->chatGroup($this->bob);
        $this->assertSame('chat', $group['module']);
        $item = $group['items'][0];
        $this->assertSame(['გამარჯობა', 'alice', 'self', true], [$item['title'], $item['subtitle'], $item['scope'], $item['restorable']]);
        $this->assertNotNull($item['when'], 'როდის გაიგზავნა');

        // ⚠️ ავტორის ურნაში არაფერია — ეს ბობის წაშლაა
        $this->assertNull($this->chatGroup($this->alice));

        $this->actingAs($this->bob)->postJson("/api/trash/chat_message/{$item['id']}/restore")->assertOk();

        $this->actingAs($this->bob)->getJson("/api/chat/{$conversation}")->assertJsonCount(1, 'data');
        $this->assertSame(0, MessageHide::count());
        $this->assertSame(0, TrashedMessage::withoutGlobalScope('owner')->count());
        $this->assertTrue(AuditLog::where('action', AuditLog::ACTION_RESTORE)->where('subject_type', 'message')->where('subject_id', $message)->exists());
    }

    /** „ორივესთან" — ავტორის ურნაშია, აღდგენა წერილს ორივეს უბრუნებს */
    public function test_a_message_deleted_for_both_comes_back_for_both(): void
    {
        [$conversation, $message] = $this->sent();

        $this->actingAs($this->alice)->deleteJson("/api/chat/messages/{$message}", ['scope' => 'both'])->assertNoContent();

        $item = $this->chatGroup($this->alice)['items'][0];
        $this->assertSame(['both', 'bob'], [$item['scope'], $item['subtitle']]);
        $this->assertNull($this->chatGroup($this->bob));

        $this->actingAs($this->alice)->postJson("/api/trash/chat_message/{$item['id']}/restore")->assertOk();

        $this->actingAs($this->alice)->getJson("/api/chat/{$conversation}")->assertJsonCount(1, 'data');
        $this->actingAs($this->bob)->getJson("/api/chat/{$conversation}")->assertJsonCount(1, 'data');
        $this->assertNull(Message::find($message)->removed_at);
    }

    /**
     * ⚠️ **საბოლოო წაშლა წერილს არ აბრუნებს და არც ანადგურებს** — მხოლოდ
     * ურნის რიგი ქრება; დამალვა და თვითონ წერილი რჩება (§4.6).
     */
    public function test_deleting_forever_only_forgets_it(): void
    {
        [$conversation, $message] = $this->sent();
        $this->actingAs($this->bob)->deleteJson("/api/chat/messages/{$message}", ['scope' => 'self'])->assertNoContent();
        $id = $this->chatGroup($this->bob)['items'][0]['id'];

        $this->actingAs($this->bob)->deleteJson("/api/trash/chat_message/{$id}")->assertNoContent();

        $this->assertNull($this->chatGroup($this->bob));
        $this->actingAs($this->bob)->getJson("/api/chat/{$conversation}")->assertJsonCount(0, 'data');
        $this->assertSame(1, Message::count());
        $this->assertSame(1, MessageHide::count());
    }

    /** ურნის დაცლაც მხოლოდ ივიწყებს — წერილი ორივესთან წაშლილი რჩება */
    public function test_emptying_the_trash_keeps_the_message_removed(): void
    {
        [$conversation, $message] = $this->sent();
        $this->actingAs($this->alice)->deleteJson("/api/chat/messages/{$message}", ['scope' => 'both'])->assertNoContent();

        $this->actingAs($this->alice)->deleteJson('/api/trash', ['confirm' => 'DELETE'])->assertOk()->assertJsonPath('deleted', 1);

        $this->assertSame(0, TrashedMessage::withoutGlobalScope('owner')->count());
        $this->assertNotNull(Message::find($message)->removed_at);
        $this->actingAs($this->bob)->getJson("/api/chat/{$conversation}")->assertJsonCount(0, 'data');
    }

    /** ვადის გასვლა — ურნის რიგი ქრება, წერილი დამალული რჩება */
    public function test_prune_forgets_an_expired_message(): void
    {
        [, $message] = $this->sent();
        $this->actingAs($this->bob)->deleteJson("/api/chat/messages/{$message}", ['scope' => 'self'])->assertNoContent();
        TrashedMessage::withoutGlobalScope('owner')->update(['trashed_at' => now()->subDays(40)]);

        $this->artisan('trash:prune')->assertSuccessful();

        $this->assertSame(0, TrashedMessage::withoutGlobalScope('owner')->count());
        $this->assertSame(1, MessageHide::count());
    }

    /** სხვისი ურნის წერილი — 404 (და არა 403) */
    public function test_someone_elses_trashed_message_is_a_404(): void
    {
        [, $message] = $this->sent();
        $this->actingAs($this->bob)->deleteJson("/api/chat/messages/{$message}", ['scope' => 'self'])->assertNoContent();
        $id = TrashedMessage::withoutGlobalScope('owner')->sole()->id;

        $this->actingAs($this->alice)->postJson("/api/trash/chat_message/{$id}/restore")->assertNotFound();
        $this->actingAs($this->alice)->deleteJson("/api/trash/chat_message/{$id}")->assertNotFound();
        $this->assertSame(1, MessageHide::count());
    }

    /**
     * ⚠️ **მეორედ წაშლა ვადას თავიდან არ იწყებს** და ურნიდან საბოლოოდ
     * წაშლილს ისევ აღდგენადს არ ხდის.
     */
    public function test_deleting_again_neither_restarts_the_clock_nor_revives_it(): void
    {
        [, $message] = $this->sent();
        $this->actingAs($this->alice)->deleteJson("/api/chat/messages/{$message}", ['scope' => 'both'])->assertNoContent();

        $old = now()->subDays(10)->startOfSecond();
        TrashedMessage::withoutGlobalScope('owner')->update(['trashed_at' => $old]);
        Message::whereKey($message)->update(['removed_at' => $old]);

        $this->actingAs($this->alice)->deleteJson("/api/chat/messages/{$message}", ['scope' => 'both'])->assertNoContent();

        $this->assertEquals($old, TrashedMessage::withoutGlobalScope('owner')->sole()->trashed_at);
        $this->assertEquals($old, Message::find($message)->removed_at);

        // საბოლოოდ წაშლილი — ხელახლა „წაშლა" მას ურნაში აღარ აბრუნებს
        TrashedMessage::withoutGlobalScope('owner')->delete();
        $this->actingAs($this->alice)->deleteJson("/api/chat/messages/{$message}", ['scope' => 'both'])->assertNoContent();
        $this->assertSame(0, TrashedMessage::withoutGlobalScope('owner')->count());
    }

    /** ⚠️ ელემენტი თავის წერილთან ერთად ქრება — ობლად არ რჩება */
    public function test_the_item_disappears_with_its_message(): void
    {
        [, $message] = $this->sent();
        $this->actingAs($this->bob)->deleteJson("/api/chat/messages/{$message}", ['scope' => 'self'])->assertNoContent();

        Message::whereKey($message)->delete();

        $this->assertSame(0, TrashedMessage::withoutGlobalScope('owner')->count());
        $this->assertNull($this->chatGroup($this->bob));
    }

    /** ⚠️ დაშორებული ფაქტი (ასლის აღდგენის შემდეგ) — „აღარაფერია" და არა 500 */
    public function test_nothing_left_to_restore_is_said_out_loud(): void
    {
        [, $message] = $this->sent();
        $this->actingAs($this->bob)->deleteJson("/api/chat/messages/{$message}", ['scope' => 'self'])->assertNoContent();
        MessageHide::query()->delete();

        $item = $this->chatGroup($this->bob)['items'][0];
        $this->assertSame([false, 'already_present'], [$item['restorable'], $item['blocked']]);

        $this->actingAs($this->bob)->postJson("/api/trash/chat_message/{$item['id']}/restore")
            ->assertStatus(409)->assertJsonPath('message', 'already_present');
    }

    /** სია თითო წერილზე მოთხოვნას არ ხარჯავს — სათაური, თანამოსაუბრე და „აღდგება?" ერთი ჩატვირთვით */
    public function test_the_listing_does_not_grow_a_query_per_message(): void
    {
        $count = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->actingAs($this->bob)->getJson('/api/trash')->assertOk();
            DB::disableQueryLog();

            return count(DB::getQueryLog());
        };

        [, $first] = $this->sent('ერთი');
        $this->actingAs($this->bob)->deleteJson("/api/chat/messages/{$first}", ['scope' => 'self'])->assertNoContent();

        /* ⚠️ ჯერ ცარიელი გაზომვა — PERF-15-ის გაკვეთილი: მარშრუტი კონტროლერს
           ინახავს და მოთხოვნის მეხსიერება (`AlbumLock`, მომხმარებლის კავშირები)
           მეორე გაზომვაზე უკვე თბილია; ორივე რიცხვი თბილ მდგომარეობაში უნდა იყოს. */
        $count();
        $one = $count();

        foreach (['ორი', 'სამი', 'ოთხი', 'ხუთი'] as $body) {
            [, $id] = $this->sent($body);
            $this->actingAs($this->bob)->deleteJson("/api/chat/messages/{$id}", ['scope' => 'self'])->assertNoContent();
        }

        $this->assertGreaterThan(0, $one);
        $this->assertSame($one, $count());
    }

    /** მიგრაცია უკვე წაშლილს ურნაში ამატებს — მხოლოდ ვადის ფარგლებში */
    public function test_the_migration_backfills_recent_deletions_only(): void
    {
        [, $recent] = $this->sent('ახალი');
        [, $old] = $this->sent('ძველი');
        [, $removed] = $this->sent('ორივესთან');

        MessageHide::create(['message_id' => $recent, 'user_id' => $this->bob->id, 'hidden_at' => now()->subDays(3)]);
        MessageHide::create(['message_id' => $old, 'user_id' => $this->bob->id, 'hidden_at' => now()->subDays(45)]);
        Message::whereKey($removed)->update(['removed_at' => now()->subDay(), 'removed_by' => $this->alice->id]);

        Schema::drop('trashed_messages');
        (require database_path('migrations/2026_09_28_000004_extend_trash_to_chat_messages.php'))->up();

        $rows = TrashedMessage::withoutGlobalScope('owner')->orderBy('message_id')->get(['user_id', 'message_id', 'scope']);
        $this->assertSame([
            ['user_id' => $this->bob->id, 'message_id' => $recent, 'scope' => 'self'],
            ['user_id' => $this->alice->id, 'message_id' => $removed, 'scope' => 'both'],
        ], $rows->map(fn (TrashedMessage $row) => $row->only(['user_id', 'message_id', 'scope']))->all());
    }
}
