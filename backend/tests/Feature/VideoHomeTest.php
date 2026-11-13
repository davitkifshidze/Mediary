<?php

namespace Tests\Feature;

use App\Models\Bookmark;
use App\Models\Course;
use App\Models\CourseCategory;
use App\Models\Status;
use App\Models\User;
use App\Models\Video;
use App\Models\VideoType;
use App\Services\Share\ShareScope;
use App\Support\DictionaryTrash;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **ყოველ ვიდეოს ერთი სახლი აქვს.**
 *
 * ვიდეოების მოდული = ბმულით ხელით დამატებული + სხვა მოდულიდან ცხადად გადმოტანილი
 * (წყაროთი). კურსის ფლეილისტის ვიდეო კურსში ცხოვრობს (`listed = false`) და
 * ვიდეოებში მხოლოდ „გადატანით" ხვდება. სია, მთვლელები, ძებნა, საჯარო პროფილი და
 * იმპორტი ერთ წესს მიჰყვება.
 */
class VideoHomeTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private int $type;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        Storage::fake('private');
        // შენახვის ავტოშევსება ბმულს არ კითხულობს
        Http::fake(fn () => Http::response('', 404));

        $this->seed(ModulesSeeder::class);

        $this->user = User::factory()->create(['username' => 'dara']);
        $this->user->assignRole('super_admin')->save();
        $this->actingAs($this->user);

        VideoType::ensureDefaults($this->user->id);
        $this->type = (int) VideoType::where('user_id', $this->user->id)->value('id');
    }

    private function course(string $title = 'Laravel'): Course
    {
        CourseCategory::ensureDefaults($this->user->id);

        return Course::create([
            'user_id' => $this->user->id,
            'title' => $title,
            'status' => 'taking',
            'category_id' => CourseCategory::where('user_id', $this->user->id)->value('id'),
        ]);
    }

    /** @param  array<string, mixed>  $over */
    private function video(string $title, array $over = []): Video
    {
        Status::ensureDefaults($this->user->id, 'video');

        return Video::create($over + [
            'user_id' => $this->user->id,
            'title' => $title,
            'url' => 'https://example.com/v/'.md5($title),
            'platform' => 'other',
            'type_id' => $this->type,
            'status_id' => Status::where('user_id', $this->user->id)->where('module', 'video')->value('id'),
            'tags' => [],
        ]);
    }

    private function lesson(Course $course, string $title, int $position = 1): Video
    {
        return $this->video($title, [
            'course_id' => $course->id,
            'listed' => false,
            'origin_type' => 'course',
            'origin_id' => $course->id,
            'sort_order' => $position,
        ]);
    }

    public function test_a_course_lesson_stays_out_of_the_videos_list_until_it_is_moved(): void
    {
        $course = $this->course();
        $mine = $this->video('Hand added');
        $lesson = $this->lesson($course, 'Lesson one');

        $this->getJson('/api/videos')->assertOk()->assertJsonPath('data.*.id', [$mine->id]);
        // კურსის საქაღალდეც მხოლოდ სიაში მყოფს აჩვენებს და ითვლის
        $this->getJson("/api/videos?course={$course->id}")->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/videos/folders')->assertOk()->assertJsonCount(0, 'data');
        // ვიდეო თვითონ იხსნება — კურსის ფანჯარა მას უკრავს
        $this->getJson("/api/videos/{$lesson->id}")->assertOk()
            ->assertJsonPath('data.listed', false)
            ->assertJsonPath('data.origin.kind', 'course')
            ->assertJsonPath('data.origin.title', 'Laravel');

        $this->putJson("/api/videos/{$lesson->id}/listing", ['listed' => true])->assertOk()->assertJsonPath('data.listed', true);
        $this->getJson('/api/videos?sort=oldest')->assertOk()->assertJsonPath('data.*.id', [$mine->id, $lesson->id]);
        $this->getJson('/api/videos/folders')->assertOk()->assertJsonPath('data.0.videos_count', 1);

        $this->putJson("/api/videos/{$lesson->id}/listing", ['listed' => false])->assertOk();
        $this->getJson('/api/videos')->assertOk()->assertJsonPath('data.*.id', [$mine->id]);
        $this->assertNotNull(Video::find($lesson->id));
    }

    public function test_a_video_without_a_course_cannot_leave_the_list(): void
    {
        $mine = $this->video('Hand added');

        $this->putJson("/api/videos/{$mine->id}/listing", ['listed' => false])
            ->assertStatus(422)
            ->assertJsonPath('message', 'video_needs_course');

        // კურსს მოწყვეტილი ვიდეო სიაში ბრუნდება
        $lesson = $this->lesson($this->course(), 'Lesson');
        $this->putJson("/api/videos/{$lesson->id}", ['course_id' => null])->assertOk()->assertJsonPath('data.listed', true);
    }

    public function test_a_video_added_from_another_record_carries_its_origin(): void
    {
        $bookmark = Bookmark::create(['user_id' => $this->user->id, 'title' => 'Tokyo House', 'url' => 'https://tokyohouse.ge']);

        $created = $this->postJson('/api/videos', [
            'title' => 'Sushi',
            'url' => 'https://example.com/sushi',
            'type_id' => $this->type,
            'status' => 'undecided',
            'origin_type' => 'bookmark',
            'origin_id' => $bookmark->id,
            'autofill' => 0,
        ])->assertCreated()
            ->assertJsonPath('data.listed', true)
            ->assertJsonPath('data.origin.kind', 'bookmark')
            ->assertJsonPath('data.origin.module', 'bookmark')
            ->assertJsonPath('data.origin.id', $bookmark->id)
            ->assertJsonPath('data.origin.title', 'Tokyo House');

        // სიაშიც წყაროთი მოდის; ხელით დამატებულს წყარო არ აქვს
        $this->video('Hand added');
        $rows = collect($this->getJson('/api/videos?sort=oldest')->assertOk()->json('data'))->keyBy('title');
        $this->assertSame('Tokyo House', $rows['Sushi']['origin']['title']);
        $this->assertNull($rows['Hand added']['origin']);

        // ურნაში გადასული წყაროს სახელი აღარ გადის — მხოლოდ მოდული რჩება
        $bookmark->moveToTrash();
        $this->getJson('/api/videos/'.$created->json('data.id'))->assertOk()
            ->assertJsonPath('data.origin.module', 'bookmark')
            ->assertJsonPath('data.origin.title', null);
    }

    public function test_another_accounts_record_cannot_be_an_origin(): void
    {
        $other = User::factory()->create();
        $foreign = Bookmark::withoutGlobalScopes()->create(['user_id' => $other->id, 'title' => 'Theirs', 'url' => 'https://example.org']);

        $this->postJson('/api/videos', [
            'title' => 'X', 'url' => 'https://example.com/x', 'type_id' => $this->type, 'status' => 'undecided',
            'origin_type' => 'bookmark', 'origin_id' => $foreign->id, 'autofill' => 0,
        ])->assertNotFound();

        $this->postJson('/api/videos', [
            'title' => 'X', 'url' => 'https://example.com/x', 'type_id' => $this->type, 'status' => 'undecided',
            'origin_type' => 'nonsense', 'origin_id' => 1, 'autofill' => 0,
        ])->assertStatus(422);

        $this->assertSame(0, Video::count());
    }

    public function test_counters_statuses_and_search_follow_the_list(): void
    {
        $course = $this->course();
        $this->video('Hand added');
        $this->lesson($course, 'Harness engineering');

        $cards = collect($this->getJson('/api/dashboard')->assertOk()->json('data'))->keyBy('key');
        $this->assertSame(1, $cards['video']['count']);

        $statuses = collect($this->getJson('/api/statuses/video')->assertOk()->json('data'));
        $this->assertSame(1, (int) $statuses->sum('records_count'));

        $types = collect($this->getJson('/api/video-types')->assertOk()->json('data'));
        $this->assertSame(1, (int) $types->sum('videos_count'));

        // კურსში მცხოვრები ვიდეო ვიდეოებში არ იძებნება — კურსის ქვეშ იძებნება
        $groups = collect($this->getJson('/api/search?q=harness')->assertOk()->json('groups'))->keyBy('key');
        $this->assertSame(0, (int) ($groups['video']['total'] ?? 0));
        $this->assertSame([$course->id], array_column($groups['course']['items'] ?? [], 'id'));
    }

    /* ---------- ლექსიკონის წაშლა და მასობრივი ცვლილება: კურსის ვიდეო მოდულის ჩანაწერი არ არის ---------- */

    /** მეორე ტიპი — გადასატანი ადგილი */
    private function otherType(): int
    {
        return (int) VideoType::where('user_id', $this->user->id)->where('id', '!=', $this->type)->value('id');
    }

    /**
     * ⚠️ **„ჩანაწერებიანად" წაშლა კურსის ვიდეოს ურნაში არ აგზავნის.** ფანჯარა
     * სიაში მყოფ ვიდეოებს ითვლის (`videos_count`), წაშლა კი ტიპის ყველა ვიდეოს
     * ეხებოდა — კურსის ფანჯარა ცარიელდებოდა. კურსის ვიდეო ყოველთვის სხვა ტიპზე
     * გადადის და ამისთვის სამიზნე სავალდებულოა.
     */
    public function test_deleting_a_type_with_its_records_never_trashes_a_course_lesson(): void
    {
        $course = $this->course();
        $mine = $this->video('Hand added');
        $lesson = $this->lesson($course, 'Lesson one');

        $row = collect($this->getJson('/api/video-types')->assertOk()->json('data'))->firstWhere('id', $this->type);
        $this->assertSame([1, 1], [$row['videos_count'], $row['lessons_count']]);

        // სამიზნის გარეშე — 422: გაკვეთილს სადმე წასვლა სჭირდება
        $this->deleteJson("/api/video-types/{$this->type}", ['delete_records' => true])
            ->assertStatus(422)
            ->assertJsonPath('message', 'lesson_target_required');
        $this->assertNull(Video::find($lesson->id)->trashed_at);

        $this->deleteJson("/api/video-types/{$this->type}", ['delete_records' => true, 'lessons_to' => $this->otherType()])
            ->assertOk()
            ->assertExactJson(['moved' => 0, 'deleted' => 1, 'lessons' => 1]);

        // სიაში მყოფი — ურნაში; კურსის ვიდეო — ადგილზე, ახალი ტიპით
        $this->assertNull(Video::find($mine->id));
        $kept = Video::findOrFail($lesson->id);
        $this->assertSame($this->otherType(), (int) $kept->type_id);
        $this->assertFalse($kept->listed);
    }

    /** გადატანისას კურსის ვიდეო `move_to`-ს მიჰყვება; ცარიელად დატოვება მას მაინც სხვა ტიპზე აგზავნის */
    public function test_moving_or_clearing_a_type_always_gives_a_lesson_another_type(): void
    {
        $course = $this->course();
        $mine = $this->video('Hand added');
        $lesson = $this->lesson($course, 'Lesson one');
        $target = $this->otherType();

        $this->deleteJson("/api/video-types/{$this->type}", ['clear_records' => true])
            ->assertStatus(422)
            ->assertJsonPath('message', 'lesson_target_required');

        $this->deleteJson("/api/video-types/{$this->type}", ['clear_records' => true, 'lessons_to' => $target])
            ->assertOk()
            ->assertExactJson(['moved' => 1, 'deleted' => 0, 'lessons' => 1]);

        $this->assertNull(Video::findOrFail($mine->id)->type_id);
        $this->assertSame($target, (int) Video::findOrFail($lesson->id)->type_id);

        // ურნიდან „ჩანაწერებიანად" აღდგენა ორივე ჯგუფს უკან აბრუნებს — თითოს იქიდან, სადაც წაშლამ დატოვა
        $trashed = VideoType::withoutGlobalScope('trash')->findOrFail($this->type);
        $this->assertSame(2, DictionaryTrash::remembered($trashed));
        $trashed->restoreFromTrash();
        $this->assertSame(2, DictionaryTrash::restoreRecords($trashed, 'video_type'));
        $this->assertSame([$this->type, $this->type], [(int) Video::findOrFail($mine->id)->type_id, (int) Video::findOrFail($lesson->id)->type_id]);

        // გადატანა: ერთი სამიზნე ორივესთვის
        $this->deleteJson("/api/video-types/{$this->type}", ['move_to' => $target])
            ->assertOk()
            ->assertExactJson(['moved' => 1, 'deleted' => 0, 'lessons' => 1]);
        $this->assertSame([$target, $target], [(int) Video::findOrFail($mine->id)->type_id, (int) Video::findOrFail($lesson->id)->type_id]);
    }

    /** სტატუსის წაშლა ვიდეოს დომენზე — იგივე წესი */
    public function test_deleting_a_status_with_its_records_never_trashes_a_course_lesson(): void
    {
        $course = $this->course();
        $mine = $this->video('Hand added');
        $lesson = $this->lesson($course, 'Lesson one');

        $statuses = Status::where('user_id', $this->user->id)->where('module', 'video')->orderBy('sort_order')->pluck('id')->all();
        [$doomed, $target] = [(int) $mine->status_id, (int) collect($statuses)->first(fn ($id) => (int) $id !== (int) $mine->status_id)];

        $row = collect($this->getJson('/api/statuses/video')->assertOk()->json('data'))->firstWhere('id', $doomed);
        $this->assertSame([1, 1], [$row['records_count'], $row['lessons_count']]);

        $this->deleteJson("/api/statuses/video/{$doomed}", ['delete_records' => true])
            ->assertStatus(422)
            ->assertJsonPath('message', 'lesson_target_required');

        $this->deleteJson("/api/statuses/video/{$doomed}", ['delete_records' => true, 'lessons_to' => $target])
            ->assertOk()
            ->assertExactJson(['moved' => 0, 'deleted' => 1, 'lessons' => 1]);

        $this->assertNull(Video::find($mine->id));
        $this->assertSame($target, (int) Video::findOrFail($lesson->id)->status_id);
    }

    /** მასობრივი ცვლილება — ყველა სკოუპი, `ids`-ის ჩათვლით, მხოლოდ სიაში მყოფ ვიდეოს ეხება */
    public function test_bulk_changes_never_touch_a_course_lesson(): void
    {
        $course = $this->course();
        $mine = $this->video('Hand added');
        $lesson = $this->lesson($course, 'Lesson one');
        $target = $this->otherType();

        foreach ([['scope' => 'all'], ['scope' => 'ids', 'scope_ids' => [$mine->id, $lesson->id]], ['scope' => 'type', 'scope_type_id' => $this->type]] as $scope) {
            $this->getJson('/api/videos/bulk-preview?'.http_build_query($scope))->assertOk()->assertJsonPath('count', 1);
        }

        $this->postJson('/api/videos/bulk', ['scope' => 'ids', 'scope_ids' => [$mine->id, $lesson->id], 'action' => 'type', 'type_id' => $target])
            ->assertOk()
            ->assertJsonPath('updated', 1);

        $this->assertSame($target, (int) Video::findOrFail($mine->id)->type_id);
        $this->assertSame($this->type, (int) Video::findOrFail($lesson->id)->type_id);

        // სტატუსის მასობრივი შეცვლა „ამ სტატუსის ყველა"-ზე
        $from = Status::findOrFail($lesson->status_id)->key;
        $to = Status::where('user_id', $this->user->id)->where('module', 'video')->where('id', '!=', $lesson->status_id)->value('key');
        $this->postJson('/api/videos/bulk-status', ['from_status' => $from, 'status' => $to])->assertOk()->assertJsonPath('updated', 1);
        $this->assertSame($from, Status::findOrFail(Video::findOrFail($lesson->id)->status_id)->key);
    }

    /** გაზიარების ბმული ვიდეოს დომენზე — მხოლოდ სიაში მყოფი; კურსის ვიდეოს id-ით ბმული ვერ აეწყობა */
    public function test_a_share_link_never_carries_a_course_lesson(): void
    {
        $course = $this->course();
        $mine = $this->video('Hand added');
        $lesson = $this->lesson($course, 'Lesson one');

        $this->assertSame(
            [$mine->id],
            ShareScope::query($this->user, 'video', ['scope' => 'all'])->pluck('videos.id')->all(),
        );
        $this->assertSame(
            [$mine->id],
            ShareScope::query($this->user, 'video', ['scope' => 'ids', 'ids' => [$mine->id, $lesson->id]])->pluck('videos.id')->all(),
        );

        $this->postJson('/api/share-links', ['domains' => ['video' => ['scope' => 'ids', 'ids' => [$lesson->id]]]])
            ->assertStatus(422);
    }

    public function test_deleting_a_course_for_good_takes_its_own_videos_and_frees_the_listed_ones(): void
    {
        $course = $this->course();
        $lesson = $this->lesson($course, 'Lesson', 1);
        $moved = $this->lesson($course, 'Moved', 2);
        $moved->forceFill(['listed' => true])->save();

        $course->delete();

        $this->assertNull(Video::find($lesson->id));
        $kept = Video::find($moved->id);
        $this->assertNotNull($kept);
        $this->assertNull($kept->course_id);
        $this->assertTrue($kept->listed);
    }
}
