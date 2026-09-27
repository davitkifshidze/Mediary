<?php

namespace Tests\Feature;

use App\Models\BoardGame;
use App\Models\BoardGameGenre;
use App\Models\Book;
use App\Models\BookGenre;
use App\Models\Bookmark;
use App\Models\BookmarkCategory;
use App\Models\Course;
use App\Models\CourseCategory;
use App\Models\Game;
use App\Models\GameGenre;
use App\Models\Module;
use App\Models\Movie;
use App\Models\NoteCategory;
use App\Models\NoteEntry;
use App\Models\Place;
use App\Models\PlaceCategory;
use App\Models\Status;
use App\Models\User;
use App\Models\Video;
use App\Models\VideoType;
use Database\Seeders\ModulesSeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * **ურნა კლასიფიკატორის რიგზე (Tasks §29, ეტაპი 3).**
 *
 * ⚠️ მოწმდება ის, რაც ჩუმად ტყდებოდა: ურნაში მყოფი რიგი თავის გასაღებს
 * ინარჩუნებს (ახალი იმავე სახელით 500-ს აღარ აბრუნებს), ყველა რიგის
 * წაშლა ნაგულისხმევებს იმავე გასაღებით თავიდან არ წერს, ურნაში მყოფ
 * რიგს ჩანაწერი ვერ მიენიჭება, და აღდგენა გადატანილ ჩანაწერებს **მხოლოდ
 * მოთხოვნით** აბრუნებს — და მხოლოდ მათ, ვინც მას შემდეგ არ შეცვლილა.
 */
class TrashDictionaryTest extends TestCase
{
    use RefreshDatabase;

