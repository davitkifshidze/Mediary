<?php

namespace Tests\Feature;

use App\Models\Bookmark;
use App\Models\Module;
use App\Models\User;
use App\Support\RichText;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * **ფორმატიანი ტექსტი — Markdown ტექსტად (Tasks §47).**
 *
 * სერვერის სამი პასუხისმგებლობა: **ერთი ზღვარი** ყველა აღწერაზე (5 000 და
 * 10 000 აღარ არის, ფილმის აღწერას კი ზღვარი საერთოდ არ ჰქონდა), **ძებნა
 * ფორმატის გარეშე** (სიტყვებს შორის `**` ფრაზას აღარ არღვევს) და **CSV —
 * უბრალო ტექსტი**, JSON-ში კი Markdown რჩება.
 */
class RichTextTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = User::create([
            'name' => 'writer',
            'username' => 'writer',
            'email' => 'writer@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::pluck('id')->all());
        $this->user = $this->user->refresh();
    }

    private function note(string $title, string $description): void
    {
        $category = $this->actingAs($this->user)->getJson('/api/note-categories')->json('data.0.id');

        $this->actingAs($this->user)
            ->postJson('/api/notes', ['title' => $title, 'description' => $description, 'status' => 'open', 'category_id' => $category])
            ->assertStatus(201);
    }

    /** @return array<string, array{string, string}> */
    public static function descriptions(): array
    {
        return [
            'movie' => ['/api/movies', 'description_ka'],
            'series' => ['/api/series', 'description_en'],
            'anime' => ['/api/anime', 'description_ka'],
            'video' => ['/api/videos', 'description'],
            'bookmark' => ['/api/bookmarks', 'description'],
            'course' => ['/api/courses', 'description'],
            'place' => ['/api/places', 'description'],
            'note' => ['/api/notes', 'description'],
            'book' => ['/api/books', 'description_ka'],
            'game' => ['/api/games', 'description_en'],
            'board_game' => ['/api/board-games', 'description'],
        ];
    }

    /**
     * ⚠️ დანარჩენი ველები განზრახ აკლია — პასუხი 422-ია, მაგრამ შეცდომების
     * სიაში აღწერა **ზღვრამდე არ ჩანს** და ზღვარს მიღმა ჩანს.
     */
    #[DataProvider('descriptions')]
    public function test_every_description_shares_one_limit(string $endpoint, string $field): void
    {
        $this->actingAs($this->user)
            ->postJson($endpoint, [$field => str_repeat('ა', RichText::MAX)])
            ->assertStatus(422)
            ->assertJsonMissingValidationErrors([$field]);

        $this->actingAs($this->user)
            ->postJson($endpoint, [$field => str_repeat('ა', RichText::MAX + 1)])
            ->assertStatus(422)
            ->assertJsonValidationErrors([$field]);
    }

    public function test_search_finds_words_across_formatting(): void
    {
        $this->note('სია', "**ყიდვა** რძე და _პური_\n- ხორცი");
        $this->note('სხვა', 'არაფერი');

        $titles = fn (string $q) => collect(
            $this->actingAs($this->user)->getJson('/api/notes?q='.urlencode($q))->assertOk()->json('data'),
        )->pluck('title')->all();

        $this->assertSame(['სია'], $titles('ყიდვა რძე'));
        // სიტყვების რიგი არ აქვს მნიშვნელობა, ყველა კი უნდა იყოს
        $this->assertSame(['სია'], $titles('პური ყიდვა'));
        $this->assertSame([], $titles('ყიდვა ხაჭო'));
    }

    public function test_csv_export_is_plain_text_and_json_keeps_markdown(): void
    {
        $markdown = "**Fast** mouse — [shop](https://shop.ge/m_1)\n\n* wireless";
        Bookmark::create([
            'user_id' => $this->user->id,
            'title' => 'Mouse',
            'url' => 'https://example.com/m',
            'domain' => 'example.com',
            'description' => $markdown,
        ]);

        $csv = $this->actingAs($this->user)->get('/api/export/bookmark?format=csv')->assertOk()->streamedContent();
        $this->assertStringContainsString('Fast mouse — shop (https://shop.ge/m_1)', $csv);
        $this->assertStringContainsString('- wireless', $csv);
        $this->assertStringNotContainsString('**', $csv);

        $json = $this->actingAs($this->user)->get('/api/export/bookmark?format=json')->assertOk()->streamedContent();
        $this->assertSame($markdown, json_decode($json, true)['records'][0]['description']);
    }

    public function test_plain_text_drops_formatting_and_keeps_the_words(): void
    {
        $this->assertSame('Bold and soft', RichText::plain('**Bold** and *soft*'));
        $this->assertSame("Title\n- one\n- two", RichText::plain("## Title\n* one\n+ two"));
        $this->assertSame('docs (https://x.dev) https://y.dev', RichText::plain('[docs](https://x.dev) [https://y.dev](https://y.dev)'));
        $this->assertSame("quoted\n\ncode", RichText::plain("> quoted\n\n```\ncode\n```"));
        $this->assertSame('snake_case & 2*3', RichText::plain('snake_case &amp; 2\*3'));
        // ძველი უბრალო ტექსტი უცვლელია
        $this->assertSame("line one\nline two", RichText::plain("line one\nline two"));
        $this->assertSame('', RichText::plain(null));
        $this->assertSame(['a', 'b'], RichText::words('  a  b a '));
    }
}
