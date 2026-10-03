<?php

namespace Tests\Feature;

use App\Models\CastMember;
use App\Models\CastMemberSyncPref;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use App\Support\SyncOutcome;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * **გეგმა: დამუშავებულების დამალვა და „აღარ განაახლო"** (Tasks §31.2/§31.3/§31.6).
 *
 * ⚠️ „დამუშავებული" = `last_synced_at` არის **და** შედეგი `updated|unchanged`;
 * ცარიელი და ჩავარდნილი კვლავ შემოთავაზებაა. შეჩერებული ჩანაწერი არცერთ
 * გეგმაში არ ზის (სინქრონი, თარგმანი, გალერეა), მსახიობი — თითო მომხმარებლის
 * პარამეტრით.
 */
class MediaSyncPlanTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        Http::fake(['*' => fn () => Http::response([], 200)]);

        $this->user = User::create(['name' => 'plan', 'username' => 'plan', 'email' => 'plan@example.com', 'password' => 'password']);
        $this->user->modules()->sync(Module::whereIn('key', ['movie', 'gallery'])->pluck('id')->all());
        $this->user->refresh();
        $this->giveCredential($this->user, 'tmdb');
        $this->actingAs($this->user);
    }

    private function movie(string $title, array $extra = []): Movie
    {
        $movie = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 600 + Movie::count(), ...$extra]);
        $movie->setTranslation('en', ['title' => $title]);

        return $movie->refresh();
    }

    private function stamped(string $title, string $result, array $extra = []): Movie
    {
        return $this->movie($title, ['last_synced_at' => now(), 'last_sync_result' => $result, ...$extra]);
    }

    private function ids(array $items): array
    {
        return collect($items)->pluck('id')->sort()->values()->all();
    }

    public function test_hiding_the_processed_keeps_the_empty_and_the_failed(): void
    {
        $fresh = $this->movie('Fresh');
        $updated = $this->stamped('Updated', SyncOutcome::UPDATED);
        $unchanged = $this->stamped('Unchanged', SyncOutcome::UNCHANGED);
        $empty = $this->stamped('Empty', SyncOutcome::EMPTY);
        $failed = $this->stamped('Failed', SyncOutcome::FAILED);

        $hidden = $this->postJson('/api/media/sync/plan', ['types' => ['movie'], 'hide_processed' => true])->assertOk()->json();
        $this->assertSame($this->ids([$fresh, $empty, $failed]), $this->ids($hidden['items']));
        $this->assertSame(2, $hidden['skipped_processed']);

        $all = $this->postJson('/api/media/sync/plan', ['types' => ['movie'], 'hide_processed' => false])->assertOk()->json();
        $this->assertSame($this->ids([$fresh, $updated, $unchanged, $empty, $failed]), $this->ids($all['items']));
        $this->assertSame(0, $all['skipped_processed']);
    }

    public function test_a_paused_record_never_enters_the_sync_plan(): void
    {
        $this->movie('Active');
        $paused = $this->movie('Paused', ['sync_paused' => true]);

        $plan = $this->postJson('/api/media/sync/plan', ['types' => ['movie']])->assertOk()->json();

        $this->assertCount(1, $plan['items']);
        $this->assertNotContains($paused->id, $this->ids($plan['items']));
        $this->assertSame(1, $plan['skipped_paused']);
    }

    public function test_the_pause_switch_is_written_through_its_own_endpoint(): void
    {
        $movie = $this->movie('Switch');

        $this->patchJson("/api/media/sync/movie/{$movie->id}/pause", ['paused' => true])
            ->assertOk()
            ->assertJsonPath('sync_paused', true);
        $this->assertTrue($movie->refresh()->sync_paused);

        $this->getJson("/api/movies/{$movie->id}")->assertOk()->assertJsonPath('data.sync_paused', true);

        $this->patchJson("/api/media/sync/movie/{$movie->id}/pause", ['paused' => false])->assertOk()->assertJsonPath('sync_paused', false);
        $this->assertFalse($movie->refresh()->sync_paused);

        $this->patchJson("/api/media/sync/movie/{$movie->id}/pause", [])->assertStatus(422);
    }

    public function test_another_users_record_cannot_be_paused(): void
    {
        $other = User::create(['name' => 'o', 'username' => 'o', 'email' => 'o@example.com', 'password' => 'password']);
        $movie = Movie::create(['user_id' => $other->id, 'tmdb_id' => 1]);

        $this->patchJson("/api/media/sync/movie/{$movie->id}/pause", ['paused' => true])->assertNotFound();
    }

    public function test_the_translation_and_gallery_plans_respect_the_pause(): void
    {
        // თარგმანის გეგმა: ორივეს აკლია ქართული სათაური, ერთი შეჩერებულია
        $gap = $this->movie('Needs KA');
        $this->movie('Paused KA', ['sync_paused' => true]);

        $plan = $this->postJson('/api/translations/plan', ['types' => ['movie']])->assertOk()->json();
        $this->assertSame([$gap->id], $this->ids($plan['items']));

        $gallery = $this->postJson('/api/gallery/plan', ['types' => ['movie']])->assertOk()->json();
        $this->assertSame([$gap->id], $this->ids($gallery['items']));
    }

    public function test_the_translation_plan_hides_the_processed_too(): void
    {
        $fresh = $this->movie('Fresh');
        $this->movie('Translated', ['last_translated_at' => now(), 'last_translate_result' => SyncOutcome::UPDATED]);
        $empty = $this->movie('Empty', ['last_translated_at' => now(), 'last_translate_result' => SyncOutcome::EMPTY]);

        $hidden = $this->postJson('/api/translations/plan', ['types' => ['movie'], 'hide_processed' => true])->assertOk()->json();
        $this->assertSame($this->ids([$fresh, $empty]), $this->ids($hidden['items']));

        $all = $this->postJson('/api/translations/plan', ['types' => ['movie']])->assertOk()->json();
        $this->assertCount(3, $all['items']);
    }

    /** მსახიობი გლობალურია — „აღარ განაახლო" **ჩემი** პარამეტრია და სხვის გეგმას არ ეხება */
    public function test_a_paused_actor_leaves_only_my_cast_plan(): void
    {
        $movie = $this->movie('With cast');
        $anna = CastMember::create(['name' => 'Anna', 'tmdb_person_id' => 11]);
        $bob = CastMember::create(['name' => 'Bob', 'tmdb_person_id' => 12]);
        $movie->cast()->attach([$anna->id => ['character' => 'a', 'billing_order' => 0], $bob->id => ['character' => 'b', 'billing_order' => 1]]);

        $this->patchJson("/api/cast/sync/{$anna->id}/pause", ['paused' => true])->assertOk()->assertJsonPath('paused', true);
        $this->assertSame(1, CastMemberSyncPref::withoutGlobalScopes()->count());

        $plan = $this->postJson('/api/cast/sync/plan', ['types' => ['movie'], 'scope' => 'all'])->assertOk()->json();
        $this->assertSame([$bob->id], $this->ids($plan['items']));
        $this->assertSame(1, $plan['skipped_paused']);

        // სხვა მომხმარებლის გეგმაში ანა ისევ ზის — პარამეტრი ჩემია
        $other = User::create(['name' => 'o', 'username' => 'o', 'email' => 'o@example.com', 'password' => 'password']);
        $other->modules()->sync(Module::where('key', 'movie')->pluck('id')->all());
        $theirs = Movie::create(['user_id' => $other->id, 'tmdb_id' => 2]);
        $theirs->cast()->attach([$anna->id => ['character' => 'a', 'billing_order' => 0]]);
        $this->giveCredential($other, 'tmdb');

        $plan = $this->actingAs($other->refresh())->postJson('/api/cast/sync/plan', ['types' => ['movie'], 'scope' => 'all'])->assertOk()->json();
        $this->assertSame([$anna->id], $this->ids($plan['items']));

        // მოხსნა რიგს შლის
        $this->actingAs($this->user)->patchJson("/api/cast/sync/{$anna->id}/pause", ['paused' => false])->assertOk()->assertJsonPath('paused', false);
        $this->assertSame(0, CastMemberSyncPref::withoutGlobalScopes()->count());
    }
}
