<?php

namespace Tests\Feature;

use App\Models\ApprovalRequest;
use App\Models\AppSetting;
use App\Models\Role;
use App\Models\User;
use App\Support\AppSettings;
use App\Support\UploadLimits;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **ატვირთვის ლიმიტები** (2026-09-14 → Tasks §34).
 *
 * ⚠️ 2026-09-14-ის ორი ფაქტი ისევ აქაა: რუკა ერთია და **ნამდვილი ჭერი PHP-ს
 * ითვალისწინებს**. §34-მა მესამე დაამატა — **ვინ ცვლის**: სუპერადმინი
 * (ინსტალაციის მნიშვნელობა), დამტკიცებული მოთხოვნა (პირადი გამონაკლისი ან
 * „ყველასთვის"), და **არავინ** — აქტიური შიგთავსი (იხ. `CustomFieldTest`-ის
 * SEC-05 ტესტი, რომელიც სამივე წყაროს ამოწმებს).
 */
class UploadLimitsTest extends TestCase
{
    use RefreshDatabase;

    private User $root;

    private User $alice;

    private User $bob;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);
        Storage::fake('public');

        $this->root = tap($this->makeUser('root'), fn (User $u) => $u->assignRole('super_admin')->save())->refresh();
        $this->alice = $this->makeUser('alice');
        $this->bob = $this->makeUser('bob');
    }

    /** ⚠️ ლიმიტები მოდულზე დამოკიდებული არაა — user-ს არც ერთი მოდული არ სჭირდება */
    private function makeUser(string $name): User
    {
        return User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ])->refresh();
    }

    /** ავატარის ატვირთვა — `primary` სახეობა, მოდულის გარეშე */
    private function uploadAvatar(User $user, UploadedFile $file)
    {
        return $this->actingAs($user)->post('/api/auth/profile', ['_method' => 'PATCH', 'avatar' => $file], ['Accept' => 'application/json']);
    }

    /** `mimes:` წესის სია */
    private function mimesOf(array $rule): array
    {
        $mimes = collect($rule)->first(fn ($r) => is_string($r) && str_starts_with($r, 'mimes:'));

        return $mimes ? explode(',', substr($mimes, 6)) : [];
    }

    /* ================================================================
       2026-09-14-ის ფაქტები
       ================================================================ */

    /**
     * ⚠️ **ჭერი ორი რიცხვის მინიმუმია** — აპისა და `php.ini`-ის. სწორედ ეს
     * იყო ხარვეზის გული: `php.ini` 2M-ზე იდგა, აპი კი 100 MB-ს ჰპირდებოდა.
     */
    public function test_the_effective_limit_never_exceeds_the_php_ceiling(): void
    {
        $serverKb = UploadLimits::serverMaxKb();

        foreach (array_keys(UploadLimits::KINDS) as $kind) {
            $this->assertLessThanOrEqual($serverKb, UploadLimits::effectiveKb($kind, null), "„{$kind}\"-ის ჭერი PHP-ის ლიმიტს აღემატება");
            $this->assertLessThanOrEqual(UploadLimits::maxKb($kind, null), UploadLimits::effectiveKb($kind, null));
        }
    }

    /** ინტერფეისს იგივე რიცხვები მიაქვს, რასაც ვალიდაცია ამოწმებს */
    public function test_the_endpoint_reports_every_kind(): void
    {
        $data = $this->actingAs($this->alice)->getJson('/api/uploads/limits')->assertOk()->json('data');

        $this->assertSame(array_keys(UploadLimits::KINDS), array_column($data['kinds'], 'kind'));

        foreach ($data['kinds'] as $kind) {
            $this->assertSame(UploadLimits::effectiveKb($kind['kind'], $this->alice) * 1024, $kind['max_bytes']);
        }

        $this->assertSame(UploadLimits::MAX_FILES, $data['max_files']);
        $this->assertNotEmpty($data['server']['upload_max_filesize']);
        $this->assertFalse($data['can_edit']);
        $this->assertTrue($this->actingAs($this->root)->getJson('/api/uploads/limits')->json('data.can_edit'));
    }

    /* ================================================================
       §34.4 — ნამდვილი სია
       ================================================================ */

    /**
     * ⚠️ **„ნებისმიერი ფორმატი" ტყუილი იყო** — სურათს `image` წესი იცავდა,
     * რომელიც მხოლოდ ამ ცხრას იღებდა. ახლა ის სიაა, იგივე შედეგით, და
     * **არც ერთ სახეობას ცარიელი სია არ აქვს**.
     */
    public function test_every_kind_has_a_real_list_and_images_match_the_image_rule(): void
    {
        $laravelImageRule = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'avif', 'heic', 'heif'];

        $image = $this->mimesOf(UploadLimits::rule('image', null));
        sort($image);
        sort($laravelImageRule);
        $this->assertSame($laravelImageRule, $image);

        foreach (array_keys(UploadLimits::KINDS) as $kind) {
            $this->assertNotEmpty($this->mimesOf(UploadLimits::rule($kind, null)), "{$kind}: ცარიელი სია");
            $this->assertNotEmpty(UploadLimits::all(null)['kinds'][array_search($kind, array_keys(UploadLimits::KINDS), true)]['mimes']);
        }

        // უცნობი სახეობა `doc`-ზე ეშვება და არა შეცდომაზე
        $this->assertSame(UploadLimits::rule('doc', null), UploadLimits::rule('რაღაც', null));
    }

    /**
     * ⚠️ **ფსევდონიმი ნამდვილი ფაილისაა**: `.mobi`-ს `finfo` `prc`-ად ცნობს,
     * ე.ი. ე-წიგნის სიის `mobi` აქამდე ყოველთვის 422-ს იღებდა.
     */
    public function test_aliases_follow_what_the_server_actually_detects(): void
    {
        $book = $this->mimesOf(UploadLimits::rule('book', null));
        $this->assertContains('prc', $book);
        $this->assertNotContains('fb2', $book, 'fb2 XML-ია და ყოველთვის 422-ს იღებდა');

        $this->assertContains('jpeg', $this->mimesOf(UploadLimits::rule('primary', null)));
    }

    /* ================================================================
       §34.2 — სუპერადმინის რედაქტორი
       ================================================================ */

    public function test_a_super_admin_changes_a_limit_for_everyone(): void
    {
        $this->uploadAvatar($this->alice, UploadedFile::fake()->image('a.png', 10, 10))->assertOk();

        $this->actingAs($this->root)->putJson('/api/admin/uploads/limits', [
            'kinds' => ['primary' => ['max_kb' => 2048, 'formats' => ['jpg', 'webp']]],
        ])->assertOk()->assertJsonPath('data.kinds.1.installation.formats', ['jpg', 'webp']);

        // ⚠️ ცვლილება **მომდევნო მოთხოვნაზე მაშინვე** მოქმედებს — ქეში მოთხოვნისაა
        $this->uploadAvatar($this->bob, UploadedFile::fake()->image('b.png', 10, 10))->assertStatus(422);
        $this->uploadAvatar($this->bob, UploadedFile::fake()->image('b.jpg', 10, 10))->assertOk();
        $this->uploadAvatar($this->bob, UploadedFile::fake()->image('big.jpg', 10, 10)->size(3000))->assertStatus(422);

        $this->assertSame(['jpg', 'webp'], UploadLimits::installation('primary')['formats']);
        $this->assertSame(1, AppSetting::count());
    }

    /** ⚠️ ნაგულისხმევის ტოლი მნიშვნელობა ბაზიდან იშლება — „დაბრუნება" ცალკე endpoint არ სჭირდება */
    public function test_saving_the_default_removes_the_stored_row(): void
    {
        $this->actingAs($this->root)->putJson('/api/admin/uploads/limits', [
            'kinds' => ['doc' => ['max_kb' => 4096]],
        ])->assertOk();
        $this->assertTrue(AppSettings::has(UploadLimits::SETTING));

        $this->actingAs($this->root)->putJson('/api/admin/uploads/limits', [
            'kinds' => ['doc' => UploadLimits::defaults('doc')],
        ])->assertOk();

        $this->assertSame(0, AppSetting::count());
        $this->assertSame(UploadLimits::defaults('doc'), UploadLimits::installation('doc'));
    }

    public function test_only_a_super_admin_edits_the_installation(): void
    {
        $role = Role::create([
            'key' => 'moderator',
            'name_ka' => 'მოდერატორი',
            'name_en' => 'Moderator',
            'permissions' => ['admin:users' => ['view', 'update'], 'admin:requests' => ['view', 'update']],
        ]);
        $this->alice->forceFill(['role_id' => $role->id])->save();

        $this->actingAs($this->alice->refresh())->putJson('/api/admin/uploads/limits', [
            'kinds' => ['doc' => ['max_kb' => 4096]],
        ])->assertStatus(403);

        $this->assertSame(0, AppSetting::count());
    }

    /**
     * ⚠️ **ფორმატი სიიდან ირჩევა** — აქტიური შიგთავსი, უცნობი ფორმატი და
     * სხვა ოჯახის ფორმატი (PDF სურათის სახეობაში) **422**-ია და არა ჩუმი
     * გამოტოვება.
     */
    public function test_the_editor_refuses_formats_outside_the_catalogue(): void
    {
        foreach ([['image', 'svg'], ['doc', 'html'], ['doc', 'exe'], ['image', 'pdf'], ['video', 'mp3']] as [$kind, $format]) {
            $this->actingAs($this->root)->putJson('/api/admin/uploads/limits', [
                'kinds' => [$kind => ['formats' => ['jpg', $format]]],
            ])->assertStatus(422)->assertJsonPath('message', 'upload_format_not_allowed');
        }

        $this->actingAs($this->root)->putJson('/api/admin/uploads/limits', [
            'kinds' => ['nope' => ['max_kb' => 4096]],
        ])->assertStatus(422)->assertJsonPath('message', 'upload_kind_unknown');

        // ცარიელი სია — სახეობა, რომელიც არაფერს იღებს, ღილაკს მთელ აპში ტეხს
        $this->actingAs($this->root)->putJson('/api/admin/uploads/limits', [
            'kinds' => ['doc' => ['formats' => []]],
        ])->assertStatus(422);

        $this->assertSame(0, AppSetting::count());
    }

    /** ⚠️ იმპორტის ფორმატი ფიქსირებულია — ზომა იცვლება, ფორმატი კი ისევ csv/txt */
    public function test_a_locked_kind_keeps_its_formats(): void
    {
        $this->actingAs($this->root)->putJson('/api/admin/uploads/limits', [
            'kinds' => ['import' => ['max_kb' => 20480, 'formats' => ['pdf']]],
        ])->assertOk();

        $this->assertSame(['txt', 'csv'], UploadLimits::installation('import')['formats']);
        $this->assertSame(20480, UploadLimits::installation('import')['max_kb']);
    }

    /** ⚠️ ბაზაში ხელით ჩაწერილი ნაგავი ნაგულისხმევზე ბრუნდება და ვალიდაციაში არ ჩადის */
    public function test_a_tampered_row_falls_back_to_the_default(): void
    {
        AppSettings::put(UploadLimits::SETTING, ['kinds' => ['doc' => ['max_kb' => 'lots', 'formats' => ['svg', 'html']]]]);

        $this->assertSame(UploadLimits::defaults('doc'), UploadLimits::installation('doc'));
    }

    /* ================================================================
       §34.6 — პირადი გამონაკლისი
       ================================================================ */

    public function test_a_personal_exception_widens_only_that_account(): void
    {
        $this->actingAs($this->root)->putJson('/api/admin/uploads/limits', [
            'kinds' => ['primary' => ['formats' => ['jpg']]],
        ])->assertOk();

        UploadLimits::widenPersonal($this->alice, 'primary', ['png'], 16384);

        $this->uploadAvatar($this->alice->refresh(), UploadedFile::fake()->image('a.png', 10, 10))->assertOk();
        $this->uploadAvatar($this->bob, UploadedFile::fake()->image('b.png', 10, 10))->assertStatus(422);

        $kind = collect($this->actingAs($this->alice)->getJson('/api/uploads/limits')->json('data.kinds'))->firstWhere('kind', 'primary');
        $this->assertSame(['jpg', 'png'], $kind['mimes']);
        $this->assertSame(['png'], $kind['personal']['formats']);
        $this->assertSame(16384, $kind['max_kb']);
        $this->assertSame(['jpg'], $kind['installation']['formats']);
    }

    /**
     * ⚠️ **გამონაკლისი `users.settings`-ში არ ცხოვრობს** — `PUT /auth/settings`
     * ბლობს მთლიანად იღებს, ე.ი. იქ ჩაწერილს მომხმარებელი თავისთავს მისცემდა.
     */
    public function test_the_settings_blob_cannot_grant_an_exception(): void
    {
        $this->actingAs($this->alice)->putJson('/api/auth/settings', [
            'settings' => ['upload_overrides' => ['doc' => ['formats' => ['mp3'], 'max_kb' => 4194304]]],
        ])->assertOk();

        $this->assertNull(UploadLimits::personal('doc', $this->alice->refresh()));
        $this->assertNotContains('mp3', UploadLimits::effective('doc', $this->alice)['formats']);
    }

    public function test_an_admin_sees_and_removes_an_exception(): void
    {
        UploadLimits::widenPersonal($this->alice, 'doc', ['mp3', 'flac'], null);

        $this->actingAs($this->root)->getJson("/api/admin/users/{$this->alice->id}")
            ->assertOk()
            ->assertJsonPath('upload_overrides.doc.formats', ['mp3', 'flac']);

        $this->actingAs($this->root)->putJson("/api/admin/users/{$this->alice->id}/upload-overrides", [
            'overrides' => ['doc' => ['formats' => ['flac'], 'max_kb' => null]],
        ])->assertOk()->assertJsonPath('upload_overrides.doc.formats', ['flac']);

        $this->actingAs($this->root)->putJson("/api/admin/users/{$this->alice->id}/upload-overrides", [
            'overrides' => [],
        ])->assertOk();

        $this->assertNull($this->alice->refresh()->upload_overrides);

        // აქტიური შიგთავსი ამ გზითაც ვერ ჩაირთვება
        $this->actingAs($this->root)->putJson("/api/admin/users/{$this->alice->id}/upload-overrides", [
            'overrides' => ['doc' => ['formats' => ['svg']]],
        ])->assertStatus(422)->assertJsonPath('message', 'upload_format_not_allowed');
    }

    /** ⚠️ SEC-02-ის კარი: `admin:users`-ის მქონე ადმინი სუპერადმინის გამონაკლისს ვერ ეხება */
    public function test_a_section_admin_cannot_edit_an_account_above_them(): void
    {
        $role = Role::create([
            'key' => 'moderator',
            'name_ka' => 'მოდერატორი',
            'name_en' => 'Moderator',
            'permissions' => ['admin:users' => ['view', 'update']],
        ]);
        $this->alice->forceFill(['role_id' => $role->id])->save();

        $this->actingAs($this->alice->refresh())->putJson("/api/admin/users/{$this->root->id}/upload-overrides", [
            'overrides' => ['doc' => ['formats' => ['mp3']]],
        ])->assertStatus(403)->assertJsonPath('message', 'role_escalation');

        // ჩვეულებრივ ანგარიშზე კი შეუძლია
        $this->actingAs($this->alice)->putJson("/api/admin/users/{$this->bob->id}/upload-overrides", [
            'overrides' => ['doc' => ['formats' => ['mp3']]],
        ])->assertOk();
    }

    /* ================================================================
       §34.5 — მოთხოვნის გზა
       ================================================================ */

    private function askFor(User $user, array $body)
    {
        return $this->actingAs($user)->postJson('/api/requests/upload', $body);
    }

    /** ⚠️ payload-ში **მხოლოდ ახალი** ფორმატი იწერება — ის, რაც უკვე აქვს, „ჩართვად" არ ჩანს */
    public function test_a_request_records_only_what_is_new(): void
    {
        $payload = $this->askFor($this->alice, ['kind' => 'doc', 'formats' => ['pdf', 'mp3'], 'max_kb' => 51200, 'message' => 'მინდა აუდიო'])
            ->assertCreated()
            ->json('data.payload');

        $this->assertSame('doc', $payload['kind']);
        $this->assertSame(['mp3'], $payload['formats']);
        $this->assertSame(51200, $payload['max_kb']);
    }

    public function test_a_request_that_asks_for_nothing_new_is_refused(): void
    {
        $this->askFor($this->alice, ['kind' => 'doc', 'formats' => ['pdf'], 'max_kb' => 1024])
            ->assertStatus(422)->assertJsonPath('message', 'upload_request_nothing_new');

        $this->askFor($this->alice, ['kind' => 'doc'])
            ->assertStatus(422)->assertJsonPath('message', 'upload_request_nothing_new');
    }

    /** ⚠️ აქტიური შიგთავსის მოთხოვნა **ვერც შეიქმნება** — დამტკიცებამდე */
    public function test_active_content_cannot_even_be_requested(): void
    {
        foreach (['svg', 'html', 'js', 'php', 'xml'] as $format) {
            $this->askFor($this->alice, ['kind' => 'doc', 'formats' => [$format]])
                ->assertStatus(422)->assertJsonPath('message', 'upload_format_not_allowed');
        }

        $this->askFor($this->alice, ['kind' => 'import', 'formats' => ['xlsx']])
            ->assertStatus(422)->assertJsonPath('message', 'upload_formats_locked');

        $this->assertSame(0, ApprovalRequest::count());
    }

    public function test_one_open_request_per_kind(): void
    {
        $this->askFor($this->alice, ['kind' => 'doc', 'formats' => ['mp3']])->assertCreated();
        $this->askFor($this->alice, ['kind' => 'doc', 'formats' => ['flac']])
            ->assertStatus(422)->assertJsonPath('message', 'upload_request_pending');

        // სხვა სახეობაზე — შეიძლება
        $this->askFor($this->alice, ['kind' => 'video', 'formats' => ['mkv']])->assertCreated();
    }

    /**
     * ⚠️ **„მხოლოდ მას" ნაგულისხმევია** — ერთი დაჭერა (`/users/{id}`-ის სწრაფი
     * დამტკიცება scope-ს არ აგზავნის) სხვებს არაფერს უცვლის.
     */
    public function test_approving_for_the_user_alone_is_the_default(): void
    {
        $id = $this->askFor($this->alice, ['kind' => 'doc', 'formats' => ['mp3']])->json('data.id');

        $this->actingAs($this->root)->postJson("/api/admin/requests/{$id}/approve")
            ->assertOk()
            ->assertJsonPath('data.payload.granted_scope', 'user');

        $this->assertContains('mp3', UploadLimits::effective('doc', $this->alice->refresh())['formats']);
        $this->assertNotContains('mp3', UploadLimits::effective('doc', $this->bob)['formats']);
        $this->assertNotContains('mp3', UploadLimits::installation('doc')['formats']);

        // მთხოვნელი იგებს, **ვისზე** გავრცელდა — და შეტყობინება `/settings`-ზე მიდის
        $note = $this->actingAs($this->alice)->getJson('/api/notifications')->json('data.0');
        $this->assertSame('request_approved', $note['type']);
        $this->assertSame('user', $note['data']['upload_scope']);
        $this->assertSame(['mp3'], $note['data']['upload_formats']);
        $this->assertSame('/settings', $note['route']);
    }

    public function test_a_super_admin_can_approve_for_everyone(): void
    {
        $id = $this->askFor($this->alice, ['kind' => 'video', 'formats' => ['mkv'], 'max_kb' => 204800])->json('data.id');

        $this->actingAs($this->root)->postJson("/api/admin/requests/{$id}/approve", ['scope' => 'all'])
            ->assertOk()
            ->assertJsonPath('data.payload.granted_scope', 'all');

        $this->assertContains('mkv', UploadLimits::effective('video', $this->bob)['formats']);
        $this->assertSame(204800, UploadLimits::installation('video')['max_kb']);
        $this->assertNull($this->alice->refresh()->upload_overrides);
    }

    /**
     * ⚠️ **„ყველასთვის" ინსტალაციის ლიმიტის შეცვლაა** — `admin:requests` ერთი
     * სექციის უფლებაა და SEC-02-ის წესით ძალაუფლების ლიცენზია ვერ იქნება.
     */
    public function test_a_section_admin_cannot_approve_for_everyone(): void
    {
        $role = Role::create([
            'key' => 'moderator',
            'name_ka' => 'მოდერატორი',
            'name_en' => 'Moderator',
            'permissions' => ['admin:requests' => ['view', 'update']],
        ]);
        $this->bob->forceFill(['role_id' => $role->id])->save();

        $id = $this->askFor($this->alice, ['kind' => 'doc', 'formats' => ['mp3']])->json('data.id');

        $this->actingAs($this->bob->refresh())->postJson("/api/admin/requests/{$id}/approve", ['scope' => 'all'])
            ->assertStatus(403)
            ->assertJsonPath('message', 'role_escalation');

        $this->assertSame('pending', ApprovalRequest::find($id)->status);
        $this->assertNotContains('mp3', UploadLimits::installation('doc')['formats']);

        // „მხოლოდ მას" კი მისი სექციის საქმეა
        $this->actingAs($this->bob)->postJson("/api/admin/requests/{$id}/approve", ['scope' => 'user'])->assertOk();
        $this->assertContains('mp3', UploadLimits::effective('doc', $this->alice->refresh())['formats']);
    }

    /* ================================================================
       ბაზის ასლი — `doc`-ის ლიმიტს აღარ ემორჩილება
       ================================================================ */

    /**
     * ⚠️ დოკუმენტის ზომა ახლა სუპერადმინის ხელშია — „დოკუმენტები 1 MB" ბაზის
     * ასლის ატვირთვას ჩუმად არ უნდა კეტავდეს.
     */
    public function test_the_backup_upload_ignores_the_document_limit(): void
    {
        $this->actingAs($this->root)->putJson('/api/admin/uploads/limits', [
            'kinds' => ['doc' => ['max_kb' => UploadLimits::MIN_KB]],
        ])->assertOk();

        $this->actingAs($this->root)->getJson('/api/admin/backups')
            ->assertOk()
            ->assertJsonPath('meta.max_upload_kb', UploadLimits::serverMaxKb());
    }
}
