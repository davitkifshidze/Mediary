<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Song;
use App\Models\User;
use App\Models\Video;
use App\Models\VideoType;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **ლექსიკონის ერთეულის წაშლა ჩანაწერებით (ეტაპი 8).**
 *
 * რვავე ლექსიკონი (`DictionaryRecords`) ერთ წესს მიჰყვება; აქ ორი ფორმაა
 * დატესტილი, რადგან ისინი **სხვადასხვა გზით** პოულობენ ჩანაწერებს:
 *  · ერთი სვეტი (`videos.type_id`) — ტიპი, წიგნისა და ბორდგეიმის ჟანრი, კატეგორიები;
 *  · pivot (`song_genre_song`) — სიმღერისა და თამაშის ჟანრი.
 * სტატუსის ვარიანტი `StatusDictionaryTest`-შია.
 */
class DictionaryDeletionTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = User::create([
            'name' => 'dato',
            'username' => 'dato',
            'email' => 'dato@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::pluck('id')->all());
        $this->user->refresh();
    }

    /** ⚠️ `deleted` ივენთი ისვრის — ე.ი. ფაილი და კვოტა მოდელის hook-ში თავისუფლდება */
    public function test_deleting_a_video_type_can_delete_its_videos(): void
    {
        $this->actingAs($this->user);

        [$first, $second] = collect($this->getJson('/api/video-types')->json('data'))->pluck('id')->all();

        $gone = Video::create(['title' => 'a', 'url' => 'https://youtu.be/aaaaaaaaaaa', 'type_id' => $first]);
        $kept = Video::create(['title' => 'b', 'url' => 'https://youtu.be/bbbbbbbbbbb', 'type_id' => $second]);

        $fired = 0;
        Video::deleted(function () use (&$fired) {
            $fired++;
        });

        $this->deleteJson("/api/video-types/{$first}", ['delete_records' => true])
            ->assertOk()
            ->assertJsonPath('deleted', 1)
            ->assertJsonPath('moved', 0);

        $this->assertSame(1, $fired);
        $this->assertNull(Video::find($gone->id));
        $this->assertNotNull(Video::find($kept->id));
        $this->assertNull(VideoType::find($first));
    }

    /** ⚠️ წაშლის ორ ბრძანება ერთად — 422, და ტიპიც ადგილზე რჩება */
    public function test_move_to_and_delete_records_together_are_rejected(): void
    {
        $this->actingAs($this->user);

        [$first, $second] = collect($this->getJson('/api/video-types')->json('data'))->pluck('id')->all();

        $this->deleteJson("/api/video-types/{$first}", ['move_to' => $second, 'delete_records' => true])
            ->assertStatus(422)
            ->assertJsonValidationErrors('move_to');

        $this->assertNotNull(VideoType::find($first));
    }

    /**
     * ⚠️ **pivot-ზე „ამ ჟანრის სიმღერა" ისიცაა, რომელსაც სხვა ჟანრიც აქვს** —
     * და ის **იშლება**. ეს დიალოგში ცხადად წერია; აქ ფიქსირდება, რომ რიცხვი,
     * რომელიც UI-ში ჩანს (`songs_count`), და წაშლილი ერთი და იგივეა.
     */
    public function test_deleting_a_song_genre_deletes_every_song_that_has_it(): void
    {
        $this->actingAs($this->user);

        [$rock, $jazz] = collect($this->getJson('/api/song-genres')->json('data'))->pluck('id')->all();

        $both = $this->postJson('/api/songs', [
            'title' => 'Both',
            'url' => 'https://youtu.be/aaaaaaaaaaa',
            'genre_ids' => [$rock, $jazz],
            'autofill' => 0,
        ])->json('data.id');

        $jazzOnly = $this->postJson('/api/songs', [
            'title' => 'Jazz',
            'url' => 'https://youtu.be/bbbbbbbbbbb',
            'genre_ids' => [$jazz],
            'autofill' => 0,
        ])->json('data.id');

        $this->deleteJson("/api/song-genres/{$rock}", ['delete_records' => true])
            ->assertOk()
            ->assertJsonPath('deleted', 1);

        $this->assertNull(Song::find($both));
        $this->assertNotNull(Song::find($jazzOnly));
    }
}
