<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Playlist;
use App\Models\Song;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * **Tasks §33 — საჯარო ფლეილისტის შიგთავსი.**
 *
 * შენი სიტყვები: „ფლეილისტი თუ გაზიარებული მაქვს, შიდა კონტენტი რატომ არ არის
 * საჯარო? უნდა ჩანდეს — და რა შედის იქ."
 *
 * ⚠️ **ყოველი ხილვადობის ტესტი ორ სტუმარზე გადის — ანონიმსა და შესულ უცხოზე.**
 * `Song`-ის `owner` scope ანონიმისთვის არაფერს აკეთებს, შესულისთვის კი მის
 * საკუთარ რიგებზე ჭრის — ე.ი. მარტო ანონიმური ტესტი ზუსტად იმ ნახევარს
 * ამოწმებდა, სადაც ხარვეზი არ იყო (§1.2-ის გაკვეთილი; ფლეილისტის ბარათი შესულ
 * უცხოს „0 სიმღერას" უწერდა).
 */
class PublicPlaylistTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->alice = $this->publicUser('alice');
    }

    /** საჯარო პროფილი საჯარო `song` მოდულით — სამი ფენიდან ორი ღიაა */
    private function publicUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);

        // ⚠️ `profile_visibility` mass-assignable არაა (`PublicProfileTest`-ის გზა)
        $user->forceFill(['profile_visibility' => 'public'])->save();

        $user->modules()->sync([
            Module::where('key', 'song')->value('id') => ['enabled_at' => now(), 'is_public' => true],
        ]);

        return $user->refresh();
    }

    private function song(User $owner, string $title, string $visibility = 'private', array $extra = []): Song
    {
        $id = strtolower(str_replace(' ', '', $title));

        return Song::create([
            'user_id' => $owner->id,
            'title' => $title,
            'artist' => "{$title} artist",
            'year' => 2001,
            'duration' => 215,
            'url' => "https://youtu.be/{$id}",
            'platform' => 'youtube',
            'external_id' => $id,
            'embed_url' => "https://www.youtube.com/embed/{$id}",
            'visibility' => $visibility,
            'play_count' => 7,
            'tags' => ['secret-tag'],
            'is_favorite' => true,
        ] + $extra);
    }

    /** @param  list<Song>  $songs  ფლეილისტის რიგით */
    private function playlist(User $owner, string $name, array $songs, string $visibility = 'public'): Playlist
    {
        $playlist = Playlist::withoutGlobalScope('owner')->create([
            'user_id' => $owner->id,
            'name' => $name,
            'visibility' => $visibility,
        ]);

        foreach ($songs as $i => $song) {
            $playlist->songs()->attach($song->id, ['sort_order' => $i + 1]);
        }

        return $playlist;
    }

    private function url(Playlist $playlist, string $username = 'alice'): string
    {
        return "/api/public/profiles/{$username}/playlists/{$playlist->id}";
    }

    /** შესული უცხო — მისი `owner` scope ყველა `Song` query-ს მის რიგებზე ჭრის */
    private function stranger(): User
    {
        return $this->publicUser('bob');
    }

    /* ---------- 33.1 — შიგთავსი, რიგით ---------- */

    /**
     * ფლეილისტი თავისი რიგით ბრუნდება და **პირადი სიმღერაც ჩანს** (Q24).
     *
     * ⚠️ რიგი pivot-ისაა: `id`-ით დალაგებული სია აქ A, B, C იქნებოდა.
     */
    public function test_a_public_playlist_lists_every_song_in_its_own_order(): void
    {
        $a = $this->song($this->alice, 'Alpha', 'public');
        $b = $this->song($this->alice, 'Bravo');
        $c = $this->song($this->alice, 'Charlie');
        $playlist = $this->playlist($this->alice, 'Evening', [$c, $a, $b]);

        foreach ([null, $this->stranger()] as $visitor) {
            $request = $visitor ? $this->actingAs($visitor) : $this;
            $res = $request->getJson($this->url($playlist))->assertOk();

            $this->assertSame(['Charlie', 'Alpha', 'Bravo'], array_column($res->json('data'), 'title_en'));
            $this->assertSame('Evening', $res->json('playlist.title_en'));
            $this->assertSame(3, $res->json('playlist.songs_count'));
            $this->assertSame(3, $res->json('meta.total'));
        }
    }

    /**
     * ⚠️ **სიმღერა ვიწრო ბარათით მოდის** — `PublicDomain::card()`-ის ფორმით და
     * არა `SongResource`-ით. ერთი ახალი ველი სრულ რესურსში ჩუმად გაჟონავდა.
     */
    public function test_a_song_inside_a_playlist_is_the_narrow_public_card(): void
    {
        $song = $this->song($this->alice, 'Alpha');
        $playlist = $this->playlist($this->alice, 'Evening', [$song]);

        $card = $this->getJson($this->url($playlist))->assertOk()->json('data.0');

        $this->assertEqualsCanonicalizing(
            ['id', 'domain', 'title_en', 'subtitle', 'year', 'image', 'rating', 'url', 'platform', 'embed_url', 'duration'],
            array_keys($card),
        );
        $this->assertSame('song', $card['domain']);
        $this->assertSame('https://www.youtube.com/embed/alpha', $card['embed_url']);
        $this->assertSame(215, $card['duration']);

        $playlistCard = $this->getJson($this->url($playlist))->json('playlist');
        $this->assertEqualsCanonicalizing(['id', 'domain', 'title_en', 'songs_count'], array_keys($playlistCard));
    }

    /* ---------- 33.3 — რიცხვი ყველასთვის ერთია ---------- */

    /**
     * **ბარათის რიცხვი ანონიმსაც, შესულ უცხოსაც და მფლობელსაც ერთნაირად ეწერება.**
     *
     * ⚠️ ეს იყო ცოცხალი ხარვეზი: `withCount('songs')` `Song`-ის `owner` scope-ის
     * ქვეშ იდგა და შესული უცხო „0 სიმღერას" ხედავდა. რიცხვი პირად სიმღერებსაც
     * ითვლის — შიგნით ისინიც ჩანს (Q24), ე.ი. ბარათი და შიგთავსი ერთსა და იმავეს
     * ამბობს.
     */
    public function test_the_song_count_is_the_same_for_every_visitor(): void
    {
        $playlist = $this->playlist($this->alice, 'Evening', [
            $this->song($this->alice, 'Alpha', 'public'),
            $this->song($this->alice, 'Bravo'),
            $this->song($this->alice, 'Charlie'),
        ]);

        foreach ([null, $this->stranger(), $this->alice] as $visitor) {
            $request = $visitor ? $this->actingAs($visitor) : $this;

            $card = collect($request->getJson('/api/public/profiles/alice/playlist')->assertOk()->json('data'))
                ->firstWhere('id', $playlist->id);

            $this->assertSame(3, $card['songs_count'], 'visitor: '.($visitor?->username ?? 'anonymous'));
            $this->assertSame(3, $request->getJson($this->url($playlist))->json('meta.total'));
        }
    }

    /* ---------- 33.4 — ფლეილისტი ბიბლიოთეკას არ ხსნის ---------- */

    /** „სიმღერების" ჩანართში მხოლოდ თავად საჯარო სიმღერაა (Q24) */
    public function test_a_private_song_in_a_public_playlist_stays_out_of_the_songs_tab(): void
    {
        $open = $this->song($this->alice, 'Alpha', 'public');
        $this->playlist($this->alice, 'Evening', [$open, $this->song($this->alice, 'Bravo')]);

        foreach ([null, $this->stranger()] as $visitor) {
            $request = $visitor ? $this->actingAs($visitor) : $this;

            $titles = array_column($request->getJson('/api/public/profiles/alice/song')->assertOk()->json('data'), 'title_en');
            $this->assertSame(['Alpha'], $titles);
        }
    }

    /**
     * ⚠️ **ფლეილისტით გამჟღავნებული პირადი სიმღერა დამთხვევაში არ მონაწილეობს**
     * (§16.2): `MatchService` „სიმღერების" ჩანართის query-ს კითხულობს.
     *
     * მეორე ნახევარი — იგივე სიმღერა საჯაროდ რომ დაემთხვევა — ცალკე ტესტია
     * (`…_matches_once_it_is_public`), თორემ „0" ნებისმიერი სხვა მიზეზით
     * შეიძლება მოსულიყო. ⚠️ **ერთ ტესტში ვერ ჩაეტევა**: `MatchService`-ის memo
     * ინსტანციაზეა, კონტროლერი კი როუტზე ქეშირდება (PERF-15) — ე.ი. მეორე
     * მოთხოვნა იმავე ტესტში პირველის პასუხს დააბრუნებდა.
     */
    public function test_a_private_song_revealed_by_a_playlist_never_matches(): void
    {
        $bob = $this->stranger();
        $this->song($bob, 'Alpha', 'public');
        $this->playlist($this->alice, 'Evening', [$this->song($this->alice, 'Alpha')]);

        $song = collect($this->actingAs($bob)->getJson('/api/matches/alice')->assertOk()->json('domains'))
            ->firstWhere('domain', 'song');

        $this->assertSame(0, $song['shared']);
    }

    /** წინა ტესტის საკონტროლო ნახევარი: იგივე წყვილი საჯაროდ მართლა ემთხვევა */
    public function test_the_same_song_matches_once_it_is_public(): void
    {
        $bob = $this->stranger();
        $this->song($bob, 'Alpha', 'public');
        $this->playlist($this->alice, 'Evening', [$this->song($this->alice, 'Alpha', 'public')]);

        $song = collect($this->actingAs($bob)->getJson('/api/matches/alice')->assertOk()->json('domains'))
            ->firstWhere('domain', 'song');

        $this->assertSame(1, $song['shared']);
    }

    /* ---------- რა არ ჩანს ---------- */

    public function test_a_private_playlist_is_not_found(): void
    {
        $playlist = $this->playlist($this->alice, 'Mine', [$this->song($this->alice, 'Alpha')], 'private');

        $this->getJson($this->url($playlist))->assertNotFound();
        $this->actingAs($this->stranger())->getJson($this->url($playlist))->assertNotFound();
    }

    /** სხვისი ფლეილისტი ჩემი username-ით — 404, თუნდაც ის საჯარო იყოს */
    public function test_another_profiles_playlist_is_not_found_under_this_name(): void
    {
        $bob = $this->stranger();
        $theirs = $this->playlist($bob, 'Theirs', [$this->song($bob, 'Alpha', 'public')]);

        $this->getJson($this->url($theirs, 'alice'))->assertNotFound();
        $this->getJson($this->url($theirs, 'bob'))->assertOk();
    }

    /** სამივე ფენა: მოდული საჯარო არაა ან პროფილი პირადია → ფლეილისტიც არ არსებობს */
    public function test_the_module_and_the_profile_must_both_be_public(): void
    {
        $playlist = $this->playlist($this->alice, 'Evening', [$this->song($this->alice, 'Alpha')]);
        $moduleId = Module::where('key', 'song')->value('id');

        $this->alice->modules()->updateExistingPivot($moduleId, ['is_public' => false]);
        $this->getJson($this->url($playlist))->assertNotFound();

        $this->alice->modules()->updateExistingPivot($moduleId, ['is_public' => true]);
        $this->alice->forceFill(['profile_visibility' => 'private'])->save();
        $this->getJson($this->url($playlist))->assertNotFound();

        $this->alice->forceFill(['profile_visibility' => 'public'])->save();
        config(['mediary.public_profiles' => false]);
        $this->getJson($this->url($playlist))->assertNotFound();
    }

    /** ურნაში გადატანილი სიმღერა არც ჩანს და არც ითვლება; ფლეილისტი — 404 */
    public function test_the_trash_hides_songs_and_playlists(): void
    {
        $kept = $this->song($this->alice, 'Alpha');
        $gone = $this->song($this->alice, 'Bravo');
        $playlist = $this->playlist($this->alice, 'Evening', [$kept, $gone]);

        $gone->moveToTrash();

        $res = $this->actingAs($this->stranger())->getJson($this->url($playlist))->assertOk();
        $this->assertSame(['Alpha'], array_column($res->json('data'), 'title_en'));
        $this->assertSame(1, $res->json('playlist.songs_count'));

        $playlist->moveToTrash();
        $this->getJson($this->url($playlist))->assertNotFound();
    }

    /**
     * ⚠️ **სხვისი სიმღერა ჩემი ფლეილისტით ვერ გაჟონავს** — არც სიაში, არც
     * რიცხვში. `PlaylistController::orderedPivot()` ამას ისედაც არ უშვებს;
     * ეს ტესტი თავდაცვის მეორე ფენას იჭერს (`songs.user_id`), რომელიც
     * ავტორიზაციის გარეშე მდგომ პასუხს იმ დაშვებაზე აღარ აყენებს.
     */
    public function test_another_accounts_song_never_leaks_through_a_playlist(): void
    {
        $bob = $this->stranger();
        $playlist = $this->playlist($this->alice, 'Evening', [$this->song($this->alice, 'Alpha')]);

        DB::table('playlist_song')->insert([
            'playlist_id' => $playlist->id,
            'song_id' => $this->song($bob, 'Stolen', 'public')->id,
            'sort_order' => 2,
        ]);

        foreach ([null, $bob] as $visitor) {
            $request = $visitor ? $this->actingAs($visitor) : $this;
            $res = $request->getJson($this->url($playlist))->assertOk();

            $this->assertSame(['Alpha'], array_column($res->json('data'), 'title_en'));
            $this->assertSame(1, $res->json('playlist.songs_count'));
        }
    }

    /**
     * **მფლობელის დამალული ველი ფლეილისტის შიგნითაც დამალულია** (§6 ფაზა 4a).
     *
     * ⚠️ დამალულ ბმულთან ერთად `embed_url`-იც ქრება — ის ბმულიდანაა აგებული
     * და თორემ ბმულს ხელახლა გაამხელდა (`PublicDomain::DERIVED`).
     */
    public function test_fields_the_owner_hid_stay_hidden_inside_the_playlist(): void
    {
        $playlist = $this->playlist($this->alice, 'Evening', [$this->song($this->alice, 'Alpha')]);

        DB::table('module_user')
            ->where('user_id', $this->alice->id)
            ->where('module_id', Module::where('key', 'song')->value('id'))
            ->update(['settings' => json_encode(['fields' => [
                // `url` ჩაკეტილია — დამალვას `unlocked` სჭირდება (§4.3)
                'url' => ['unlocked' => true, 'public' => false],
                'year' => ['public' => false],
            ]])]);

        $card = $this->getJson($this->url($playlist))->assertOk()->json('data.0');

        $this->assertArrayNotHasKey('url', $card);
        $this->assertArrayNotHasKey('embed_url', $card);
        $this->assertArrayNotHasKey('year', $card);
        $this->assertSame('Alpha', $card['title_en']);
    }

    /* ---------- ავტორიზაციის გარეშე მდგომი endpoint-ის ზღვრები ---------- */

    /** ⚠️ `?per_page=-1` `LIMIT`-ს ჩუმად აშორებდა (§B4) — ქვედა ზღვარი 1-ია */
    public function test_per_page_is_clamped_from_below(): void
    {
        $playlist = $this->playlist($this->alice, 'Evening', [
            $this->song($this->alice, 'Alpha'),
            $this->song($this->alice, 'Bravo'),
        ]);

        $res = $this->getJson($this->url($playlist).'?per_page=-1')->assertOk();

        $this->assertSame(1, $res->json('meta.per_page'));
        $this->assertCount(1, $res->json('data'));
        $this->assertSame(2, $res->json('meta.total'));
    }

    /**
     * **query-ების რიცხვი სიმღერების რაოდენობაზე არ არის დამოკიდებული**
     * (PERF-02-ის წესი — ეს ავტორიზაციის გარეშე endpoint-ია).
     *
     * ⚠️ ორივე გაზომვა „თბილია": კონტროლერი როუტზე ქეშირდება (PERF-15) და
     * `PublicProfileService`-ის memo მეორე მოთხოვნაზე უკვე სავსეა — ცივი და
     * თბილი შედარება ცრუ სხვაობას აჩვენებდა.
     */
    public function test_the_query_count_does_not_depend_on_the_number_of_songs(): void
    {
        $playlist = $this->playlist($this->alice, 'Evening', [
            $this->song($this->alice, 'Alpha'),
            $this->song($this->alice, 'Bravo'),
            $this->song($this->alice, 'Charlie'),
        ]);

        $measure = function () use ($playlist): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson($this->url($playlist).'?per_page=100')->assertOk();
            DB::disableQueryLog();

            return count(DB::getQueryLog());
        };

        $measure();
        $few = $measure();

        foreach (range(1, 30) as $i) {
            $playlist->songs()->attach($this->song($this->alice, "Extra {$i}")->id, ['sort_order' => 10 + $i]);
        }

        $many = $measure();

        $this->assertGreaterThan(0, $few);
        $this->assertSame($few, $many);
    }
}
