<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use App\Models\Video;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **Tasks §16.2 — დამთხვევები.**
 *
 * ტესტი სამ რამეს იჭერს: (1) პრივატული ჩანაწერი დამთხვევაში **არასდროს**
 * ხვდება, (2) მსგავსების ინდექსი Jaccard-ია და არა ასიმეტრიული წილადი,
 * (3) „ორივემ გავაკეთეთ" სტატუსზეა და დომენებზე სტატუსი **არ ემთხვევა**.
 */
class MatchTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;

    private User $bob;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->alice = $this->makeUser('alice');
        $this->bob = $this->makeUser('bob');
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);

        $ids = Module::whereIn('key', ['movie', 'video'])
            ->pluck('id')
            ->mapWithKeys(fn ($id) => [$id => ['enabled_at' => now(), 'is_public' => true]])
            ->all();
        $user->modules()->sync($ids);

        // ორივე პროფილი საჯაროა — 16.2 „ორ საჯარო პროფილს შორის"-ს ითხოვს
        $user->forceFill(['profile_visibility' => 'public'])->save();

        return $user->refresh();
    }

    private function movie(
        User $owner,
        ?int $tmdbId,
        string $status = 'undecided',
        string $visibility = 'public',
    ): Movie {
        $movie = Movie::create([
            'user_id' => $owner->id,
            'tmdb_id' => $tmdbId,
            'visibility' => $visibility,
        ]);

        // §6.4 — სტატუსი ლექსიკონის რიგია; გასაღები იმავე რჩება
        $movie->applyStatusKey($status);
        $movie->save();

        return $movie;
    }

    /* ---------- ძირითადი ---------- */

    public function test_shared_records_are_counted_per_domain(): void
    {
        $this->movie($this->alice, 100);
        $this->movie($this->alice, 200);
        $this->movie($this->bob, 100);
        $this->movie($this->bob, 300);

        $res = $this->actingAs($this->alice)->getJson('/api/matches/bob')->assertOk();

        $this->assertSame('movie', $res->json('domains.0.domain'));
        $this->assertSame(1, $res->json('domains.0.shared'));
        $this->assertSame(2, $res->json('domains.0.mine'));
        $this->assertSame(2, $res->json('domains.0.theirs'));
        // Jaccard: 1 საერთო ÷ 3 გაერთიანება
        $this->assertSame(33.3, $res->json('domains.0.percent'));
        $this->assertSame(1, $res->json('total.shared'));
    }

    /**
     * ⚠️ **§16.2-ის მთავარი წესი:** დამთხვევა მხოლოდ `public` ჩანაწერებზე
     * ითვლება — პრივატული არც ერთი მხრიდან არ ჟონავს.
     */
    public function test_private_records_never_count(): void
    {
        $this->movie($this->alice, 100, visibility: 'private');
        $this->movie($this->bob, 100);

        $res = $this->actingAs($this->alice)->getJson('/api/matches/bob')->assertOk();

        $this->assertSame(0, $res->json('domains.0.shared'));
        $this->assertSame(0, $res->json('domains.0.mine'));

        $items = $this->actingAs($this->alice)->getJson('/api/matches/bob/movie')->assertOk();
        $this->assertSame([], $items->json('data'));
    }

    /** ⚠️ იდენტობის სვეტი ცარიელი → ჩანაწერი შედარებაში არ მონაწილეობს */
    public function test_records_without_an_identity_key_are_skipped(): void
    {
        $this->movie($this->alice, null);
        $this->movie($this->bob, null);

        $res = $this->actingAs($this->alice)->getJson('/api/matches/bob')->assertOk();

        $this->assertSame(0, $res->json('domains.0.shared'));
        $this->assertSame(0, $res->json('domains.0.mine'));
    }

    /** „ორივემ ვნახეთ" — სტატუსი ორივე მხარეს უნდა იყოს `watched` */
    public function test_both_done_needs_the_domain_status_on_both_sides(): void
    {
        $this->movie($this->alice, 100, status: 'watched');
        $this->movie($this->bob, 100, status: 'watched');
        $this->movie($this->alice, 200, status: 'watched');
        $this->movie($this->bob, 200, status: 'to_watch');

        $res = $this->actingAs($this->alice)->getJson('/api/matches/bob')->assertOk();

        $this->assertSame(2, $res->json('domains.0.shared'));
        $this->assertSame(1, $res->json('domains.0.both_done'));
        /* ⚠️ §6.4 — ლექსიკონიან დომენზე `done_status` **`null`-ია**: „ნანახს"
           ყველა ანგარიშზე თავისი სახელი აქვს, კრიტერიუმი კი `role = done`-ია. */
        $this->assertNull($res->json('domains.0.done_status'));
    }

    /**
     * ⚠️ **ვიდეოს სტატუსი §6.4-ის შემდეგ აქვს**, ე.ი. `both_done` ითვლება
     * (აქ — 0, რადგან არცერთი არაა „ნანახი"). „არ ითვლება" (`null`) მხოლოდ
     * სიმღერაზე რჩება — ორი სხვადასხვა რამაა და ასე უნდა დარჩეს.
     */
    public function test_video_matches_on_platform_and_external_id(): void
    {
        foreach ([$this->alice, $this->bob] as $user) {
            Video::create([
                'user_id' => $user->id,
                'title' => 'Same clip',
                'url' => 'https://youtu.be/abc',
                'platform' => 'youtube',
                'external_id' => 'abc',
                'visibility' => 'public',
            ]);
        }

        // იგივე id სხვა პლატფორმაზე — **სხვა** ჩანაწერია
        Video::create([
            'user_id' => $this->bob->id,
            'title' => 'Other host',
            'url' => 'https://vimeo.com/abc',
            'platform' => 'vimeo',
            'external_id' => 'abc',
            'visibility' => 'public',
        ]);

        $res = $this->actingAs($this->alice)->getJson('/api/matches/bob')->assertOk();

        $video = collect($res->json('domains'))->firstWhere('domain', 'video');
        $this->assertSame(1, $video['shared']);
        $this->assertSame(2, $video['theirs']);
        $this->assertSame(0, $video['both_done']);
        $this->assertNull($video['done_status']);
    }

    public function test_item_list_carries_both_sides(): void
    {
        $mine = $this->movie($this->alice, 100, status: 'watched');
        $mine->rating = 9;
        $mine->save();

        $theirs = $this->movie($this->bob, 100, status: 'to_watch');
        $theirs->rating = 5;
        $theirs->save();

        $res = $this->actingAs($this->alice)->getJson('/api/matches/bob/movie')->assertOk();

        $this->assertCount(1, $res->json('data'));
        // ⚠️ ბარათის `status`/`rating` **მეორე მხარისაა** — ცალკე `their_*` ველები
        // იმავე ფაქტს ორ ადგილას გაიმეორებდა
        $this->assertSame('to_watch', $res->json('data.0.status.key'));
        $this->assertSame('watched', $res->json('data.0.mine.status.key'));
        $this->assertSame($mine->id, $res->json('data.0.mine.id'));
        $this->assertFalse($res->json('data.0.both_done'));
    }

    /* ---------- წვდომა ---------- */

    public function test_matches_require_authentication(): void
    {
        $this->getJson('/api/matches/bob')->assertStatus(401);
    }

    /** ჩემი პროფილი დახურულია → ცალსახა 409, და არა ჩუმად ცარიელი შედეგი */
    public function test_my_profile_must_be_public_too(): void
    {
        $this->alice->forceFill(['profile_visibility' => 'private'])->save();

        $this->actingAs($this->alice)
            ->getJson('/api/matches/bob')
            ->assertStatus(409)
            ->assertJsonPath('message', 'profile_not_public');
    }

    public function test_private_target_profile_is_404(): void
    {
        $this->bob->forceFill(['profile_visibility' => 'private'])->save();

        $this->actingAs($this->alice)->getJson('/api/matches/bob')->assertStatus(404);
    }

    public function test_cannot_match_with_yourself(): void
    {
        $this->actingAs($this->alice)
            ->getJson('/api/matches/alice')
            ->assertStatus(422)
            ->assertJsonPath('message', 'cannot_match_self');
    }

    /** მოდული ერთ მხარეს არ არის საჯარო → დომენი შედარებაში არ ხვდება */
    public function test_domain_needs_the_module_public_on_both_sides(): void
    {
        $movieId = Module::where('key', 'movie')->value('id');
        $this->bob->modules()->syncWithoutDetaching([$movieId => ['is_public' => false]]);

        $this->movie($this->alice, 100);
        $this->movie($this->bob, 100);

        $res = $this->actingAs($this->alice)->getJson('/api/matches/bob')->assertOk();

        $this->assertSame([], collect($res->json('domains'))->pluck('domain')->intersect(['movie'])->all());
        $this->actingAs($this->alice)->getJson('/api/matches/bob/movie')->assertStatus(404);
    }

    /** ⚠️ `playlist` საერთო იდენტობის გარეშეა → შედარებადი დომენი არაა */
    public function test_playlist_is_not_matchable(): void
    {
        $this->actingAs($this->alice)->getJson('/api/matches/bob/playlist')->assertStatus(404);
        $this->actingAs($this->alice)->getJson('/api/matches/bob/note')->assertStatus(404);
    }

    /* ---------- „ვისთან ჰგავს ჩემი გემოვნება" (პროფილების კატალოგი) ---------- */

    public function test_ranking_orders_profiles_by_similarity(): void
    {
        $carol = $this->makeUser('carol');

        // alice: 100, 200 · bob: 100, 200 (სრული დამთხვევა) · carol: 100, 300
        foreach ([100, 200] as $id) {
            $this->movie($this->alice, $id);
            $this->movie($this->bob, $id);
        }
        $this->movie($carol, 100);
        $this->movie($carol, 300);

        $res = $this->actingAs($this->alice)->getJson('/api/matches')->assertOk();

        $this->assertSame('bob', $res->json('items.0.profile.username'));
        // ⚠️ `assertEquals` განზრახ: 100.0 JSON-ში `100`-ად იწერება და int-ად ბრუნდება
        $this->assertEquals(100, $res->json('items.0.percent'));
        $this->assertSame('carol', $res->json('items.1.profile.username'));
        // Jaccard: 1 საერთო ÷ 3 გაერთიანება
        $this->assertSame(33.3, $res->json('items.1.percent'));
        $this->assertSame(2, $res->json('total'));
        $this->assertFalse($res->json('truncated'));
    }

    /**
     * ⚠️ **დამთხვევის გარეშე პროფილიც ჩანს** — ეს კატალოგიცაა და არა მარტო
     * რეიტინგი (§16.2 „საჯარო პროფილების ძებნა/კატალოგი"). უბრალოდ ბოლოშია.
     */
    public function test_profiles_without_matches_stay_in_the_list(): void
    {
        $this->movie($this->alice, 100);

        $res = $this->actingAs($this->alice)->getJson('/api/matches')->assertOk();

        $this->assertSame('bob', $res->json('items.0.profile.username'));
        $this->assertSame(0, $res->json('items.0.shared'));
        $this->assertSame([], $res->json('items.0.domains'));
    }

    public function test_ranking_is_searchable_and_hides_private_profiles(): void
    {
        $carol = $this->makeUser('carol');
        $carol->forceFill(['profile_visibility' => 'private'])->save();

        // ძებნა
        $res = $this->actingAs($this->alice)->getJson('/api/matches?q=bo')->assertOk();
        $this->assertCount(1, $res->json('items'));
        $this->assertSame('bob', $res->json('items.0.profile.username'));

        // ⚠️ დაპრივატებული პროფილი კატალოგში საერთოდ არ ჩანს
        $all = $this->actingAs($this->alice)->getJson('/api/matches')->assertOk();
        $this->assertSame(['bob'], collect($all->json('items'))->pluck('profile.username')->all());
    }

    /** ⚠️ იგივე წესი, რაც წყვილურ შედარებას: ჩემი პროფილიც საჯარო უნდა იყოს */
    public function test_ranking_needs_my_profile_to_be_public(): void
    {
        $this->alice->forceFill(['profile_visibility' => 'private'])->save();

        $this->actingAs($this->alice->refresh())
            ->getJson('/api/matches')
            ->assertStatus(409)
            ->assertJsonPath('message', 'profile_not_public');
    }
}