    private User $me;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->me = User::create([
            'name' => 'dict', 'username' => 'dict',
            'email' => 'dict@example.com', 'password' => 'password',
        ]);
        $this->me->modules()->sync(Module::pluck('id')->all());
        $this->me->refresh();
    }

    /**
     * სახე → კლასიფიკატორის მოდელი, მისამართი, ჩანაწერის შემქმნელი და სვეტი.
     *
     * @return array<string, array{0: string}>
     */
    public static function singleColumnKinds(): array
    {
        return [
            'video type' => ['video_type'],
            'book genre' => ['book_genre'],
            'board game genre' => ['board_game_genre'],
            'note category' => ['note_category'],
            'bookmark category' => ['bookmark_category'],
            'course category' => ['course_category'],
            'place category' => ['place_category'],
        ];
    }

    /** @return array{0: class-string<Model>, 1: string, 2: \Closure(int): Model, 3: string} */
    private function spec(string $kind): array
    {
        $uid = $this->me->id;

        return match ($kind) {
            'video_type' => [VideoType::class, 'video-types', fn (int $id) => Video::create(['user_id' => $uid, 'title' => 'v', 'url' => 'https://youtu.be/dQw4w9WgXcQ', 'type_id' => $id]), 'type_id'],
            'book_genre' => [BookGenre::class, 'book-genres', fn (int $id) => Book::create(['user_id' => $uid, 'title_en' => 'b', 'genre_id' => $id]), 'genre_id'],
            'board_game_genre' => [BoardGameGenre::class, 'board-game-genres', fn (int $id) => BoardGame::create(['user_id' => $uid, 'title' => 'bg', 'genre_id' => $id]), 'genre_id'],
            'note_category' => [NoteCategory::class, 'note-categories', fn (int $id) => NoteEntry::create(['user_id' => $uid, 'title' => 'n', 'category_id' => $id]), 'category_id'],
            'bookmark_category' => [BookmarkCategory::class, 'bookmark-categories', fn (int $id) => Bookmark::create(['user_id' => $uid, 'title' => 'b', 'url' => 'https://example.com', 'category_id' => $id]), 'category_id'],
            'course_category' => [CourseCategory::class, 'course-categories', fn (int $id) => Course::create(['user_id' => $uid, 'title' => 'c', 'category_id' => $id]), 'category_id'],
            'place_category' => [PlaceCategory::class, 'place-categories', fn (int $id) => Place::create(['user_id' => $uid, 'name' => 'p', 'category_id' => $id]), 'category_id'],
        };
    }

    /** ორი რიგი: ერთი წასაშლელი, მეორე — სამიზნე */
    private function pair(string $model): array
    {
        return [
            $model::withoutGlobalScope('owner')->create(['user_id' => $this->me->id, 'name_ka' => 'ა', 'name_en' => 'A', 'key' => 'a-'.uniqid(), 'sort_order' => 1]),
            $model::withoutGlobalScope('owner')->create(['user_id' => $this->me->id, 'name_ka' => 'ბ', 'name_en' => 'B', 'key' => 'b-'.uniqid(), 'sort_order' => 2]),
        ];
    }

    /** @return array<string, mixed>|null */
    private function group(string $kind): ?array
    {
        return collect($this->actingAs($this->me)->getJson('/api/trash')->assertOk()->json('data'))
            ->firstWhere('kind', $kind);
    }

    #[DataProvider('singleColumnKinds')]
    public function test_a_dictionary_row_goes_to_the_trash_and_back_with_or_without_its_records(string $kind): void
    {
        [$model, $url, $make, $column] = $this->spec($kind);
        [$gone, $target] = $this->pair($model);
        $first = $make($gone->id);
        $second = $make($gone->id);

        $this->actingAs($this->me)->deleteJson("/api/{$url}/{$gone->id}", ['move_to' => $target->id])->assertOk();

        $this->assertNotNull($model::withoutGlobalScopes()->find($gone->id)->trashed_at);
        $this->assertSame($target->id, (int) $first->refresh()->{$column});
        $this->assertNotContains($gone->id, array_column($this->actingAs($this->me)->getJson("/api/{$url}")->json('data'), 'id'));

        $item = $this->group($kind)['items'][0];
        $this->assertSame(2, $item['count'], 'გადატანილი ჩანაწერები უნდა დაიმახსოვროს');

        // ⚠️ ერთი ჩანაწერი მას შემდეგ შეიცვალა — ის აღარ ბრუნდება
        $second->forceFill([$column => null])->saveQuietly();

        $this->actingAs($this->me)
            ->postJson("/api/trash/{$kind}/{$gone->id}/restore", ['records' => true])
            ->assertOk()
            ->assertJsonPath('records', 1);

        $this->assertSame($gone->id, (int) $first->refresh()->{$column});
        $this->assertNull($second->refresh()->{$column});
        $this->assertNull($model::find($gone->id)->trash_meta);
    }

    /** „მხოლოდ რიგი" — ჩანაწერები ახალ ადგილას რჩება (Q21-ის მიღებული შეზღუდვა) */
    public function test_a_row_only_restore_leaves_the_records_where_they_went(): void
    {
        [$gone, $target] = $this->pair(VideoType::class);
        $video = Video::create(['user_id' => $this->me->id, 'title' => 'v', 'url' => 'https://youtu.be/dQw4w9WgXcQ', 'type_id' => $gone->id]);

        $this->actingAs($this->me)->deleteJson("/api/video-types/{$gone->id}", ['move_to' => $target->id])->assertOk();
        $this->actingAs($this->me)->postJson("/api/trash/video_type/{$gone->id}/restore")->assertOk()->assertJsonPath('records', 0);

        $this->assertSame($target->id, (int) $video->refresh()->type_id);
        $this->assertNotNull(VideoType::find($gone->id));
    }

    /** ⚠️ ურნაში მყოფი რიგი გასაღებს ინარჩუნებს — იმავე სახელის ახალი რიგი 500-ს აღარ აბრუნებს */
    public function test_a_new_row_with_a_trashed_rows_name_gets_its_own_key(): void
    {
        $first = $this->actingAs($this->me)->postJson('/api/video-types', ['name_ka' => 'დოკუმენტური', 'name_en' => 'Documentary'])->assertCreated()->json('data');
        $other = $this->actingAs($this->me)->postJson('/api/video-types', ['name_ka' => 'სხვა', 'name_en' => 'Other'])->assertCreated()->json('data');

        $this->actingAs($this->me)->deleteJson("/api/video-types/{$first['id']}", ['move_to' => $other['id']])->assertOk();

        $again = $this->actingAs($this->me)->postJson('/api/video-types', ['name_ka' => 'დოკუმენტური', 'name_en' => 'Documentary'])->assertCreated()->json('data');
        $this->assertNotSame($first['key'], $again['key']);
    }

    /** ⚠️ ყველა რიგი ურნაშია → ნაგულისხმევები **არ** იწერება თავიდან (იმავე გასაღებით 500 იქნებოდა) */
    public function test_emptying_a_dictionary_into_the_trash_does_not_reseed_it(): void
    {
        $types = $this->actingAs($this->me)->getJson('/api/video-types')->assertOk()->json('data');
        $this->assertNotEmpty($types);

        foreach ($types as $type) {
            $this->actingAs($this->me)->deleteJson("/api/video-types/{$type['id']}", ['clear_records' => true])->assertOk();
        }

        $this->actingAs($this->me)->getJson('/api/video-types')->assertOk()->assertJsonCount(0, 'data');
    }

    /** ⚠️ ურნაში მყოფ რიგს ჩანაწერი ვერ მიენიჭება — ძველი ფორმის მოთხოვნა 422-ია */
    public function test_a_record_cannot_take_a_trashed_row(): void
    {
        [$gone, $target] = $this->pair(VideoType::class);
        $this->actingAs($this->me)->deleteJson("/api/video-types/{$gone->id}", ['move_to' => $target->id])->assertOk();

        $undecided = Status::defaultFor($this->me->id, 'video');

        $this->actingAs($this->me)
            ->postJson('/api/videos', ['title' => 'x', 'url' => 'https://youtu.be/dQw4w9WgXcQ', 'type_id' => $gone->id, 'status' => $undecided->key])
            ->assertStatus(422)
            ->assertJsonValidationErrors('type_id');
    }

    /** სტატუსი: ნაგულისხმევი ურნაში → შემდეგი დაწინაურდა; აღდგენილი აღარ არის ნაგულისხმევი */
    public function test_a_default_status_hands_over_and_comes_back_as_an_ordinary_one(): void
    {
        $default = Status::defaultFor($this->me->id, 'movie');
        $other = Status::forDomain('movie')->withoutGlobalScope('owner')->where('user_id', $this->me->id)->where('id', '!=', $default->id)->ordered()->first();
        $movie = Movie::create(['user_id' => $this->me->id, 'year' => 2001, 'status_id' => $default->id]);

        $this->actingAs($this->me)->deleteJson("/api/statuses/movie/{$default->id}", ['move_to' => $other->id])->assertOk();

        $this->assertNotSame($default->id, Status::defaultFor($this->me->id, 'movie')->id);
        $this->assertSame($other->id, (int) $movie->refresh()->status_id);
        $this->assertSame('movie', $this->group('status')['items'][0]['module']);

        $this->actingAs($this->me)->postJson("/api/trash/status/{$default->id}/restore", ['records' => true])->assertOk()->assertJsonPath('records', 1);

        $this->assertSame($default->id, (int) $movie->refresh()->status_id);
        $this->assertSame(1, Status::withoutGlobalScope('owner')->where('user_id', $this->me->id)->where('module', 'movie')->where('is_default', true)->count());
    }

    /** ჟანრის pivot: ურნა ბმულს ხსნის, აღდგენა „ჩანაწერებთან ერთად" მას აბრუნებს */
    public function test_a_game_genre_comes_back_to_its_games(): void
    {
        [$gone, $target] = $this->pair(GameGenre::class);
        $game = Game::create(['user_id' => $this->me->id, 'title_en' => 'g']);
        $game->genres()->attach($gone->id);

        $this->actingAs($this->me)->deleteJson("/api/game-genres/{$gone->id}", ['move_to' => $target->id])->assertOk();

        // ⚠️ FK-ის კასკადი აღარ ეშვება — ბმული ცხადად უნდა მოიხსნას
        $this->assertSame([$target->id], $game->genres()->withoutGlobalScopes()->pluck('game_genres.id')->all());

        $this->actingAs($this->me)->postJson("/api/trash/game_genre/{$gone->id}/restore", ['records' => true])->assertOk();

        $ids = $game->genres()->pluck('game_genres.id')->sort()->values()->all();
        $this->assertSame(collect([$gone->id, $target->id])->sort()->values()->all(), $ids);
    }
}
