<?php

namespace Tests\Feature;

use App\Models\BoardGame;
use App\Models\BoardGameGenre;
use App\Models\Book;
use App\Models\BookGenre;
use App\Models\Bookmark;
use App\Models\BookNote;
use App\Models\CastMember;
use App\Models\GalleryImage;
use App\Models\Game;
use App\Models\GameGenre;
use App\Models\Genre;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Song;
use App\Models\SongGenre;
use App\Models\User;
use App\Models\Video;
use App\Models\VideoType;
use App\Services\Storage\StorageMeter;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Tasks 20 — მასობრივი წაშლა: გეგმა, დადასტურება, სკოუპები
 * (ყველა · კონკრეტული · ჟანრი · სტატუსი · ვიდეოს ტიპი/ტეგი),
 * მხოლოდ გალერეის გასუფთავება და კვოტის განთავისუფლება.
 */
class PurgeTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $other;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->admin = $this->makeUser('davit');
        $this->admin->assignRole('super_admin')->save();
        $this->admin = $this->admin->refresh();

        $this->other = $this->makeUser('otto');
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', ['movie', 'video', 'gallery'])->pluck('id')->all());

        return $user->refresh();
    }

    private function makeMovie(User $owner, string $title, array $attrs = []): Movie
    {
        $movie = Movie::create(['user_id' => $owner->id, 'year' => 2020, ...$attrs]);
        $movie->translations()->create(['locale' => 'en', 'title' => $title]);

        return $movie->refresh();
    }

    /** გალერეის ფოტო ჩანაწერზე ან მსახიობზე, რეალური ფაილით */
    private function photo(object $parent, User $owner, string $path, int $bytes): GalleryImage
    {
        Storage::disk('public')->put($path, str_repeat('x', $bytes));

        return $parent->galleryImages()->create([
            'user_id' => $owner->id,
            'source' => 'tmdb',
            'category' => 'backdrop',
            'path' => $path,
            'size' => $bytes,
        ]);
    }

    public function test_plan_counts_and_run_requires_typed_confirmation(): void
    {
        Storage::fake('public');
        $movie = $this->makeMovie($this->admin, 'Alien');
        $this->photo($movie, $this->admin, 'gallery/images/a.jpg', 1000);
        app(StorageMeter::class)->recalculate($this->admin);

        $this->actingAs($this->admin->refresh())
            ->postJson('/api/admin/purge/plan', ['target' => 'movie', 'mode' => 'all'])
            ->assertOk()
            ->assertJsonPath('plan.records', 1)
            ->assertJsonPath('plan.photos', 1)
            ->assertJsonPath('plan.bytes', 1000);

        // დადასტურების გარეშე — 422, ჩანაწერი ხელუხლებელი
        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge', ['target' => 'movie', 'mode' => 'all'])
            ->assertStatus(422);

        $this->assertSame(1, Movie::withoutGlobalScope('owner')->count());

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge', ['target' => 'movie', 'mode' => 'all', 'confirm' => 'DELETE'])
            ->assertOk()
            ->assertJsonPath('result.records', 1)
            ->assertJsonPath('storage.used', 0);

        $this->assertSame(0, Movie::withoutGlobalScope('owner')->count());
        $this->assertSame(0, GalleryImage::withoutGlobalScope('owner')->count());
        Storage::disk('public')->assertMissing('gallery/images/a.jpg');
    }

    /** ჟანრით წაშლა — სხვა ჟანრი და სხვისი ჩანაწერი ხელუხლებელი რჩება */
    public function test_purge_by_genre_keeps_everything_else(): void
    {
        $horror = Genre::create(['slug' => 'horror']);
        $drama = Genre::create(['slug' => 'drama']);

        $a = $this->makeMovie($this->admin, 'Scary');
        $a->genres()->sync([$horror->id]);
        $b = $this->makeMovie($this->admin, 'Sad');
        $b->genres()->sync([$drama->id]);
        $mine = $this->makeMovie($this->other, 'Theirs');
        $mine->genres()->sync([$horror->id]);

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge', [
                'target' => 'movie',
                'mode' => 'genre',
                'genres' => ['horror'],
                'confirm' => 'DELETE',
            ])
            ->assertOk()
            ->assertJsonPath('result.records', 1);

        $left = Movie::withoutGlobalScope('owner')->pluck('id')->all();
        $this->assertEqualsCanonicalizing([$b->id, $mine->id], $left);
    }

    /** ცარიელი სკოუპი „ყველად" არ იქცევა */
    public function test_empty_scope_is_rejected(): void
    {
        $this->makeMovie($this->admin, 'Safe');

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge', ['target' => 'movie', 'mode' => 'genre', 'confirm' => 'DELETE'])
            ->assertStatus(422);

        $this->assertSame(1, Movie::withoutGlobalScope('owner')->count());
    }

    /** „რჩეული დამიტოვე" — ერთი checkbox, რომელიც ყველაზე ხშირ შეცდომას იჭერს */
    public function test_favorites_can_be_kept(): void
    {
        $fav = $this->makeMovie($this->admin, 'Keeper', ['is_favorite' => true]);
        $this->makeMovie($this->admin, 'Goner');

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge', [
                'target' => 'movie',
                'mode' => 'all',
                'keep_favorites' => true,
                'confirm' => 'DELETE',
            ])
            ->assertOk()
            ->assertJsonPath('result.records', 1);

        $this->assertSame([$fav->id], Movie::withoutGlobalScope('owner')->pluck('id')->all());
    }

    /** მხოლოდ გალერეა: ფოტოები ქრება, ჩანაწერი რჩება (მსახიობის ფოტოებთან ერთად) */
    public function test_gallery_only_purge_keeps_records(): void
    {
        Storage::fake('public');

        $movie = $this->makeMovie($this->admin, 'Alien');
        $actor = CastMember::create(['tmdb_person_id' => 7, 'name' => 'Sigourney']);
        $movie->cast()->sync([$actor->id => ['character' => 'Ripley', 'billing_order' => 0]]);

        $this->photo($movie, $this->admin, 'gallery/images/still.jpg', 500);
        $this->photo($actor, $this->admin, 'gallery/images/actor.jpg', 300);
        app(StorageMeter::class)->recalculate($this->admin);
        $this->assertSame(800, (int) $this->admin->refresh()->storage_used_bytes);

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge/plan', ['target' => 'gallery', 'media_type' => 'movie', 'mode' => 'all'])
            ->assertOk()
            ->assertJsonPath('plan.photos', 2)
            ->assertJsonPath('plan.records', 0)
            ->assertJsonPath('plan.bytes', 800);

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge', [
                'target' => 'gallery',
                'media_type' => 'movie',
                'mode' => 'all',
                'confirm' => 'DELETE',
            ])
            ->assertOk()
            ->assertJsonPath('result.photos', 2)
            ->assertJsonPath('storage.used', 0);

        $this->assertSame(1, Movie::withoutGlobalScope('owner')->count());
        $this->assertSame(0, GalleryImage::withoutGlobalScope('owner')->count());
        Storage::disk('public')->assertMissing('gallery/images/actor.jpg');
    }

    /** ვიდეოები: ტიპით და ტეგით */
    public function test_videos_by_type_and_tag(): void
    {
        $types = $this->actingAs($this->admin)->getJson('/api/video-types')->json('data');
        [$info, $fun] = [$types[0]['id'], $types[1]['id']];

        Video::create([
            'user_id' => $this->admin->id,
            'title' => 'Doc',
            'url' => 'https://youtu.be/aaaaaaaaaaa',
            'type_id' => $info,
            'tags' => ['Music'],
        ]);
        $keep = Video::create([
            'user_id' => $this->admin->id,
            'title' => 'Fun',
            'url' => 'https://youtu.be/bbbbbbbbbbb',
            'type_id' => $fun,
            'tags' => ['comedy'],
        ]);

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge', [
                'target' => 'video',
                'mode' => 'type',
                'type_ids' => [$info],
                'confirm' => 'DELETE',
            ])
            ->assertOk()
            ->assertJsonPath('result.records', 1);

        $this->assertSame([$keep->id], Video::withoutGlobalScope('owner')->pluck('id')->all());

        // ტეგი რეგისტრს არ ითვალისწინებს (`Video::tagKey()`)
        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge', [
                'target' => 'video',
                'mode' => 'tag',
                'tags' => ['COMEDY'],
                'confirm' => 'DELETE',
            ])
            ->assertOk()
            ->assertJsonPath('result.records', 1);

        $this->assertSame(0, Video::withoutGlobalScope('owner')->count());
        $this->assertSame(2, VideoType::withoutGlobalScope('owner')->count());
    }

    /**
     * სიმღერები: „ტიპი" = მუსიკის ჟანრი, ტეგიც იმავე წესით.
     *
     * ⚠️ ჟანრი **pivot-ია** 2026-09-06-იდან (`DECISIONS.md` §5), ე.ი. სკოუპი
     * `whereHas`-ზე გადის (`PurgeService::GENRE_PIVOTS`) და არა სვეტზე.
     */
    public function test_songs_by_genre_and_tag(): void
    {
        $genres = $this->actingAs($this->admin)->getJson('/api/song-genres')->json('data');
        [$pop, $rock] = [$genres[0]['id'], $genres[1]['id']];

        $drop = Song::create([
            'user_id' => $this->admin->id,
            'title' => 'Popsong',
            'url' => 'https://youtu.be/aaaaaaaaaaa',
            'tags' => ['Radio'],
        ]);
        $drop->genres()->sync([$pop]);

        $keep = Song::create([
            'user_id' => $this->admin->id,
            'title' => 'Rocksong',
            'url' => 'https://youtu.be/bbbbbbbbbbb',
            'tags' => ['live'],
        ]);
        $keep->genres()->sync([$rock]);

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge', [
                'target' => 'song',
                'mode' => 'type',
                'type_ids' => [$pop],
                'confirm' => 'DELETE',
            ])
            ->assertOk()
            ->assertJsonPath('result.records', 1);

        $this->assertSame([$keep->id], Song::withoutGlobalScope('owner')->pluck('id')->all());

        // ტეგი რეგისტრს არ ითვალისწინებს (`Song::tagKey()` → `Video::tagKey()`)
        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge', [
                'target' => 'song',
                'mode' => 'tag',
                'tags' => ['LIVE'],
                'confirm' => 'DELETE',
            ])
            ->assertOk()
            ->assertJsonPath('result.records', 1);

        $this->assertSame(0, Song::withoutGlobalScope('owner')->count());
        // ლექსიკონი ხელუხლებელი რჩება
        $this->assertSame(count(SongGenre::DEFAULTS), SongGenre::withoutGlobalScope('owner')->count());
    }

    /**
     * წიგნები (§12): „ტიპი" = per-user ჟანრის ლექსიკონი, სტატუსი კი **თავისი**
     * აქვს (`read`, და არა `watched`). ჩანიშვნები/ციტატები ჩანაწერთან ერთად ქრება.
     */
    public function test_books_by_genre_and_status(): void
    {
        BookGenre::ensureDefaults($this->admin->id);
        $genres = BookGenre::withoutGlobalScope('owner')->where('user_id', $this->admin->id)->get();
        [$fiction, $history] = [$genres[0]->id, $genres[5]->id];

        $gone = Book::create([
            'user_id' => $this->admin->id,
            'title_en' => 'Dune',
            'year' => 1965,
            'genre_id' => $fiction,
            'status' => 'read',
            'tags' => ['Classic'],
        ]);
        BookNote::create(['user_id' => $this->admin->id, 'book_id' => $gone->id, 'body' => 'ციტატა', 'is_quote' => true]);

        $keep = Book::create([
            'user_id' => $this->admin->id,
            'title_en' => 'Sapiens',
            'genre_id' => $history,
            'status' => 'to_read',
        ]);

        // გეგმა — სათაური ბრტყელი სვეტიდან, ჩანიშვნაც დათვლილია
        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge/plan', ['target' => 'book', 'mode' => 'type', 'type_ids' => [$fiction]])
            ->assertOk()
            ->assertJsonPath('plan.records', 1)
            ->assertJsonPath('plan.notes', 1)
            ->assertJsonPath('plan.items.0.title', 'Dune')
            ->assertJsonPath('plan.items.0.year', 1965);

        // ⚠️ ფილმის სტატუსი წიგნზე არ გაივლის
        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge/plan', ['target' => 'book', 'mode' => 'status', 'status' => 'watched'])
            ->assertStatus(422);

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge', [
                'target' => 'book',
                'mode' => 'status',
                'status' => 'read',
                'confirm' => 'DELETE',
            ])
            ->assertOk()
            ->assertJsonPath('result.records', 1);

        $this->assertSame([$keep->id], Book::withoutGlobalScope('owner')->pluck('id')->all());
        $this->assertSame(0, BookNote::withoutGlobalScope('owner')->count());
        // ლექსიკონი ხელუხლებელი რჩება
        $this->assertSame(count(BookGenre::DEFAULTS), BookGenre::withoutGlobalScope('owner')->count());
    }

    /** ბორდგეიმები (§14): ჟანრი და სტატუსი; ტეგი მათ არ აქვთ — 422 */
    public function test_board_games_by_genre_and_status(): void
    {
        BoardGameGenre::ensureDefaults($this->admin->id);
        $genres = BoardGameGenre::withoutGlobalScope('owner')->where('user_id', $this->admin->id)->get();

        $gone = BoardGame::create([
            'user_id' => $this->admin->id,
            'title' => 'Catan',
            'year' => 1995,
            'genre_id' => $genres[0]->id,
            'status' => 'sold',
        ]);
        $keep = BoardGame::create([
            'user_id' => $this->admin->id,
            'title' => 'Carcassonne',
            'genre_id' => $genres[1]->id,
            'status' => 'owned',
        ]);

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge/plan', ['target' => 'board_game', 'mode' => 'all'])
            ->assertOk()
            ->assertJsonPath('plan.records', 2)
            ->assertJsonPath('plan.items.0.title', 'Catan')
            ->assertJsonPath('plan.items.0.year', 1995);

        // ტეგები ბორდგეიმს არ აქვს (მექანიკები სხვა ღერძია)
        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge/plan', ['target' => 'board_game', 'mode' => 'tag', 'tags' => ['x']])
            ->assertStatus(422);

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge/item', [
                'target' => 'board_game',
                'id' => $gone->id,
                'confirm' => 'DELETE',
            ])
            ->assertOk()
            ->assertJsonPath('result.records', 1)
            ->assertJsonPath('result.title', 'Catan');

        $this->assertSame([$keep->id], BoardGame::withoutGlobalScope('owner')->pluck('id')->all());
        $this->assertSame(count(BoardGameGenre::DEFAULTS), BoardGameGenre::withoutGlobalScope('owner')->count());
    }

    /**
     * თამაშები (§11): ⚠️ ჟანრი **pivot-ია** და არა სვეტი, ე.ი. „ტიპით" წაშლა
     * `whereHas`-ზე უნდა გადიოდეს; სტატუსებიც თავისი აქვს (`finished`).
     */
    public function test_games_by_genre_pivot_and_status(): void
    {
        GameGenre::ensureDefaults($this->admin->id);
        $genres = GameGenre::withoutGlobalScope('owner')->where('user_id', $this->admin->id)->get();
        [$action, $rpg] = [$genres[0]->id, $genres[2]->id];

        $gone = Game::create([
            'user_id' => $this->admin->id,
            'title_en' => 'Doom',
            'release_date' => '2016-05-13',
            'status' => 'finished',
        ]);
        $gone->genres()->sync([$action]);

        $keep = Game::create([
            'user_id' => $this->admin->id,
            'title_en' => 'Baldurs Gate 3',
            'status' => 'playing',
        ]);
        $keep->genres()->sync([$rpg]);

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge/plan', ['target' => 'game', 'mode' => 'type', 'type_ids' => [$action]])
            ->assertOk()
            ->assertJsonPath('plan.records', 1)
            ->assertJsonPath('plan.items.0.title', 'Doom')
            // ⚠️ `year` სვეტი არ არსებობს — `release_date`-ის აქსესორია
            ->assertJsonPath('plan.items.0.year', 2016);

        // ბორდგეიმის სტატუსი თამაშზე არ გაივლის
        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge/plan', ['target' => 'game', 'mode' => 'status', 'status' => 'owned'])
            ->assertStatus(422);

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge', [
                'target' => 'game',
                'mode' => 'status',
                'status' => 'finished',
                'confirm' => 'DELETE',
            ])
            ->assertOk()
            ->assertJsonPath('result.records', 1);

        $this->assertSame([$keep->id], Game::withoutGlobalScope('owner')->pluck('id')->all());
        $this->assertSame(count(GameGenre::DEFAULTS), GameGenre::withoutGlobalScope('owner')->count());
    }

    /** ჟანრი/სტატუსი ვიდეოზე და ტიპი/ტეგი მედიაზე — აზრი არ აქვს, 422 */
    public function test_mode_must_match_the_target(): void
    {
        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge/plan', ['target' => 'video', 'mode' => 'genre', 'genres' => ['x']])
            ->assertStatus(422);

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge/plan', ['target' => 'movie', 'mode' => 'tag', 'tags' => ['x']])
            ->assertStatus(422);

        // ჟანრი (გლობალური `genres`) წიგნზე არ არსებობს — მას ლექსიკონი აქვს
        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge/plan', ['target' => 'book', 'mode' => 'genre', 'genres' => ['x']])
            ->assertStatus(422);
    }

    /** ადმინს სხვისი ანგარიშის გასუფთავებაც შეუძლია (`user_id`) */
    public function test_admin_can_purge_another_users_library(): void
    {
        $this->makeMovie($this->other, 'Theirs');
        $mine = $this->makeMovie($this->admin, 'Mine');

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge', [
                'target' => 'movie',
                'mode' => 'all',
                'user_id' => $this->other->id,
                'confirm' => 'DELETE',
            ])
            ->assertOk()
            ->assertJsonPath('result.records', 1);

        $this->assertSame([$mine->id], Movie::withoutGlobalScope('owner')->pluck('id')->all());
    }

    /** ჩვეულებრივ user-ს ეს endpoint არ აქვს */
    public function test_purge_is_super_admin_only(): void
    {
        $this->actingAs($this->other)
            ->postJson('/api/admin/purge/plan', ['target' => 'movie', 'mode' => 'all'])
            ->assertStatus(403);

        $this->actingAs($this->other)
            ->postJson('/api/admin/purge/item', ['target' => 'movie', 'id' => 1, 'confirm' => 'DELETE'])
            ->assertStatus(403);
    }

    /* ---------- 20.2: per-item რიგი ---------- */

    /** გეგმა რიგსაც აბრუნებს — სახელი პროგრესში უნდა ჩანდეს */
    public function test_plan_returns_the_queue_with_titles(): void
    {
        $movie = $this->makeMovie($this->admin, 'Alien');

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge/plan', ['target' => 'movie', 'mode' => 'all'])
            ->assertOk()
            ->assertJsonPath('plan.items.0.id', $movie->id)
            ->assertJsonPath('plan.items.0.type', 'movie')
            ->assertJsonPath('plan.items.0.title', 'Alien')
            ->assertJsonPath('plan.items.0.year', 2020)
            ->assertJsonPath('eta_seconds', 1);
    }

    /**
     * §25.1 — „კონკრეტული" სკოუპი **ყველა** დომენს აქვს.
     *
     * ⚠️ აქამდე ბუკმარკიდან/ჩანაწერიდან/თამაშიდან ერთი ჩანაწერის წაშლა
     * `/purge`-ით შეუძლებელი იყო: `mode: ids` **422**-ს იძლეოდა
     * (`mode_not_supported_for_target`) და მთელი კატეგორიის წაშლა რჩებოდა
     * ერთადერთ გზად.
     */
    public function test_the_ids_scope_works_on_a_non_media_module(): void
    {
        $gone = Bookmark::create(['user_id' => $this->admin->id, 'title' => 'Gone', 'url' => 'https://a.example/1']);
        $keep = Bookmark::create(['user_id' => $this->admin->id, 'title' => 'Keep', 'url' => 'https://a.example/2']);

        $this->actingAs($this->admin->refresh())
            ->postJson('/api/admin/purge/plan', [
                'target' => 'bookmark',
                'mode' => 'ids',
                'ids' => [$gone->id],
            ])
            ->assertOk()
            ->assertJsonPath('plan.records', 1)
            ->assertJsonPath('plan.items.0.title', 'Gone');

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge/item', [
                'target' => 'bookmark',
                'id' => $gone->id,
                'confirm' => 'DELETE',
            ])
            ->assertOk();

        $left = Bookmark::withoutGlobalScope('owner')->pluck('id')->all();
        $this->assertSame([$keep->id], $left);
    }

    /**
     * §25.2 — ამრჩევის სია **სამიზნე ანგარიშისაა**.
     *
     * ⚠️ ეს ცოცხალი ხარვეზი იყო: ფრონტი სიას მოდულის თავისი `index()`-იდან
     * კითხულობდა, რომელსაც `owner` სკოუპი **ჩემს** ჩანაწერებზე ჭრის — ე.ი.
     * ადმინი სხვისი ბიბლიოთეკის გასუფთავებისას თავის ფილმებს ხედავდა და
     * იმ id-ებს სხვის ანგარიშზე აგზავნიდა.
     */
    public function test_the_record_pool_belongs_to_the_target_account(): void
    {
        $mine = $this->makeMovie($this->admin, 'Mine');
        $theirs = $this->makeMovie($this->other, 'Theirs');

        $this->actingAs($this->admin->refresh())
            ->getJson('/api/admin/purge/records?target=movie&user_id='.$this->other->id)
            ->assertOk()
            ->assertJsonCount(1, 'items')
            ->assertJsonPath('items.0.id', $theirs->id)
            ->assertJsonPath('items.0.title', 'Theirs');

        // user_id-ის გარეშე — ჩემი
        $this->actingAs($this->admin)
            ->getJson('/api/admin/purge/records?target=movie')
            ->assertOk()
            ->assertJsonCount(1, 'items')
            ->assertJsonPath('items.0.id', $mine->id);
    }

    /** ერთი ნაბიჯი — ერთი ჩანაწერი, დანარჩენი ხელუხლებელი; კვოტაც თავისუფლდება */
    public function test_item_deletes_exactly_one_record(): void
    {
        Storage::fake('public');

        $gone = $this->makeMovie($this->admin, 'Goner');
        $keep = $this->makeMovie($this->admin, 'Keeper');
        $this->photo($gone, $this->admin, 'gallery/images/a.jpg', 700);
        app(StorageMeter::class)->recalculate($this->admin);

        // დადასტურების გარეშე — 422
        $this->actingAs($this->admin->refresh())
            ->postJson('/api/admin/purge/item', ['target' => 'movie', 'id' => $gone->id])
            ->assertStatus(422);

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge/item', [
                'target' => 'movie',
                'id' => $gone->id,
                'confirm' => 'DELETE',
            ])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('skipped', false)
            ->assertJsonPath('result.records', 1)
            ->assertJsonPath('result.title', 'Goner')
            ->assertJsonPath('result.bytes', 700)
            ->assertJsonPath('storage.used', 0);

        $this->assertSame([$keep->id], Movie::withoutGlobalScope('owner')->pluck('id')->all());
        Storage::disk('public')->assertMissing('gallery/images/a.jpg');
    }

    /**
     * ⚠️ სხვისი (ან უკვე წაშლილი) id — **არ იშლება** და 200-ით „გამოტოვებულია":
     * ციკლი ერთ ჩავარდნაზე არ უნდა გაწყდეს.
     */
    public function test_item_skips_ids_outside_the_target_account(): void
    {
        $theirs = $this->makeMovie($this->other, 'Theirs');

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge/item', [
                'target' => 'movie',
                'id' => $theirs->id,
                'confirm' => 'DELETE',
            ])
            ->assertOk()
            ->assertJsonPath('skipped', true)
            ->assertJsonPath('result.records', 0);

        $this->assertSame(1, Movie::withoutGlobalScope('owner')->count());

        // `user_id`-ით კი იშლება — ადმინის ცხადი არჩევანია
        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge/item', [
                'target' => 'movie',
                'id' => $theirs->id,
                'user_id' => $this->other->id,
                'confirm' => 'DELETE',
            ])
            ->assertOk()
            ->assertJsonPath('result.records', 1);

        $this->assertSame(0, Movie::withoutGlobalScope('owner')->count());
    }

    /**
     * გალერეაზე რიგში მხოლოდ **ფოტოს მქონე** ჩანაწერები ხვდება, თორემ
     * დიდ სკოუპზე ასობით ცარიელი რექვესთი წავიდოდა.
     */
    public function test_gallery_queue_only_lists_records_that_have_photos(): void
    {
        Storage::fake('public');

        $withPhoto = $this->makeMovie($this->admin, 'Alien');
        $viaActor = $this->makeMovie($this->admin, 'Aliens');
        $this->makeMovie($this->admin, 'Empty');

        $actor = CastMember::create(['tmdb_person_id' => 7, 'name' => 'Sigourney']);
        $viaActor->cast()->sync([$actor->id => ['character' => 'Ripley', 'billing_order' => 0]]);

        $this->photo($withPhoto, $this->admin, 'gallery/images/still.jpg', 500);
        $this->photo($actor, $this->admin, 'gallery/images/actor.jpg', 300);

        $items = $this->actingAs($this->admin)
            ->postJson('/api/admin/purge/plan', ['target' => 'gallery', 'media_type' => 'movie', 'mode' => 'all'])
            ->assertOk()
            ->assertJsonPath('plan.records', 0)
            ->assertJsonPath('plan.photos', 2)
            ->json('plan.items');

        $this->assertEqualsCanonicalizing(
            [$withPhoto->id, $viaActor->id],
            array_column($items, 'id'),
        );

        // ერთი ნაბიჯი — ჩანაწერი რჩება, მხოლოდ ფოტო ქრება
        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge/item', [
                'target' => 'gallery',
                'media_type' => 'movie',
                'id' => $withPhoto->id,
                'confirm' => 'DELETE',
            ])
            ->assertOk()
            ->assertJsonPath('result.records', 0)
            ->assertJsonPath('result.photos', 1)
            ->assertJsonPath('result.bytes', 500);

        $this->assertSame(3, Movie::withoutGlobalScope('owner')->count());
        $this->assertSame(1, GalleryImage::withoutGlobalScope('owner')->count());
    }

    /** ვიდეოს რიგში სათაური ჩვეულებრივი სვეტიდან მოდის (`year` არ აქვს) */
    public function test_video_queue_items_carry_the_plain_title(): void
    {
        $types = $this->actingAs($this->admin)->getJson('/api/video-types')->json('data');

        $video = Video::create([
            'user_id' => $this->admin->id,
            'title' => 'Doc',
            'url' => 'https://youtu.be/aaaaaaaaaaa',
            'type_id' => $types[0]['id'],
        ]);

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge/plan', ['target' => 'video', 'mode' => 'all'])
            ->assertOk()
            ->assertJsonPath('plan.items.0.title', 'Doc')
            ->assertJsonPath('plan.items.0.year', null);

        $this->actingAs($this->admin)
            ->postJson('/api/admin/purge/item', [
                'target' => 'video',
                'id' => $video->id,
                'confirm' => 'DELETE',
            ])
            ->assertOk()
            ->assertJsonPath('result.records', 1);

        $this->assertSame(0, Video::withoutGlobalScope('owner')->count());
    }

    /**
     * **სკოუპი ერთხელ ითვლება** (Tasks PERF-10).
     *
     * ⚠️ `run()` ჯერ `plan()`-ს იძახებდა (რომელიც `recordIds()`-ს აკეთებს),
     * მერე `recordIds()`-ს **თავიდან**. ორმაგი ხარჯი ერთი ნახევარია; მეორე
     * უფრო მნიშვნელოვანია — ორ გამოძახებას შორის ჩაწერილი ჩანაწერი ორ
     * **სხვადასხვა სეტს** დაბადებდა, ე.ი. „დათვლილი" და „წაშლილი" დაშორდებოდა.
     * სწორედ ამას კრძალავს კლასის მთავარი წესი.
     *
     * ⚠️ query-ები `movies`-ზე ითვლება და არა სულ: საერთო რიცხვს ყოველი ახალი
     * მრიცხველი ან eager load გადასწევდა და ტესტი უკავშირო ცვლილებების
     * მავთულსაკაბელი გახდებოდა.
     */
    public function test_the_scope_is_counted_once_per_run(): void
    {
        foreach (['Alien', 'Aliens', 'Alien 3'] as $title) {
            $this->makeMovie($this->admin, $title);
        }

        $this->actingAs($this->admin->refresh());

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->postJson('/api/admin/purge', ['target' => 'movie', 'mode' => 'all', 'confirm' => 'DELETE'])
            ->assertOk()
            ->assertJsonPath('result.records', 3);
        $log = collect(DB::getQueryLog())->pluck('query');
        DB::disableQueryLog();

        /* ⚠️ სწორედ ეს არის `recordIds()`-ის ხელწერა: `select "id" from "movies"`.
           ჩანაწერების **წასაშლელად** წამოღება (`select * from "movies"`) სხვა
           query-ია და აქ არ ითვლება. */
        $scopeQueries = $log->filter(
            fn (string $q) => str_contains($q, 'from "movies"') && str_contains($q, 'select "id"'),
        );

        $this->assertCount(1, $scopeQueries, "სკოუპი ერთზე მეტჯერ დაითვალა:\n".$scopeQueries->implode("\n"));
    }
}
