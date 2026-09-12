<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\User;
use App\Models\Video;
use App\Services\Storage\StorageMeter;
use App\Support\CustomFields;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **Tasks §6, ფაზა 3 — მორგებული ველები** (`DECISIONS.md` §2: ცალკე ცხრილი).
 *
 * ჩამაგრებულია ის, რაც ადვილად იშლება ჩუმად:
 *  · განსაზღვრება მოდულზეა, მნიშვნელობა — ჩანაწერზე;
 *  · **ტიპი სვეტს ირჩევს** (რიცხვი `value_number`-ში, თარიღი `value_date`-ში);
 *  · სიიდან ამოღებული ველი **მნიშვნელობებსაც** იტანს;
 *  · ცარიელი მნიშვნელობა რიგს **შლის**;
 *  · სხვისი ჩანაწერი **404-ია**.
 */
class CustomFieldTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->user = User::create([
            'name' => 'gia',
            'username' => 'gia',
            'email' => 'gia@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::whereIn('key', ['video'])->pluck('id')->all());
        $this->user = $this->user->refresh();
    }

    private function defineFields(array $fields): array
    {
        return $this->actingAs($this->user)
            ->putJson('/api/modules/video/custom-fields', ['fields' => $fields])
            ->assertOk()
            ->json('fields');
    }

    private function makeVideo(): Video
    {
        return Video::create([
            'user_id' => $this->user->id,
            'title' => 'ტესტი',
            'url' => 'https://youtu.be/abc',
        ]);
    }

    public function test_definitions_get_a_key_from_the_label(): void
    {
        $fields = $this->defineFields([
            ['type' => 'text', 'label_ka' => 'ვისთან ვნახე', 'label_en' => 'Watched with'],
        ]);

        $this->assertCount(1, $fields);
        $this->assertSame('watched_with', $fields[0]['key']);
        $this->assertTrue($fields[0]['custom']);
        // ⚠️ მორგებული ველი საჯარო ბარათზე არ ჩანს — გადამრთველიც არ აქვს
        $this->assertFalse($fields[0]['public']);
    }

    /** ჩაშენებული და მორგებული ველები ერთ სიაში ბრუნდება (`useModuleFields`) */
    public function test_custom_fields_join_the_built_in_list(): void
    {
        $this->defineFields([['type' => 'text', 'label_en' => 'Mood', 'sort_order' => 5]]);

        $keys = collect($this->actingAs($this->user)->getJson('/api/modules/video/fields')->json('fields'))
            ->pluck('key')
            ->all();

        $this->assertContains('mood', $keys);
        $this->assertContains('duration', $keys);
    }

    /** ⚠️ ტიპი სვეტს ირჩევს — რიცხვი ტექსტში არ ჯდება */
    public function test_values_land_in_the_typed_column(): void
    {
        $this->defineFields([
            ['type' => 'number', 'label_en' => 'Seats'],
            ['type' => 'date', 'label_en' => 'Seen on'],
            ['type' => 'switch', 'label_en' => 'Rewatch'],
            ['type' => 'list', 'label_en' => 'People'],
        ]);

        $video = $this->makeVideo();

        $this->actingAs($this->user)
            ->putJson("/api/custom-fields/video/{$video->id}", ['values' => [
                'seats' => '4',
                'seen_on' => '2026-09-06',
                'rewatch' => false,
                'people' => ['გია', 'ნინო'],
            ]])
            ->assertOk()
            ->assertJsonPath('values.seats', 4)
            ->assertJsonPath('values.seen_on', '2026-09-06')
            // ⚠️ გადამრთველზე `false` **მნიშვნელობაა** და არა სიცარიელე
            ->assertJsonPath('values.rewatch', false)
            ->assertJsonPath('values.people', ['გია', 'ნინო']);

        $row = DB::table('video_field_values')->where('field_key', 'seats')->first();
        $this->assertSame(4.0, (float) $row->value_number);
        $this->assertNull($row->value_text);
    }

    /** ⚠️ ცარიელი მნიშვნელობა რიგს შლის და არა ცარიელს წერს */
    public function test_clearing_a_value_removes_the_row(): void
    {
        $this->defineFields([['type' => 'text', 'label_en' => 'Mood']]);
        $video = $this->makeVideo();

        $this->actingAs($this->user)
            ->putJson("/api/custom-fields/video/{$video->id}", ['values' => ['mood' => 'კარგი']])
            ->assertOk();
        $this->assertSame(1, DB::table('video_field_values')->count());

        $this->actingAs($this->user)
            ->putJson("/api/custom-fields/video/{$video->id}", ['values' => ['mood' => '']])
            ->assertOk()
            ->assertJsonPath('values', []);
        $this->assertSame(0, DB::table('video_field_values')->count());
    }

    /** ⚠️ ველის წაშლა მნიშვნელობებსაც იტანს — თორემ ობოლი რიგები დარჩებოდა */
    public function test_removing_a_definition_drops_its_values(): void
    {
        $fields = $this->defineFields([
            ['type' => 'text', 'label_en' => 'Mood'],
            ['type' => 'text', 'label_en' => 'Place'],
        ]);
        $video = $this->makeVideo();

        $this->actingAs($this->user)
            ->putJson("/api/custom-fields/video/{$video->id}", ['values' => ['mood' => 'კარგი', 'place' => 'სახლი']])
            ->assertOk();
        $this->assertSame(2, DB::table('video_field_values')->count());

        // მხოლოდ ერთი რჩება — key უცვლელი უნდა დარჩეს
        $this->defineFields([['key' => $fields[0]['key'], 'type' => 'text', 'label_en' => 'Mood']]);

        $this->assertSame(1, DB::table('video_field_values')->count());
        $this->assertSame('mood', DB::table('video_field_values')->value('field_key'));
    }

    /** ჩანაწერის წაშლა მნიშვნელობებსაც შლის (ბაზის cascade) */
    public function test_deleting_the_record_removes_its_values(): void
    {
        $this->defineFields([['type' => 'text', 'label_en' => 'Mood']]);
        $video = $this->makeVideo();

        $this->actingAs($this->user)
            ->putJson("/api/custom-fields/video/{$video->id}", ['values' => ['mood' => 'კარგი']])
            ->assertOk();

        $this->actingAs($this->user)->deleteJson("/api/videos/{$video->id}")->assertNoContent();

        $this->assertSame(0, DB::table('video_field_values')->count());
    }

    /** ⚠️ სხვისი ჩანაწერი **404-ია** — `owner` scope-ის გამო ის უბრალოდ არ არსებობს */
    public function test_another_users_record_is_not_found(): void
    {
        $this->defineFields([['type' => 'text', 'label_en' => 'Mood']]);

        $other = User::create([
            'name' => 'nino',
            'username' => 'nino',
            'email' => 'nino@example.com',
            'password' => 'password',
        ]);
        $foreign = Video::withoutGlobalScope('owner')->create([
            'user_id' => $other->id,
            'title' => 'სხვისი',
            'url' => 'https://youtu.be/xyz',
        ]);

        $this->actingAs($this->user)
            ->getJson("/api/custom-fields/video/{$foreign->id}")
            ->assertStatus(404);
    }

    /** მოდული, რომელსაც მორგებული ველები არ აქვს (`gallery`) — 404 */
    public function test_unsupported_module_is_not_found(): void
    {
        $this->actingAs($this->user)
            ->getJson('/api/modules/gallery/custom-fields')
            ->assertStatus(404);
    }

    /* ---------- ფაზა 4b — `ფაილი` ტიპი (🔗 §17) ---------- */

    private function defineFileField(): void
    {
        $this->defineFields([
            ['key' => 'ticket', 'type' => 'file', 'label_ka' => 'ბილეთი', 'label_en' => 'Ticket'],
        ]);
    }

    /** ატვირთვა კვოტაზე გადის, საქაღალდე მოდულისაა და ზომა ცხრილში ჯდება */
    public function test_file_upload_is_metered_and_lands_in_the_module_folder(): void
    {
        Storage::fake('public');
        $this->defineFileField();
        $video = $this->makeVideo();

        $before = (int) $this->user->fresh()->storage_used_bytes;

        $value = $this->actingAs($this->user)
            ->post("/api/custom-fields/video/{$video->id}/file", [
                'key' => 'ticket',
                'file' => UploadedFile::fake()->create('ticket.pdf', 40),
            ])
            ->assertCreated()
            ->json('value');

        /* §7.3 — ⚠️ **მნიშვნელობა სიაა და ერთ ფაილზეც**: ცვალებადი ფორმა
           („ერთზე ობიექტი, ორზე მასივი") ფრონტს ყოველ გამოყენებაზე
           `Array.isArray()`-ს მოსთხოვდა. */
        $this->assertCount(1, $value);
        $this->assertSame('ticket.pdf', $value[0]['name']);

        $row = DB::table('video_field_values')->where('field_key', 'ticket')->first();
        $this->assertSame("/custom-fields/video/{$video->id}/file/ticket/{$row->id}", $value[0]['url']);
        // ⚠️ ფესვი მოდულისაა (`videos/`), თორემ §17.2-ის ლიმიტი სხვა მოდულს დაეთვლებოდა
        $this->assertStringStartsWith('videos/fields/', $row->value_path);
        $this->assertSame($value[0]['size'], (int) $row->value_size);

        // მრიცხველი ჩაწერილი ზომით გაიზარდა
        $this->assertSame($before + (int) $row->value_size, (int) $this->user->fresh()->storage_used_bytes);
    }

    /**
     * ⚠️ **მნიშვნელობების ჩვეულებრივი `PUT` ფაილს ვერ შლის.** ბარათი მთელ
     * მონახაზს აგზავნის და ფაილის აღწერა მასშიც ზის — გატარება ჩუმად წაშლიდა.
     */
    public function test_values_put_never_touches_a_file_field(): void
    {
        Storage::fake('public');
        $this->defineFileField();
        $video = $this->makeVideo();

        $this->actingAs($this->user)->post("/api/custom-fields/video/{$video->id}/file", [
            'key' => 'ticket',
            'file' => UploadedFile::fake()->create('ticket.pdf', 10),
        ])->assertCreated();

        $this->actingAs($this->user)
            ->putJson("/api/custom-fields/video/{$video->id}", ['values' => ['ticket' => null]])
            ->assertOk();

        $this->assertDatabaseCount('video_field_values', 1);
        $this->assertNotNull(DB::table('video_field_values')->value('value_path'));
    }

    /** ფაილის წაშლა: დისკიდანაც ქრება და კვოტაც უკან ბრუნდება */
    public function test_deleting_a_file_frees_the_quota(): void
    {
        Storage::fake('public');
        $this->defineFileField();
        $video = $this->makeVideo();

        $this->actingAs($this->user)->post("/api/custom-fields/video/{$video->id}/file", [
            'key' => 'ticket',
            'file' => UploadedFile::fake()->create('ticket.pdf', 30),
        ])->assertCreated();

        $path = DB::table('video_field_values')->value('value_path');
        $this->assertTrue(Storage::disk('public')->exists($path));

        $this->actingAs($this->user)
            ->deleteJson("/api/custom-fields/video/{$video->id}/file/ticket")
            ->assertNoContent();

        $this->assertFalse(Storage::disk('public')->exists($path));
        // ⚠️ რიგიც იშლება — `file` ველზე ფაილი *არის* მნიშვნელობა
        $this->assertDatabaseCount('video_field_values', 0);
        $this->assertSame(0, (int) $this->user->fresh()->storage_used_bytes);
    }

    /**
     * ⚠️ **ჩანაწერის წაშლა ფაილსაც იტანს.** რიგებს SQL-ის კასკადი შლის, ის კი
     * მოდელის ივენთს არ ისვრის — სწორედ ამიტომ არსებობს `HasCustomFields`.
     */
    public function test_deleting_the_record_removes_the_file_and_releases_the_quota(): void
    {
        Storage::fake('public');
        $this->defineFileField();
        $video = $this->makeVideo();

        $this->actingAs($this->user)->post("/api/custom-fields/video/{$video->id}/file", [
            'key' => 'ticket',
            'file' => UploadedFile::fake()->create('ticket.pdf', 50),
        ])->assertCreated();

        $path = DB::table('video_field_values')->value('value_path');

        $video->delete();

        $this->assertFalse(Storage::disk('public')->exists($path));
        $this->assertSame(0, (int) $this->user->fresh()->storage_used_bytes);
    }

    /** ველის სიიდან ამოღება ატვირთულ ფაილსაც იტანს */
    public function test_removing_the_definition_removes_the_file(): void
    {
        Storage::fake('public');
        $this->defineFileField();
        $video = $this->makeVideo();

        $this->actingAs($this->user)->post("/api/custom-fields/video/{$video->id}/file", [
            'key' => 'ticket',
            'file' => UploadedFile::fake()->create('ticket.pdf', 20),
        ])->assertCreated();

        $path = DB::table('video_field_values')->value('value_path');

        $this->defineFields([]);

        $this->assertFalse(Storage::disk('public')->exists($path));
        $this->assertDatabaseCount('video_field_values', 0);
        $this->assertSame(0, (int) $this->user->fresh()->storage_used_bytes);
    }

    /**
     * ⚠️ **ტიპის შეცვლაც წაშლაა.** სხვა ტიპებზე ძველი მნიშვნელობა უბრალოდ
     * აღარ იკითხება; ფაილი კი დისკზე ობლად დარჩებოდა.
     */
    public function test_retyping_a_file_field_removes_the_file(): void
    {
        Storage::fake('public');
        $this->defineFileField();
        $video = $this->makeVideo();

        $this->actingAs($this->user)->post("/api/custom-fields/video/{$video->id}/file", [
            'key' => 'ticket',
            'file' => UploadedFile::fake()->create('ticket.pdf', 20),
        ])->assertCreated();

        $path = DB::table('video_field_values')->value('value_path');

        $this->defineFields([
            ['key' => 'ticket', 'type' => 'text', 'label_ka' => 'ბილეთი', 'label_en' => 'Ticket'],
        ]);

        $this->assertFalse(Storage::disk('public')->exists($path));
        $this->assertNull(DB::table('video_field_values')->value('value_path'));
        $this->assertSame(0, (int) $this->user->fresh()->storage_used_bytes);
    }

    /** კვოტის ამოწურვა — **413** და არა 422 (§17-ის წესი) */
    public function test_upload_over_the_quota_is_rejected(): void
    {
        Storage::fake('public');
        $this->defineFileField();
        $video = $this->makeVideo();

        $this->user->forceFill(['storage_quota_bytes' => 1024])->save();

        $this->actingAs($this->user)
            ->post("/api/custom-fields/video/{$video->id}/file", [
                'key' => 'ticket',
                'file' => UploadedFile::fake()->create('ticket.pdf', 100),
            ])
            ->assertStatus(413)
            ->assertJsonPath('message', 'storage_quota_exceeded');

        $this->assertDatabaseCount('video_field_values', 0);
    }

    /** არა-`file` ველზე ატვირთვა 422-ია და არა ჩუმი იგნორი */
    public function test_uploading_to_a_non_file_field_is_rejected(): void
    {
        Storage::fake('public');
        $this->defineFields([
            ['key' => 'mood', 'type' => 'text', 'label_ka' => 'ხასიათი', 'label_en' => 'Mood'],
        ]);
        $video = $this->makeVideo();

        $this->actingAs($this->user)
            ->post("/api/custom-fields/video/{$video->id}/file", [
                'key' => 'mood',
                'file' => UploadedFile::fake()->create('x.pdf', 5),
            ])
            ->assertStatus(422);
    }

    /** ფაილი მხოლოდ policy-ით დაცული route-იდან გაიცემა; სხვისთვის — **404** */
    public function test_only_the_owner_can_download_the_file(): void
    {
        Storage::fake('public');
        $this->defineFileField();
        $video = $this->makeVideo();

        $this->actingAs($this->user)->post("/api/custom-fields/video/{$video->id}/file", [
            'key' => 'ticket',
            'file' => UploadedFile::fake()->create('ticket.pdf', 10),
        ])->assertCreated();

        $this->actingAs($this->user)
            ->get("/api/custom-fields/video/{$video->id}/file/ticket")
            ->assertOk();

        $other = User::create([
            'name' => 'nino',
            'username' => 'nino',
            'email' => 'nino@example.com',
            'password' => 'password',
        ]);
        $other->modules()->sync(Module::where('key', 'video')->pluck('id')->all());

        $this->actingAs($other->refresh())
            ->get("/api/custom-fields/video/{$video->id}/file/ticket")
            ->assertStatus(404);
    }

    /**
     * ⚠️ **ატვირთვა საცავის სიაშიც ჩანს და ობოლი არაა.** უამისოდ ადმინის
     * „გასუფთავება" წაშლიდა ცოცხალ ფაილს (ზუსტად ის, რაც თამაშებს დაემართა).
     */
    public function test_the_file_is_counted_and_never_looks_orphaned(): void
    {
        Storage::fake('public');
        $this->defineFileField();
        $video = $this->makeVideo();

        $this->actingAs($this->user)->post("/api/custom-fields/video/{$video->id}/file", [
            'key' => 'ticket',
            'file' => UploadedFile::fake()->create('ticket.pdf', 60),
        ])->assertCreated();

        $meter = app(StorageMeter::class);
        $user = $this->user->fresh();

        $this->assertSame(1, $meter->files($user)->where('owner_type', 'field_value')->count());
        // მოდულებად დაშლაში ვიდეოს მოდულს ეწერება (საქაღალდის ფესვიც `videos/`-ია)
        $this->assertGreaterThan(0, $meter->breakdown($user)['video'] ?? 0);
        // ჩაქეშილი მრიცხველი და დისკიდან გადათვლა ერთმანეთს ემთხვევა
        $this->assertSame((int) $user->storage_used_bytes, $meter->recalculate($user));

        /* ⚠️ **`orphans()` აქ არ გამოდგება** — ის ბოლო საათში შეცვლილ ფაილს
           ისედაც ტოვებს, ე.ი. ტესტი ყოველთვის გაივლიდა და ხაფანგს ვერ
           დაიჭერდა. ვამოწმებთ სწორედ იმ სიას, რომელსაც გასუფთავება ეყრდნობა. */
        $path = DB::table('video_field_values')->value('value_path');

        $referenced = (new \ReflectionMethod($meter, 'referencedPaths'))->invoke($meter);
        $this->assertArrayHasKey($path, $referenced);
    }

    /* ---------- §7.3 — ერთ ველზე რამდენიმე ფაილი ---------- */

    /**
     * ⚠️ **მეორე ატვირთვა პირველს აღარ შლის.** სწორედ ეს იყო ფაზა 4b-ის ქცევა
     * (`unique(record_id, field_key)`), და §7.3 სწორედ მას ცვლის.
     */
    public function test_a_second_upload_is_added_not_substituted(): void
    {
        Storage::fake('public');
        $this->defineFileField();
        $video = $this->makeVideo();

        foreach (['one.pdf', 'two.pdf'] as $name) {
            $this->actingAs($this->user)->post("/api/custom-fields/video/{$video->id}/file", [
                'key' => 'ticket',
                'file' => UploadedFile::fake()->create($name, 20),
            ])->assertCreated();
        }

        $value = $this->actingAs($this->user)
            ->getJson("/api/custom-fields/video/{$video->id}")
            ->assertOk()
            ->json('values.ticket');

        // თანმიმდევრობა ატვირთვისაა (`sort_order`)
        $this->assertSame(['one.pdf', 'two.pdf'], array_column($value, 'name'));
        $this->assertSame(2, DB::table('video_field_values')->where('field_key', 'ticket')->count());

        // ორივე ფაილი დისკზეა და ორივე კვოტაშია
        $paths = DB::table('video_field_values')->pluck('value_path');
        $this->assertCount(2, array_unique($paths->all()));
        foreach ($paths as $path) {
            Storage::disk('public')->assertExists($path);
        }
        $this->assertSame(
            (int) DB::table('video_field_values')->sum('value_size'),
            (int) $this->user->fresh()->storage_used_bytes,
        );
    }

    /** ერთ რექვესთში პარტია — ბარათი ყველა არჩეულს ერთად აგზავნის */
    public function test_a_batch_upload_keeps_every_file(): void
    {
        Storage::fake('public');
        $this->defineFileField();
        $video = $this->makeVideo();

        $value = $this->actingAs($this->user)
            ->post("/api/custom-fields/video/{$video->id}/file", [
                'key' => 'ticket',
                'files' => [
                    UploadedFile::fake()->create('a.pdf', 10),
                    UploadedFile::fake()->create('b.pdf', 10),
                    UploadedFile::fake()->create('c.pdf', 10),
                ],
            ])
            ->assertCreated()
            ->json('value');

        $this->assertSame(['a.pdf', 'b.pdf', 'c.pdf'], array_column($value, 'name'));
    }

    /**
     * ⚠️ **ერთი ფაილის წაშლა დანარჩენებს არ ეხება**, და სწორედ ამიტომ აქვს
     * თითოეულს `id` — სახელი უნიკალური არაა.
     */
    public function test_one_file_can_be_deleted_without_the_others(): void
    {
        Storage::fake('public');
        $this->defineFileField();
        $video = $this->makeVideo();

        foreach (['one.pdf', 'two.pdf'] as $name) {
            $this->actingAs($this->user)->post("/api/custom-fields/video/{$video->id}/file", [
                'key' => 'ticket',
                'file' => UploadedFile::fake()->create($name, 30),
            ])->assertCreated();
        }

        $first = DB::table('video_field_values')->orderBy('sort_order')->first();
        $used = (int) $this->user->fresh()->storage_used_bytes;

        $this->actingAs($this->user)
            ->deleteJson("/api/custom-fields/video/{$video->id}/file/ticket/{$first->id}")
            ->assertNoContent();

        Storage::disk('public')->assertMissing($first->value_path);
        $this->assertSame(1, DB::table('video_field_values')->count());
        // კვოტას **ჩაწერილი ზომა** დაუბრუნდა (`StoredFile`-ის წესი)
        $this->assertSame($used - (int) $first->value_size, (int) $this->user->fresh()->storage_used_bytes);

        // მეორე ფაილი ხელუხლებელია და ისევ გაიცემა
        $rest = DB::table('video_field_values')->first();
        Storage::disk('public')->assertExists($rest->value_path);
        $this->actingAs($this->user)
            ->get("/api/custom-fields/video/{$video->id}/file/ticket/{$rest->id}")
            ->assertOk();
    }

    /** id-ის გარეშე წაშლა ისევ **ველის ყველა** ფაილს იღებს (ძველი მისამართი) */
    public function test_deleting_without_an_id_clears_every_file_of_the_field(): void
    {
        Storage::fake('public');
        $this->defineFileField();
        $video = $this->makeVideo();

        foreach (['one.pdf', 'two.pdf'] as $name) {
            $this->actingAs($this->user)->post("/api/custom-fields/video/{$video->id}/file", [
                'key' => 'ticket',
                'file' => UploadedFile::fake()->create($name, 15),
            ])->assertCreated();
        }

        $this->actingAs($this->user)
            ->deleteJson("/api/custom-fields/video/{$video->id}/file/ticket")
            ->assertNoContent();

        $this->assertSame(0, DB::table('video_field_values')->count());
        $this->assertSame(0, (int) $this->user->fresh()->storage_used_bytes);
    }

    /**
     * ⚠️ **ჭერზე 422 და არა ჩუმად „აიტვირთა"** — ბაიტები უკვე მოვიდა და
     * წარმატების დაბრუნება ისეთ რამეს დაპირდებოდა, რაც არ მოხდა.
     */
    public function test_the_per_field_file_cap_is_enforced(): void
    {
        Storage::fake('public');
        $this->defineFileField();
        $video = $this->makeVideo();

        for ($i = 0; $i < CustomFields::FILE_MAX_COUNT; $i++) {
            $this->actingAs($this->user)->post("/api/custom-fields/video/{$video->id}/file", [
                'key' => 'ticket',
                'file' => UploadedFile::fake()->create("f{$i}.pdf", 1),
            ])->assertCreated();
        }

        $this->actingAs($this->user)
            ->post("/api/custom-fields/video/{$video->id}/file", [
                'key' => 'ticket',
                'file' => UploadedFile::fake()->create('over.pdf', 1),
            ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'custom_field_file_limit');

        $this->assertSame(
            CustomFields::FILE_MAX_COUNT,
            DB::table('video_field_values')->where('field_key', 'ticket')->count(),
        );
    }

    /**
     * ⚠️ **ტიპის შეცვლა `file`-იდან ყველა რიგს იღებს** და არა მხოლოდ პირველს:
     * უფაილო რიგი აქ სრულიად ცარიელია (ტექსტი/რიცხვი `file` ველზე არასდროს
     * იწერება), ე.ი. მისი დატოვება მხოლოდ ნაგავია — და `sort_order > 0`
     * რიგები მერე ახალ ჩაწერასაც შეაწუხებდნენ.
     */
    public function test_retyping_removes_every_file_row(): void
    {
        Storage::fake('public');
        $this->defineFileField();
        $video = $this->makeVideo();

        foreach (['one.pdf', 'two.pdf', 'three.pdf'] as $name) {
            $this->actingAs($this->user)->post("/api/custom-fields/video/{$video->id}/file", [
                'key' => 'ticket',
                'file' => UploadedFile::fake()->create($name, 25),
            ])->assertCreated();
        }

        $paths = DB::table('video_field_values')->pluck('value_path')->all();

        $this->defineFields([
            ['key' => 'ticket', 'type' => 'text', 'label_ka' => 'ბილეთი', 'label_en' => 'Ticket'],
        ]);

        foreach ($paths as $path) {
            Storage::disk('public')->assertMissing($path);
        }
        $this->assertSame(0, DB::table('video_field_values')->count());
        $this->assertSame(0, (int) $this->user->fresh()->storage_used_bytes);

        // ველი ისევ იწერება — ძველი რიგები ახალ მნიშვნელობას ვერ უშლიან ხელს
        $this->actingAs($this->user)
            ->putJson("/api/custom-fields/video/{$video->id}", ['values' => ['ticket' => 'A-12']])
            ->assertOk()
            ->assertJsonPath('values.ticket', 'A-12');
    }
}
