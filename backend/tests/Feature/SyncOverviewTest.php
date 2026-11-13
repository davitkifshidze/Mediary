<?php

namespace Tests\Feature;

use App\Models\Anime;
use App\Models\CastMember;
use App\Models\CastMemberSyncPref;
use App\Models\Module;
use App\Models\Movie;
use App\Models\RecordLock;
use App\Models\Role;
use App\Models\Series;
use App\Models\User;
use App\Services\Episodes\EpisodeSync;
use App\Services\Sync\SyncHistory;
use App\Support\SyncOutcome;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * **სინქრონიზაციის გვერდების ბარათები** — `GET /sync/overview`.
 *
 * ⚠️ მოწმდება: „რამდენია გასაშვები" ზუსტად ის რიცხვია, რასაც გაშვების გეგმა აბრუნებს
 * (მონაცემები — დაუმუშავებელი ჩანაწერები, სეზონები — `/media/episodes/{type}/plan`,
 * მსახიობები — „ვისაც ჯერ არ განახლებია"); TMDB id-ის გარეშე, შეჩერებული და ჩაკეტილი
 * რიცხვში არ ხვდება; `type` რიცხვებსაც და ბოლო გაშვებასაც ერთ მოდულზე ავიწროებს და
 * ფილმს სეზონების ბარათი არ აქვს; ბოლო გაშვება სახეობის მიხედვითაა, ისტორიის ჯამი და
 * ბოლო გაშვება კი მთლიანია; უფლების გარეშე ბარათი `null`-ია; სხვისი გაშვება არ ჩანს.
 */
class SyncOverviewTest extends TestCase
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
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::pluck('id')->all());

        return $user->refresh();
    }

    /** @param  array<string, mixed>  $extra */
    private function movie(array $extra = [], ?User $owner = null): Movie
    {
        return Movie::create(['user_id' => ($owner ?? $this->alice)->id, 'tmdb_id' => random_int(1000, 999999), ...$extra])->refresh();
    }

    private function stamp(Movie|Series|Anime $record, string $result): void
    {
        SyncOutcome::stamp($record, 'sync', $result);
    }

    private function lock(Movie|Series|Anime|CastMember $record): void
    {
        RecordLock::create([
            'user_id' => $this->alice->id,
            'lockable_type' => $record->getMorphClass(),
            'lockable_id' => $record->getKey(),
            'password_hash' => Hash::make('secret1'),
        ]);
    }

    /** გაშვება ერთი ერთეულით — ისტორიის მწერლით, როგორც ნამდვილი გაშვება */
    private function recordRun(string $kind, string $type, int $recordId, string $result = SyncHistory::UPDATED, ?User $owner = null): string
    {
        $key = (string) Str::uuid();
        app(SyncHistory::class)->record(($owner ?? $this->alice)->id, $key, $kind, SyncHistory::SOURCE_QUEUE, 1, $type, $recordId, 'Title', $result);

        return $key;
    }

    public function test_pending_numbers_match_what_the_plans_would_run(): void
    {
        $this->actingAs($this->alice);

        // --- მონაცემები: დაუმუშავებელია არასდროს გაშვებული, ცარიელი და ჩავარდნილი ---
        $never = $this->movie();
        $this->stamp($this->movie(), SyncOutcome::UPDATED);
        $this->stamp($this->movie(), SyncOutcome::UNCHANGED);
        $this->stamp($this->movie(), SyncOutcome::EMPTY);
        $this->stamp($this->movie(), SyncOutcome::FAILED);
        // რიცხვში არ ხვდება: TMDB id-ის გარეშე, „აღარ განაახლო", ჩაკეტილი, სხვისი
        $this->movie(['tmdb_id' => null]);
        $this->movie(['sync_paused' => true]);
        $this->lock($this->movie());
        $this->movie([], $this->bob);

        // --- სეზონები: დაუსრულებელი და ბოლო საათებში ჩამოუტვირთავი ---
        $series = fn (array $extra = []) => Series::create(['user_id' => $this->alice->id, 'tmdb_id' => random_int(1000, 999999), ...$extra]);
        $series();
        $series(['tmdb_status' => 'Returning Series']);
        $series(['tmdb_status' => 'Ended']);
        $series(['episodes_synced_at' => now()->subHour()]);
        $series(['episodes_synced_at' => now()->subHours(EpisodeSync::RESUME_HOURS + 1)]);
        Anime::create(['user_id' => $this->alice->id, 'tmdb_id' => 77]);

        // --- მსახიობები: ამ ბიბლიოთეკის, TMDB id-ით, ჯერ არ განახლებული, შეუჩერებელი ---
        $actor = fn (array $extra = []) => CastMember::create(['tmdb_person_id' => random_int(1000, 999999), 'name' => Str::random(8), ...$extra]);
        $fresh = $actor();
        $synced = $actor(['details_synced_at' => now()]);
        $noId = $actor(['tmdb_person_id' => null]);
        $paused = $actor();
        $elsewhere = $actor();
        $never->cast()->sync(collect([$fresh, $synced, $noId, $paused])->mapWithKeys(fn (CastMember $m, int $i) => [$m->id => ['character' => 'X', 'billing_order' => $i]])->all());
        $this->movie([], $this->bob)->cast()->sync([$elsewhere->id => ['character' => 'X', 'billing_order' => 0]]);
        CastMemberSyncPref::withoutGlobalScope('owner')->create(['user_id' => $this->alice->id, 'cast_member_id' => $paused->id, 'paused_at' => now()]);

        $pending = $this->getJson('/api/sync/overview')->assertOk()->json('pending');
        $this->assertSame(['sync' => 3 + 6, 'episodes' => 3 + 1, 'cast' => 1], $pending);

        // იგივე რიცხვი, რასაც გეგმები აბრუნებს
        $plan = $this->postJson('/api/media/sync/plan', ['hide_processed' => true])->assertOk()->json();
        $this->assertSame($pending['sync'], $plan['count']);
        $episodes = count($this->getJson('/api/media/episodes/series/plan')->json('items')) + count($this->getJson('/api/media/episodes/anime/plan')->json('items'));
        $this->assertSame($pending['episodes'], $episodes);
        $this->assertSame($pending['cast'], $this->postJson('/api/cast/sync/plan', ['scope' => 'never'])->json('count'));

        // ერთ მოდულზე: ფილმს სეზონები არ აქვს, სერიალზე მხოლოდ მისი რიცხვებია
        $this->assertSame(['sync' => 3, 'episodes' => null, 'cast' => 1], $this->getJson('/api/sync/overview?type=movie')->json('pending'));
        $this->assertSame(['sync' => 5, 'episodes' => 3, 'cast' => 0], $this->getJson('/api/sync/overview?type=series')->json('pending'));
        $this->getJson('/api/sync/overview?type=book')->assertStatus(422);
    }

    public function test_last_runs_are_per_kind_and_narrow_to_a_module(): void
    {
        $this->actingAs($this->alice);
        $movie = $this->movie();
        $series = Series::create(['user_id' => $this->alice->id, 'tmdb_id' => 1399]);

        $this->assertSame(
            ['last' => ['sync' => null, 'episodes' => null, 'cast' => null], 'runs' => 0, 'latest' => null],
            collect($this->getJson('/api/sync/overview')->json())->only(['last', 'runs', 'latest'])->all(),
        );

        $movieRun = $this->recordRun('sync', 'movie', $movie->id);
        $seriesRun = $this->recordRun('sync', 'series', $series->id, SyncHistory::FAILED);
        $episodesRun = $this->recordRun('episodes', 'series', $series->id);
        $castRun = $this->recordRun('cast', 'actor', 5);
        $translateRun = $this->recordRun('translate', 'movie', $movie->id);
        $this->recordRun('sync', 'movie', 1, SyncHistory::UPDATED, $this->bob);

        // დროები ცხადად: სია ბოლო ერთეულის დროით ლაგდება
        foreach ([$movieRun, $seriesRun, $episodesRun, $castRun, $translateRun] as $minutes => $key) {
            DB::table('sync_runs')->where('key', $key)->update(['updated_at' => now()->subHour()->addMinutes($minutes)]);
        }

        $all = $this->getJson('/api/sync/overview')->assertOk()->json();
        $this->assertSame($seriesRun, $all['last']['sync']['key']);
        $this->assertSame(['updated' => 0, 'unchanged' => 0, 'skipped' => 0, 'failed' => 1], $all['last']['sync']['counts']);
        $this->assertSame($episodesRun, $all['last']['episodes']['key']);
        $this->assertSame($castRun, $all['last']['cast']['key']);
        // ისტორიის ჯამი და ბოლო გაშვება ყველა სახეობაზეა — თარგმანიც
        $this->assertSame(5, $all['runs']);
        $this->assertSame($translateRun, $all['latest']['key']);

        // ფილმების გვერდი: მონაცემების ბოლო გაშვება ფილმებისაა; სეზონები მას არ ეხება
        $movies = $this->getJson('/api/sync/overview?type=movie')->json();
        $this->assertSame($movieRun, $movies['last']['sync']['key']);
        $this->assertNull($movies['last']['episodes']);
        // მსახიობის გაშვება მოდულით არ იფილტრება; ისტორია მთლიანია
        $this->assertSame($castRun, $movies['last']['cast']['key']);
        $this->assertSame(5, $movies['runs']);

        // ჩაკეტილი ჩანაწერის ერთეული გაშვებას ამ მოდულის „ბოლოდ" აღარ აქცევს
        $this->lock($movie);
        $this->assertNull($this->getJson('/api/sync/overview?type=movie')->json('last.sync'));
    }

    public function test_a_card_is_absent_without_the_right_to_run_it(): void
    {
        $this->movie();
        Series::create(['user_id' => $this->alice->id, 'tmdb_id' => 1399]);

        // მხოლოდ ნახვის უფლება: მონაცემები და სეზონები რედაქტირებაა, მსახიობებს ნახვაც ჰყოფნის
        $role = Role::create(['key' => 'viewer', 'name_ka' => 'მკითხველი', 'name_en' => 'Viewer', 'permissions' => ['movie' => ['view'], 'series' => ['view']]]);
        $this->alice->forceFill(['role_id' => $role->id])->save();

        $pending = $this->actingAs($this->alice->refresh())->getJson('/api/sync/overview')->assertOk()->json('pending');
        $this->assertSame(['sync' => null, 'episodes' => null, 'cast' => 0], $pending);

        $this->app['auth']->forgetGuards();
        $this->getJson('/api/sync/overview')->assertUnauthorized();
    }
}
