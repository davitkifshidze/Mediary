<?php

namespace Tests\Feature;

use App\Models\Bookmark;
use App\Models\Module;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **ბუკმარკის დამატებითი ბმულები** (Tasks §36.3, §36.6).
 *
 * შენი სიტყვები: „თუ შოპინგია ან რამე ისეთი, კონკრეტული ლინკის დამატებაც
 * იყოს დამატებით".
 *
 * ⚠️ მოწმდება: ფორმა (`Bookmark::normalizeLinks()` — წარწერა, ტიპი, ფასი მხოლოდ
 * მაღაზიასა და ფასზე), ჭერი (≤ 20), `url`-ის ვალიდაცია, რიგის შენარჩუნება
 * multipart-ში, ცარიელი სიით გასუფთავება და ექსპორტი (JSON-ში მასივი, CSV-ში JSON).
 */
class BookmarkLinksTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = User::create([
            'name' => 'lina',
            'username' => 'lina',
            'email' => 'lina@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::whereIn('key', ['bookmark'])->pluck('id')->all());
        $this->user->refresh();
        $this->actingAs($this->user);
    }

    /** ⚠️ სტატუსი და კატეგორია სავალდებულოა — ბუკმარკი მათ გარეშე ვერ იქმნება */
    private function payload(array $extra = []): array
    {
        return [
            'title' => 'MX Master 3S',
            'url' => 'https://www.logitech.com/mx-master-3s',
            'autofill' => 0,
            'status' => 'to_read',
            'category_id' => $this->getJson('/api/bookmark-categories')->json('data.0.id'),
            ...$extra,
        ];
    }

    public function test_links_are_saved_in_one_normalised_shape(): void
    {
        $this->postJson('/api/bookmarks', $this->payload([
            'links' => [
                ['label' => '  Amazon ', 'url' => 'https://www.amazon.com/dp/1', 'kind' => 'shop', 'price' => ' $99 ', 'favicon_url' => 'https://www.amazon.com/favicon.ico'],
                // ⚠️ მიმოხილვის „ფასი" აზრს მოკლებულია — სერვერი ჭრის
                ['label' => '', 'url' => 'https://www.rtings.com/mouse', 'kind' => 'review', 'price' => '10'],
                // ტიპის გარეშე — „სხვა"
                ['url' => 'https://example.com/manual.pdf'],
            ],
        ]))
            ->assertStatus(201)
            ->assertJsonPath('data.links', [
                ['label' => 'Amazon', 'url' => 'https://www.amazon.com/dp/1', 'kind' => 'shop', 'price' => '$99', 'favicon_url' => 'https://www.amazon.com/favicon.ico'],
                ['label' => null, 'url' => 'https://www.rtings.com/mouse', 'kind' => 'review', 'price' => null, 'favicon_url' => null],
                ['label' => null, 'url' => 'https://example.com/manual.pdf', 'kind' => 'other', 'price' => null, 'favicon_url' => null],
            ]);
    }

    public function test_at_most_twenty_links(): void
    {
        $links = array_map(fn (int $i) => ['url' => "https://shop.example/{$i}", 'kind' => 'shop'], range(1, 21));

        $this->postJson('/api/bookmarks', $this->payload(['links' => $links]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('links');

        $this->postJson('/api/bookmarks', $this->payload(['links' => array_slice($links, 0, 20)]))
            ->assertStatus(201)
            ->assertJsonCount(20, 'data.links');
    }

    public function test_a_link_needs_a_real_url_and_a_known_kind(): void
    {
        $this->postJson('/api/bookmarks', $this->payload(['links' => [['url' => 'not a link']]]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('links.0.url');

        $this->postJson('/api/bookmarks', $this->payload(['links' => [['url' => 'https://a.example', 'kind' => 'coupon']]]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('links.0.kind');

        $this->postJson('/api/bookmarks', $this->payload(['links' => [['url' => 'https://a.example/'.str_repeat('x', 1000)]]]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('links.0.url');

        // ⚠️ ბმული `<a href>`-ად იხატება — მხოლოდ `http(s)`
        $this->postJson('/api/bookmarks', $this->payload(['links' => [['url' => 'javascript:alert(1)']]]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('links.0.url');
    }

    /** ხატულა კოსმეტიკაა: უვარგისი ჩუმად ქრება და ბუკმარკის შენახვას არ აჩერებს */
    public function test_a_bad_favicon_is_dropped_and_does_not_block_saving(): void
    {
        $this->postJson('/api/bookmarks', $this->payload([
            'links' => [
                ['url' => 'https://a.example', 'favicon_url' => 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'],
                ['url' => 'https://b.example', 'favicon_url' => 'https://b.example/'.str_repeat('i', 600).'.png'],
                ['url' => 'https://c.example', 'favicon_url' => 'https://c.example/favicon.ico'],
            ],
        ]))
            ->assertStatus(201)
            ->assertJsonPath('data.links.0.favicon_url', null)
            ->assertJsonPath('data.links.1.favicon_url', null)
            ->assertJsonPath('data.links.2.favicon_url', 'https://c.example/favicon.ico');
    }

    /**
     * ⚠️ **რიგი multipart-შიც რჩება** (თამაშის §22.3-ის გაკვეთილი): `validate()`
     * wildcard-ის მასივს წესების რიგით აგებს, ე.ი. წარწერიანი და უწარწეროდ
     * რიგები სხვადასხვა რიგით მოდის და `ksort`-ის გარეშე აირეოდა.
     */
    public function test_the_order_survives_a_multipart_update(): void
    {
        $id = $this->postJson('/api/bookmarks', $this->payload())->json('data.id');

        $this->post("/api/bookmarks/{$id}", [
            '_method' => 'PATCH',
            'links' => [
                ['url' => 'https://first.example', 'label' => '', 'kind' => 'other'],
                ['url' => 'https://second.example', 'label' => 'Second', 'kind' => 'docs'],
                ['url' => 'https://third.example', 'label' => '', 'kind' => 'video'],
            ],
        ], ['Accept' => 'application/json'])->assertOk();

        $this->assertSame(
            ['https://first.example', 'https://second.example', 'https://third.example'],
            array_column(Bookmark::findOrFail($id)->links, 'url'),
        );
    }

    /** JSON `PATCH` მხოლოდ `links`-ით (§36.5 — „ბმულის დამატება" ფორმის გარეშე) სხვა ველებს არ ეხება */
    public function test_a_links_only_patch_keeps_everything_else_and_an_empty_list_clears(): void
    {
        $id = $this->postJson('/api/bookmarks', $this->payload([
            'tags' => ['mouse'],
            'links' => [['url' => 'https://shop.example/1', 'kind' => 'shop']],
        ]))->json('data.id');

        $this->patchJson("/api/bookmarks/{$id}", ['links' => [
            ['url' => 'https://shop.example/1', 'kind' => 'shop'],
            ['url' => 'https://price.example/1', 'kind' => 'price', 'price' => '89 ₾'],
        ]])
            ->assertOk()
            ->assertJsonPath('data.title', 'MX Master 3S')
            ->assertJsonPath('data.tags', ['mouse'])
            ->assertJsonPath('data.links.1.price', '89 ₾');

        $this->patchJson("/api/bookmarks/{$id}", ['links' => []])
            ->assertOk()
            ->assertJsonPath('data.links', []);
    }

    /** ⚠️ ექსპორტი (`ExportDomain`): JSON-ში მასივია, CSV-ში — JSON-ის სტრიქონი და არა „Array" */
    public function test_links_reach_the_export_in_both_formats(): void
    {
        $this->postJson('/api/bookmarks', $this->payload([
            'links' => [['label' => 'Amazon', 'url' => 'https://www.amazon.com/dp/1', 'kind' => 'shop', 'price' => '$99']],
        ]))->assertStatus(201);

        $json = json_decode($this->get('/api/export/bookmark?format=json')->assertOk()->streamedContent(), true);
        $this->assertSame('https://www.amazon.com/dp/1', $json['records'][0]['links'][0]['url']);
        $this->assertSame('$99', $json['records'][0]['links'][0]['price']);

        $csv = $this->get('/api/export/bookmark?format=csv')->assertOk()->streamedContent();
        $this->assertStringContainsString('links', explode("\n", $csv)[0]);
        $this->assertStringContainsString('https://www.amazon.com/dp/1', $csv);
        $this->assertStringNotContainsString('Array', $csv);
    }
}
