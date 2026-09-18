<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Role;
use App\Models\User;
use App\Models\Video;
use App\Models\VideoFile;
use App\Models\VideoNote;
use App\Models\VideoType;
use App\Services\Modules\FieldSettings;
use App\Services\Storage\StorageMeter;
use App\Support\VideoUrl;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * I5 — ვიდეოს მოდული: ბმულის ამოცნობა, მფლობელობა და მიმაგრებული შიგთავსი.
 */
class VideoModuleTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);
        $this->user = $this->makeUser('vera', ['video']);
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

    public function test_url_parser_recognises_platforms(): void
    {
        $yt = VideoUrl::parse('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s');
        $this->assertSame('youtube', $yt['platform']);
        $this->assertSame('dQw4w9WgXcQ', $yt['external_id']);
        $this->assertSame('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', $yt['embed_url']);

        $this->assertSame('dQw4w9WgXcQ', VideoUrl::parse('https://youtu.be/dQw4w9WgXcQ')['external_id']);
        $this->assertSame('dQw4w9WgXcQ', VideoUrl::parse('https://www.youtube.com/shorts/dQw4w9WgXcQ')['external_id']);
        $this->assertSame('vimeo', VideoUrl::parse('https://vimeo.com/76979871')['platform']);
        $this->assertSame('file', VideoUrl::parse('https://cdn.example.com/clip.mp4')['platform']);

        // უცნობი წყარო embed-ის გარეშე რჩება — iframe მხოლოდ allowlist-ზე
        $other = VideoUrl::parse('https://example.com/watch/123');
        $this->assertSame('other', $other['platform']);
        $this->assertNull($other['embed_url']);
    }

    /**
     * ⚠️ ტიპიც და სტატუსიც სავალდებულოა — ვიდეო ვერცერთის გარეშე ვერ იქმნება.
     * ტიპების ლექსიკონი ზარმაცად ითესება, ამიტომ პირველი გამოძახება იანგარიშებს.
     */
    private function videoDefaults(): array
    {
        return [
            'status' => 'to_watch',
            'type_id' => $this->actingAs($this->user)->getJson('/api/video-types')->json('data.0.id'),
        ];
    }

    public function test_module_gate_and_crud(): void
    {
        $outsider = $this->makeUser('nomodule', []);
        $this->actingAs($outsider)->getJson('/api/videos')->assertStatus(403);

        $this->actingAs($this->user)
            ->postJson('/api/videos', [
                'title' => 'Rick',
                'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                'tags' => ['music', 'meme'],
            ] + $this->videoDefaults())
            ->assertStatus(201)
            ->assertJsonPath('data.platform', 'youtube')
            ->assertJsonPath('data.embed_url', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
            ->assertJsonPath('data.tags', ['music', 'meme']);

        $video = Video::withoutGlobalScope('owner')->firstOrFail();
        $this->assertSame($this->user->id, $video->user_id);

        $this->actingAs($this->user)->patchJson("/api/videos/{$video->id}/favorite")
            ->assertOk()->assertJsonPath('data.is_favorite', true);

        $this->actingAs($this->user)->postJson("/api/videos/{$video->id}/watched")
            ->assertOk()->assertJsonPath('data.watch_count', 1);
    }

    public function test_other_users_video_is_not_found(): void
    {
        $other = $this->makeUser('otto', ['video']);
        $video = Video::create([
            'user_id' => $other->id,
            'title' => 'Private',
            'url' => 'https://youtu.be/dQw4w9WgXcQ',
        ]);

        $this->actingAs($this->user)->getJson("/api/videos/{$video->id}")->assertStatus(404);
        $this->actingAs($this->user)->getJson('/api/videos')->assertOk()->assertJsonCount(0, 'data');
    }

    /** K3 — ფაილები/ჩანიშვნები და მათი გასუფთავება ვიდეოს წაშლისას */
    public function test_files_and_notes_lifecycle(): void
    {
        Storage::fake('public');

        $video = Video::create([
            'user_id' => $this->user->id,
            'title' => 'With extras',
            'url' => 'https://youtu.be/dQw4w9WgXcQ',
        ]);

        $this->actingAs($this->user)
            ->postJson("/api/videos/{$video->id}/files", [
                'kind' => 'image',
                'files' => [UploadedFile::fake()->image('shot.jpg')],
            ])
            ->assertStatus(201);

        $this->actingAs($this->user)
            ->postJson("/api/videos/{$video->id}/files", [
                'kind' => 'doc',
                'files' => [UploadedFile::fake()->create('notes.pdf', 12, 'application/pdf')],
            ])
            ->assertStatus(201);

        $this->actingAs($this->user)
            ->postJson("/api/videos/{$video->id}/notes", ['body' => 'timestamp 3:20'])
            ->assertStatus(201);

        $this->actingAs($this->user)->getJson('/api/videos')
            ->assertOk()
            ->assertJsonPath('data.0.images_count', 1)
            ->assertJsonPath('data.0.documents_count', 1)
            ->assertJsonPath('data.0.notes_count', 1);

        $path = VideoFile::where('kind', 'image')->value('path');
        Storage::disk('public')->assertExists($path);

        // ვიდეოს წაშლა → ჩანაწერებიც და ფაილებიც ქრება
        $this->actingAs($this->user)->deleteJson("/api/videos/{$video->id}")->assertNoContent();

        $this->assertSame(0, VideoFile::withoutGlobalScope('owner')->count());
        $this->assertSame(0, VideoNote::withoutGlobalScope('owner')->count());
        Storage::disk('public')->assertMissing($path);
    }

    /** სხვისი ფაილი მიუწვდომელია */
    public function test_file_of_another_user_is_not_found(): void
    {
        Storage::fake('public');

        $other = $this->makeUser('otto2', ['video']);
        $video = Video::create(['user_id' => $other->id, 'title' => 'X', 'url' => 'https://youtu.be/abc123']);
        $file = $video->files()->create([
            'user_id' => $other->id,
            'kind' => 'image',
            'path' => 'videos/files/images/x.jpg',
        ]);

        $this->actingAs($this->user)->getJson("/api/videos/{$video->id}/files")->assertStatus(404);
        $this->actingAs($this->user)->deleteJson("/api/video-files/{$file->id}")->assertStatus(404);
    }

    /** Tasks 5.1 — ტიპების ლექსიკონი: დეფაულტები, CRUD და წაშლაზე გადატანა */
    public function test_video_types_are_managed_per_user(): void
    {
        // პირველ მოთხოვნაზე დეფაულტები ჩნდება (ინფორმაციული + გასართობი)
        $this->actingAs($this->user)->getJson('/api/video-types')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.key', 'info');

        $created = $this->actingAs($this->user)
            ->postJson('/api/video-types', ['name_ka' => 'გაკვეთილი', 'name_en' => 'Lesson'])
            ->assertStatus(201)
            ->json('data');

        $lesson = $created['id'];
        $default = VideoType::withoutGlobalScope('owner')
            ->where('user_id', $this->user->id)->where('key', 'info')->value('id');

        $video = $this->actingAs($this->user)
            ->postJson('/api/videos', [
                'title' => 'Laravel intro',
                'url' => 'https://youtu.be/dQw4w9WgXcQ',
                'type_id' => $lesson,
                'status' => 'to_watch',
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.type_id', $lesson)
            // 5.6 — ხილვადობა ნაგულისხმევად პირადია
            ->assertJsonPath('data.visibility', 'private')
            ->json('data.id');

        // ტიპით ფილტრი
        $this->actingAs($this->user)->getJson("/api/videos?type_id={$lesson}")
            ->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($this->user)->getJson("/api/videos?type_id={$default}")
            ->assertOk()->assertJsonCount(0, 'data');

        // წაშლაზე ვიდეო სხვა ტიპზე გადადის და არ იშლება
        $this->actingAs($this->user)
            ->deleteJson("/api/video-types/{$lesson}", ['move_to' => $default])
            ->assertOk()
            ->assertJsonPath('moved', 1);

        $this->actingAs($this->user)->getJson("/api/videos/{$video}")
            ->assertOk()->assertJsonPath('data.type_id', $default);
    }

    /** სხვისი ტიპი არ არსებობს */
    public function test_video_type_of_another_user_is_not_found(): void
    {
        $other = $this->makeUser('otto3', ['video']);
        $type = VideoType::withoutGlobalScope('owner')->create([
            'user_id' => $other->id,
            'key' => 'secret',
            'name_ka' => 'საიდუმლო',
            'name_en' => 'Secret',
        ]);

        $this->actingAs($this->user)->patchJson("/api/video-types/{$type->id}", [
            'name_ka' => 'ჩემი',
            'name_en' => 'Mine',
        ])->assertStatus(404);

        // სხვისი ტიპის მიბმაც აკრძალულია (ვალიდაცია)
        $this->actingAs($this->user)->postJson('/api/videos', [
            'title' => 'X',
            'url' => 'https://youtu.be/dQw4w9WgXcQ',
            'type_id' => $type->id,
        ])->assertStatus(422);
    }

    /** Tasks 5.3 — ტეგების დუბლი backend-ზეც იჭრება */
    public function test_duplicate_tags_are_removed(): void
    {
        $this->actingAs($this->user)
            ->postJson('/api/videos', [
                'title' => 'Tagged',
                'url' => 'https://youtu.be/dQw4w9WgXcQ',
                'tags' => ['Music', 'music', ' music ', 'meme'],
            ] + $this->videoDefaults())
            ->assertStatus(201)
            ->assertJsonPath('data.tags', ['Music', 'meme']);
    }

    /**
     * Tasks 17.1/17.3 — კვოტა: ატვირთვა ითვლება, წაშლა ათავისუფლებს,
     * ამოწურვაზე იბლოკება (413).
     */
    public function test_storage_quota_counts_uploads_and_blocks_at_the_limit(): void
    {
        Storage::fake('public');
        $meter = app(StorageMeter::class);

        $video = Video::create([
            'user_id' => $this->user->id,
            'title' => 'Quota',
            'url' => 'https://youtu.be/dQw4w9WgXcQ',
        ]);

        $this->assertSame(0, (int) $this->user->storage_used_bytes);

        $file = UploadedFile::fake()->create('doc.pdf', 100, 'application/pdf'); // ~100 KB
        $this->actingAs($this->user)
            ->postJson("/api/videos/{$video->id}/files", ['kind' => 'doc', 'files' => [$file]])
            ->assertStatus(201);

        // საქაღალდე მოდულისაა (2026-09-04): `videos/files/docs/…` და არა `documents/`
        $this->assertStringStartsWith(
            'videos/files/docs/',
            (string) $video->files()->value('path'),
        );

        $used = (int) $this->user->refresh()->storage_used_bytes;
        $this->assertGreaterThan(0, $used);
        // დაქეშილი მრიცხველი და დისკიდან გადათვლილი ერთი და იგივეა
        $this->assertSame($used, $meter->recalculate($this->user->refresh()));

        // მიმაგრებული ფაილი მოდულის ჭრილშიც ჩანს (17.5-ის ბაზისი)
        $this->actingAs($this->user)->getJson('/api/storage')
            ->assertOk()
            ->assertJsonPath('used', $used)
            ->assertJsonPath('quota', 1073741824)
            ->assertJsonPath('modules.video', $used);

        // ლიმიტის ჩამოწევა → შემდეგი ატვირთვა იბლოკება, არსებული ფაილი რჩება
        $this->user->forceFill(['storage_quota_bytes' => $used + 10])->save();

        $this->actingAs($this->user->refresh())
            ->postJson("/api/videos/{$video->id}/files", [
                'kind' => 'doc',
                'files' => [UploadedFile::fake()->create('big.pdf', 50, 'application/pdf')],
            ])
            ->assertStatus(413)
            ->assertJsonPath('message', 'storage_quota_exceeded');

        $this->assertSame(1, VideoFile::withoutGlobalScope('owner')->count());

        // ვიდეოს წაშლა კასკადით ათავისუფლებს კვოტას
        $this->actingAs($this->user)->deleteJson("/api/videos/{$video->id}")->assertNoContent();
        $this->assertSame(0, (int) $this->user->refresh()->storage_used_bytes);
    }

    /**
     * Tasks 4 → §9 — მასობრივი ოპერაცია: ტიპი, ტეგები და **სტატუსი**.
     *
     * ⚠️ წყარო ახლა ცხადი `scope`-ია (`ids | type | tag | status | all`) —
     * იგივე ლექსიკა, რასაც `PurgeService::TARGET_MODES` იყენებს. სკოუპის
     * პარამეტრებს `scope_` პრეფიქსი აქვს, თორემ „დაამატე ტეგი X ყველას,
     * ვისაც X აქვს" თავის თავზე მიუთითებდა.
     */
    public function test_bulk_changes_type_and_tags(): void
    {
        $types = $this->actingAs($this->user)->getJson('/api/video-types')->json('data');
        [$info, $fun] = [$types[0]['id'], $types[1]['id']];

        $a = Video::create([
            'user_id' => $this->user->id,
            'title' => 'A',
            'url' => 'https://youtu.be/aaaaaaaaaaa',
            'type_id' => $info,
            'tags' => ['Music'],
        ]);
        $b = Video::create([
            'user_id' => $this->user->id,
            'title' => 'B',
            'url' => 'https://youtu.be/bbbbbbbbbbb',
            'type_id' => $info,
        ]);
        // სხვისი ვიდეო არ უნდა შეეხოს (global scope)
        $other = $this->makeUser('otto4', ['video']);
        $foreign = Video::create([
            'user_id' => $other->id,
            'title' => 'Foreign',
            'url' => 'https://youtu.be/ccccccccccc',
            'type_id' => $info,
        ]);

        // „ამ ტიპის ყველა" → ახალი ტიპი
        $this->actingAs($this->user)
            ->postJson('/api/videos/bulk', ['action' => 'type', 'scope' => 'type', 'scope_type_id' => $info, 'type_id' => $fun])
            ->assertOk()
            ->assertJsonPath('updated', 2);

        $this->assertSame($fun, $a->refresh()->type_id);
        $this->assertSame($fun, $b->refresh()->type_id);
        $this->assertSame($info, $foreign->refresh()->type_id);

        // ტეგის დამატება კონკრეტულებზე; არსებული დუბლად არ ჩნდება
        $this->actingAs($this->user)
            ->postJson('/api/videos/bulk', [
                'action' => 'tags_add',
                'scope' => 'ids',
                'scope_ids' => [$a->id, $b->id],
                'tags' => ['music', 'meme'],
            ])
            ->assertOk()
            ->assertJsonPath('updated', 2);

        $this->assertSame(['Music', 'meme'], $a->refresh()->tags);
        $this->assertSame(['music', 'meme'], $b->refresh()->tags);

        // მოხსნა რეგისტრს არ ითვალისწინებს
        $this->actingAs($this->user)
            ->postJson('/api/videos/bulk', [
                'action' => 'tags_remove',
                'scope' => 'ids',
                'scope_ids' => [$a->id, $b->id],
                'tags' => [' MUSIC '],
            ])
            ->assertOk()
            ->assertJsonPath('updated', 2);

        $this->assertSame(['meme'], $a->refresh()->tags);
        $this->assertSame(['meme'], $b->refresh()->tags);

        // ცვლილების გარეშე — 0, არა შეცდომა
        $this->actingAs($this->user)
            ->postJson('/api/videos/bulk', ['action' => 'tags_remove', 'scope' => 'ids', 'scope_ids' => [$a->id], 'tags' => ['nope']])
            ->assertOk()
            ->assertJsonPath('updated', 0);

        // სკოუპის გარეშე 422 — „ყველა" ცხადი არჩევანია და არა ცარიელი ფილტრი
        $this->actingAs($this->user)
            ->postJson('/api/videos/bulk', ['action' => 'type', 'type_id' => $fun])
            ->assertStatus(422);
        $this->actingAs($this->user)
            ->postJson('/api/videos/bulk', [
                'action' => 'tags_add', 'scope' => 'ids', 'scope_ids' => [$a->id], 'tags' => [],
            ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'no_tags_given');
    }

    /**
     * **§9.1 — ტეგის სკოუპი: „ვისაც ეს ტეგი აქვს".**
     *
     * ⚠️ ქართული ტეგი JSON სვეტში **escape-ულად** ზის, ე.ი. `LIKE` ვერასდროს
     * დაემთხვეოდა — შედარება `Video::tagKey()`-ით PHP-შია.
     */
    public function test_the_tag_scope_matches_georgian_tags(): void
    {
        $types = $this->actingAs($this->user)->getJson('/api/video-types')->json('data');

        $hit = Video::create([
            'user_id' => $this->user->id, 'title' => 'ერთი',
            'url' => 'https://youtu.be/ddddddddddd',
            'type_id' => $types[0]['id'], 'tags' => ['ინფორმაცია'],
        ]);
        Video::create([
            'user_id' => $this->user->id, 'title' => 'ორი',
            'url' => 'https://youtu.be/eeeeeeeeeee',
            'type_id' => $types[0]['id'], 'tags' => ['სხვა'],
        ]);

        // პრევიუ და ჩაწერა **ერთი query-დან** მოდის
        $this->actingAs($this->user)
            ->getJson('/api/videos/bulk-preview?scope=tag&scope_tag='.urlencode('ინფორმაცია'))
            ->assertOk()
            ->assertJsonPath('count', 1)
            ->assertJsonPath('sample.0.title', 'ერთი');

        $this->actingAs($this->user)
            ->postJson('/api/videos/bulk', [
                'action' => 'tags_add', 'scope' => 'tag', 'scope_tag' => 'ინფორმაცია', 'tags' => ['ახალი'],
            ])
            ->assertOk()
            ->assertJsonPath('updated', 1);

        $this->assertSame(['ინფორმაცია', 'ახალი'], $hit->refresh()->tags);
    }

    /**
     * **§9.6 — მასობრივი სტატუსი იმავე სკოუპებით.**
     *
     * ⚠️ `POST /videos/bulk-status` მხოლოდ `ids`/`from_status`-ს იცნობს,
     * ე.ი. SPA აქ მოდის — თორემ სკოუპის მეორე განმარტება დაიბადებოდა.
     */
    public function test_bulk_status_uses_the_same_scopes(): void
    {
        $types = $this->actingAs($this->user)->getJson('/api/video-types')->json('data');
        $statuses = $this->actingAs($this->user)->getJson('/api/statuses/video')->json('data');
        $target = collect($statuses)->firstWhere('role', 'done') ?? $statuses[0];

        $video = Video::create([
            'user_id' => $this->user->id, 'title' => 'C',
            'url' => 'https://youtu.be/fffffffffff', 'type_id' => $types[0]['id'],
        ]);

        $this->actingAs($this->user)
            ->postJson('/api/videos/bulk', [
                'action' => 'status', 'scope' => 'all', 'status' => $target['key'],
            ])
            ->assertOk();

        $this->assertSame($target['key'], $video->refresh()->status->key);
    }

    /** bulk = `update` უფლება და არა `create` (POST-ის მიუხედავად) */
    public function test_bulk_requires_update_permission(): void
    {
        Role::create([
            'key' => 'viewer2',
            'name_ka' => 'დამკვირვებელი',
            'name_en' => 'Viewer',
            'permissions' => ['video' => ['view', 'create']],
        ]);
        $this->user->assignRole('viewer2')->save();
        $this->user->refresh();

        $this->actingAs($this->user)
            ->postJson('/api/videos/bulk', ['action' => 'type', 'from_type_id' => 0, 'type_id' => null])
            ->assertStatus(403);
    }

    /** Tasks 1.6 — მოდულის შიდა უფლება: წვდომა აქვს, წაშლის უფლება — არა */
    public function test_role_permissions_limit_module_actions(): void
    {
        $readonly = Role::create([
            'key' => 'viewer',
            'name_ka' => 'დამკვირვებელი',
            'name_en' => 'Viewer',
            'permissions' => ['video' => ['view']],
        ]);

        $video = Video::create([
            'user_id' => $this->user->id,
            'title' => 'Locked',
            'url' => 'https://youtu.be/dQw4w9WgXcQ',
        ]);

        $this->user->assignRole('viewer')->save();
        $this->user->refresh();

        // ნახვა შეიძლება…
        $this->actingAs($this->user)->getJson('/api/videos')->assertOk();
        // …დამატება, შეცვლა და წაშლა — არა
        $this->actingAs($this->user)
            ->postJson('/api/videos', ['title' => 'X', 'url' => 'https://youtu.be/abc123'])
            ->assertStatus(403);
        $this->actingAs($this->user)->deleteJson("/api/videos/{$video->id}")->assertStatus(403);

        $this->assertFalse($this->user->hasPermission('video', 'delete'));
        $this->assertTrue($this->user->hasPermission('video', 'view'));
        $this->assertSame($readonly->id, $this->user->role_id);
    }

    public function test_super_admin_gets_active_modules_automatically(): void
    {
        $admin = $this->makeUser('root', []);
        $admin->assignRole('super_admin')->save();

        $this->assertTrue($admin->hasModule('video'));
        $this->assertTrue($admin->hasModule('movie'));
    }

    /** per-user per-module პარამეტრები (`module_user.settings`) */
    public function test_module_settings_are_stored_per_user(): void
    {
        $this->actingAs($this->user)
            ->putJson('/api/modules/video/settings', ['settings' => ['last_view' => 'media']])
            ->assertOk();

        $this->actingAs($this->user)->getJson('/api/modules')
            ->assertOk()
            ->assertJsonFragment(['last_view' => 'media']);
    }

    /* ---------- §6 (ფაზა 1) — ველების კონსტრუქტორი ---------- */

    /** ხანგრძლივობის ხელით ველი **გამორთულია** default-ად (§5) */
    public function test_optional_field_is_off_by_default_and_can_be_enabled(): void
    {
        $res = $this->actingAs($this->user)->getJson('/api/modules/video/fields')->assertOk();

        // ⚠️ გასაღებით და არა პოზიციით: კატალოგი იზრდება და რიგი `sort_order`-ისაა
        $duration = collect($res->json('fields'))->firstWhere('key', 'duration');
        $this->assertNotNull($duration, 'duration is not in the catalogue');
        $this->assertFalse($duration['enabled']);

        $after = $this->actingAs($this->user)
            ->putJson('/api/modules/video/fields', ['fields' => ['duration' => ['enabled' => true]]])
            ->assertOk()
            ->json('fields');

        $this->assertTrue(collect($after)->firstWhere('key', 'duration')['enabled']);

        $this->assertTrue(
            app(FieldSettings::class)->enabled($this->user->refresh(), 'video', 'duration'),
        );
    }

    /**
     * ⚠️ **`settings`-ის სხვა გასაღებები არ იკარგება** — ველების ჩაწერა
     * მთელ JSON-ს არ გადააწერს (გალერეის პარამეტრები, ჩანაწერების არხები
     * იმავე სვეტში ცხოვრობს).
     */
    public function test_saving_fields_keeps_other_module_settings(): void
    {
        $this->actingAs($this->user)
            ->putJson('/api/modules/video/settings', ['settings' => ['last_view' => 'media']])
            ->assertOk();

        $this->actingAs($this->user)
            ->putJson('/api/modules/video/fields', ['fields' => ['duration' => ['enabled' => true]]])
            ->assertOk();

        $this->actingAs($this->user)->getJson('/api/modules')
            ->assertOk()
            ->assertJsonFragment(['last_view' => 'media']);
    }

    /**
     * ⚠️ **და პირიქითაც** — `PUT /modules/{key}/settings` ველების კონფიგს არ
     * შლის. ეს ნამდვილი ბაგი იყო: endpoint მთელ JSON-ბლობს
     * `json_encode($data['settings'])`-ით გადააწერდა, ე.ი. „შეინახე გალერეის
     * არჩევანი" ან „შეინახე შეხსენების არხი" **ჩუმად შლიდა** ამ მოდულის
     * ველების გადახრებს (და მორგებული ველების აღწერებსაც).
     */
    public function test_saving_settings_keeps_the_field_overrides(): void
    {
        $this->actingAs($this->user)
            ->putJson('/api/modules/video/fields', ['fields' => ['duration' => ['enabled' => true]]])
            ->assertOk();

        $this->actingAs($this->user)
            ->putJson('/api/modules/video/settings', ['settings' => ['last_view' => 'media']])
            ->assertOk()
            // პასუხი შერწყმულს აბრუნებს, ე.ი. ორივე ფენა ჩანს
            ->assertJsonPath('settings.last_view', 'media');

        $fields = $this->actingAs($this->user)->getJson('/api/modules/video/fields')->assertOk()->json('fields');
        $this->assertTrue(collect($fields)->firstWhere('key', 'duration')['enabled']);

        $this->assertTrue(
            app(FieldSettings::class)->enabled($this->user->refresh(), 'video', 'duration'),
        );
    }

    /** ⚠️ უცნობი ველი ჩუმად იგნორირდება — ძველი ფრონტი ამით არ უნდა ტყდებოდეს */
    public function test_unknown_field_is_ignored_not_rejected(): void
    {
        $res = $this->actingAs($this->user)
            ->putJson('/api/modules/video/fields', ['fields' => ['nope' => ['enabled' => true]]])
            ->assertOk();

        // უცნობი ველი არსად ჩნდება; კატალოგის ველები კი ხელუხლებელია
        $keys = collect($res->json('fields'))->pluck('key')->all();
        $this->assertNotContains('nope', $keys);
        $this->assertContains('duration', $keys);
    }

    /**
     * ფაზა 2 — ლეიბლი/placeholder/`required`.
     * ⚠️ **ცარიელი ტექსტი გადახრას შლის** და არა ცარიელ ლეიბლს წერს:
     * user-ის ქმედება „დააბრუნე ნაგულისხმევი"-ა, ტექსტი კი ლოკალიზაციაშია.
     */
    public function test_field_label_and_required_can_be_overridden_and_cleared(): void
    {
        $set = fn (array $duration) => $this->actingAs($this->user)
            ->putJson('/api/modules/video/fields', ['fields' => ['duration' => $duration]])
            ->assertOk()
            ->json('fields');

        $fields = $set(['required' => true, 'label_ka' => 'წუთები', 'placeholder_ka' => 'მაგ. 240']);
        $duration = collect($fields)->firstWhere('key', 'duration');

        $this->assertTrue($duration['required']);
        $this->assertSame('წუთები', $duration['label_ka']);
        $this->assertSame('მაგ. 240', $duration['placeholder_ka']);
        // გადაუწერელი ენა `null`-ია — ფრონტი მას i18n-იდან იღებს
        $this->assertNull($duration['label_en']);

        $cleared = collect($set(['label_ka' => '  ']))->firstWhere('key', 'duration');
        $this->assertNull($cleared['label_ka']);
        // სხვა ატრიბუტი ხელუხლებელი დარჩა
        $this->assertTrue($cleared['required']);
    }

    /**
     * **§6.5 — თანმიმდევრობა კატალოგისაა და `sort_order` აღარ ისმენს.**
     *
     * ადრე რიგი UI-დან იცვლებოდა; §6.5-მ ის მოაშორა („დალაგება აქ არ
     * გვინდა"), ე.ი. გაგზავნილი `sort_order` ჩუმად უნდა დარჩეს უპასუხოდ —
     * 422 არ იყოს (ძველი ფრონტი არ უნდა გატყდეს), მაგრამ რიგიც არ შეიცვალოს.
     */
    public function test_sort_order_is_ignored_and_catalogue_order_wins(): void
    {
        $fields = $this->actingAs($this->user)
            ->putJson('/api/modules/video/fields', ['fields' => ['duration' => ['sort_order' => 1]]])
            ->assertOk()
            ->json('fields');

        // კატალოგში `url` პირველია და ისე რჩება
        $this->assertSame('url', $fields[0]['key']);
    }

    /**
     * **§6.5 → §4 — `locked` ველი ჩანს, იმართება მხოლოდ მოხსნის შემდეგ.**
     *
     * ვიდეოს `url`-ის გარეშე ჩანაწერი არ არსებობს, ამიტომ ველი სიაშია
     * (რომ სია არ ტყუოდეს) და მისი გამორთვა **backend-ზე** იგნორირდება —
     * არა მხოლოდ UI-ში. ⚠️ ჩვეულებრივი მომხმარებლისთვის ეს უცვლელია
     * მაშინაც, როცა ის `unlocked`-ს ცხადად გზავნის.
     */
    public function test_locked_field_is_listed_but_cannot_be_disabled(): void
    {
        $fields = $this->actingAs($this->user)
            ->putJson('/api/modules/video/fields', [
                'fields' => ['url' => ['unlocked' => true, 'enabled' => false, 'required' => false, 'public' => false]],
            ])
            ->assertOk()
            ->json('fields');

        $url = collect($fields)->firstWhere('key', 'url');

        $this->assertTrue($url['locked']);
        // ⚠️ მოხსნა `super_admin`-ს რჩება (Tasks §4) — უარი ჩუმია და არა 422
        $this->assertFalse($url['unlocked']);
        $this->assertTrue($url['enabled']);
        $this->assertTrue($url['required']);
        $this->assertTrue($url['public']);

        // ჩვეულებრივი ველი კი ისევ იმართება
        $title = collect($fields)->firstWhere('key', 'title');
        $this->assertFalse($title['locked']);
        $this->assertTrue($title['enabled']);
    }

    /**
     * **ჩაკეტილი → მოხსნილი → გამორთული → ისევ ჩაკეტილი** (Tasks §4.6).
     *
     * ⚠️ ბოლო ნაბიჯი ყველაზე მნიშვნელოვანია: ხელახლა ჩაკეტვამ დროშები
     * `true`-ზე უნდა დააბრუნოს, თორემ დარჩებოდა **დამალული და თან
     * „ჩაკეტილი"** ველი — ე.ი. ფორმა გატეხილი იქნებოდა, გვერდი კი
     * იტყოდა, რომ ყველაფერი წესრიგშია.
     */
    public function test_a_super_admin_can_unlock_a_locked_field_and_lock_it_back(): void
    {
        $admin = User::factory()->create(['role_id' => Role::where('key', 'super_admin')->value('id')]);
        $admin->modules()->syncWithoutDetaching([Module::where('key', 'video')->value('id')]);

        $field = fn (array $fields) => collect($fields)->firstWhere('key', 'url');

        // 1. მოხსნა — ჩაკეტვა ფაქტად რჩება, დროშები კი იმართებადი ხდება
        $url = $field($this->actingAs($admin)
            ->putJson('/api/modules/video/fields', ['fields' => ['url' => ['unlocked' => true]]])
            ->assertOk()->json('fields'));

        $this->assertTrue($url['locked'], 'კატალოგის ფაქტი უცვლელია');
        $this->assertTrue($url['unlocked']);
        $this->assertTrue($url['enabled'], 'მოხსნა თავისთავად არაფერს რთავს');

        // 2. გამორთვა — ახლა უკვე ინახება
        $url = $field($this->actingAs($admin)
            ->putJson('/api/modules/video/fields', ['fields' => ['url' => ['enabled' => false]]])
            ->assertOk()->json('fields'));

        $this->assertFalse($url['enabled']);

        // 3. ხელახლა ჩაკეტვა — დროშები უსაფრთხო მდგომარეობას უბრუნდება
        $url = $field($this->actingAs($admin)
            ->putJson('/api/modules/video/fields', ['fields' => ['url' => ['unlocked' => false]]])
            ->assertOk()->json('fields'));

        $this->assertFalse($url['unlocked']);
        $this->assertTrue($url['enabled'], 'ჩაკეტვამ დამალული ველი არ უნდა დატოვოს');
        $this->assertTrue($url['required']);
        $this->assertTrue($url['public']);
    }

    /**
     * **ნაგულისხმევზე დაბრუნება** — საგარანტიო გასასვლელი (Tasks §4).
     *
     * ⚠️ მხოლოდ `fields` იშლება: იმავე JSON ბლოკში გალერეის
     * ნაგულისხმევები და სტატუსების განლაგებაც ზის.
     */
    public function test_resetting_the_fields_keeps_the_rest_of_the_module_settings(): void
    {
        $this->actingAs($this->user)
            ->putJson('/api/modules/video/settings', ['settings' => ['gallery' => ['limit' => 7]]])
            ->assertOk();

        $this->actingAs($this->user)
            ->putJson('/api/modules/video/fields', ['fields' => ['tags' => ['enabled' => false]]])
            ->assertOk();

        $fields = $this->actingAs($this->user)
            ->deleteJson('/api/modules/video/fields')
            ->assertOk()
            ->json('fields');

        $this->assertTrue(collect($fields)->firstWhere('key', 'tags')['enabled']);

        $settings = $this->actingAs($this->user)->getJson('/api/modules')->json();
        $video = collect($settings['data'] ?? $settings)->firstWhere('key', 'video');

        $this->assertSame(7, data_get($video, 'user_settings.gallery.limit'));
    }

    /**
     * **probe `view` უფლებაა და არა `create` (Tasks GAP-04).**
     *
     * ⚠️ `POST /videos/metadata` მხოლოდ **კითხულობს** (oEmbed) და ჩანაწერს
     * არ ქმნის, მაგრამ POST-ის გამო `EnsureModulePermission` მას
     * `create`-ად კითხულობდა. ⚠️ **ეს ცოცხალი ხარვეზი იყო და არა თეორია**:
     * `VideosPage`-ის `loadMeta()` **რედაქტირებიდანაც** ეშვება (არსებული
     * ჩანაწერის URL-ის შეცვლაზე), ე.ი. როლი „ვცვლი, მაგრამ არ ვქმნი"
     * ბმულს ვერ შეასწორებდა — ცრუ 403.
     */
    public function test_an_update_only_role_can_probe_a_link(): void
    {
        Http::fake();

        $role = Role::create([
            'key' => 'video-editor',
            'name_ka' => 'რედაქტორი',
            'name_en' => 'Editor',
            'permissions' => ['video' => ['view', 'update']],
        ]);
        $this->user->forceFill(['role_id' => $role->id])->save();
        $editor = $this->user->refresh();

        $this->actingAs($editor)
            ->postJson('/api/videos/metadata', ['url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'])
            ->assertOk();

        // ⚠️ შექმნა კი ისევ დახურულია — probe-ის გახსნა მას არ აღებს
        $this->actingAs($editor)
            ->postJson('/api/videos', ['title' => 'x', 'url' => 'https://youtu.be/dQw4w9WgXcQ'])
            ->assertStatus(403)
            ->assertJson(['message' => 'forbidden_permission', 'permission' => 'video.create']);
    }
}
