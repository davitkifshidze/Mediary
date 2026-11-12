<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\CastMember;
use App\Models\GalleryImage;
use App\Models\Genre;
use App\Models\Module;
use App\Models\Movie;
use App\Models\RecordLock;
use App\Models\User;
use App\Services\Share\RecordPage;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * **ერთი ჩანაწერის გაზიარება და სტუმრის შიდა გვერდი.**
 *
 * ⚠️ მოწმდება ორივე გზა (გაზიარების ბმული და საჯარო პროფილი) და ორივე უცხო —
 * ანონიმი და შესული: `owner`/`creator`/`record_lock` scope-ები მნახველს კითხულობს,
 * ე.ი. ერთ მათგანზე გამართული query მეორეზე ცარიელს ან ზედმეტს აბრუნებს.
 */
class SharedRecordPageTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $viewer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);
        Storage::fake('public');
        Storage::fake('private');

        $this->owner = $this->makeUser('owner');
        $this->viewer = $this->makeUser('viewer');
    }

    private function makeUser(string $name): User
    {
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $ids = Module::whereIn('key', ['movie', 'series', 'book', 'gallery'])
            ->pluck('id')
            ->mapWithKeys(fn ($id) => [$id => ['enabled_at' => now()]])
            ->all();
        $user->modules()->sync($ids);

        return $user->refresh();
    }

    private function movie(string $title, array $attrs = []): Movie
    {
        $movie = Movie::create(['user_id' => $this->owner->id, 'year' => 2010, 'visibility' => 'private', ...$attrs]);
        $movie->setTranslation('en', ['title' => $title, 'description' => "About {$title}"]);

        return $movie->refresh();
    }

    private function photo(Movie $movie, string $name): GalleryImage
    {
        Storage::disk('public')->put("gallery/images/{$name}.jpg", 'x');

        return GalleryImage::create([
            'user_id' => $this->owner->id, 'imageable_type' => 'movie', 'imageable_id' => $movie->id,
            'source' => 'web', 'category' => 'still', 'path' => "gallery/images/{$name}.jpg", 'size' => 1,
        ]);
    }

    private function actor(Movie $movie, string $name, array $pivot = [], array $attrs = []): CastMember
    {
        $actor = CastMember::create(['name' => $name, 'tmdb_person_id' => crc32($name) % 100000, ...$attrs]);
        $movie->castLinks()->attach($actor->id, ['billing_order' => $movie->castLinks()->count(), ...$pivot]);

        return $actor;
    }

    /** ბმულის შექმნა API-ით — აბრუნებს ტოკენს */
    private function link(array $domains, array $extra = []): string
    {
        $url = $this->actingAs($this->owner)
            ->postJson('/api/share-links', ['domains' => $domains, ...$extra])
            ->assertCreated()
            ->json('data.url');

        Auth::forgetGuards();

        return basename((string) $url);
    }

    private function anonymous(string $uri): TestResponse
    {
        Auth::forgetGuards();

        return $this->getJson($uri);
    }

    /** პროფილი, მოდული და ჩანაწერი — სამივე ფენა საჯარო */
    private function publish(string $module, array $blocks = []): void
    {
        $this->owner->forceFill(['profile_visibility' => 'public'])->save();
        $id = Module::where('key', $module)->value('id');
        $this->owner->modules()->syncWithoutDetaching([$id => [
            'is_public' => true,
            'settings' => json_encode($blocks === [] ? [] : [RecordPage::SETTING => $blocks]),
        ]]);
    }

    /* ================= გაზიარების ბმული ================= */

    public function test_a_link_to_one_record_opens_its_page_and_no_other_record(): void
    {
        $shared = $this->movie('Shared');
        $other = $this->movie('Other');
        $token = $this->link(['movie' => ['scope' => 'ids', 'ids' => [$shared->id]]]);

        $page = $this->anonymous("/api/public/shares/{$token}/movie/{$shared->id}")->assertOk()->json();

        $this->assertSame('Shared', $page['record']['title_en']);
        $this->assertSame('About Shared', $page['description']['en']);
        // ბლოკები ნაგულისხმევად დახურულია
        $this->assertSame(['gallery' => false, 'cast' => false, 'trailer' => false], $page['blocks']);
        $this->assertSame([], $page['gallery']);
        $this->assertSame([], $page['cast']);
        $this->assertNull($page['trailer']);

        // იგივე ბმული + სხვა ჩანაწერის id — 404, ანონიმზეც და შესულზეც
        $this->anonymous("/api/public/shares/{$token}/movie/{$other->id}")
            ->assertNotFound()
            ->assertJsonPath('message', 'share_record_not_found');
        $this->actingAs($this->viewer)->getJson("/api/public/shares/{$token}/movie/{$other->id}")->assertNotFound();
        // ბმულში არმყოფი დომენი და სია
        $this->anonymous("/api/public/shares/{$token}/series/{$shared->id}")->assertNotFound();
        $this->anonymous("/api/public/shares/{$token}/playlist/1")->assertNotFound();
    }

    public function test_the_link_decides_which_blocks_leave(): void
    {
        $movie = $this->movie('Blocks', ['trailer_url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'my_rating' => 9]);
        $genre = Genre::create(['slug' => 'drama']);
        $genre->setTranslation('en', 'Drama');
        $movie->genres()->attach($genre->id);
        $this->photo($movie, 'one');
        $this->actor($movie, 'Liam Neeson', ['character' => 'Bryan']);

        $closed = $this->link(['movie' => ['scope' => 'ids', 'ids' => [$movie->id]]], ['show_rating' => false]);
        $page = $this->anonymous("/api/public/shares/{$closed}/movie/{$movie->id}")->assertOk()->json();
        $this->assertArrayNotHasKey('my_rating', $page['record']);
        $this->assertSame('drama', $page['genres'][0]['value']);
        $this->assertSame([], $page['gallery']);
        $this->assertSame([], $page['cast']);

        $open = $this->link(
            ['movie' => ['scope' => 'ids', 'ids' => [$movie->id]]],
            ['show_gallery' => true, 'show_cast' => true, 'show_trailer' => true],
        );

        // შესულ უცხოზეც იგივე — მსახიობი და ჟანრი მის scope-ებზე არ იჭრება
        foreach ([null, $this->viewer] as $who) {
            $who ? $this->actingAs($who) : Auth::forgetGuards();
            $page = $this->getJson("/api/public/shares/{$open}/movie/{$movie->id}")->assertOk()->json();

            $this->assertSame(['gallery' => true, 'cast' => true, 'trailer' => true], $page['blocks']);
            $this->assertSame(9, $page['record']['my_rating']);
            $this->assertSame(['gallery/images/one.jpg'], array_column($page['gallery'], 'path'));
            $this->assertSame('Liam Neeson', $page['cast'][0]['name']);
            $this->assertSame('Bryan', $page['cast'][0]['character']);
            $this->assertSame('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', $page['trailer']['embed_url']);
        }
    }

    public function test_locked_and_hidden_things_never_leave_even_with_every_block_on(): void
    {
        $movie = $this->movie('Guarded');
        $open = $this->photo($movie, 'open');
        $secret = $this->photo($movie, 'secret');
        $this->actor($movie, 'Seen');
        $this->actor($movie, 'Hidden On Record', ['is_hidden' => true]);
        $this->actor($movie, 'Removed', ['is_removed' => true]);
        $lockedActor = $this->actor($movie, 'Locked Actor');
        // ხელით შექმნილი მსახიობი მხოლოდ შემქმნელს უჩანს — მის ბმულზე კი ჩანს
        $own = CastMember::create(['name' => 'Hand Made', 'created_by' => $this->owner->id]);
        $movie->castLinks()->attach($own->id, ['billing_order' => 9]);

        RecordLock::create([
            'user_id' => $this->owner->id, 'lockable_type' => 'cast_member',
            'lockable_id' => $lockedActor->id, 'password_hash' => Hash::make('secret1'),
        ]);
        // ფოტოს ჩაკეტვა მას სისტემურ ჩაკეტილ ალბომში და პირად დისკზე გადაიტანს
        $this->actingAs($this->owner)
            ->postJson('/api/gallery/images/lock', ['ids' => [$secret->id], 'password' => 'secret1'])
            ->assertOk();
        $token = $this->link(
            ['movie' => ['scope' => 'ids', 'ids' => [$movie->id]]],
            ['show_gallery' => true, 'show_cast' => true, 'show_trailer' => true],
        );

        foreach ([null, $this->viewer, $this->owner] as $who) {
            $who ? $this->actingAs($who) : Auth::forgetGuards();
            $page = $this->getJson("/api/public/shares/{$token}/movie/{$movie->id}")->assertOk()->json();

            $this->assertSame([$open->id], array_column($page['gallery'], 'id'));
            $this->assertSame(['Seen', 'Hand Made'], array_column($page['cast'], 'name'));
            $this->assertStringNotContainsString('gallery/locked', json_encode($page));
        }

        // ჩაკეტილი ჩანაწერი ბმულიდან ქრება — მისი გვერდი 404-ია
        RecordLock::create([
            'user_id' => $this->owner->id, 'lockable_type' => 'movie',
            'lockable_id' => $movie->id, 'password_hash' => Hash::make('secret1'),
        ]);
        $this->anonymous("/api/public/shares/{$token}/movie/{$movie->id}")->assertNotFound();
    }

    public function test_a_record_page_never_carries_private_fields(): void
    {
        $movie = $this->movie('Private Bits', ['my_rating' => 7]);
        DB::table('movies')->where('id', $movie->id)->update(['ge_url' => 'https://example.com/TOP-SECRET-NOTE']);
        $token = $this->link(
            ['movie' => ['scope' => 'ids', 'ids' => [$movie->id]]],
            ['show_gallery' => true, 'show_cast' => true, 'show_trailer' => true],
        );

        $body = $this->anonymous("/api/public/shares/{$token}/movie/{$movie->id}")->assertOk();

        $this->assertStringNotContainsString('TOP-SECRET-NOTE', $body->getContent());
        $this->assertSame(
            ['record', 'description', 'genres', 'blocks', 'gallery', 'cast', 'trailer'],
            array_keys($body->json()),
        );
    }

    public function test_a_non_media_record_has_a_page_too(): void
    {
        $book = Book::create([
            'user_id' => $this->owner->id, 'title_en' => 'Dune', 'author' => 'Frank Herbert',
            'status' => 'to_read', 'description_en' => 'Spice.',
        ]);
        $token = $this->link(
            ['book' => ['scope' => 'ids', 'ids' => [$book->id]]],
            ['show_cast' => true, 'show_trailer' => true, 'show_gallery' => true],
        );

        $page = $this->anonymous("/api/public/shares/{$token}/book/{$book->id}")->assertOk()->json();

        $this->assertSame('Dune', $page['record']['title_en']);
        $this->assertSame('Spice.', $page['description']['en']);
        // მსახიობები და თრეილერი მხოლოდ მედიას აქვს
        $this->assertFalse($page['blocks']['cast']);
        $this->assertFalse($page['blocks']['trailer']);
    }

    public function test_the_blocks_are_saved_on_the_link_and_default_to_closed(): void
    {
        $movie = $this->movie('Saved');

        $data = $this->actingAs($this->owner)
            ->postJson('/api/share-links', ['domains' => ['movie' => ['scope' => 'ids', 'ids' => [$movie->id]]]])
            ->assertCreated()
            ->json('data');
        $this->assertFalse($data['show_gallery']);
        $this->assertFalse($data['show_cast']);
        $this->assertFalse($data['show_trailer']);

        $this->patchJson("/api/share-links/{$data['id']}", ['show_cast' => true])
            ->assertOk()
            ->assertJsonPath('data.show_cast', true)
            ->assertJsonPath('data.show_gallery', false);
    }

    /* ================= საჯარო პროფილი ================= */

    public function test_a_public_profile_opens_only_public_records(): void
    {
        $public = $this->movie('Public', ['visibility' => 'public']);
        $private = $this->movie('Private');
        $this->photo($public, 'one');
        $this->actor($public, 'Liam Neeson');

        // მოდული ჯერ საჯარო არ არის
        $this->anonymous("/api/public/profiles/owner/movie/{$public->id}")->assertNotFound();

        $this->publish('movie');
        $page = $this->anonymous("/api/public/profiles/owner/movie/{$public->id}")->assertOk()->json();
        $this->assertSame('Public', $page['record']['title_en']);
        // პროფილზე გალერეა, მსახიობები და თრეილერი ჩასართავია
        $this->assertSame(['gallery' => false, 'cast' => false, 'trailer' => false], $page['blocks']);
        $this->assertSame([], $page['gallery']);

        $this->anonymous("/api/public/profiles/owner/movie/{$private->id}")->assertNotFound();
        $this->actingAs($this->viewer)->getJson("/api/public/profiles/owner/movie/{$private->id}")->assertNotFound();
        // ალბომს თავისი გვერდი აქვს
        $this->anonymous('/api/public/profiles/owner/gallery_album/1')->assertNotFound();
    }

    public function test_the_module_settings_decide_the_profile_blocks(): void
    {
        $movie = $this->movie('Blocks', ['visibility' => 'public', 'my_rating' => 8]);
        $this->photo($movie, 'one');
        $this->actor($movie, 'Liam Neeson');
        $this->publish('movie', ['gallery' => true, 'cast' => true, 'rating' => false]);

        $page = $this->actingAs($this->viewer)->getJson("/api/public/profiles/owner/movie/{$movie->id}")->assertOk()->json();

        $this->assertTrue($page['blocks']['gallery']);
        $this->assertTrue($page['blocks']['cast']);
        $this->assertCount(1, $page['gallery']);
        $this->assertSame('Liam Neeson', $page['cast'][0]['name']);
        $this->assertArrayNotHasKey('my_rating', $page['record']);

        // პარამეტრი ჩვეულებრივი მოდულის პარამეტრებით ინახება
        $this->actingAs($this->owner)
            ->putJson('/api/modules/movie/settings', ['settings' => [RecordPage::SETTING => ['gallery' => false, 'cast' => true]]])
            ->assertOk();
        $page = $this->anonymous("/api/public/profiles/owner/movie/{$movie->id}")->assertOk()->json();
        $this->assertFalse($page['blocks']['gallery']);
        $this->assertSame([], $page['gallery']);
        $this->assertTrue($page['blocks']['cast']);
    }

    public function test_a_locked_record_has_no_public_page(): void
    {
        $movie = $this->movie('Locked', ['visibility' => 'public']);
        $this->publish('movie');
        RecordLock::create([
            'user_id' => $this->owner->id, 'lockable_type' => 'movie',
            'lockable_id' => $movie->id, 'password_hash' => Hash::make('secret1'),
        ]);

        $this->anonymous("/api/public/profiles/owner/movie/{$movie->id}")->assertNotFound();
        // მფლობელის სესიაშიც — საჯარო ჩაკეტილი არასდროსაა
        $this->actingAs($this->owner)->getJson("/api/public/profiles/owner/movie/{$movie->id}")->assertNotFound();
    }
}
