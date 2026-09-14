<?php

namespace Tests\Feature;

use App\Models\BoardGame;
use App\Models\BoardGameGenre;
use App\Models\Module;
use App\Models\User;
use App\Services\Storage\StorageMeter;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * ბორდგეიმების მოდული (`board_game`, Tasks §14).
 *
 * ამოწმებს იმას, რაც აქ ადვილად ტყდება: მოდულის gate, per-user ლექსიკონი,
 * მოთამაშეთა რაოდენობით ფილტრი, მაღაზიის ბმულის ფასი, `bgg_id`-ის per-user
 * უნიკალურობა, წესების PDF-ის კვოტა და გალერეა `board_game_files`-ში.
 */
class BoardGameModuleTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('bora', ['board_game']);
    }

    private function makeUser(string $name, array $modules): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', $modules)->pluck('id')->all());

        return $user->refresh();
    }

    private function makeGame(array $overrides = []): int
    {
        return $this->actingAs($this->user)
            ->postJson('/api/board-games', $overrides + ['title' => 'Catan'])
            ->assertStatus(201)
            ->json('data.id');
    }

    /** მოდულის gate + §14-ის ველების ნაკრები */
    public function test_module_gate_and_field_set(): void
    {
        $outsider = $this->makeUser('nomodule', []);
        $this->actingAs($outsider)->getJson('/api/board-games')->assertStatus(403);

        $genreId = $this->actingAs($this->user)->getJson('/api/board-game-genres')->json('data.0.id');

        $this->actingAs($this->user)
            ->postJson('/api/board-games', [
                'title' => 'Gloomhaven',
                'description' => 'კამპანიური კოოპერაცია',
                'year' => 2017,
                'designer' => 'Isaac Childres',
                'publisher' => 'Cephalofair Games',
                'genre_id' => $genreId,
                'players_min' => 1,
                'players_max' => 4,
                'age_min' => 14,
                'playtime_min' => 60,
                'playtime_max' => 120,
                'complexity' => 3.87,
                'bgg_id' => 174430,
                'bgg_rating' => 8.6,
                'status' => 'owned',
                'rating' => 10,
                'links' => [
                    ['label' => 'Amazon', 'url' => 'https://amazon.com/x', 'price' => 149.99, 'currency' => 'USD'],
                ],
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.designer', 'Isaac Childres')
            ->assertJsonPath('data.players_max', 4)
            ->assertJsonPath('data.playtime_max', 120)
            ->assertJsonPath('data.complexity', 3.87)
            ->assertJsonPath('data.bgg_rating', 8.6)
            // ბმული სვეტად არ ინახება — id-დან იგება
            ->assertJsonPath('data.bgg_url', 'https://boardgamegeek.com/boardgame/174430')
            ->assertJsonPath('data.links.0.price', 149.99)
            ->assertJsonPath('data.links.0.currency', 'USD')
            // 16.5 — ხილვადობა default-ად პირადია
            ->assertJsonPath('data.visibility', 'private')
            // ეტაპი 8 — მექანიკები სრულად მოიხსნა: ველი პასუხში აღარ არსებობს
            ->assertJsonMissingPath('data.mechanics');
    }

    /** მოთამაშეთა რაოდენობით ფილტრი — დიაპაზონში მოხვედრა და არა ზუსტი დამთხვევა */
    public function test_players_filter_matches_the_range(): void
    {
        $this->makeGame(['title' => 'Solo only', 'players_min' => 1, 'players_max' => 1]);
        $this->makeGame(['title' => 'Party', 'players_min' => 4, 'players_max' => 10]);
        $this->makeGame(['title' => 'Mid', 'players_min' => 2, 'players_max' => 5]);

        $titles = $this->actingAs($this->user)->getJson('/api/board-games?players=4')
            ->assertOk()
            ->json('data.*.title');

        sort($titles);
        $this->assertSame(['Mid', 'Party'], $titles);
    }

    /**
     * **ეტაპი 8 — რამდენიმე რაოდენობა ერთდროულად, OR-ით.**
     *
     * ⚠️ „1 **ან** 10 მოთამაშეს უდგება" და არა „ორივეს ერთდროულად": AND
     * დიაპაზონურ ველზე თითქმის ყოველთვის ცარიელ პასუხს იძლეოდა.
     */
    public function test_players_filter_takes_several_counts_with_or(): void
    {
        $this->makeGame(['title' => 'Solo only', 'players_min' => 1, 'players_max' => 1]);
        $this->makeGame(['title' => 'Party', 'players_min' => 4, 'players_max' => 10]);
        $this->makeGame(['title' => 'Mid', 'players_min' => 2, 'players_max' => 5]);

        $titles = $this->actingAs($this->user)->getJson('/api/board-games?players=1,10')
            ->assertOk()
            ->json('data.*.title');

        sort($titles);
        $this->assertSame(['Party', 'Solo only'], $titles);
    }

    /**
     * ⚠️ **დიაპაზონის გარეშე ჩანაწერი ფილტრში არ ხვდება** — „უცნობია" და
     * „ნებისმიერს უდგება" ერთი არაა. აქამდე `whereNull`-ის შტო მას ყველა
     * რიცხვზე აჩვენებდა, ე.ი. შედეგი ცრუდ ფართოვდებოდა.
     */
    public function test_a_game_without_a_range_is_out_of_the_players_filter(): void
    {
        $this->makeGame(['title' => 'Unknown', 'players_min' => null, 'players_max' => null]);
        $this->makeGame(['title' => 'Mid', 'players_min' => 2, 'players_max' => 5]);

        $this->assertSame(['Mid'], $this->actingAs($this->user)
            ->getJson('/api/board-games?players=3')
            ->assertOk()
            ->json('data.*.title'));
    }

    /**
     * ⚠️ **არარიცხვი 422-ია და არა ცარიელი სია** — თორემ `?players=abc`
     * ისე გამოიყურებოდა, თითქოს ბიბლიოთეკაში არაფერია.
     */
    public function test_a_non_numeric_players_filter_is_rejected(): void
    {
        $this->actingAs($this->user)
            ->getJson('/api/board-games?players=abc')
            ->assertStatus(422);

        $this->actingAs($this->user)
            ->getJson('/api/board-games?players=99')
            ->assertStatus(422);
    }

    /** ⚠️ `bgg_id` უნიკალურია **user-ზე**: ორ ანგარიშს ერთი თამაში უნდა შეეძლოს */
    public function test_bgg_id_is_unique_per_user_only(): void
    {
        $this->makeGame(['bgg_id' => 13]);

        $this->actingAs($this->user)
            ->postJson('/api/board-games', ['title' => 'Catan again', 'bgg_id' => 13])
            ->assertStatus(422);

        $other = $this->makeUser('otto', ['board_game']);
        $this->actingAs($other)
            ->postJson('/api/board-games', ['title' => 'Catan', 'bgg_id' => 13])
            ->assertStatus(201);
    }

    /** ჟანრი **per-user** ლექსიკონია — სხვისი ჟანრის id 422-ია */
    public function test_genre_dictionary_is_per_user(): void
    {
        $other = $this->makeUser('otto', ['board_game']);
        $theirGenre = $this->actingAs($other)->getJson('/api/board-game-genres')->json('data.0.id');

        $this->actingAs($this->user)
            ->postJson('/api/board-games', ['title' => 'X', 'genre_id' => $theirGenre])
            ->assertStatus(422);

        // დეფაულტები ლენივია: პირველი `index` მათ ქმნის
        $this->actingAs($this->user)->getJson('/api/board-game-genres')->assertOk();
        $mine = BoardGameGenre::withoutGlobalScope('owner')->where('user_id', $this->user->id)->get();
        $id = $this->makeGame(['genre_id' => $mine[0]->id]);

        $this->actingAs($this->user)
            ->deleteJson("/api/board-game-genres/{$mine[0]->id}", ['move_to' => $mine[1]->id])
            ->assertOk()
            ->assertJsonPath('moved', 1);

        $this->assertSame(
            $mine[1]->id,
            BoardGame::withoutGlobalScope('owner')->find($id)->genre_id,
        );
    }

    /**
     * წესების PDF და გალერეის ფოტო ერთ ცხრილშია, ორივე კვოტაზე გადის და
     * ჩანაწერთან ერთად იშლება (SQL cascade მოდელის ივენთს არ აგდებს).
     */
    public function test_rules_and_gallery_files_share_one_table_and_the_quota(): void
    {
        Storage::fake('public');
        $meter = app(StorageMeter::class);

        $id = $this->makeGame();

        $rules = $this->actingAs($this->user)
            ->postJson("/api/board-games/{$id}/files", [
                'kind' => 'rules',
                'files' => [UploadedFile::fake()->create('rules.pdf', 300, 'application/pdf')],
            ])
            ->assertStatus(201)
            ->json('data.0.url');

        $photo = $this->actingAs($this->user)
            ->postJson("/api/board-games/{$id}/files", [
                'kind' => 'image',
                'files' => [UploadedFile::fake()->image('table.jpg')],
            ])
            ->assertStatus(201)
            ->json('data.0.url');

        // საქაღალდე მოდულისაა (2026-09-04)
        $this->assertStringStartsWith('boardgames/files/rules/', $rules);
        $this->assertStringStartsWith('boardgames/files/images/', $photo);

        // გალერეა იმავე ცხრილიდან იფილტრება
        $this->actingAs($this->user)->getJson("/api/board-games/{$id}/files?kind=image")
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $used = (int) $this->user->refresh()->storage_used_bytes;
        $this->assertGreaterThan(0, $used);
        $this->actingAs($this->user)->getJson('/api/storage')
            ->assertOk()
            ->assertJsonPath('modules.board_game', $used);

        $this->actingAs($this->user)->deleteJson("/api/board-games/{$id}")->assertNoContent();

        Storage::disk('public')->assertMissing($rules);
        Storage::disk('public')->assertMissing($photo);
        $this->assertSame(0, (int) $this->user->refresh()->storage_used_bytes);
        $this->assertSame(0, $meter->recalculate($this->user->refresh()));
    }

    /** სტატუსი ცალკე endpoint-ია და მხოლოდ ცნობილ მნიშვნელობებს იღებს */
    public function test_status_endpoint_is_bounded(): void
    {
        $id = $this->makeGame();

        $this->actingAs($this->user)
            ->patchJson("/api/board-games/{$id}/status", ['status' => 'sold'])
            ->assertOk()
            ->assertJsonPath('data.status', 'sold');

        $this->actingAs($this->user)
            ->patchJson("/api/board-games/{$id}/status", ['status' => 'lost'])
            ->assertStatus(422);
    }

    /** სხვისი ჩანაწერი 404-ია (`BelongsToUser`-ის global scope) */
    public function test_another_users_game_is_not_found(): void
    {
        $other = $this->makeUser('otto', ['board_game']);
        $id = $this->makeGame();

        $this->actingAs($other)->getJson("/api/board-games/{$id}")->assertStatus(404);
        $this->actingAs($other)->deleteJson("/api/board-games/{$id}")->assertStatus(404);
    }

    /* ---------- ქართული მაღაზიები (§7.2) ---------- */

    /**
     * ორივე მაღაზიის ნამდვილი მარკაპი (`tests/Fixtures/*.html`, აღებული
     * 2026-09-11) — სახელი, ბმული, ფასი, ფასდაკლება და ვალუტა.
     *
     * ⚠️ **ფასდაკლება ორივე მაღაზიაზე სხვა კლასებშია** (corners: `<del>`/`<ins>`,
     * puzz: `.price-old`/`.price-new`) და სწორედ ეს ტყდება მარკაპის ცვლილებაზე.
     */
    public function test_georgian_shop_search_reads_titles_and_prices(): void
    {
        Http::fake([
            'corners.ge*' => Http::response(file_get_contents(base_path('tests/Fixtures/corners-search.html'))),
            'puzz.ge*' => Http::response(file_get_contents(base_path('tests/Fixtures/puzz-search.html'))),
        ]);

        $res = $this->actingAs($this->user)
            ->getJson('/api/board-games/shops?query=catan')
            ->assertOk();

        $offers = $res->json('offers');
        $this->assertNotEmpty($offers);

        // ორივე მაღაზია გაიხსნა და ორივემ იპოვა
        foreach ($res->json('sources') as $source) {
            $this->assertTrue($source['ok'], "{$source['key']} არ გაიხსნა");
            $this->assertGreaterThan(0, $source['count'], "{$source['key']}-მა ვერაფერი იპოვა");
        }

        foreach (['corners', 'puzz'] as $shop) {
            $shopOffers = array_values(array_filter($offers, fn ($o) => $o['shop'] === $shop));
            $this->assertNotEmpty($shopOffers);

            foreach ($shopOffers as $offer) {
                $this->assertNotEmpty($offer['title']);
                $this->assertStringStartsWith('http', $offer['url']);
            }

            // ფასი მაინც ერთ ერთეულზე ამოიკითხა და ლარშია
            $priced = array_values(array_filter($shopOffers, fn ($o) => $o['price'] !== null));
            $this->assertNotEmpty($priced, "{$shop}: ფასი ვერსად ამოვიკითხე");
            $this->assertSame('GEL', $priced[0]['currency']);

            // ფასდაკლებულ ერთეულზე ძველი ფასი ახალზე მაღალია
            $sale = array_values(array_filter($shopOffers, fn ($o) => $o['old_price'] !== null));
            $this->assertNotEmpty($sale, "{$shop}: ფასდაკლება ვერ ამოვიკითხე");
            $this->assertGreaterThan($sale[0]['price'], $sale[0]['old_price']);
        }
    }

    /**
     * ⚠️ **მაღაზიის ჩავარდნა 200-ია და არა 5xx** — სქრეიპინგია და მარკაპის
     * ცვლილება/Cloudflare ჩანაწერის დამატებას ვერ შეაჩერებს. „ვერ გაიხსნა"
     * (`ok: false`) და „ვერაფერი ვიპოვა" (`ok: true, count: 0`) კი ცალ-ცალკეა.
     */
    public function test_unreachable_shop_is_reported_not_thrown(): void
    {
        Http::fake([
            'corners.ge*' => Http::response('nope', 403),
            'puzz.ge*' => Http::response('<html><body><p>no results</p></body></html>'),
        ]);

        $res = $this->actingAs($this->user)
            ->getJson('/api/board-games/shops?query=catan')
            ->assertOk()
            ->assertJsonPath('offers', []);

        $sources = collect($res->json('sources'))->keyBy('key');

        $this->assertFalse($sources['corners']['ok']);
        $this->assertTrue($sources['puzz']['ok']);
        $this->assertSame(0, $sources['puzz']['count']);
    }

    /** მხოლოდ არჩეული მაღაზია იძებნება — ზედმეტი რექვესთი არ გადის */
    public function test_shop_filter_limits_the_requests(): void
    {
        Http::fake([
            'puzz.ge*' => Http::response(file_get_contents(base_path('tests/Fixtures/puzz-search.html'))),
        ]);

        $res = $this->actingAs($this->user)
            ->getJson('/api/board-games/shops?query=catan&shops=puzz')
            ->assertOk();

        $this->assertSame(['puzz'], array_column($res->json('sources'), 'key'));
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'corners.ge'));
    }
}
