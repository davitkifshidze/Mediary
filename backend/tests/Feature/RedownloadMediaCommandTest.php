<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **`media:redownload` — თითო ჩანაწერი თავისი მფლობელის გასაღებით** (Tasks §30.7).
 *
 * ⚠️ §30-მდე ბრძანება საერთო (`.env`) გასაღებზე იდგა: CLI-ს `Auth::id()` არ
 * აქვს. საერთო ფენა გაქრა, ე.ი. მფლობელზე გადართვის გარეშე ბრძანება
 * **ყველაფერს ჩუმად გამოტოვებდა**. ტესტი სწორედ ამას იჭერს: ვისი გასაღებით
 * წავიდა მოთხოვნა, და რა ემართება მას, ვისაც გასაღები არ აქვს.
 */
class RedownloadMediaCommandTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;

    private User $bob;

    /** @var list<string> TMDB-ზე გაგზავნილი `api_key`-ები */
    private array $keys = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        Storage::fake('public');

        $this->alice = $this->makeUser('alice');
        $this->bob = $this->makeUser('bob');

        $this->giveCredential($this->alice, 'tmdb', ['key' => 'alice-key']);

        Http::fake([
            'image.tmdb.org/*' => Http::response('jpeg-bytes', 200, ['Content-Type' => 'image/jpeg']),
            'api.themoviedb.org/*' => function ($request) {
                parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);
                $this->keys[] = (string) ($query['api_key'] ?? '');

                return str_contains($request->url(), '/credits')
                    ? Http::response(['cast' => []])
                    : Http::response(['id' => 603, 'title' => 'The Matrix', 'poster_path' => '/p.jpg']);
            },
        ]);
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::where('key', 'movie')->pluck('id')->all());

        return $user->refresh();
    }

    public function test_each_record_is_fetched_with_its_owners_key(): void
    {
        Movie::create(['user_id' => $this->alice->id, 'tmdb_id' => 603]);
        Movie::create(['user_id' => $this->bob->id, 'tmdb_id' => 604]);

        $this->artisan('media:redownload', ['--type' => 'movie'])
            ->expectsOutputToContain('bob@example.com')
            ->assertSuccessful();

        // ⚠️ მხოლოდ ალისის გასაღები წავიდა — ბობის ჩანაწერი TMDB-მდე არ მისულა
        $this->assertNotEmpty($this->keys);
        $this->assertSame(['alice-key'], array_values(array_unique($this->keys)));

        // ⚠️ `Auth` უკან სუფთა რჩება — ბრძანება სხვა ბრძანების შიგნითაც ეშვება
        $this->assertNull(Auth::id());
    }

    /** ვისაც გასაღები არ აქვს და სხვა არაფერია — ბრძანება **ჩავარდნაა**, არა „ყველაფერი ჩამოვიდა" */
    public function test_a_run_where_nobody_has_a_key_fails(): void
    {
        Movie::create(['user_id' => $this->bob->id, 'tmdb_id' => 604]);

        $this->artisan('media:redownload', ['--user' => $this->bob->id])
            ->expectsOutputToContain('bob@example.com')
            ->assertFailed();

        $this->assertSame([], $this->keys);
    }
}
