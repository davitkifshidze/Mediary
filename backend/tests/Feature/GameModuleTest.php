<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\GameFile;
use App\Models\GameGenre;
use App\Models\GameNote;
use App\Models\GameVideo;
use App\Models\Module;
use App\Models\User;
use App\Services\Storage\StorageMeter;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * თამაშების მოდული (`game`, Tasks §11; ველების სია დამტკიცდა 19.1-ში).
 *
 * ამოწმებს იმას, რაც აქ ადვილად ტყდება: მოდულის gate, **მრავალჟანრიანობა**
 * (pivot და არა სვეტი), `year`-ის აქსესორი, „ჩემი პლატფორმის" ავტომატური
 * მიმატება სიაში, `rawg_id`-ის per-user უნიკალურობა, walkthrough-ის
 * embed-ის აგება allowlist-ით და კვოტა ატვირთვებზე.
 */
class GameModuleTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('gamer', ['game']);
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

    private function genreIds(int $count = 2): array
    {
        $data = $this->actingAs($this->user)->getJson('/api/game-genres')->json('data');

        return array_column(array_slice($data, 0, $count), 'id');
    }

    /**
     * ⚠️ სტატუსი და ჟანრი სავალდებულოა — ჟანრი აქ pivot-ია, ე.ი. მინიმუმ ერთი.
     */
    private function gameDefaults(?User $user = null): array
    {
        $user ??= $this->user;

        return [
            'status' => 'undecided',
            'genre_ids' => [$this->actingAs($user)->getJson('/api/game-genres')->json('data.0.id')],
        ];
    }

    private function makeGame(array $overrides = []): int
    {
        return $this->actingAs($this->user)
            ->postJson('/api/games', $overrides + $this->gameDefaults() + ['title_en' => 'Hades'])
            ->assertStatus(201)
            ->json('data.id');
    }

    /** მოდულის gate + 11.1-ის ველების ნაკრები */
    public function test_module_gate_and_field_set(): void
    {
        $outsider = $this->makeUser('nomodule', []);
        $this->actingAs($outsider)->getJson('/api/games')->assertStatus(403);

        $genres = $this->genreIds(2);

        $response = $this->actingAs($this->user)
            ->postJson('/api/games', [
                'title_ka' => 'ელდენ რინგი',
                'title_en' => 'Elden Ring',
                'description_en' => 'Open world action RPG',
                'release_date' => '2022-02-25',
                'developer' => 'FromSoftware',
                'publisher' => 'Bandai Namco',
                'franchise' => 'Souls',
                'platforms' => ['pc', 'ps5'],
                'my_platform' => 'pc',
                'modes' => ['single', 'coop_online'],
                'genre_ids' => $genres,
                // ⚠️ წუთები და არა საათები (§2.5): 55 სთ 30 წთ
                'hltb_main' => 3330,
                'hltb_complete' => 7980,
                'metacritic' => 96,
                'users_score' => 4.4,
                'rating' => 10,
                'age_rating' => 'ESRB Mature',
                'languages' => ['interface' => ['EN', 'KA'], 'audio' => ['EN']],
                'size_gb' => 60.5,
                'dlcs' => [['name' => 'Shadow of the Erdtree', 'note' => 'DLC']],
                'links' => [['label' => 'Steam', 'url' => 'https://store.steampowered.com/app/1245620', 'kind' => 'steam']],
                'status' => 'finished',
            ])
            ->assertStatus(201);

        $response
            ->assertJsonPath('data.title_ka', 'ელდენ რინგი')
            // ⚠️ `year` სვეტი არაა — `release_date`-ის აქსესორია
            ->assertJsonPath('data.year', 2022)
            ->assertJsonPath('data.hltb_main', 3330)
            ->assertJsonPath('data.metacritic', 96)
            ->assertJsonPath('data.size_gb', 60.5)
            ->assertJsonPath('data.dlcs.0.name', 'Shadow of the Erdtree')
            ->assertJsonPath('data.links.0.kind', 'steam')
            ->assertJsonPath('data.status', 'finished')
            // 16.5 — ხილვადობა default-ად პრივატულია
            ->assertJsonPath('data.visibility', 'private');

        // ჟანრები pivot-შია და **ორივე** შენახულია
        $this->assertEqualsCanonicalizing($genres, $response->json('data.genre_ids'));
    }

    /**
     * ⚠️ თამაში **მრავალჟანრიანია** — ეს არის ერთადერთი განსხვავება წიგნისა და
     * ბორდგეიმისგან, სადაც ერთი `genre_id`-ა. ფილტრიც pivot-ზე უნდა მუშაობდეს.
     */
    public function test_multiple_genres_and_filtering(): void
    {
        [$action, $adventure] = $this->genreIds(2);

        $both = $this->makeGame(['title_en' => 'Zelda', 'genre_ids' => [$action, $adventure]]);
        $this->makeGame(['title_en' => 'Tetris', 'genre_ids' => [$adventure]]);

        // ერთი ჟანრი — ორივე თამაში
        $this->actingAs($this->user)
            ->getJson("/api/games?genre_id={$adventure}")
            ->assertOk()
            ->assertJsonCount(2, 'data');

        // ორი ჟანრი მძიმით = **AND** (5.2-ის წესი), ე.ი. მხოლოდ ერთი
        $list = $this->actingAs($this->user)
            ->getJson("/api/games?genre_id={$action},{$adventure}")
            ->assertOk()
            ->json('data');

        $this->assertSame([$both], array_column($list, 'id'));
    }

    /**
     * ჟანრის წაშლა pivot-ზე — თამაშები **არ იკარგება** და დანარჩენი ჟანრებიც
     * რჩება (`syncWithoutDetaching`, და არა სვეტის გადაწერა).
     */
    public function test_deleting_a_genre_keeps_the_other_genres(): void
    {
        [$action, $adventure] = $this->genreIds(2);
        $id = $this->makeGame(['genre_ids' => [$action, $adventure]]);

        $this->actingAs($this->user)
            ->deleteJson("/api/game-genres/{$action}", ['move_to' => $adventure])
            ->assertOk()
            ->assertJsonPath('moved', 1);

        $left = $this->actingAs($this->user)->getJson("/api/games/{$id}")->json('data.genre_ids');

        $this->assertSame([$adventure], $left);
        $this->assertSame(1, Game::withoutGlobalScope('owner')->count());
    }

    /**
     * §5.1 — ფრენჩაიზის მოდალის ორი წყარო: სია და **ზუსტი** ფილტრი.
     *
     * ⚠️ ფილტრი `like` **არ არის** განზრახ — „Mass Effect" და
     * „Mass Effect: Andromeda" ორი სხვადასხვა ნაკრებია.
     */
    public function test_franchise_list_and_exact_filter(): void
    {
        $this->makeGame(['title_en' => 'Mass Effect', 'franchise' => 'Mass Effect']);
        $this->makeGame(['title_en' => 'Mass Effect 2', 'franchise' => 'Mass Effect']);
        $this->makeGame(['title_en' => 'Andromeda', 'franchise' => 'Mass Effect: Andromeda']);
        $this->makeGame(['title_en' => 'Hades']); // უფრენჩაიზო — სიაში არ უნდა იყოს

        $list = $this->actingAs($this->user)->getJson('/api/games/franchises')->assertOk()->json('data');

        $this->assertSame(
            [['name' => 'Mass Effect', 'games_count' => 2], ['name' => 'Mass Effect: Andromeda', 'games_count' => 1]],
            $list,
        );

        $filtered = $this->actingAs($this->user)
            ->getJson('/api/games?franchise='.urlencode('Mass Effect'))
            ->assertOk()
            ->json('data');

        $this->assertCount(2, $filtered);
        $this->assertEqualsCanonicalizing(
            ['Mass Effect', 'Mass Effect 2'],
            array_column($filtered, 'title_en'),
        );
    }

    /** ფრენჩაიზების სია სხვისას არ ითვლის (`owner` scope) */
    public function test_franchise_list_is_per_user(): void
    {
        $this->makeGame(['franchise' => 'Halo']);

        $other = $this->makeUser('other', ['game']);

        $this->assertSame([], $this->actingAs($other)->getJson('/api/games/franchises')->json('data'));
    }

    /** „ჩემი პლატფორმა" სიაშიც უნდა იყოს, თორემ ბარათი შეუსაბამობას აჩვენებდა */
    public function test_my_platform_is_added_to_the_platform_list(): void
    {
        $id = $this->makeGame(['platforms' => ['pc'], 'my_platform' => 'switch']);

        $platforms = $this->actingAs($this->user)->getJson("/api/games/{$id}")->json('data.platforms');

        $this->assertEqualsCanonicalizing(['pc', 'switch'], $platforms);
    }

    /** `rawg_id` **user-ზეა** უნიკალური — ორ ანგარიშს ერთი თამაში უნდა შეეძლოს */
    public function test_rawg_id_is_unique_per_user(): void
    {
        $this->makeGame(['rawg_id' => 3498]);

        $this->actingAs($this->user)
            ->postJson('/api/games', ['title_en' => 'Duplicate', 'rawg_id' => 3498])
            ->assertStatus(422);

        $other = $this->makeUser('other', ['game']);
        $this->actingAs($other)
            ->postJson('/api/games', ['title_en' => 'GTA V', 'rawg_id' => 3498] + $this->gameDefaults($other))
            ->assertStatus(201);
    }

    /** `igdb_id`-საც იგივე per-user წესი აქვს (`DECISIONS.md` §7) */
    public function test_igdb_id_is_unique_per_user(): void
    {
        $this->makeGame(['igdb_id' => 1942]);

        $this->actingAs($this->user)
            ->postJson('/api/games', ['title_en' => 'Duplicate', 'igdb_id' => 1942])
            ->assertStatus(422);

        $other = $this->makeUser('other', ['game']);
        $this->actingAs($other)
            ->postJson('/api/games', ['title_en' => 'The Witcher 3', 'igdb_id' => 1942] + $this->gameDefaults($other))
            ->assertStatus(201);
    }

    /**
     * `lookup` ორივე იდენტიფიკატორს იღებს, მაგრამ **ერთი მაინც** სჭირდება.
     *
     * ⚠️ ეს იმას იცავს, რომ IGDB-ის კანდიდატი (რომელსაც `rawg_id` არ აქვს)
     * ჩუმად „ვერაფერი ვიპოვე"-დ არ იქცეს — უიდენტიფიკატორო რექვესთი 422-ია.
     */
    public function test_lookup_requires_one_of_the_two_ids(): void
    {
        $this->actingAs($this->user)
            ->postJson('/api/games/lookup', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['rawg_id', 'igdb_id']);
    }

    /**
     * კლავიშების გარეშე ორივე წყარო მიუწვდომელია → **503 და არა ცარიელი სია**.
     * ⚠️ ცარიელი სია user-ს „ასეთი თამაში არ არსებობს"-ად წაეკითხებოდა.
     */
    public function test_candidates_report_the_source_as_unavailable_without_keys(): void
    {
        config(['services.rawg.key' => null, 'services.igdb.client_id' => null, 'services.igdb.client_secret' => null]);

        $this->actingAs($this->user)
            ->postJson('/api/games/lookup/candidates', ['query' => 'zelda'])
            ->assertStatus(503)
            ->assertJsonPath('message', 'rawg_unavailable')
            ->assertJsonPath('configured', false);
    }

    /** ორივე სათაური ცარიელი — ჩანაწერი უსახელო დარჩებოდა */
    public function test_at_least_one_title_is_required(): void
    {
        $this->actingAs($this->user)
            ->postJson('/api/games', ['developer' => 'Valve'])
            ->assertStatus(422);
    }

    /**
     * §11.2 — walkthrough და სხვა ვიდეოები.
     * ⚠️ embed **სერვერზე** იგება allowlist-ით; ნედლი HTML არასდროს ინახება.
     */
    public function test_videos_build_the_embed_from_the_allowlist(): void
    {
        $id = $this->makeGame();

        $this->actingAs($this->user)
            ->postJson("/api/games/{$id}/videos", [
                'url' => 'https://youtu.be/aaaaaaaaaaa',
                'title' => 'Full walkthrough',
            ])
            ->assertStatus(201)
            // default-ია „სრული დახურვა" (11.2 მას სავალდებულოდ ასახელებს)
            ->assertJsonPath('data.kind', 'walkthrough')
            ->assertJsonPath('data.platform', 'youtube')
            ->assertJsonPath('data.embed_url', 'https://www.youtube-nocookie.com/embed/aaaaaaaaaaa');

        // უცნობი წყარო embed-ის გარეშე რჩება — iframe-ში მხოლოდ allowlist ხვდება
        $this->actingAs($this->user)
            ->postJson("/api/games/{$id}/videos", [
                'url' => 'https://evil.example.com/clip',
                'kind' => 'review',
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.platform', 'other')
            ->assertJsonPath('data.embed_url', null);

        $this->assertSame(2, GameVideo::withoutGlobalScope('owner')->count());
    }

    /** ჩანაწერის წაშლა — ფაილები, ჩანიშვნები და ვიდეოებიც მიჰყვება, კვოტაც თავისუფლდება */
    public function test_deleting_a_game_releases_files_and_quota(): void
    {
        Storage::fake('public');
        $id = $this->makeGame();

        $this->actingAs($this->user)
            ->postJson("/api/games/{$id}/files", [
                'kind' => 'image',
                'files' => [UploadedFile::fake()->image('screen.jpg')->size(120)],
            ])
            ->assertStatus(201);

        $this->actingAs($this->user)
            ->postJson("/api/games/{$id}/notes", ['body' => 'ბოსი მეორე სართულზეა'])
            ->assertStatus(201);

        $this->actingAs($this->user)
            ->postJson("/api/games/{$id}/videos", ['url' => 'https://youtu.be/bbbbbbbbbbb'])
            ->assertStatus(201);

        $used = (int) $this->user->refresh()->storage_used_bytes;
        $this->assertGreaterThan(0, $used);

        $this->actingAs($this->user)->deleteJson("/api/games/{$id}")->assertNoContent();

        $this->assertSame(0, GameFile::withoutGlobalScope('owner')->count());
        $this->assertSame(0, GameNote::withoutGlobalScope('owner')->count());
        $this->assertSame(0, GameVideo::withoutGlobalScope('owner')->count());
        $this->assertSame(0, (int) $this->user->refresh()->storage_used_bytes);
    }

    /** ატვირთული ყდა კვოტაზე გადის და `StorageMeter::files()`-შიც ჩანს (19.4/B) */
    public function test_uploaded_cover_counts_towards_the_quota(): void
    {
        Storage::fake('public');

        $id = $this->actingAs($this->user)
            ->post('/api/games', [
                'title_en' => 'Celeste',
                'cover' => UploadedFile::fake()->image('cover.jpg')->size(90),
            ] + $this->gameDefaults())
            ->assertStatus(201)
            ->json('data.id');

        $this->assertGreaterThan(0, (int) $this->user->refresh()->storage_used_bytes);

        $files = app(StorageMeter::class)->files($this->user->refresh());
        $cover = $files->firstWhere('owner_type', 'game');

        $this->assertNotNull($cover);
        $this->assertSame('game', $cover['module']);
        $this->assertStringStartsWith('games/covers/', $cover['path']);
        $this->assertSame($id, $cover['owner_id']);
    }

    /** ლექსიკონი per-user არის — სხვისი ჟანრი აქ არ ჩანს და არც მიება */
    public function test_genre_dictionary_is_per_user(): void
    {
        $mine = $this->genreIds(1)[0];

        $other = $this->makeUser('other', ['game']);
        GameGenre::ensureDefaults($other->id);

        $theirs = $this->actingAs($other)->getJson('/api/game-genres')->json('data.0.id');
        $this->assertNotSame($mine, $theirs);

        $this->actingAs($this->user)
            ->postJson('/api/games', ['title_en' => 'Nope', 'genre_ids' => [$theirs]])
            ->assertStatus(422);
    }

    /** სტატუსი და რჩეული — ბარათიდან ერთი კლიკია */
    public function test_status_and_favorite_toggles(): void
    {
        $id = $this->makeGame();

        $this->actingAs($this->user)
            ->patchJson("/api/games/{$id}/status", ['status' => 'playing'])
            ->assertOk()
            ->assertJsonPath('data.status', 'playing');

        $this->actingAs($this->user)
            ->patchJson("/api/games/{$id}/status", ['status' => 'watched'])
            ->assertStatus(422);

        $this->actingAs($this->user)
            ->patchJson("/api/games/{$id}/favorite")
            ->assertOk()
            ->assertJsonPath('data.is_favorite', true);
    }

    /**
     * ⚠️ RAWG-ის კლავიში ტესტში არ არის — endpoint-მა **503** უნდა დააბრუნოს
     * და არა ცარიელი სია, თორემ user-ს ეგონებოდა, რომ თამაში არ არსებობს.
     */
    public function test_lookup_reports_an_unavailable_source_instead_of_empty_results(): void
    {
        config(['services.rawg.key' => null]);

        $this->actingAs($this->user)
            ->postJson('/api/games/lookup/candidates', ['query' => 'hades'])
            ->assertStatus(503)
            ->assertJsonPath('message', 'rawg_unavailable')
            ->assertJsonPath('configured', false);
    }
}
