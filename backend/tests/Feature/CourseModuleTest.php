<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseCategory;
use App\Models\User;
use App\Services\Storage\StorageMeter;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **კურსების მოდული (FEAT-25).**
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
     * Tasks §29.3 — YouTube-ის ბმულზე ესკიზი გვერდის გარეშე მოდის (`VideoUrl`):
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
     * დაუსრულებელ კურსს სამუდამოდ ჩათვლიდა (FEAT-08/FEAT-21).
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
     * Tasks §14 — ლექტორი, შეფასება, გაკვეთილები და ხანგრძლივობა ამოვიდა:
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
     * **სერტიფიკატი ცალკე `kind`-ია და წაშლა კვოტას ათავისუფლებს.**
     */
    public function test_a_certificate_is_uploaded_and_released_with_the_course(): void
    {
        Storage::fake('public');

        $id = $this->postJson('/api/courses', $this->payload())->json('data.id');

        $this->postJson("/api/courses/{$id}/files", [
            'kind' => 'certificate',
            'files' => [UploadedFile::fake()->create('cert.pdf', 40, 'application/pdf')],
        ])->assertStatus(201)->assertJsonPath('data.0.kind', 'certificate');

        $used = (int) $this->user->fresh()->storage_used_bytes;
        $this->assertGreaterThan(0, $used);

        /* ⚠️ **მოდელით ვშლით და არა endpoint-ით**: `PurgeService` სწორედ ასე
           იქცევა, ე.ი. სწორედ ეს გზა უნდა ათავისუფლებდეს დისკსა და კვოტას
           (SQL-ის კასკადი მოდელის ივენთს არ ისვრის). */
        Course::findOrFail($id)->delete();

        $this->assertSame(0, (int) $this->user->fresh()->storage_used_bytes);
        $this->assertDatabaseCount('course_files', 0);
    }

    /** `DELETE /courses/{id}` კალათაში აგზავნის და არაფერს ათავისუფლებს (FEAT-11) */
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
