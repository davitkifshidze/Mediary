<?php

namespace Tests\Feature;

use App\Models\Course;
use App\Models\CourseCategory;
use App\Models\User;
use App\Models\Video;
use App\Models\VideoType;
use App\Services\Export\RecordExporter;
use App\Services\Import\MediaryFiles;
use App\Services\Import\MediaryWriter;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **კურსი — „საქაღალდე" ვიდეოებში** (`videos.course_id`).
 *
 * ⚠️ ურნა და საბოლოო წაშლა სხვადასხვაა: კურსი ურნაში — საქაღალდე იმალება,
 * ვიდეო რჩება; საბოლოო წაშლაზე ბაზა `course_id`-ს ანულებს (`nullOnDelete`).
 */
class VideoCourseFolderTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        $this->user = User::factory()->create();
        $this->user->assignRole('super_admin')->save();
        $this->user->refresh();
        $this->actingAs($this->user);
    }

    private function course(string $title = 'Laravel', ?User $owner = null): Course
    {
        $owner ??= $this->user;
        CourseCategory::ensureDefaults($owner->id);

        return Course::create([
            'user_id' => $owner->id,
            'title' => $title,
            'status' => 'taking',
            'category_id' => CourseCategory::where('user_id', $owner->id)->value('id'),
        ]);
    }

    private function video(array $extra = []): Video
    {
        $type = VideoType::where('user_id', $this->user->id)->value('id')
            ?? $this->getJson('/api/video-types')->json('data.0.id');

        return Video::create([
            'user_id' => $this->user->id,
            'title' => 'Lesson',
            'url' => 'https://www.youtube.com/watch?v=aaaaaaaaaa1',
            'platform' => 'youtube',
            'type_id' => $type,
            ...$extra,
        ]);
    }

    private function body(array $extra = []): array
    {
        return [
            'url' => 'https://www.youtube.com/watch?v=aaaaaaaaaa1',
            'title' => 'Lesson',
            'status' => 'to_watch',
            'type_id' => $this->getJson('/api/video-types')->json('data.0.id'),
            'autofill' => 0,
            ...$extra,
        ];
    }

    public function test_a_video_can_be_put_in_an_own_live_course_only(): void
    {
        $course = $this->course();

        $id = $this->postJson('/api/videos', $this->body(['course_id' => $course->id]))
            ->assertCreated()
            ->assertJsonPath('data.course_id', $course->id)
            ->assertJsonPath('data.course.title', 'Laravel')
            ->json('data.id');

        // სხვისი კურსი და ურნაში მყოფი — 422
        $foreign = $this->course('Other', User::factory()->create());
        $this->postJson('/api/videos', $this->body(['course_id' => $foreign->id]))->assertStatus(422)->assertJsonValidationErrors('course_id');

        $trashed = $this->course('Old');
        $trashed->moveToTrash();
        $this->putJson("/api/videos/{$id}", ['course_id' => $trashed->id])->assertStatus(422);

        // ამოღება საქაღალდიდან
        $this->putJson("/api/videos/{$id}", ['course_id' => null])->assertOk()->assertJsonPath('data.course_id', null);
    }

    public function test_the_list_filters_by_course_and_the_folders_count_videos(): void
    {
        $laravel = $this->course('Laravel');
        $empty = $this->course('Empty');
        $this->video(['course_id' => $laravel->id]);
        $this->video(['course_id' => $laravel->id, 'download_status' => Video::DOWNLOAD_READY, 'download_path' => 'videos/downloads/x.mp4']);
        $this->video();

        $this->getJson("/api/videos?course={$laravel->id}")->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/videos')->assertOk()->assertJsonCount(3, 'data');

        // ცარიელი კურსი საქაღალდე არ არის
        $this->getJson('/api/videos/folders')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $laravel->id)
            ->assertJsonPath('data.0.videos_count', 2)
            ->assertJsonPath('data.0.downloaded_count', 1);

        $this->assertNotNull($empty->id);
    }

    public function test_a_trashed_course_hides_the_folder_but_keeps_the_videos_and_a_final_delete_unlinks_them(): void
    {
        $course = $this->course();
        $video = $this->video(['course_id' => $course->id]);

        $course->moveToTrash();

        $this->getJson('/api/videos/folders')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/videos/{$video->id}")
            ->assertOk()
            ->assertJsonPath('data.course', null)
            // აღდგენაზე საქაღალდე ბრუნდება — კავშირი არ წაშლილა
            ->assertJsonPath('data.course_id', $course->id);

        Course::withoutGlobalScope('trash')->find($course->id)->delete();

        $this->assertNull($video->fresh()->course_id);
        $this->assertNotNull($video->fresh());
    }

    /** ექსპორტი კურსს სათაურით წერს; იმპორტი **არსებულ** კურსს პოულობს და ახალს არ ქმნის */
    public function test_export_writes_the_course_title_and_import_finds_the_course_by_it(): void
    {
        $course = $this->course('ლარაველი');
        $video = $this->video(['course_id' => $course->id]);

        $row = collect(app(RecordExporter::class)->rows($this->user, 'video'))->firstWhere('id', $video->id);
        $this->assertSame('ლარაველი', $row['course']);

        $writer = app(MediaryWriter::class);
        $files = app(MediaryFiles::class);
        $files->begin(null);
        $imported = $writer->create($this->user, 'video', [...$row, 'course' => 'ლარაველი'], [], $files);
        $this->assertSame($course->id, $imported->course_id);

        $files->begin(null);
        $orphan = $writer->create($this->user, 'video', [...$row, 'course' => 'არარსებული'], [], $files);
        $this->assertNull($orphan->course_id);
        $this->assertSame(1, Course::count());
    }

    /** `/purge`-ის `course` რეჟიმი მხოლოდ ამ კურსის ვიდეოებს ეხება */
    public function test_the_purge_course_scope_takes_only_that_folder(): void
    {
        $laravel = $this->course('Laravel');
        $this->video(['course_id' => $laravel->id]);
        $this->video(['course_id' => $laravel->id]);
        $this->video();

        $this->postJson('/api/admin/purge/plan', ['target' => 'video', 'mode' => 'course', 'course_ids' => [$laravel->id]])
            ->assertOk()
            ->assertJsonPath('plan.records', 2);

        $this->postJson('/api/admin/purge/plan', ['target' => 'video', 'mode' => 'course'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'scope_required');
    }
}
