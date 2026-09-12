<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\NoteCategory;
use App\Models\NoteEntry;
use App\Models\NoteEntryFile;
use App\Models\NoteNotification;
use App\Models\NoteReminder;
use App\Models\User;
use App\Services\Notes\ReminderDispatcher;
use App\Services\Storage\StorageMeter;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * ჩანაწერების მოდული (`note`, Tasks §13).
 *
 * ამოწმებს იმას, რაც აქ ადვილად ტყდება: მოდულის gate, per-user ლექსიკონი,
 * ატვირთვის კვოტა, **შეხსენების დროის გამოთვლა სარტყელთან ერთად** და ის, რომ
 * ერთი შეხსენება ორჯერ არ ისროლებს.
 */
class NoteModuleTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('noter', ['note']);
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

    private function makeNote(array $overrides = []): int
    {
        return $this->actingAs($this->user)
            ->postJson('/api/notes', $overrides + ['title' => 'პასპორტის ვადა'])
            ->assertStatus(201)
            ->json('data.id');
    }

    /** მოდულის gate + §13.1-ის ველების ნაკრები */
    public function test_module_gate_and_field_set(): void
    {
        $outsider = $this->makeUser('nomodule', []);
        $this->actingAs($outsider)->getJson('/api/notes')->assertStatus(403);

        $categoryId = $this->actingAs($this->user)->getJson('/api/note-categories')->json('data.0.id');

        $this->actingAs($this->user)
            ->postJson('/api/notes', [
                'title' => 'ავტოსატესტო',
                'description' => 'რისთვისაა: ტექდათვალიერება',
                'category_id' => $categoryId,
                // დუბლი ტეგი უნდა მოიჭრას (`Video::normalizeTags()`-ის საერთო წესი)
                'tags' => ['მანქანა', 'მანქანა', ' ტექდათვალიერება '],
                'links' => [
                    ['label' => 'ჩანაწერი', 'url' => 'https://example.com/a'],
                    ['label' => null, 'url' => 'https://example.com/b'],
                ],
                'due_at' => '2026-12-01T09:00:00Z',
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.title', 'ავტოსატესტო')
            ->assertJsonPath('data.category_id', $categoryId)
            ->assertJsonCount(2, 'data.tags')
            ->assertJsonCount(2, 'data.links')
            ->assertJsonPath('data.status.key', 'open')
            // ⚠️ §13 — პირადი დოკუმენტების მოდული: default ყოველთვის `private`
            ->assertJsonPath('data.visibility', 'private');
    }

    /** ლექსიკონი per-user-ია და წაშლისას ჩანაწერები არ იკარგება */
    public function test_category_dictionary_is_per_user_and_delete_moves_entries(): void
    {
        $mine = $this->actingAs($this->user)->getJson('/api/note-categories')->json('data');
        $this->assertCount(count(NoteCategory::DEFAULTS), $mine);

        $other = $this->makeUser('other', ['note']);
        $theirs = $this->actingAs($other)->getJson('/api/note-categories')->json('data.0.id');
        $this->assertNotEquals($mine[0]['id'], $theirs);

        $noteId = $this->makeNote(['category_id' => $mine[0]['id']]);

        $this->actingAs($this->user)
            ->deleteJson("/api/note-categories/{$mine[0]['id']}", ['move_to' => $mine[1]['id']])
            ->assertOk()
            ->assertJsonPath('moved', 1);

        $this->assertSame(
            $mine[1]['id'],
            NoteEntry::withoutGlobalScope('owner')->find($noteId)->category_id,
        );
    }

    /** სხვისი ჩანაწერი 404-ია (`BelongsToUser`-ის global scope) */
    public function test_other_users_note_is_not_reachable(): void
    {
        $noteId = $this->makeNote();
        $other = $this->makeUser('nosy', ['note']);

        $this->actingAs($other)->getJson("/api/notes/{$noteId}")->assertStatus(404);
    }

    /** ატვირთვა კვოტაზე გადის და წაშლა მას ათავისუფლებს (§13.1 → 17.1) */
    public function test_uploads_are_metered_and_released(): void
    {
        // §17.5 — ჩანაწერების ფაილები **პრივატულ დისკზეა**
        Storage::fake('private');
        $noteId = $this->makeNote();

        $fileId = $this->actingAs($this->user)
            ->postJson("/api/notes/{$noteId}/files", [
                'kind' => 'image',
                'files' => [UploadedFile::fake()->image('screenshot.png', 40, 40)],
            ])
            ->assertStatus(201)
            ->json('data.0.id');

        $used = (int) $this->user->refresh()->storage_used_bytes;
        $this->assertGreaterThan(0, $used);

        // ფაილი ჩანაწერების მოდულს მიეწერება და არა სხვას
        $this->assertSame(
            $used,
            (int) app(StorageMeter::class)->breakdown($this->user->refresh())['note'],
        );

        $this->actingAs($this->user)->deleteJson("/api/note-files/{$fileId}")->assertNoContent();
        $this->assertSame(0, (int) $this->user->refresh()->storage_used_bytes);
    }

    /** ჩანაწერის წაშლა ფაილსაც შლის — cascade მოდელის ივენთს არ აგდებს */
    public function test_deleting_note_releases_its_files(): void
    {
        // §17.5 — ჩანაწერების ფაილები **პრივატულ დისკზეა**
        Storage::fake('private');
        $noteId = $this->makeNote();

        $this->actingAs($this->user)
            ->postJson("/api/notes/{$noteId}/files", [
                'kind' => 'doc',
                'files' => [UploadedFile::fake()->create('manual.pdf', 20, 'application/pdf')],
            ])
            ->assertStatus(201);

        $this->assertGreaterThan(0, (int) $this->user->refresh()->storage_used_bytes);

        $this->actingAs($this->user)->deleteJson("/api/notes/{$noteId}")->assertNoContent();

        $this->assertSame(0, (int) $this->user->refresh()->storage_used_bytes);
        $this->assertSame(0, NoteEntry::withoutGlobalScope('owner')->count());
    }

    /**
     * ⚠️ **სარტყელი**: „ყოველ დღე 09:00 თბილისში" = 05:00 UTC.
     * სწორედ ეს ტყდებოდა, სანამ `timezone` ცალკე სვეტად არ ჩაიწერა.
     */
    public function test_daily_reminder_respects_the_users_timezone(): void
    {
        Carbon::setTestNow('2026-09-04 12:00:00');

        $noteId = $this->makeNote();

        $next = $this->actingAs($this->user)
            ->postJson("/api/notes/{$noteId}/reminders", [
                'mode' => 'daily',
                'time_of_day' => '09:00',
                'timezone' => 'Asia/Tbilisi',
                'channels' => ['browser'],
            ])
            ->assertStatus(201)
            ->json('data.next_at');

        // 12:00 UTC-ზე დღევანდელი 05:00 UTC უკვე გასულია → ხვალინდელი
        $this->assertSame('2026-09-05T05:00:00+00:00', Carbon::parse($next)->utc()->toIso8601String());

        Carbon::setTestNow();
    }

    /** ინტერვალი ველია და არა ჩაშენებული კონსტანტა (§13.2) */
    public function test_interval_reminder_uses_the_given_minutes(): void
    {
        Carbon::setTestNow('2026-09-04 12:00:00');

        $noteId = $this->makeNote();

        $next = $this->actingAs($this->user)
            ->postJson("/api/notes/{$noteId}/reminders", [
                'mode' => 'interval',
                'interval_minutes' => 17,
            ])
            ->assertStatus(201)
            ->json('data.next_at');

        $this->assertSame('2026-09-04T12:17:00+00:00', Carbon::parse($next)->utc()->toIso8601String());

        Carbon::setTestNow();
    }

    /**
     * §5.5 — ყოველკვირეული **რამდენიმე დღეზე**: უახლოესი არჩეული დღე იგება.
     *
     * 2026-09-04 არის პარასკევი (`dayOfWeek` 5). ორშ(1)/ოთხ(3) არჩევანზე
     * უახლოესი ორშაბათია — 2026-09-07.
     */
    public function test_weekly_reminder_takes_the_nearest_of_several_days(): void
    {
        Carbon::setTestNow('2026-09-04 12:00:00');

        $noteId = $this->makeNote();

        $next = $this->actingAs($this->user)
            ->postJson("/api/notes/{$noteId}/reminders", [
                'mode' => 'weekly',
                'weekdays' => [1, 3],
                'time_of_day' => '09:00',
                'timezone' => 'UTC',
            ])
            ->assertStatus(201)
            ->json('data.next_at');

        $this->assertSame('2026-09-07T09:00:00+00:00', Carbon::parse($next)->utc()->toIso8601String());

        Carbon::setTestNow();
    }

    /**
     * §5.5 რეგრესია — „აქტიურობის" გადამრთველი ყველა ველს უკან აგზავნის,
     * მათ შორის **ცარიელ `weekdays`-ს**. არაკვირეულ შეხსენებაზე ეს 422-ს
     * არ უნდა იძლეოდეს, კვირეულზე კი ცარიელი დღეები დაუშვებელია.
     */
    public function test_empty_weekdays_are_allowed_only_outside_weekly_mode(): void
    {
        $noteId = $this->makeNote();

        $id = $this->actingAs($this->user)
            ->postJson("/api/notes/{$noteId}/reminders", [
                'mode' => 'daily',
                'time_of_day' => '09:00',
                'weekdays' => [],
            ])
            ->assertStatus(201)
            ->json('data.id');

        $this->actingAs($this->user)
            ->patchJson("/api/note-reminders/{$id}", [
                'mode' => 'daily',
                'time_of_day' => '09:00',
                'weekdays' => [],
                'is_active' => false,
            ])
            ->assertOk()
            ->assertJsonPath('data.is_active', false);

        // კვირეული ცარიელი დღეებით — ვალიდაციის შეცდომა
        $this->actingAs($this->user)
            ->postJson("/api/notes/{$noteId}/reminders", [
                'mode' => 'weekly',
                'time_of_day' => '09:00',
                'weekdays' => [],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('weekdays');
    }

    /**
     * §5.5 — ყოველთვიური. ⚠️ **31 თებერვალში თვის ბოლო დღეა** და არა
     * მარტის 3: Carbon-ის ნაგულისხმევი გადავსება ჩუმად სხვა თვეს აირჩევდა.
     */
    public function test_monthly_reminder_clamps_the_day_to_the_month_length(): void
    {
        Carbon::setTestNow('2026-01-31 12:00:00');

        $noteId = $this->makeNote();

        $next = $this->actingAs($this->user)
            ->postJson("/api/notes/{$noteId}/reminders", [
                'mode' => 'monthly',
                'day_of_month' => 31,
                'time_of_day' => '09:00',
                'timezone' => 'UTC',
            ])
            ->assertStatus(201)
            ->json('data.next_at');

        // იანვრის 31-ის 09:00 უკვე გასულია → თებერვალი, და თებერვალს 31 არ აქვს
        $this->assertSame('2026-02-28T09:00:00+00:00', Carbon::parse($next)->utc()->toIso8601String());

        Carbon::setTestNow();
    }

    /** §5.5 — ყოველწლიური: თვე + რიცხვი, გასული თარიღი მომავალ წელს ჯდება */
    public function test_yearly_reminder_moves_to_the_next_year_when_past(): void
    {
        Carbon::setTestNow('2026-09-04 12:00:00');

        $noteId = $this->makeNote();

        $next = $this->actingAs($this->user)
            ->postJson("/api/notes/{$noteId}/reminders", [
                'mode' => 'yearly',
                'month' => 3,
                'day_of_month' => 15,
                'time_of_day' => '08:30',
                'timezone' => 'UTC',
            ])
            ->assertStatus(201)
            ->json('data.next_at');

        $this->assertSame('2027-03-15T08:30:00+00:00', Carbon::parse($next)->utc()->toIso8601String());

        Carbon::setTestNow();
    }

    /**
     * §5.5 — **ჯერადობა**: მითითებული რაოდენობის შემდეგ პერიოდულიც ითიშება.
     *
     * ⚠️ ეს ერთადერთ ადგილას წყდება (`NoteReminder::exhaustedAfter()`), თორემ
     * „ბოლო გასროლა" ორ ფორმულას ექნებოდა.
     */
    public function test_repeat_count_stops_a_recurring_reminder(): void
    {
        Carbon::setTestNow('2026-09-04 12:00:00');
        $noteId = $this->makeNote();

        $reminderId = $this->actingAs($this->user)
            ->postJson("/api/notes/{$noteId}/reminders", [
                'mode' => 'interval',
                'interval_minutes' => 10,
                'repeat_count' => 2,
            ])
            ->assertStatus(201)
            ->json('data.id');

        $dispatcher = app(ReminderDispatcher::class);

        // პირველი გასროლა — ჯერ კიდევ აქტიურია
        Carbon::setTestNow('2026-09-04 12:10:00');
        $this->assertSame(1, $dispatcher->run());

        $reminder = NoteReminder::withoutGlobalScope('owner')->find($reminderId);
        $this->assertTrue((bool) $reminder->is_active);
        $this->assertSame(1, (int) $reminder->sent_count);

        // მეორე — ჯერადობა ამოიწურა
        Carbon::setTestNow('2026-09-04 12:20:00');
        $this->assertSame(1, $dispatcher->run());

        $reminder = NoteReminder::withoutGlobalScope('owner')->find($reminderId);
        $this->assertFalse((bool) $reminder->is_active);
        $this->assertNull($reminder->next_at);
        $this->assertSame(2, (int) $reminder->sent_count);

        // მესამედ აღარაფერი ისროლებს
        Carbon::setTestNow('2026-09-04 12:30:00');
        $this->assertSame(0, $dispatcher->run());

        Carbon::setTestNow();
    }

    /**
     * ვადამოსული ერთჯერადი შეხსენება ისროლებს **ერთხელ** და ითიშება;
     * ბრაუზერის რიგი კი `due`-ზე გამოდის.
     */
    public function test_due_reminder_fires_once_and_deactivates(): void
    {
        Carbon::setTestNow('2026-09-04 12:00:00');
        $noteId = $this->makeNote();

        $reminderId = $this->actingAs($this->user)
            ->postJson("/api/notes/{$noteId}/reminders", [
                'mode' => 'once',
                'remind_at' => '2026-09-04T11:59:00Z',
                'channels' => ['browser'],
            ])
            ->assertStatus(201)
            ->json('data.id');

        $pending = $this->actingAs($this->user)->getJson('/api/note-reminders/due')->assertOk()->json('data');
        $this->assertCount(1, $pending);
        $this->assertSame('პასპორტის ვადა', $pending[0]['title']);

        $reminder = NoteReminder::withoutGlobalScope('owner')->find($reminderId);
        $this->assertFalse((bool) $reminder->is_active);
        $this->assertNull($reminder->next_at);

        // მეორედ გაშვება ახალ შეტყობინებას აღარ ქმნის
        app(ReminderDispatcher::class)->run();
        $this->assertSame(1, NoteNotification::withoutGlobalScope('owner')->count());

        // წაკითხვის შემდეგ რიგი იცლება
        $this->actingAs($this->user)
            ->patchJson("/api/note-notifications/{$pending[0]['id']}")
            ->assertOk();

        $this->assertCount(
            0,
            $this->actingAs($this->user)->getJson('/api/note-reminders/due')->json('data'),
        );

        Carbon::setTestNow();
    }

    /** მასობრივი წაშლა (Tasks 20) ჩანაწერებსაც ფარავს */
    public function test_purge_covers_notes(): void
    {
        $admin = $this->makeUser('boss', ['note']);
        $admin->assignRole('super_admin')->save();

        $categoryId = $this->actingAs($this->user)->getJson('/api/note-categories')->json('data.0.id');
        $this->makeNote(['category_id' => $categoryId]);
        $this->makeNote(['title' => 'სხვა']);

        $plan = $this->actingAs($admin)
            ->postJson('/api/admin/purge/plan', [
                'target' => 'note',
                'mode' => 'type',
                'type_ids' => [$categoryId],
                'user_id' => $this->user->id,
            ])
            ->assertOk()
            ->json('plan');

        $this->assertSame(1, $plan['records']);

        $this->actingAs($admin)
            ->postJson('/api/admin/purge/item', [
                'target' => 'note',
                'id' => $plan['items'][0]['id'],
                'user_id' => $this->user->id,
                'confirm' => 'DELETE',
            ])
            ->assertOk();

        $this->assertSame(1, NoteEntry::withoutGlobalScope('owner')->count());
    }

    /* ---------- §17.5 — პრივატული დისკი ---------- */

    /**
     * ⚠️ **§17.5-ის მთავარი წესი:** პირადი დოკუმენტი public დისკზე **არ**
     * ჩაწერება. სწორედ ეს იყო პრობლემა — `/storage/*` ავტორიზაციას არ
     * ითხოვს, ე.ი. მისამართის ცოდნა საკმარისი იყო.
     */
    public function test_note_uploads_land_on_the_private_disk_only(): void
    {
        Storage::fake('private');
        Storage::fake('public');
        $noteId = $this->makeNote();

        $path = $this->actingAs($this->user)
            ->postJson("/api/notes/{$noteId}/files", [
                'kind' => 'doc',
                'files' => [UploadedFile::fake()->create('passport.pdf', 12, 'application/pdf')],
            ])
            ->assertStatus(201)
            ->json('data.0.id');

        $stored = NoteEntryFile::withoutGlobalScope('owner')->findOrFail($path);

        Storage::disk('private')->assertExists($stored->path);
        Storage::disk('public')->assertMissing($stored->path);
        $this->assertStringStartsWith('notes/', $stored->path);
    }

    /** ფაილი მხოლოდ დაცული endpoint-იდან გაიცემა და მხოლოდ მფლობელს */
    public function test_private_file_is_served_to_its_owner_and_nobody_else(): void
    {
        Storage::fake('private');
        $noteId = $this->makeNote();

        $fileId = $this->actingAs($this->user)
            ->postJson("/api/notes/{$noteId}/files", [
                'kind' => 'image',
                'files' => [UploadedFile::fake()->image('scan.png', 20, 20)],
            ])
            ->assertStatus(201)
            ->json('data.0.id');

        $this->actingAs($this->user)->get("/api/note-files/{$fileId}")->assertOk();

        // ⚠️ სხვისი ფაილი **404-ია და არა 403**: „არსებობს, უბრალოდ შენი არაა"
        // თვითონაც ინფორმაციაა (იგივე წესი, რაც 16.1-ს)
        $other = $this->makeUser('nosy2', ['note']);
        $this->actingAs($other)->get("/api/note-files/{$fileId}")->assertStatus(404);
    }

    /** წაშლა პრივატული დისკიდანაც შლის — `StoredFile`-ს დისკი გზიდან გამოჰყავს */
    public function test_deleting_a_private_file_removes_it_from_the_private_disk(): void
    {
        Storage::fake('private');
        $noteId = $this->makeNote();

        $fileId = $this->actingAs($this->user)
            ->postJson("/api/notes/{$noteId}/files", [
                'kind' => 'doc',
                'files' => [UploadedFile::fake()->create('contract.pdf', 8, 'application/pdf')],
            ])
            ->assertStatus(201)
            ->json('data.0.id');

        $path = NoteEntryFile::withoutGlobalScope('owner')->findOrFail($fileId)->path;

        $this->actingAs($this->user)->deleteJson("/api/note-files/{$fileId}")->assertNoContent();

        Storage::disk('private')->assertMissing($path);
        $this->assertSame(0, (int) $this->user->refresh()->storage_used_bytes);
    }

    /**
     * Tasks §8.2 — **ელფოსტის არხი აღარ არსებობს** („არ გვინდა").
     *
     * ⚠️ უარი 422-ია და არა ჩუმად გამოტოვება: SMTP ისედაც არ გვაქვს
     * (`MAIL_MAILER=log`), ე.ი. „მონიშნე და არაფერი მოხდეს" ყველაზე ცუდი
     * ვარიანტია — მომხმარებელი დარწმუნებული იქნებოდა, რომ წერილი მიდის.
     */
    public function test_the_email_channel_is_gone(): void
    {
        $noteId = $this->makeNote();

        $this->actingAs($this->user)
            ->postJson("/api/notes/{$noteId}/reminders", [
                'mode' => 'daily',
                'time_of_day' => '09:00',
                'channels' => ['email'],
            ])
            ->assertStatus(422);

        $this->assertSame(['browser', 'telegram'], NoteReminder::CHANNELS);
    }

    /**
     * Tasks §8.2 — გასროლილი შეხსენება **ჟურნალში რჩება და აპლიკაციაში იკითხება**.
     *
     * ⚠️ ეს სწორედ ის ხვრელია, რომელსაც ელფოსტა ხურავდა: აპი დახურული იყო →
     * ამოხტომა ვერ ნახე. ახლა ჩანაწერი რჩება და ისტორიაშია.
     */
    public function test_a_fired_reminder_stays_in_the_readable_log(): void
    {
        Carbon::setTestNow('2026-09-04 12:00:00');

        $noteId = $this->makeNote();

        $this->actingAs($this->user)
            ->postJson("/api/notes/{$noteId}/reminders", [
                'mode' => 'once',
                'remind_at' => '2026-09-04T12:30:00+00:00',
                'channels' => ['browser'],
            ])
            ->assertStatus(201);

        Carbon::setTestNow('2026-09-04 12:31:00');

        // ბრაუზერის polling-ი თვითონ ისვრის (cron-ზე დამოკიდებულების გარეშე)
        $this->actingAs($this->user)->getJson('/api/note-reminders/due')->assertOk();

        $log = $this->actingAs($this->user)->getJson('/api/note-notifications')->assertOk();
        $this->assertSame(1, count($log->json('data')));
        $this->assertSame('browser', $log->json('data.0.channel'));

        // ⚠️ წაკითხვის შემდეგაც **რჩება** — ჟურნალია და არა რიგი
        $id = $log->json('data.0.id');
        $this->actingAs($this->user)->patchJson("/api/note-notifications/{$id}")->assertOk();

        $this->assertSame(1, count(
            $this->actingAs($this->user)->getJson('/api/note-notifications')->json('data'),
        ));
        // …რიგიდან კი ქრება, თორემ ისევ ამოხტებოდა
        $this->assertSame([], $this->actingAs($this->user)->getJson('/api/note-reminders/due')->json('data'));

        Carbon::setTestNow();
    }
}
