<?php

namespace Tests\Feature;

use App\Models\ApprovalRequest;
use App\Models\DatabaseBackup;
use App\Models\Module;
use App\Models\User;
use App\Services\Notify\Notifier;
use App\Services\Storage\StorageMeter;
use App\Support\NotificationType;
use App\Support\StorageFolder;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **შეტყობინებების ცენტრი.**
 */
class NotificationTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->admin = User::factory()->create();
        $this->admin->assignRole('super_admin')->save();

        $this->user = User::factory()->create();
    }

    /* ================= მოთხოვნა ================= */

    public function test_approving_a_request_leaves_the_user_a_notification(): void
    {
        $module = Module::where('key', 'game')->firstOrFail();

        $req = ApprovalRequest::create([
            'user_id' => $this->user->id,
            'type' => ApprovalRequest::TYPE_MODULE,
            'module_id' => $module->id,
            'status' => 'pending',
        ]);

        $this->actingAs($this->admin)
            ->postJson("/api/admin/requests/{$req->id}/approve")
            ->assertOk();

        $row = $this->user->notifications()->firstOrFail();

        $this->assertSame(NotificationType::REQUEST_APPROVED, $row->type);
        $this->assertSame('game', $row->data['module']);
        $this->assertNull($row->read_at);
    }

    public function test_rejecting_a_request_carries_the_review_note(): void
    {
        $module = Module::where('key', 'game')->firstOrFail();

        $req = ApprovalRequest::create([
            'user_id' => $this->user->id,
            'type' => ApprovalRequest::TYPE_MODULE,
            'module_id' => $module->id,
            'status' => 'pending',
        ]);

        $this->actingAs($this->admin)
            ->postJson("/api/admin/requests/{$req->id}/reject", ['review_note' => 'ჯერ არა'])
            ->assertOk();

        $this->assertSame(
            NotificationType::REQUEST_REJECTED,
            $this->user->notifications()->firstOrFail()->type,
        );
        $this->assertSame('ჯერ არა', $this->user->notifications()->firstOrFail()->data['note']);
    }

    /* ================= კითხვა და წაშლა ================= */

    public function test_the_badge_counts_unread_and_reading_writes_read_at(): void
    {
        app(Notifier::class)->send($this->user, NotificationType::BATCH_DONE, ['kind' => 'sync']);
        app(Notifier::class)->send($this->user, NotificationType::BATCH_DONE, ['kind' => 'gallery']);

        $this->actingAs($this->user)
            ->getJson('/api/notifications/counts')
            ->assertOk()
            ->assertExactJson(['unseen' => 2, 'unread' => 2, 'total' => 2]);

        $id = $this->actingAs($this->user)->getJson('/api/notifications')->json('data.0.id');

        $this->actingAs($this->user)
            ->patchJson("/api/notifications/{$id}/read")
            ->assertOk()
            ->assertJsonPath('unread', 1);

        $this->actingAs($this->user)->patchJson('/api/notifications/read')
            ->assertOk()
            ->assertJsonPath('unread', 0);

        $this->assertSame(2, $this->user->notifications()->whereNotNull('read_at')->count());
    }

    /**
     * **ზარის რიცხვი უნახავს ითვლის, წერტილი — წაუკითხავს.** ზარის გახსნა ყველაფერს
     * ნახულად ნიშნავს და არაფერს კითხულობს; წაკითხვა ნახვასაც ნიშნავს; წაუკითხავად
     * დაბრუნებული ნახული რჩება — ზარზე აღარ ბრუნდება.
     */
    public function test_opening_the_bell_marks_seen_but_not_read(): void
    {
        app(Notifier::class)->send($this->user, NotificationType::BATCH_DONE, ['kind' => 'sync']);
        app(Notifier::class)->send($this->user, NotificationType::STORAGE_WARNING, ['percent' => 81]);

        $this->actingAs($this->user)->patchJson('/api/notifications/seen')
            ->assertOk()
            ->assertExactJson(['unseen' => 0, 'unread' => 2, 'total' => 2]);

        $rows = $this->actingAs($this->user)->getJson('/api/notifications')->json('data');
        $this->assertNotNull($rows[0]['seen_at']);
        $this->assertNull($rows[0]['read_at']);

        // ახალი შეტყობინება ისევ უნახავია; წაკითხვა მას ნახულადაც ნიშნავს
        app(Notifier::class)->send($this->user, NotificationType::BACKUP_FAILED, ['name' => 'x']);
        $fresh = $this->user->notifications()->whereNull('seen_at')->firstOrFail();

        $this->actingAs($this->user)->patchJson("/api/notifications/{$fresh->id}/read")
            ->assertExactJson(['unseen' => 0, 'unread' => 2, 'total' => 3]);

        // წაუკითხავად დაბრუნება: წერტილი ბრუნდება, ზარის რიცხვი — არა
        $this->actingAs($this->user)->patchJson("/api/notifications/{$fresh->id}/unread")
            ->assertExactJson(['unseen' => 0, 'unread' => 3, 'total' => 3]);
        $this->assertNull($fresh->refresh()->read_at);
        $this->assertNotNull($fresh->seen_at);
    }

    /** გვერდი: გვერდებად, ფილტრი წაუკითხავით და ტიპით, ტიპების რიცხვები */
    public function test_the_page_is_paginated_and_filters_by_unread_and_type(): void
    {
        foreach (range(1, 12) as $i) {
            app(Notifier::class)->send($this->user, NotificationType::BATCH_DONE, ['kind' => 'sync', 'n' => $i]);
        }
        app(Notifier::class)->send($this->user, NotificationType::STORAGE_WARNING, ['percent' => 81]);
        $this->user->notifications()->where('type', NotificationType::BATCH_DONE)->limit(5)->get()->each->markAsRead();

        $first = $this->actingAs($this->user)->getJson('/api/notifications')->assertOk();
        $this->assertCount(10, $first->json('data'));
        $this->assertSame(['total' => 13, 'last_page' => 2], $first->json('meta'));
        $this->assertSame([NotificationType::BATCH_DONE => 12, NotificationType::STORAGE_WARNING => 1], $first->json('types'));
        $this->assertSame(8, $first->json('unread'));

        $this->assertCount(3, $this->actingAs($this->user)->getJson('/api/notifications?page=2')->json('data'));
        $this->assertSame(8, $this->actingAs($this->user)->getJson('/api/notifications?unread=1')->json('meta.total'));

        $typed = $this->actingAs($this->user)->getJson('/api/notifications?type='.NotificationType::STORAGE_WARNING)->json('data');
        $this->assertSame([NotificationType::STORAGE_WARNING], array_column($typed, 'type'));

        $this->actingAs($this->user)->getJson('/api/notifications?type=made_up')->assertStatus(422);
    }

    /** მონიშნულებზე ერთად — და სხვისი id არაფერს ემთხვევა */
    public function test_bulk_actions_touch_only_my_selected_rows(): void
    {
        foreach (range(1, 4) as $i) {
            app(Notifier::class)->send($this->user, NotificationType::BATCH_DONE, ['n' => $i]);
        }
        app(Notifier::class)->send($this->admin, NotificationType::BATCH_DONE, []);

        $mine = $this->user->notifications()->pluck('id')->all();
        $theirs = $this->admin->notifications()->firstOrFail()->id;

        $this->actingAs($this->user)
            ->postJson('/api/notifications/bulk', ['action' => 'read', 'ids' => [$mine[0], $mine[1], $theirs]])
            ->assertOk()
            ->assertJsonPath('affected', 2)
            ->assertJsonPath('unread', 2);
        $this->assertNull($this->admin->notifications()->firstOrFail()->read_at);

        $this->actingAs($this->user)
            ->postJson('/api/notifications/bulk', ['action' => 'unread', 'ids' => [$mine[0]]])
            ->assertJsonPath('affected', 1)
            ->assertJsonPath('unread', 3);

        $this->actingAs($this->user)
            ->postJson('/api/notifications/bulk', ['action' => 'delete', 'ids' => [$mine[2], $mine[3], $theirs]])
            ->assertJsonPath('affected', 2)
            ->assertJsonPath('total', 2);
        $this->assertSame(1, $this->admin->notifications()->count());

        $this->actingAs($this->user)->postJson('/api/notifications/bulk', ['action' => 'archive', 'ids' => $mine])->assertStatus(422);
        $this->actingAs($this->user)->postJson('/api/notifications/bulk', ['action' => 'read', 'ids' => []])->assertStatus(422);
    }

    /**
     * ⚠️ სხვისი შეტყობინება **404-ია**: `DatabaseNotification` არც
     * `BelongsToUser`-ს იყენებს და არც `EnsureRecordOwnership` ხედავს
     * (`Illuminate\Bus\Batch`-ის იგივე ხაფანგი).
     */
    public function test_another_users_notification_is_a_404(): void
    {
        app(Notifier::class)->send($this->admin, NotificationType::BATCH_DONE, []);
        $id = $this->admin->notifications()->firstOrFail()->id;

        $this->actingAs($this->user)->patchJson("/api/notifications/{$id}/read")->assertStatus(404);
        $this->actingAs($this->user)->patchJson("/api/notifications/{$id}/unread")->assertStatus(404);
        $this->actingAs($this->user)->deleteJson("/api/notifications/{$id}")->assertStatus(404);

        $this->assertNull($this->admin->notifications()->firstOrFail()->read_at);
    }

    public function test_the_list_carries_a_route_for_the_types_that_have_one(): void
    {
        app(Notifier::class)->send($this->user, NotificationType::STORAGE_WARNING, ['percent' => 81]);
        app(Notifier::class)->send($this->user, NotificationType::BATCH_DONE, ['kind' => 'sync']);

        $rows = collect($this->actingAs($this->user)->getJson('/api/notifications')->json('data'))
            ->keyBy('type');

        $this->assertSame('/profile', $rows[NotificationType::STORAGE_WARNING]['route']);
        // ⚠️ პარტიას საკუთარი გვერდი არ აქვს — `null` და არა შეთხზული მისამართი
        $this->assertNull($rows[NotificationType::BATCH_DONE]['route']);
    }

    /* ================= კვოტა ================= */

    /**
     * **ზღვრის გადალახვა ერთ შეტყობინებას წერს და არა ყოველ ატვირთვაზე ერთს.**
     *
     * ⚠️ ეს ტესტის მთავარი აზრია: „80%-ზე მეტია" ყოველ ატვირთვაზე
     * ჭეშმარიტია, ე.ი. მდგომარეობაზე დაწერილი შემოწმება ბეჯს ხმაურად
     * აქცევდა.
     */
    public function test_the_quota_warning_fires_once_per_threshold(): void
    {
        Storage::fake('public');

        /* 10 000 ბაიტი კვოტა; თითო ატვირთვა 4 KB = **4096 ბაიტი**
           (⚠️ `UploadedFile::fake()->create($name, $kb)` კილობაიტებს იღებს).
           პირველის შემდეგ 41%, მეორის შემდეგ 82% — ე.ი. 80%-ის ხაზი (8000)
           ზუსტად ერთხელ იკვეთება, 95%-ისა კი (9500) — არასდროს. */
        $this->user->forceFill(['storage_quota_bytes' => 10_000, 'storage_used_bytes' => 0])->save();

        $meter = app(StorageMeter::class);

        foreach ([4, 4] as $kb) {
            $meter->storeUpload(
                $this->user,
                UploadedFile::fake()->create('a.bin', $kb),
                StorageFolder::AVATARS,
            );
        }

        $warnings = $this->user->notifications()
            ->where('type', NotificationType::STORAGE_WARNING)
            ->get();

        $this->assertCount(1, $warnings, 'the warning must fire exactly once per threshold');
        $this->assertSame(StorageMeter::WARN_AT, $warnings[0]->data['threshold']);
    }

    /* ================= ასლი ================= */

    public function test_a_failed_backup_reaches_every_super_admin(): void
    {
        $second = User::factory()->create();
        $second->assignRole('super_admin')->save();

        app(Notifier::class)->toAdmins(NotificationType::BACKUP_FAILED, ['name' => 'x.sql']);

        $this->assertSame(1, $this->admin->notifications()->count());
        $this->assertSame(1, $second->notifications()->count());
        // ⚠️ ჩვეულებრივ მომხმარებელს ინსტალაციის მოვლენა არ ეხება
        $this->assertSame(0, $this->user->notifications()->count());
    }

    public function test_a_disabled_admin_is_skipped(): void
    {
        $this->admin->forceFill(['is_active' => false])->save();

        app(Notifier::class)->toAdmins(NotificationType::BACKUP_FAILED, []);

        $this->assertSame(0, $this->admin->notifications()->count());
    }

    /* ================= რეესტრი ================= */

    /**
     * **ყველა სახეს ორივე ლოკალში ტექსტი აქვს.**
     *
     * ⚠️ ტექსტი ბაზაში არ ინახება (ენა ბრაუზერში ირჩევა), ე.ი. დავიწყებული
     * თარგმანი ეკრანზე **ნედლ კოდს** დახატავდა — და არც ტიპი, არც lint
     * ამას ვერ დაინახავდა.
     */
    public function test_every_type_has_a_label_in_both_locales(): void
    {
        foreach (['ka', 'en'] as $locale) {
            $path = base_path("../frontend/src/i18n/{$locale}.json");
            $this->assertFileExists($path);

            $keys = json_decode(file_get_contents($path), true)['notifications']['kind'] ?? [];

            foreach (NotificationType::ALL as $type) {
                $this->assertArrayHasKey($type, $keys, "`{$type}` has no {$locale} label");
            }
        }
    }

    /** ცხრილის არქონა შეტყობინებას ჩუმად ტოვებს და არაფერს ტეხს */
    public function test_a_missing_table_never_breaks_the_caller(): void
    {
        DatabaseBackup::query()->delete();
        Schema::drop('notifications');

        app(Notifier::class)->send($this->user, NotificationType::BATCH_DONE, []);

        $this->assertTrue(true);
    }
}
