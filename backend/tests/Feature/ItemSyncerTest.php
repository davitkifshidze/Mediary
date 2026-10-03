<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use App\Services\Sync\ItemSyncer;
use App\Support\SyncOutcome;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * **ერთი ჩანაწერის სინქრონის შედეგი** (Tasks §31.1/§31.6).
 *
 * ⚠️ აქამდე `sync()` ცარიელ TMDB-პასუხზეც `ok:true, changed:[]`-ს აბრუნებდა
 * და `sync_status='synced'`-ს წერდა — სიაში მწვანე ✓, განახლებულის იდენტური.
 * ოთხი ფაქტი ცალკე მოწმდება: განახლდა · უცვლელი · ცარიელი · ჩავარდა.
 *
 * ⚠️ `Http::fake()` ერთი stub-ით და ცვლადი პასუხით (stub-ები ემატება და არა
 * იცვლება).
 */
class ItemSyncerTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private array $details = [];

    private int $status = 200;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->user = User::create(['name' => 'sync', 'username' => 'sync', 'email' => 'sync@example.com', 'password' => 'password']);
        $this->user->modules()->sync(Module::where('key', 'movie')->pluck('id')->all());
        $this->user->refresh();
        $this->giveCredential($this->user, 'tmdb');
        $this->actingAs($this->user);

        $this->details = ['id' => 603, 'title' => 'The Matrix', 'overview' => 'A hacker learns the truth.', 'release_date' => '1999-03-31', 'vote_average' => 8.7];

        Http::fake([
            'api.themoviedb.org/3/movie/*/credits*' => fn () => Http::response(['cast' => []]),
            'api.themoviedb.org/3/movie/*/videos*' => fn () => Http::response(['results' => []]),
            'api.themoviedb.org/3/movie/*' => fn () => Http::response($this->details, $this->status),
        ]);
    }

    private function movie(): Movie
    {
        return Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 603])->refresh();
    }

    private function sync(Movie $movie): array
    {
        return app(ItemSyncer::class)->sync($movie, ['fields' => ['title', 'year', 'rating']]);
    }

    public function test_a_first_sync_is_updated_and_a_second_one_unchanged(): void
    {
        $movie = $this->movie();

        $first = $this->sync($movie);
        $this->assertTrue($first['ok']);
        $this->assertSame(SyncOutcome::UPDATED, $first['result']);
        $this->assertContains('title_en', $first['changed']);

        $movie->refresh();
        $this->assertSame('synced', $movie->sync_status);
        $this->assertSame(SyncOutcome::UPDATED, $movie->last_sync_result);
        $this->assertNotNull($movie->last_synced_at);

        $second = $this->sync($movie);
        $this->assertTrue($second['ok']);
        $this->assertSame(SyncOutcome::UNCHANGED, $second['result']);
        $this->assertSame([], $second['changed']);
        $this->assertSame(SyncOutcome::UNCHANGED, $movie->refresh()->last_sync_result);
    }

    /** ⚠️ ცარიელი პასუხი — `sync_status` **არ** იწერება, შედეგი `empty` */
    public function test_an_empty_answer_is_empty_and_leaves_sync_status_alone(): void
    {
        $this->details = [];
        $movie = $this->movie();

        $result = $this->sync($movie);

        $this->assertTrue($result['ok']);
        $this->assertFalse($result['skipped']);
        $this->assertSame(SyncOutcome::EMPTY, $result['result']);
        $this->assertSame([], $result['changed']);

        $movie->refresh();
        // ⚠️ `sync_status` ნაგულისხმევზე (`pending`) რჩება — ჩანაწერი დამუშავებულად არ ჩაითვალა
        $this->assertSame('pending', $movie->sync_status);
        $this->assertSame(SyncOutcome::EMPTY, $movie->last_sync_result);
        $this->assertNotNull($movie->last_synced_at);
    }

    /** TMDB-მ ეს id არ იცის (404) — ესეც ცარიელია და არა ჩავარდნა */
    public function test_a_404_is_empty_and_not_a_failure(): void
    {
        $this->status = 404;
        $this->details = ['status_message' => 'not found'];
        $movie = $this->movie();

        $result = $this->sync($movie);

        $this->assertTrue($result['ok']);
        $this->assertSame(SyncOutcome::EMPTY, $result['result']);
        $this->assertSame(SyncOutcome::EMPTY, $movie->refresh()->last_sync_result);
    }

    /** წყარო არ პასუხობს — ჩავარდნა დროითა და კოდით იწერება, `sync_status` უცვლელი */
    public function test_a_dead_source_is_failed_and_stamped(): void
    {
        $this->status = 500;
        $movie = $this->movie();

        $result = $this->sync($movie);

        $this->assertFalse($result['ok']);
        $this->assertSame(SyncOutcome::FAILED, $result['result']);
        $this->assertNotNull($result['error']);

        $movie->refresh();
        $this->assertSame('pending', $movie->sync_status);
        $this->assertSame(SyncOutcome::FAILED, $movie->last_sync_result);
        $this->assertNotNull($movie->last_synced_at);
    }

    /** `sync_paused` ერთეულოვან სინქრონს არ აჩერებს — ეს გეგმებისა და რიგის წესია */
    public function test_a_paused_record_still_syncs_when_asked_directly(): void
    {
        $movie = $this->movie();
        $movie->forceFill(['sync_paused' => true])->save();

        $this->assertSame(SyncOutcome::UPDATED, $this->sync($movie)['result']);
    }
}
