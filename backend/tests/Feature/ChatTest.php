<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use App\Services\Chat\ChatService;
use Database\Seeders\ModulesSeeder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **Tasks §16.3 — ჩატი.**
 *
 * ტესტში ჩამაგრებულია ის, რაც ადვილად იშლება ჩუმად:
 *  · მიწერა **მხოლოდ ორ საჯარო პროფილს შორის**;
 *  · **დაბლოკვა ორივე მიმართულებით** კრძალავს წერას;
 *  · სხვისი საუბარი **404-ია** (და არა 403);
 *  · წაუკითხავში **საკუთარი** შეტყობინება არ ითვლება;
 *  · ერთსა და იმავე წყვილზე **მეორე საუბარი არ იქმნება**.
 */
class ChatTest extends TestCase
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

    private function makeUser(string $name, string $visibility = 'public'): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->forceFill(['profile_visibility' => $visibility])->save();

        return $user->refresh();
    }

    private function open(User $me, string $username): int
    {
        return $this->actingAs($me)
            ->postJson("/api/chat/with/{$username}")
            ->assertOk()
            ->json('id');
    }

    /* ---------- ძირითადი ნაკადი ---------- */

    public function test_conversation_is_created_once_and_messages_flow(): void
    {
        $id = $this->open($this->alice, 'bob');

        // ⚠️ მეორედ გახსნა **იმავე** საუბარს აბრუნებს და დუბლს არ ქმნის
        $this->assertSame($id, $this->open($this->alice, 'bob'));
        $this->assertSame($id, $this->open($this->bob, 'alice'));
        $this->assertSame(1, Conversation::count());

        $this->actingAs($this->alice)
            ->postJson("/api/chat/{$id}", ['body' => 'გამარჯობა'])
            ->assertStatus(201)
            ->assertJsonPath('data.body', 'გამარჯობა')
            ->assertJsonPath('data.mine', true);

        // მეორე მხარე ხედავს და მისთვის ეს **სხვისია**
        $this->actingAs($this->bob)
            ->getJson("/api/chat/{$id}")
            ->assertOk()
            ->assertJsonPath('data.0.body', 'გამარჯობა')
            ->assertJsonPath('data.0.mine', false)
            ->assertJsonPath('profile.username', 'alice');
    }

    /**
     * **ერთი წყვილი — ერთი საუბარი, და ამას სქემა იცავს** (Tasks BUG-07).
     *
     * ⚠️ `conversation_user`-ის unique (`conversation_id`, `user_id`) ამას
     * ვერ იჭერდა: ის „ერთი ადამიანი ერთ საუბარში ორჯერ არ არის"-ს ამბობს
     * და არა „ეს ორი ერთხელ ხვდება ერთმანეთს" — ე.ი. ორი პარალელური
     * გახსნა ორ სრულიად კანონიერ საუბარს ქმნიდა.
     */
    public function test_the_schema_refuses_a_second_conversation_for_the_same_pair(): void
    {
        $key = Conversation::pairKey($this->alice->id, $this->bob->id);
        Conversation::create(['pair_key' => $key]);

        $this->expectException(UniqueConstraintViolationException::class);
        Conversation::create(['pair_key' => $key]);
    }

    /** ⚠️ გასაღები მიმართულებისგან დამოუკიდებელია, თორემ A→B და B→A ორი რიგი იქნებოდა */
    public function test_the_pair_key_does_not_depend_on_who_starts(): void
    {
        $this->assertSame(
            Conversation::pairKey($this->alice->id, $this->bob->id),
            Conversation::pairKey($this->bob->id, $this->alice->id),
        );
    }

    /**
     * **რბოლა: ვიღაცამ ჩვენს `SELECT`-სა და `INSERT`-ს შორის მოასწრო** (BUG-07).
     *
     * ⚠️ სიმულაცია `DB::listen`-ითაა და ეს დროის გამო არის ასე: კონკურენტი
     * ზუსტად მაშინ იწერება, როცა `pair_key`-ის კითხვა უკვე გავიდა (ე.ი.
     * „ვერაფერი ვიპოვე"), მაგრამ `DB::transaction()` **ჯერ არ დაწყებულა** —
     * თორემ იგივე savepoint-ის rollback-ს კონკურენტიც წაშლიდა და ტესტი
     * არა კოდს, არამედ საკუთარ თავს გატეხდა.
     *
     * შედეგი: `between()` არ ვარდება, დუბლიც არ ჩნდება — დამარცხებული
     * მხარე გამარჯვებულის საუბარს წაიკითხავს.
     */
    public function test_a_conversation_created_between_the_read_and_the_write_is_picked_up(): void
    {
        $key = Conversation::pairKey($this->alice->id, $this->bob->id);
        $rival = null;

        DB::listen(function ($query) use (&$rival, $key) {
            if ($rival !== null || ! str_contains($query->sql, 'pair_key')) {
                return;
            }

            $rival = 0; // ⚠️ ჯერ დროშა, მერე ჩაწერა — თორემ listener თავის თავს გამოიძახებს
            $rival = DB::table('conversations')->insertGetId([
                'pair_key' => $key,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('conversation_user')->insert([
                ['conversation_id' => $rival, 'user_id' => $this->alice->id, 'created_at' => now(), 'updated_at' => now()],
                ['conversation_id' => $rival, 'user_id' => $this->bob->id, 'created_at' => now(), 'updated_at' => now()],
            ]);
        });

        $conversation = app(ChatService::class)->between($this->alice, $this->bob);

        $this->assertSame($rival, $conversation->id);
        $this->assertSame(1, Conversation::count());
        $this->assertCount(2, $conversation->participants);
    }

    /** ⚠️ საკუთარი შეტყობინება წაუკითხავში არ ითვლება */
    public function test_unread_counts_only_the_other_side(): void
    {
        $id = $this->open($this->alice, 'bob');

        $this->actingAs($this->alice)->postJson("/api/chat/{$id}", ['body' => 'ერთი'])->assertStatus(201);
        $this->actingAs($this->alice)->postJson("/api/chat/{$id}", ['body' => 'ორი'])->assertStatus(201);

        // ავტორს — ნული
        $this->actingAs($this->alice)->getJson('/api/chat/unread')->assertOk()->assertJsonPath('unread', 0);
        // მიმღებს — ორი
        $this->actingAs($this->bob)->getJson('/api/chat/unread')->assertOk()->assertJsonPath('unread', 2);

        // გახსნა = წაკითხვა
        $this->actingAs($this->bob)->getJson("/api/chat/{$id}")->assertOk();
        $this->actingAs($this->bob)->getJson('/api/chat/unread')->assertOk()->assertJsonPath('unread', 0);
    }

    /* ---------- წვდომა ---------- */

    /** ⚠️ სხვისი საუბარი **404-ია**: „ეს საუბარი არსებობს" თვითონაც ინფორმაციაა */
    public function test_outsider_cannot_see_or_write_to_a_conversation(): void
    {
        $id = $this->open($this->alice, 'bob');
        $carol = $this->makeUser('carol');

        $this->actingAs($carol)->getJson("/api/chat/{$id}")->assertStatus(404);
        $this->actingAs($carol)->postJson("/api/chat/{$id}", ['body' => 'ჰეი'])->assertStatus(404);
        $this->actingAs($carol)->patchJson("/api/chat/{$id}/read")->assertStatus(404);
    }

    /**
     * ⚠️ **მიწერა მხოლოდ ორ საჯარო პროფილს შორის** (§16.3) — იგივე კარიბჭე,
     * რაც დამთხვევებს. პასუხი 409-ია და არა 404: მდგომარეობა გამოსწორებადია.
     */
    public function test_both_profiles_must_be_public(): void
    {
        $this->bob->forceFill(['profile_visibility' => 'private'])->save();

        $this->actingAs($this->alice)
            ->postJson('/api/chat/with/bob')
            ->assertStatus(409)
            ->assertJsonPath('message', 'profile_not_public');

        // ჩემი მხარეც ითვლება
        $this->bob->forceFill(['profile_visibility' => 'public'])->save();
        $this->alice->forceFill(['profile_visibility' => 'private'])->save();

        $this->actingAs($this->alice->refresh())
            ->postJson('/api/chat/with/bob')
            ->assertStatus(409);
    }

    public function test_cannot_chat_with_self(): void
    {
        $this->actingAs($this->alice)
            ->postJson('/api/chat/with/alice')
            ->assertStatus(422)
            ->assertJsonPath('message', 'cannot_chat_with_self');
    }

    /* ---------- დაბლოკვა ---------- */

    /**
     * ⚠️ **დაბლოკვა ორივე მიმართულებით კრძალავს წერას.** დაბლოკვა ცალმხრივი
     * ფაქტია, მაგრამ თუ მხოლოდ დამბლოკავს შევუზღუდავდით, დაბლოკილი
     * განაგრძობდა წერას იმისთვის, ვინც სწორედ ამიტომ დაბლოკა.
     */
    public function test_blocking_stops_messages_in_both_directions(): void
    {
        $id = $this->open($this->alice, 'bob');

        $this->actingAs($this->alice)
            ->putJson('/api/chat/block/bob', ['blocked' => true])
            ->assertOk()
            ->assertJsonPath('blocked', true);

        // დამბლოკავიც ვერ წერს…
        $this->actingAs($this->alice)
            ->postJson("/api/chat/{$id}", ['body' => 'ჰეი'])
            ->assertStatus(403)
            ->assertJsonPath('message', 'chat_blocked');

        // …და დაბლოკილიც
        $this->actingAs($this->bob)
            ->postJson("/api/chat/{$id}", ['body' => 'რატომ?'])
            ->assertStatus(403);

        // ისტორია იკითხება — დაბლოკვა წაშლა არაა
        $this->actingAs($this->bob)->getJson("/api/chat/{$id}")->assertOk()->assertJsonPath('blocked', true);

        // განბლოკვის შემდეგ ისევ მუშაობს
        $this->actingAs($this->alice)->putJson('/api/chat/block/bob', ['blocked' => false])->assertOk();
        $this->actingAs($this->bob)->postJson("/api/chat/{$id}", ['body' => 'ისევ აქ ვარ'])->assertStatus(201);
    }

    /** სია ბოლო შეტყობინებით ლაგდება და წაუკითხავს თან ატანს */
    public function test_conversation_list_carries_last_message_and_unread(): void
    {
        $id = $this->open($this->alice, 'bob');
        $this->actingAs($this->alice)->postJson("/api/chat/{$id}", ['body' => 'ბოლო'])->assertStatus(201);

        $this->actingAs($this->bob)->getJson('/api/chat')
            ->assertOk()
            ->assertJsonPath('data.0.profile.username', 'alice')
            ->assertJsonPath('data.0.last_message.body', 'ბოლო')
            ->assertJsonPath('data.0.last_message.mine', false)
            ->assertJsonPath('data.0.unread', 1)
            ->assertJsonPath('unread_total', 1);
    }

    /* ============================================================
       მედია (§16.3/§16.4 · `DECISIONS.md` §1)
       ============================================================ */

    /**
     * ატვირთვა → პრივატული დისკი + გამგზავნის კვოტა; ფაილს **მხოლოდ
     * მონაწილეები** ხედავენ, მესამე პირისთვის 404-ია.
     */
    public function test_media_is_private_and_counted_against_the_sender(): void
    {
        Storage::fake('private');
        $id = $this->open($this->alice, 'bob');

        $this->actingAs($this->alice)
            ->post("/api/chat/{$id}", [
                'type' => 'image',
                'file' => UploadedFile::fake()->image('cat.jpg')->size(10),
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.type', 'image')
            ->assertJsonPath('data.attachment.name', 'cat.jpg')
            ->assertJsonPath('data.attachment_deleted', false);

        $message = Message::firstOrFail();

        // ⚠️ ფაილი **პრივატულ** დისკზეა და `/storage/*`-ით არ იხსნება
        $this->assertStringStartsWith('chat/', (string) $message->attachment_path);
        Storage::disk('private')->assertExists($message->attachment_path);

        // §16.4 — ადგილი გამგზავნის კვოტიდან
        $this->assertSame(
            (int) $message->attachment_size,
            (int) $this->alice->refresh()->storage_used_bytes,
        );
        $this->assertSame(0, (int) $this->bob->refresh()->storage_used_bytes);

        // მიმღები ხედავს, უცხო — არა
        $this->actingAs($this->bob)->get("/api/chat/files/{$message->id}")->assertOk();
        $this->actingAs($this->makeUser('carol'))->get("/api/chat/files/{$message->id}")->assertStatus(404);
    }

    /**
     * ⚠️ **`DECISIONS.md` §1 — ფაილი ორივესთან ქრება**, შეტყობინების რიგი კი
     * რჩება („ფაილი წაშლილია"), და კვოტა მართლა თავისუფლდება.
     */
    public function test_deleting_an_attachment_removes_it_for_both_and_frees_the_quota(): void
    {
        Storage::fake('private');
        $id = $this->open($this->alice, 'bob');

        $this->actingAs($this->alice)
            ->post("/api/chat/{$id}", ['type' => 'image', 'file' => UploadedFile::fake()->image('cat.jpg')->size(10)])
            ->assertStatus(201);

        $message = Message::firstOrFail();
        $path = $message->attachment_path;

        // მიმღები ვერ შლის — ფაილი გამგზავნის კვოტიდან იხარჯება
        $this->actingAs($this->bob)
            ->deleteJson("/api/chat/files/{$message->id}")
            ->assertStatus(403)
            ->assertJsonPath('message', 'not_the_author');

        $this->actingAs($this->alice)
            ->deleteJson("/api/chat/files/{$message->id}")
            ->assertOk()
            ->assertJsonPath('data.attachment', null)
            ->assertJsonPath('data.attachment_deleted', true)
            // სახელი რჩება: ჩანაცვლებამ უნდა თქვას, **რა** წაიშალა
            ->assertJsonPath('data.attachment_name', 'cat.jpg');

        Storage::disk('private')->assertMissing($path);
        $this->assertSame(0, (int) $this->alice->refresh()->storage_used_bytes);
        // რიგი რჩება — ისტორია არ იხევა
        $this->assertSame(1, Message::count());

        // მიმღებთანაც ქრება და იმავე მდგომარეობას ხედავს
        $this->actingAs($this->bob)
            ->getJson("/api/chat/{$id}")
            ->assertOk()
            ->assertJsonPath('data.0.attachment', null)
            ->assertJsonPath('data.0.attachment_deleted', true);

        $this->actingAs($this->bob)->get("/api/chat/files/{$message->id}")->assertStatus(404);
    }

    /**
     * ⚠️ **კვოტის ამოწურვა მხოლოდ ატვირთვას ბლოკავს** (§16.4) — ტექსტი
     * იმავე მდგომარეობაშიც უნდა გავიდეს.
     */
    public function test_text_still_sends_when_the_quota_is_full(): void
    {
        Storage::fake('private');
        $id = $this->open($this->alice, 'bob');

        $this->alice->forceFill(['storage_quota_bytes' => 1, 'storage_used_bytes' => 1])->save();

        $this->actingAs($this->alice->refresh())
            ->post("/api/chat/{$id}", ['type' => 'image', 'file' => UploadedFile::fake()->image('cat.jpg')->size(10)])
            ->assertStatus(413)
            ->assertJsonPath('message', 'storage_quota_exceeded');

        $this->actingAs($this->alice->refresh())
            ->postJson("/api/chat/{$id}", ['body' => 'ტექსტი მაინც მიდის'])
            ->assertStatus(201);
    }

    /* ---------- წერილის წაშლა (Tasks §4.6) ---------- */

    /**
     * ⚠️ **`self` მხოლოდ წამშლელს მალავს.** მეორე მხარეს იგივე წერილი
     * უნდა უჩანდეს — სწორედ ამიტომ არ არის აქ `SoftDeletes`.
     */
    public function test_deleting_for_myself_hides_it_only_from_me(): void
    {
        $id = $this->open($this->alice, 'bob');

        $message = $this->actingAs($this->alice)
            ->postJson("/api/chat/{$id}", ['body' => 'ჩემი წერილი'])
            ->json('data.id');

        $this->actingAs($this->alice)
            ->deleteJson("/api/chat/messages/{$message}", ['scope' => 'self'])
            ->assertNoContent();

        $this->actingAs($this->alice)->getJson("/api/chat/{$id}")->assertJsonCount(0, 'data');
        $this->actingAs($this->bob)->getJson("/api/chat/{$id}")->assertJsonCount(1, 'data');

        // ⚠️ **რიგი ბაზაში რჩება** — აღდგენა შესაძლებელი უნდა იყოს
        $this->assertSame(1, Message::count());
        /* ⚠️ **დამალვა ცალკე ცხრილშია** (აუდიტი 2026-09-14, §B2) და არა
           `messages.removed_*`-ში: ეს ფაქტი **მაყურებლისაა** და არა
           შეტყობინებისა — იხ. მომდევნო ტესტი. */
        $this->assertNull(Message::first()->removed_at);
        $this->assertDatabaseHas('message_hides', [
            'message_id' => $message,
            'user_id' => $this->alice->id,
        ]);
    }

    /**
     * **მთავარი რეგრესია (აუდიტი 2026-09-14, §B2):** ერთი მხარის „ჩემთან
     * წაშლა" მეორისას **არ** უნდა აუქმებდეს.
     *
     * ⚠️ ადრე სამივე ფაქტი ერთ სამეულში ეწერა (`removed_at`/`removed_by`/
     * `removed_scope`), ე.ი. მეორე დამალვა პირველს **გადააწერდა**: B მალავდა,
     * მერე A მალავდა, `removed_by` ხდებოდა A და წერილი **B-სთან ისევ ჩნდებოდა**.
     */
    public function test_both_sides_can_hide_the_same_message_independently(): void
    {
        $id = $this->open($this->alice, 'bob');

        $message = $this->actingAs($this->alice)
            ->postJson("/api/chat/{$id}", ['body' => 'ორივემ დამალა'])
            ->json('data.id');

        // ჯერ მიმღები მალავს თავისთვის
        $this->actingAs($this->bob)
            ->deleteJson("/api/chat/messages/{$message}", ['scope' => 'self'])
            ->assertNoContent();

        $this->actingAs($this->alice)->getJson("/api/chat/{$id}")->assertJsonCount(1, 'data');
        $this->actingAs($this->bob)->getJson("/api/chat/{$id}")->assertJsonCount(0, 'data');

        // მერე ავტორიც — და ეს **არ** უნდა დაუბრუნოს წერილი მიმღებს
        $this->actingAs($this->alice)
            ->deleteJson("/api/chat/messages/{$message}", ['scope' => 'self'])
            ->assertNoContent();

        $this->actingAs($this->alice)->getJson("/api/chat/{$id}")->assertJsonCount(0, 'data');
        $this->actingAs($this->bob)->getJson("/api/chat/{$id}")->assertJsonCount(0, 'data');

        $this->assertSame(1, Message::count());
        $this->assertDatabaseCount('message_hides', 2);
    }

    /** ორჯერ დამალვა იგივე ქმედებაა — უნიკალურ ინდექსზე 500 არ უნდა იყოს */
    public function test_hiding_the_same_message_twice_is_harmless(): void
    {
        $id = $this->open($this->alice, 'bob');

        $message = $this->actingAs($this->alice)
            ->postJson("/api/chat/{$id}", ['body' => 'ორჯერ'])
            ->json('data.id');

        foreach ([1, 2] as $_) {
            $this->actingAs($this->alice)
                ->deleteJson("/api/chat/messages/{$message}", ['scope' => 'self'])
                ->assertNoContent();
        }

        $this->assertDatabaseCount('message_hides', 1);
    }

    /**
     * ⚠️ **ჩემთვის დამალული წაუკითხავადაც აღარ ითვლება** — თორემ badge
     * იმ წერილზე ენთებოდა, რომელიც ეკრანზე საერთოდ აღარ ჩანს.
     */
    public function test_a_message_hidden_for_me_is_not_unread(): void
    {
        $id = $this->open($this->alice, 'bob');

        $message = $this->actingAs($this->alice)
            ->postJson("/api/chat/{$id}", ['body' => 'წაუკითხავი'])
            ->json('data.id');

        $this->actingAs($this->bob)->getJson('/api/chat/unread')->assertJsonPath('unread', 1);

        $this->actingAs($this->bob)
            ->deleteJson("/api/chat/messages/{$message}", ['scope' => 'self'])
            ->assertNoContent();

        $this->actingAs($this->bob)->getJson('/api/chat/unread')->assertJsonPath('unread', 0);
        // ⚠️ ავტორს ეს არ ეხება — მისი საკუთარი წერილი ისედაც არ ითვლებოდა
        $this->actingAs($this->alice)->getJson('/api/chat/unread')->assertJsonPath('unread', 0);
    }

    /** `both` ორივეს მალავს, მაგრამ **მხოლოდ ავტორს** შეუძლია */
    public function test_deleting_for_both_requires_authorship(): void
    {
        $id = $this->open($this->alice, 'bob');

        $message = $this->actingAs($this->alice)
            ->postJson("/api/chat/{$id}", ['body' => 'ორივესთან'])
            ->json('data.id');

        $this->actingAs($this->bob)
            ->deleteJson("/api/chat/messages/{$message}", ['scope' => 'both'])
            ->assertStatus(403);

        $this->actingAs($this->alice)
            ->deleteJson("/api/chat/messages/{$message}", ['scope' => 'both'])
            ->assertNoContent();

        $this->actingAs($this->alice)->getJson("/api/chat/{$id}")->assertJsonCount(0, 'data');
        $this->actingAs($this->bob)->getJson("/api/chat/{$id}")->assertJsonCount(0, 'data');
        $this->assertSame(1, Message::count());
    }

    /** ⚠️ `scope` სავალდებულოა — „ვივარაუდოთ ორივესთან" სწორედ ის ქცევაა, რაც შეიცვალა */
    public function test_scope_is_required(): void
    {
        $id = $this->open($this->alice, 'bob');
        $message = $this->actingAs($this->alice)
            ->postJson("/api/chat/{$id}", ['body' => 'x'])->json('data.id');

        $this->actingAs($this->alice)
            ->deleteJson("/api/chat/messages/{$message}")
            ->assertStatus(422);
    }

    /** წაშლილი წერილი წაუკითხავად აღარ ითვლება */
    public function test_removed_message_is_not_unread(): void
    {
        $id = $this->open($this->alice, 'bob');
        $message = $this->actingAs($this->alice)
            ->postJson("/api/chat/{$id}", ['body' => 'გამარჯობა'])->json('data.id');

        $this->actingAs($this->bob)->getJson('/api/chat/unread')->assertJsonPath('unread', 1);

        $this->actingAs($this->alice)
            ->deleteJson("/api/chat/messages/{$message}", ['scope' => 'both'])->assertNoContent();

        $this->actingAs($this->bob)->getJson('/api/chat/unread')->assertJsonPath('unread', 0);
    }
}
