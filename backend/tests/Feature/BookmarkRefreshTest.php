<?php

namespace Tests\Feature;

use App\Models\Bookmark;
use App\Models\Module;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **ბუკმარკის „ბმულიდან განახლება".**
 *
 * ბმულიდან წამოღებული ფოტო მხოლოდ მისამართია (`image_url`): როცა საიტი მას
 * წაშლის, ბარათი ცარიელი რჩება, შენახვის ავტოშევსება კი მხოლოდ ცარიელ ველს ავსებს.
 *
 * ⚠️ `Http::fake()` **ერთხელ**, ერთი პასუხით, რომელიც ტესტის მიმდინარე გვერდს
 * კითხულობს (`$this->page`) — მეორე `fake()` არაფერს ცვლის (პროექტის წესი).
 */
class BookmarkRefreshTest extends TestCase
{
    use RefreshDatabase;

    private const PAGE = 'http://203.0.113.10/product';

    private User $user;

    /** რას აბრუნებს გვერდი ახლა: `<head>`-ის შიგთავსი და სტატუსი */
    private string $head = '';

    private int $status = 200;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('bela');

        Http::fake(['*' => fn () => Http::response(
            "<html><head>{$this->head}</head><body></body></html>",
            $this->status,
            ['Content-Type' => 'text/html; charset=utf-8'],
        )]);
    }

    private function makeUser(string $name): User
    {
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::where('key', 'bookmark')->pluck('id')->all());

        return $user->refresh();
    }

    /** გვერდი ამ ფოტოს, სათაურსა და აღწერას აცხადებს */
    private function pageHas(?string $image, string $title = 'Fresh Title', string $description = 'Fresh description'): void
    {
        $this->status = 200;
        $this->head = "<title>{$title}</title><meta property=\"og:description\" content=\"{$description}\">"
            .($image ? "<meta property=\"og:image\" content=\"{$image}\">" : '');
    }

    private function bookmark(array $attributes = [], ?User $owner = null): Bookmark
    {
        return Bookmark::create([
            'user_id' => ($owner ?? $this->user)->id,
            'title' => 'My title',
            'url' => self::PAGE,
            'domain' => '203.0.113.10',
            ...$attributes,
        ]);
    }

    private function refresh(Bookmark $bookmark, ?User $as = null)
    {
        return $this->actingAs($as ?? $this->user)->postJson("/api/bookmarks/{$bookmark->id}/refresh");
    }

    /** მთავარი შემთხვევა: ძველი (მკვდარი) მისამართი იცვლება იმით, რასაც გვერდი ახლა იძლევა */
    public function test_a_stale_image_address_is_replaced(): void
    {
        $bookmark = $this->bookmark(['image_url' => 'http://203.0.113.10/old-and-gone.jpg', 'description' => 'Mine']);
        $this->pageHas('http://203.0.113.10/new.jpg');

        $this->refresh($bookmark)
            ->assertOk()
            ->assertJsonPath('data.image', 'http://203.0.113.10/new.jpg')
            ->assertJsonPath('meta.image_found', true)
            ->assertJsonPath('meta.image_changed', true);

        $this->assertSame('http://203.0.113.10/new.jpg', $bookmark->refresh()->image_url);
    }

    /** სათაური და აღწერა მხოლოდ მაშინ ივსება, როცა ცარიელია — ხელით შეყვანილი რჩება */
    public function test_the_title_and_description_are_filled_only_when_empty(): void
    {
        $this->pageHas('http://203.0.113.10/new.jpg');

        $kept = $this->bookmark(['title' => 'My title', 'description' => 'My words']);
        $this->refresh($kept)->assertOk()
            ->assertJsonPath('data.title', 'My title')
            ->assertJsonPath('data.description', 'My words');

        $empty = $this->bookmark(['title' => 'My title', 'description' => null]);
        $this->refresh($empty)->assertOk()
            ->assertJsonPath('data.title', 'My title')
            ->assertJsonPath('data.description', 'Fresh description');
    }

    /** ⚠️ ატვირთული მთავარი ფოტო `image_url`-ზე უპირატესია და განახლებით არ იკარგება */
    public function test_an_uploaded_main_photo_is_never_lost(): void
    {
        Storage::fake('public');
        $categoryId = $this->actingAs($this->user)->getJson('/api/bookmark-categories')->json('data.0.id');

        $id = $this->actingAs($this->user)->post('/api/bookmarks', [
            'title' => 'Shot',
            'url' => self::PAGE,
            'autofill' => 0,
            'status' => 'to_read',
            'category_id' => $categoryId,
            'thumbnail' => UploadedFile::fake()->image('shot.jpg', 40, 40),
        ])->assertStatus(201)->json('data.id');

        $bookmark = Bookmark::findOrFail($id);
        $uploaded = $bookmark->thumbnail_path;
        $this->assertNotNull($uploaded);

        $this->pageHas('http://203.0.113.10/new.jpg');
        $this->refresh($bookmark)->assertOk()->assertJsonPath('data.image', $uploaded);

        $bookmark->refresh();
        $this->assertSame($uploaded, $bookmark->thumbnail_path);
        Storage::disk('public')->assertExists($uploaded);
        // მისამართი ქვემოთ მაინც განახლდა — ატვირთულის მოხსნის შემდეგ ბარათს ცოცხალი ფოტო დახვდება
        $this->assertSame('http://203.0.113.10/new.jpg', $bookmark->image_url);
    }

    /** გვერდი გათიშულია ან ფოტოს აღარ იძლევა → ძველი მისამართი რჩება, პასუხი ამას ამბობს */
    public function test_a_page_without_an_image_keeps_the_old_address(): void
    {
        $bookmark = $this->bookmark(['image_url' => 'http://203.0.113.10/old.jpg']);

        $this->pageHas(null);
        $this->refresh($bookmark)->assertOk()
            ->assertJsonPath('data.image', 'http://203.0.113.10/old.jpg')
            ->assertJsonPath('meta.image_found', false)
            ->assertJsonPath('meta.image_changed', false);

        $this->status = 503;
        $this->refresh($bookmark)->assertOk()->assertJsonPath('meta.image_found', false);

        $this->assertSame('http://203.0.113.10/old.jpg', $bookmark->refresh()->image_url);
    }

    /** ⚠️ ქეში გვერდს არ ფარავს: ორი განახლება ზედიზედ ორ სხვადასხვა ფოტოს ხედავს */
    public function test_every_refresh_reads_the_page_again(): void
    {
        $bookmark = $this->bookmark();

        $this->pageHas('http://203.0.113.10/first.jpg');
        $this->refresh($bookmark)->assertJsonPath('data.image', 'http://203.0.113.10/first.jpg');

        $this->pageHas('http://203.0.113.10/second.jpg');
        $this->refresh($bookmark)
            ->assertJsonPath('data.image', 'http://203.0.113.10/second.jpg')
            ->assertJsonPath('meta.image_changed', true);
    }

    /** სხვისი ბუკმარკი 404-ია, „მხოლოდ ნახვის" როლი — 403: ეს ცვლილებაა და არა შექმნა */
    public function test_refreshing_needs_ownership_and_the_update_permission(): void
    {
        $this->pageHas('http://203.0.113.10/new.jpg');

        $stranger = $this->makeUser('gio');
        $this->refresh($this->bookmark(), $stranger)->assertNotFound();

        $grant = function (string $key, array $actions): User {
            $role = Role::create(['key' => $key, 'name_ka' => $key, 'name_en' => $key, 'permissions' => ['bookmark' => $actions]]);
            $user = $this->makeUser($key);
            $user->forceFill(['role_id' => $role->id])->save();

            return $user->refresh();
        };

        $viewer = $grant('viewer', ['view']);
        $this->refresh($this->bookmark(owner: $viewer), $viewer)->assertStatus(403);

        // „ვცვლი, მაგრამ არ ვქმნი" — საკმარისია
        $editor = $grant('editor', ['view', 'update']);
        $this->refresh($this->bookmark(owner: $editor), $editor)->assertOk();
    }
}
