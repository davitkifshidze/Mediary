<?php

namespace Tests\Feature;

use App\Models\Anime;
use App\Models\BatchItem;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Role;
use App\Models\Series;
use App\Models\User;
use App\Services\Episodes\EpisodeSync;
use App\Support\BackgroundProcess;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * **„სეზონები და სერიები — ყველა სერიალზე".**
 *
 * ⚠️ მოწმდება: გეგმა ნაგულისხმევად მხოლოდ დაუსრულებელ სერიალებს იღებს (`all` — ყველას),
 * TMDB id-ის გარეშე, „აღარ განაახლო" და სხვისი ჩანაწერი მასში არ ხვდება; გაშვება ფონური
 * პარტიაა, სადაც ერთი სერიალის ჩავარდნა დანარჩენს არ აჩერებს და მიზეზი თავის რიგზე წერია;
 * შეწყვეტილი გაშვება გრძელდება — უკვე ჩამოტვირთული გეგმაში აღარ ბრუნდება.
 */
class EpisodeBatchTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('nino');
        $this->giveCredential($this->user, 'tmdb');

        // ნამდვილი პროცესი ტესტში არ ეშვება; job რიგში წერია და worker-ს ელოდება
        $this->app->bind(BackgroundProcess::class, fn () => new class extends BackgroundProcess
        {
            public function __construct() {}

            public function dispatch(array $command): bool
            {
                return true;
            }
        });
        config(['queue.default' => 'database']);
    }

    private function makeUser(string $name): User
    {
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::whereIn('key', ['movie', 'series', 'anime'])->pluck('id')->all());

        return $user->refresh();
    }

    private function series(string $title, array $extra = [], ?User $owner = null): Series
    {
        $series = Series::create(['user_id' => ($owner ?? $this->user)->id, 'tmdb_id' => random_int(1000, 999999), 'year' => 2020, ...$extra]);
        $series->setTranslation('en', ['title' => $title]);

        return $series->refresh();
    }

    /** @return array<string, mixed> */
    private function plan(string $query = ''): array
    {
        return $this->actingAs($this->user)->getJson("/api/media/episodes/series/plan{$query}")->assertOk()->json();
    }

    private function runWorker(): void
    {
        Artisan::call('queue:work', ['--stop-when-empty' => true, '--max-time' => 20, '--tries' => 1, '--memory' => 0]);
    }

    public function test_the_plan_takes_unfinished_series_by_default_and_everything_on_request(): void
    {
        $this->series('Returning', ['tmdb_status' => 'Returning Series']);
        $this->series('Unknown');
        $this->series('Ended', ['tmdb_status' => 'Ended']);
        $this->series('Canceled', ['tmdb_status' => 'Canceled']);
        // გეგმაში არასდროს: TMDB id-ის გარეშე, „აღარ განაახლო", სხვისი
        $this->series('Manual', ['tmdb_id' => null]);
        $this->series('Paused', ['sync_paused' => true]);
        $this->series('Theirs', [], $this->makeUser('dato'));

        $open = $this->plan();
        $this->assertSame(['Returning', 'Unknown'], array_column($open['items'], 'title'));
        $this->assertSame(['total' => 4, 'ended' => 2, 'in_scope' => 2, 'fresh' => 0], array_intersect_key($open, array_flip(['total', 'ended', 'in_scope', 'fresh'])));
        $this->assertSame('series', $open['items'][0]['type']);

        $all = $this->plan('?all=1');
        $this->assertSame(['Returning', 'Unknown', 'Ended', 'Canceled'], array_column($all['items'], 'title'));
        $this->assertSame(4, $all['in_scope']);

        // ანიმეს თავისი გეგმა აქვს; ფილმს სეზონი არ აქვს
        Anime::create(['user_id' => $this->user->id, 'tmdb_id' => 31910, 'year' => 2009]);
        $this->assertCount(1, $this->actingAs($this->user)->getJson('/api/media/episodes/anime/plan')->json('items'));
        $this->actingAs($this->user)->getJson('/api/media/episodes/movie/plan')->assertStatus(404);
    }

    public function test_one_failing_series_does_not_stop_the_rest_and_says_why(): void
    {
        $good = $this->series('Good');
        $bad = $this->series('Bad');
        $last = $this->series('Last');

        $this->mock(EpisodeSync::class, function ($mock) use ($bad) {
            $mock->shouldReceive('sync')->andReturnUsing(function ($record) use ($bad) {
                if ((int) $record->id === (int) $bad->id) {
                    return ['ok' => false, 'seasons' => 0, 'episodes' => 0, 'error' => 'tmdb_unavailable'];
                }

                $record->forceFill(['episodes_synced_at' => now()])->saveQuietly();

                return ['ok' => true, 'seasons' => 2, 'episodes' => 20, 'error' => null];
            });
        });

        $id = $this->actingAs($this->user)->postJson('/api/batches', [
            'kind' => 'episodes',
            'items' => $this->plan()['items'],
            'options' => ['delay_ms' => 0],
        ])->assertStatus(202)->json('id');

        $this->runWorker();

        $status = $this->actingAs($this->user)->getJson("/api/batches/{$id}")->assertOk();
        $status->assertJsonPath('total', 3)->assertJsonPath('failed', 1)->assertJsonPath('finished', true);

        $items = collect($status->json('items'))->keyBy('id');
        $this->assertSame(BatchItem::OK, $items[$good->id]['status']);
        $this->assertSame(BatchItem::OK, $items[$last->id]['status']);
        $this->assertSame(BatchItem::FAILED, $items[$bad->id]['status']);
        $this->assertSame('tmdb_unavailable', $items[$bad->id]['error']);
        $this->assertSame('Bad', $items[$bad->id]['title']);
    }

    /** შეწყვეტილი გაშვება გრძელდება: რაც უკვე ჩამოიტვირთა, გეგმაში აღარ ბრუნდება */
    public function test_an_interrupted_run_continues_where_it_stopped(): void
    {
        $done = $this->series('Done');
        $this->series('Waiting');
        $old = $this->series('Long ago');

        $done->forceFill(['episodes_synced_at' => now()->subHour()])->saveQuietly();
        $old->forceFill(['episodes_synced_at' => now()->subDays(3)])->saveQuietly();

        $plan = $this->plan();
        $this->assertSame(['Waiting', 'Long ago'], array_column($plan['items'], 'title'));
        $this->assertSame(1, $plan['fresh']);
        $this->assertSame(3, $plan['in_scope']);

        // „მაინც ყველა" — უკვე განახლებულიც თავიდან
        $this->assertCount(3, $this->plan('?force=1')['items']);
    }

    public function test_an_episodes_batch_takes_series_and_anime_only(): void
    {
        $movie = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 603]);

        $this->actingAs($this->user)->postJson('/api/batches', [
            'kind' => 'episodes',
            'items' => [['type' => 'movie', 'id' => $movie->id]],
        ])->assertStatus(422);
    }

    /** გაშვება ჩანაწერს ცვლის — მხოლოდ-ნახვის როლი გეგმასაც ვერ იღებს */
    public function test_a_view_only_role_gets_no_plan(): void
    {
        Role::create(['key' => 'viewer', 'name_ka' => 'მნახველი', 'name_en' => 'Viewer', 'permissions' => ['series' => ['view']]]);
        $this->user->assignRole('viewer')->save();

        $this->actingAs($this->user->refresh())->getJson('/api/media/episodes/series/plan')->assertForbidden();
    }

    public function test_a_real_sync_stamps_the_record(): void
    {
        $series = $this->series('Stamped', ['tmdb_id' => 1396]);

        Http::fake([
            'api.themoviedb.org/3/tv/1396/season/1*' => Http::response([
                'episodes' => [['episode_number' => 1, 'name' => 'Pilot', 'air_date' => '2008-01-20', 'runtime' => 58]],
            ]),
            'api.themoviedb.org/3/tv/1396*' => Http::response(['id' => 1396, 'seasons' => [['season_number' => 1]]]),
        ]);

        $this->actingAs($this->user)->postJson("/api/media/episodes/series/{$series->id}")->assertOk();

        $this->assertNotNull($series->refresh()->episodes_synced_at);
        $this->assertSame([], $this->plan()['items']);
    }
}
