<?php

namespace Tests\Feature;

use App\Models\BoardGame;
use App\Models\Game;
use App\Models\Module;
use App\Models\User;
use App\Support\SourceImage;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **გარე წყაროს ყდა: მისამართი მოთხოვნიდან მოდის, ე.ი. სანდო არ არის.**
 *
 * ⚠️ ფორმა ძებნის შედეგის ბმულს უკან აგზავნის (`rawg_cover_url`,
 * `bgg_image_url`) და სერვერი მას ხსნიდა ყოველგვარი შემოწმების გარეშე:
 * ნებისმიერ ჰოსტს (შიდა ქსელსაც), ნებისმიერ შიგთავსს, და შედეგს საერთო
 * ფაილში წერდა, რომელსაც სხვა ანგარიშის იგივე თამაშიც იყენებს.
 */
class SourceCoverTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        Storage::fake('public');
        Storage::fake('private');

        $this->user = $this->makeUser('gamer');
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', ['game', 'board_game'])->pluck('id')->all());

        return $user->refresh();
    }

    /** ნამდვილი JPEG, `SourceImage::MIN_BYTES`-ზე დიდი; `$shade` ორ სხვადასხვა ფაილს იძლევა */
    private function jpeg(int $shade = 40): string
    {
        $image = imagecreatetruecolor(96, 96);

        for ($x = 0; $x < 96; $x++) {
            for ($y = 0; $y < 96; $y++) {
                imagesetpixel($image, $x, $y, imagecolorallocate($image, ($x * 7 + $shade) % 256, ($y * 5) % 256, ($x * $y) % 256));
            }
        }

        ob_start();
        imagejpeg($image, null, 95);

        return (string) ob_get_clean();
    }

    private function game(User $user, array $attributes): Game
    {
        $genre = $this->actingAs($user)->getJson('/api/game-genres')->json('data.0.id');

        $id = $this->actingAs($user)
            ->postJson('/api/games', $attributes + ['title_en' => 'Hades', 'status' => 'to_play', 'genre_ids' => [$genre]])
            ->assertStatus(201)
            ->json('data.id');

        return Game::withoutGlobalScopes()->findOrFail($id);
    }

    public function test_a_cover_is_fetched_only_from_the_sources_own_cdn(): void
    {
        Http::fake(['*' => Http::response($this->jpeg(), 200, ['Content-Type' => 'image/jpeg'])]);

        $refused = [
            'https://evil.example/cover.jpg',
            'https://127.0.0.1/cover.jpg',
            'https://media.rawg.io.evil.example/cover.jpg',
            // სქემა: წყაროს CDN https-ია
            'http://media.rawg.io/media/games/a.jpg',
            'https://user@media.rawg.io/media/games/a.jpg',
        ];

        foreach ($refused as $i => $url) {
            $game = $this->game($this->user, ['rawg_id' => 100 + $i, 'rawg_cover_url' => $url]);
            $this->assertNull($game->cover_path, $url);
        }

        Http::assertNothingSent();
        $this->assertSame([], Storage::disk('public')->allFiles());

        $this->assertTrue(SourceImage::trusted('rawg', 'https://media.rawg.io/media/games/a.jpg'));
        $this->assertTrue(SourceImage::trusted('igdb', 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg'));
        $this->assertTrue(SourceImage::trusted('bgg', 'https://cf.geekdo-images.com/abc/pic1.jpg'));
        $this->assertFalse(SourceImage::trusted('bgg', 'https://media.rawg.io/media/games/a.jpg'));
    }

    /** საერთო ფაილი ერთხელ იწერება: მეორე ანგარიშის მოთხოვნა მას ვერ გადაწერს და ქსელშიც არ გადის */
    public function test_a_shared_cover_is_written_once(): void
    {
        $first = $this->jpeg(40);
        $second = $this->jpeg(200);

        Http::fake(fn (ClientRequest $request) => Http::response(
            str_contains($request->url(), 'second') ? $second : $first,
            200,
            ['Content-Type' => 'image/jpeg'],
        ));

        $mine = $this->game($this->user, ['rawg_id' => 3498, 'rawg_cover_url' => 'https://media.rawg.io/media/games/first.jpg']);
        $this->assertSame('games/covers/rawg-3498.jpg', $mine->cover_path);
        $this->assertSame('rawg', $mine->cover_source);
        $this->assertSame($first, Storage::disk('public')->get('games/covers/rawg-3498.jpg'));

        $theirs = $this->game($this->makeUser('other'), ['rawg_id' => 3498, 'rawg_cover_url' => 'https://media.rawg.io/media/games/second.jpg']);
        $this->assertSame('games/covers/rawg-3498.jpg', $theirs->cover_path);
        $this->assertSame($first, Storage::disk('public')->get('games/covers/rawg-3498.jpg'));

        Http::assertSentCount(1);
        // საერთო ფაილი არავის კვოტაში არ ითვლება
        $this->assertSame(0, (int) $this->user->fresh()->storage_used_bytes);
    }

    /** `image/jpeg`-ად გამოცხადებული HTML ყდა არ არის — ტიპს ბაიტები წყვეტს */
    public function test_a_response_that_is_not_an_image_is_not_stored(): void
    {
        Http::fake(['*' => Http::response('<html><script>alert(1)</script>'.str_repeat('x', 4000).'</html>', 200, ['Content-Type' => 'image/jpeg'])]);

        $game = $this->game($this->user, ['rawg_id' => 7, 'rawg_cover_url' => 'https://media.rawg.io/media/games/a.jpg']);

        $this->assertNull($game->cover_path);
        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    public function test_a_board_game_photo_follows_the_same_rules(): void
    {
        Http::fake(['*' => Http::response($this->jpeg(), 200, ['Content-Type' => 'image/jpeg'])]);

        $genre = $this->actingAs($this->user)->getJson('/api/board-game-genres')->json('data.0.id');
        $create = fn (array $attributes) => BoardGame::withoutGlobalScopes()->findOrFail(
            $this->actingAs($this->user)
                ->postJson('/api/board-games', $attributes + ['title' => 'Catan', 'genre_id' => $genre])
                ->assertStatus(201)
                ->json('data.id'),
        );

        $refused = $create(['bgg_id' => 1, 'bgg_image_url' => 'http://192.168.1.1/admin.jpg']);
        $this->assertNull($refused->image_path);
        Http::assertNothingSent();

        $stored = $create(['bgg_id' => 13, 'bgg_image_url' => 'https://cf.geekdo-images.com/abc/pic13.jpg']);
        $this->assertSame('boardgames/images/bgg-13.jpg', $stored->image_path);
        $this->assertSame('bgg', $stored->image_source);
        Storage::disk('public')->assertExists('boardgames/images/bgg-13.jpg');
        Http::assertSentCount(1);
    }
}
