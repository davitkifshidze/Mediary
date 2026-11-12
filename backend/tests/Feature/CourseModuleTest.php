<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseCategory;
use App\Models\Module;
use App\Models\User;
use App\Services\Storage\StorageMeter;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **კურსების მოდული.**
 *
 * ⚠️ `Http::fake()` აუცილებელია: ბმულის probe (`LinkMetadata`) გარე
 * მისამართს ხსნის — ტესტი ოფლაინ უნდა მუშაობდეს.
 */
class CourseModuleTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        Http::fake(['*' => Http::response('', 404)]);

        $this->user = User::factory()->create();
        $this->user->assignRole('super_admin')->save();
        /* ⚠️ **`refresh()` აუცილებელია**: ქარხანა კვოტას არ წერს, ე.ი.
           მნიშვნელობა ბაზის default-იდან მოდის და მეხსიერებაში `null`-ია —
           ატვირთვა უპირობოდ 413-ს დააბრუნებდა. */
        $this->user->refresh();
        $this->actingAs($this->user);
    }

    private function category(): CourseCategory
    {
        CourseCategory::ensureDefaults($this->user->id);

        return CourseCategory::where('user_id', $this->user->id)->firstOrFail();
    }

    private function payload(array $extra = []): array
    {
        return [
            'title' => 'Laravel from scratch',
            'status' => 'to_take',
            'category_id' => $this->category()->id,
            ...$extra,
        ];
    }

    public function test_a_course_is_created_with_its_platform_read_from_the_url(): void
    {
        $this->postJson('/api/courses', $this->payload([
            'url' => 'https://www.udemy.com/course/laravel/',
        ]))
            ->assertStatus(201)
            // ⚠️ `www.` იჭრება — „udemy.com" და „www.udemy.com" ერთი პლატფორმაა
            ->assertJsonPath('data.platform', 'udemy.com');
    }

    /**
     * YouTube-ის ბმულზე ესკიზი გვერდის გარეშე მოდის (`VideoUrl`):
     * probe აქ 404-ს აბრუნებს (setUp), ესკიზი მაინც ივსება.
     */
    public function test_a_youtube_link_gets_its_thumbnail_without_the_page(): void
    {
        $this->postJson('/api/courses', $this->payload([
            'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        ]))
            ->assertStatus(201)
            ->assertJsonPath('data.platform', 'youtube.com')
            ->assertJsonPath('data.image', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    }

    /** ⚠️ ბმული **არასავალდებულოა** — ოფლაინ კურსსაც ჩაწერ */
    public function test_a_course_without_a_link_is_legal(): void
    {
        $this->postJson('/api/courses', $this->payload())
            ->assertStatus(201)
            ->assertJsonPath('data.url', null)
            ->assertJsonPath('data.platform', null);
    }

    /** სტატუსიც და კატეგორიაც სავალდებულოა (2026-09-16-ის წესი) */
    public function test_status_and_category_are_required(): void
    {
        $this->postJson('/api/courses', ['title' => 'x'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['status', 'category_id']);
    }

    /**
     * **სტატუსი და მისი თარიღები ერთმა მეთოდმა უნდა შეათანხმოს**
     * (`Course::syncStatusDates()`).
     *
     * ⚠️ უკან დაბრუნებაზე თარიღი უნდა წავიდეს — თორემ სტატისტიკა
     * დაუსრულებელ კურსს სამუდამოდ ჩათვლიდა.
     */
    public function test_the_status_sets_and_clears_its_dates(): void
    {
        $id = $this->postJson('/api/courses', $this->payload(['status' => 'taking']))
            ->assertStatus(201)
            ->assertJsonPath('data.finished_at', null)
            ->json('data.id');

        $this->assertNotNull(Course::findOrFail($id)->started_at);

        $done = $this->patchJson("/api/courses/{$id}/status", ['status' => 'done'])
            ->assertOk()
            ->assertJsonPath('data.status', 'done');
        $this->assertNotNull($done->json('data.finished_at'));

        $this->patchJson("/api/courses/{$id}/status", ['status' => 'taking'])
            ->assertOk()
            ->assertJsonPath('data.finished_at', null);
    }

    /**
     * **„მივატოვე" (`dropped`) აღარ არის სტატუსი** — სამია: გასავლელი · გავდივარ · გავლილი.
     * ⚠️ სვეტი `string`-ია, ე.ი. ძველი მნიშვნელობა ბაზაში დარჩებოდა და ფილტრის ვერც ერთ
     * ჭრილში ვერ მოხვდებოდა; მიგრაცია მას „გასავლელში" აბრუნებს, იმპორტი კი ძველ ფაილში
     * იმავე წესით კითხულობს.
     */
    public function test_the_dropped_status_is_gone_and_leftovers_become_to_take(): void
    {
        $this->assertSame(['to_take', 'taking', 'done'], Course::STATUSES);

        $this->postJson('/api/courses', $this->payload(['status' => 'dropped']))
            ->assertStatus(422)->assertJsonValidationErrors('status');

        $id = $this->postJson('/api/courses', $this->payload(['status' => 'taking']))->assertStatus(201)->json('data.id');
        $this->patchJson("/api/courses/{$id}/status", ['status' => 'dropped'])->assertStatus(422);

        // სხვა ანგარიშზე დარჩენილი ძველი მნიშვნელობა — მიგრაცია „გასავლელში" აბრუნებს
        $started = Course::findOrFail($id)->started_at;
        DB::table('courses')->where('id', $id)->update(['status' => 'dropped']);
        $other = $this->postJson('/api/courses', $this->payload(['title' => 'Done one', 'status' => 'done']))->json('data.id');

        (require database_path('migrations/2026_11_12_000014_retire_dropped_course_status.php'))->up();

        $course = Course::findOrFail($id);
        $this->assertSame('to_take', $course->status);
        $this->assertNull($course->finished_at);
        // კურსი ერთხელ მართლა დაიწყო — ეს თარიღი რჩება
        $this->assertEquals($started, $course->started_at);
        // სხვა სტატუსს მიგრაცია არ ეხება
        $this->assertSame('done', Course::findOrFail($other)->status);
        $this->assertNotNull(Course::findOrFail($other)->finished_at);
    }

    public function test_an_old_export_with_the_dropped_status_imports_as_to_take(): void
    {
        $json = json_encode([
            'app' => 'mediary', 'module' => 'course', 'version' => 1,
            'records' => [
                ['id' => 1, 'title' => 'Abandoned once', 'category' => 'Programming', 'status' => 'dropped', 'tags' => []],
                ['id' => 2, 'title' => 'Finished', 'category' => 'Programming', 'status' => 'done', 'tags' => []],
            ],
        ]);
        $path = tempnam(sys_get_temp_dir(), 'mediary-test-');
        file_put_contents($path, $json);

        $plan = $this->post('/api/import/plan', ['file' => new UploadedFile($path, 'mediary-course-2026-10-01.json', null, null, true)])
            ->assertOk()->json();

        foreach ([0, 1] as $index) {
            $this->postJson('/api/import/item', ['token' => $plan['token'], 'module' => 'course', 'index' => $index])
                ->assertOk()->assertJsonPath('ok', true);
        }

        $this->assertSame('to_take', Course::where('title', 'Abandoned once')->firstOrFail()->status);
        $this->assertSame('done', Course::where('title', 'Finished')->firstOrFail()->status);
    }

    /**
     * ლექტორი, შეფასება, გაკვეთილები და ხანგრძლივობა ამოვიდა:
     * პასუხში აღარ ჩანს, გამოგზავნილი მნიშვნელობა ჩუმად იგნორირდება და
     * პროგრესის endpoint აღარ არსებობს.
     */
    public function test_the_removed_fields_are_gone(): void
    {
        $res = $this->postJson('/api/courses', $this->payload([
            'instructor' => 'Jeffrey', 'rating' => 9, 'lessons_total' => 10, 'minutes' => 60,
        ]))->assertStatus(201);

        foreach (['instructor', 'rating', 'lessons_total', 'lessons_done', 'percent', 'minutes'] as $key) {
            $this->assertArrayNotHasKey($key, $res->json('data'));
        }

        $this->patchJson("/api/courses/{$res->json('data.id')}/progress", ['lessons_done' => 1])
            ->assertNotFound();
    }

    public function test_the_filters_narrow_the_list(): void
    {
        // ⚠️ ჯერ ნაგულისხმევები, მერე ახალი — თორემ `ensureDefaults()` ვერაფერს
        // შექმნიდა და ორივე კურსი ერთსა და იმავე კატეგორიაში მოხვდებოდა
        $first = $this->category();

        $other = CourseCategory::create([
            'user_id' => $this->user->id,
            'key' => 'other',
            'name_ka' => 'სხვა',
            'name_en' => 'Other',
            'sort_order' => 99,
        ]);

        $this->postJson('/api/courses', $this->payload([
            'title' => 'Laravel A', 'category_id' => $first->id, 'tags' => ['ka', 'php'],
        ]))->assertStatus(201);
        $this->postJson('/api/courses', $this->payload([
            'title' => 'Laravel B', 'status' => 'done', 'category_id' => $other->id, 'tags' => ['php'],
        ]))->assertStatus(201);

        $this->getJson('/api/courses?status=done')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson("/api/courses?category_id={$other->id}")->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/courses?tag=php')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/courses?tag=php,ka')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/courses?q=Laravel')->assertOk()->assertJsonCount(2, 'data');
    }

    /**
     * **ფაილის ატვირთვა და წაშლა კვოტას ათავისუფლებს.**
     */
    public function test_a_document_is_uploaded_and_released_with_the_course(): void
    {
        Storage::fake('public');

        $id = $this->postJson('/api/courses', $this->payload())->json('data.id');

        $this->postJson("/api/courses/{$id}/files", [
            'kind' => 'doc',
            'files' => [UploadedFile::fake()->create('notes.pdf', 40, 'application/pdf')],
        ])->assertStatus(201)->assertJsonPath('data.0.kind', 'doc');

        $used = (int) $this->user->fresh()->storage_used_bytes;
        $this->assertGreaterThan(0, $used);

        /* ⚠️ **მოდელით ვშლით და არა endpoint-ით**: `PurgeService` სწორედ ასე
           იქცევა, ე.ი. სწორედ ეს გზა უნდა ათავისუფლებდეს დისკსა და კვოტას
           (SQL-ის კასკადი მოდელის ივენთს არ ისვრის). */
        Course::findOrFail($id)->delete();

        $this->assertSame(0, (int) $this->user->fresh()->storage_used_bytes);
        $this->assertDatabaseCount('course_files', 0);
    }

    /**
     * **სერტიფიკატი აღარ არის**: ახალი `kind: certificate` 422-ია, ძველი
     * რიგი მიგრაციით დოკუმენტად (`doc`) გადადის — ფაილი ადგილზე რჩება; მოდულის აღწერა
     * სერტიფიკატს აღარ ახსენებს.
     */
    public function test_a_certificate_is_no_longer_a_file_kind(): void
    {
        Storage::fake('public');

        $id = $this->postJson('/api/courses', $this->payload())->json('data.id');

        $this->postJson("/api/courses/{$id}/files", [
            'kind' => 'certificate',
            'files' => [UploadedFile::fake()->create('cert.pdf', 40, 'application/pdf')],
        ])->assertStatus(422)->assertJsonValidationErrors('kind');

        $old = Course::findOrFail($id)->files()->create([
            'user_id' => $this->user->id, 'kind' => 'certificate',
            'path' => 'courses/files/certificates/old.pdf', 'original_name' => 'old.pdf', 'size' => 10,
        ]);

        (require database_path('migrations/2026_10_05_000001_drop_course_certificates.php'))->up();

        $this->assertSame('doc', $old->fresh()->kind);
        $this->assertSame('courses/files/certificates/old.pdf', $old->fresh()->path);
        $this->getJson("/api/courses/{$id}/files")->assertOk()->assertJsonPath('data.0.kind', 'doc');

        $module = Module::where('key', 'course')->firstOrFail();
        $this->assertStringNotContainsString('სერტიფიკატ', (string) $module->description_ka);
        $this->assertStringNotContainsString('certificate', (string) $module->description_en);
    }

    /** `DELETE /courses/{id}` კალათაში აგზავნის და არაფერს ათავისუფლებს */
    public function test_deleting_moves_the_course_to_the_trash(): void
    {
        Storage::fake('public');

        $id = $this->postJson('/api/courses', $this->payload())->json('data.id');

        $this->postJson("/api/courses/{$id}/files", [
            'kind' => 'doc',
            'files' => [UploadedFile::fake()->create('notes.pdf', 20, 'application/pdf')],
        ])->assertStatus(201);

        $before = (int) $this->user->fresh()->storage_used_bytes;

        $this->deleteJson("/api/courses/{$id}")->assertNoContent();

        $this->getJson('/api/courses')->assertOk()->assertJsonCount(0, 'data');
        $this->assertSame($before, (int) $this->user->fresh()->storage_used_bytes);
        $this->assertDatabaseCount('course_files', 1);
    }

    /** კატეგორიის წაშლა კურსებს არ ღუპავს */
    public function test_deleting_a_category_moves_the_courses(): void
    {
        $from = $this->category();
        $to = CourseCategory::create([
            'user_id' => $this->user->id,
            'key' => 'target',
            'name_ka' => 'სამიზნე',
            'name_en' => 'Target',
            'sort_order' => 98,
        ]);

        $id = $this->postJson('/api/courses', $this->payload(['category_id' => $from->id]))->json('data.id');

        $this->deleteJson("/api/course-categories/{$from->id}", ['move_to' => $to->id])
            ->assertOk()
            ->assertJsonPath('moved', 1);

        $this->assertSame($to->id, Course::findOrFail($id)->category_id);
    }

    /** ესკიზი კვოტაზე გადის და საცავის ბიბლიოთეკაში ჩანს */
    public function test_the_thumbnail_appears_in_the_storage_library(): void
    {
        Storage::fake('public');

        $this->postJson('/api/courses', $this->payload([
            'thumbnail' => UploadedFile::fake()->image('cover.jpg'),
        ]))->assertStatus(201);

        $files = app(StorageMeter::class)->files($this->user->fresh());

        $this->assertTrue($files->contains(fn (array $f) => $f['module'] === 'course'));
    }
}
