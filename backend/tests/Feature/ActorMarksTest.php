<?php

namespace Tests\Feature;

use App\Models\ActorMark;
use App\Models\CastMember;
use App\Models\GalleryImage;
use App\Models\GalleryVideo;
use App\Models\Module;
use App\Models\Movie;
use App\Models\User;
use Carbon\Carbon;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **მსახიობზე ჩემი ნიშნები: რჩეული, გახსნების მთვლელი და მათზე აგებული რიგი.**
 *
 * ⚠️ მსახიობი გლობალურია — ყოველი ტესტი ამოწმებს, რომ ჩემი ნიშანი სხვის სიას არ ცვლის.
 */
class ActorMarksTest extends TestCase
{
    use RefreshDatabase;

    private User $me;

    private User $other;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->me = $this->makeUser('nino');
        $this->other = $this->makeUser('gio');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function makeUser(string $name): User
    {
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::whereIn('key', ['movie', 'series', 'anime', 'gallery'])->pluck('id')->all());

        return $user->refresh();
    }

    private function actor(string $name): CastMember
    {
        static $tmdb = 500;

        return CastMember::create(['name' => $name, 'tmdb_person_id' => ++$tmdb]);
    }

    private function movie(User $user, CastMember ...$cast): Movie
    {
        $movie = Movie::create(['user_id' => $user->id, 'year' => 2020]);
        foreach ($cast as $i => $member) {
            $movie->castLinks()->attach($member->id, ['billing_order' => $i]);
        }

        return $movie;
    }

    private function photo(CastMember $member, string $name, ?User $owner = null): GalleryImage
    {
        return GalleryImage::create([
            'user_id' => ($owner ?? $this->me)->id, 'imageable_type' => 'cast_member', 'imageable_id' => $member->id,
            'source' => 'web', 'category' => 'portrait', 'path' => "gallery/images/{$name}.jpg", 'size' => 1,
        ]);
    }

    private function video(CastMember $member): GalleryVideo
    {
        return GalleryVideo::create([
            'user_id' => $this->me->id, 'videoable_type' => 'cast_member', 'videoable_id' => $member->id,
            'url' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'title' => 'Interview',
        ]);
    }

    /** @return list<string> */
    private function names(string $query = '', ?User $as = null): array
    {
        return array_column($this->actingAs($as ?? $this->me)->getJson('/api/actors'.$query)->assertOk()->json('items'), 'name');
    }

    public function test_a_favourite_is_mine_and_always_comes_first(): void
    {
        $anna = $this->actor('Anna');
        $boris = $this->actor('Boris');
        $carl = $this->actor('Carl');
        $this->movie($this->me, $anna, $boris, $carl);
        $this->movie($this->other, $anna, $boris, $carl);

        $this->actingAs($this->me)
            ->putJson("/api/actors/{$carl->id}/favorite", ['favorite' => true])
            ->assertOk()
            ->assertJsonPath('favorite', true);

        // ნებისმიერ დალაგებაზე რჩეული თავშია
        foreach (['name', 'recent', 'records', 'popularity', 'media', 'opens'] as $sort) {
            $this->assertSame('Carl', $this->names("?sort={$sort}")[0], $sort);
        }
        $this->assertSame(['Carl', 'Anna', 'Boris'], $this->names('?sort=name'));
        $this->assertTrue($this->getJson('/api/actors?sort=name')->json('items.0.favorite'));
        $this->assertSame(['Carl'], $this->names('?favorite=1'));

        // სხვის სიაში არაფერი იცვლება
        $this->assertSame(['Anna', 'Boris', 'Carl'], $this->names('?sort=name', $this->other));
        $this->assertSame([], $this->names('?favorite=1', $this->other));

        $this->actingAs($this->me)->putJson("/api/actors/{$carl->id}/favorite", ['favorite' => false])->assertOk();
        $this->assertSame(['Anna', 'Boris', 'Carl'], $this->names('?sort=name'));
    }

    public function test_a_favourite_stays_in_the_list_without_any_record(): void
    {
        $loose = $this->actor('Loose');
        $this->assertSame([], $this->names());

        $this->actingAs($this->me)->putJson("/api/actors/{$loose->id}/favorite", ['favorite' => true])->assertOk();

        $this->assertSame(['Loose'], $this->names());
        $this->assertSame([], $this->names('', $this->other));
    }

    public function test_the_default_order_is_photos_and_videos_then_opens(): void
    {
        $few = $this->actor('Few');
        $many = $this->actor('Many');
        $opened = $this->actor('Opened');
        $none = $this->actor('None');
        $this->movie($this->me, $few, $many, $opened, $none);

        $this->photo($many, 'm1');
        $this->photo($many, 'm2');
        $this->video($many);
        $this->photo($few, 'f1');
        $this->photo($opened, 'o1');
        // სხვისი ფოტო ჩემს რიგს არ ცვლის
        $this->photo($none, 'x1', $this->other);
        $this->photo($none, 'x2', $this->other);
        $this->photo($none, 'x3', $this->other);
        $this->photo($none, 'x4', $this->other);

        $this->actingAs($this->me)->postJson("/api/actors/{$opened->id}/open")->assertOk()->assertJsonPath('counted', true);

        // 3 (ფოტო + ვიდეო) · 1 და გახსნილი · 1 · 0
        $this->assertSame(['Many', 'Opened', 'Few', 'None'], $this->names());
        $this->assertSame(['Opened', 'Few', 'Many', 'None'], $this->names('?sort=opens'));

        $card = collect($this->getJson('/api/actors')->json('items'))->firstWhere('name', 'Many');
        $this->assertSame(2, $card['photos']);
        $this->assertSame(1, $card['videos']);
        // გახსნების რიცხვი ბარათზე არ გამოდის
        $this->assertArrayNotHasKey('opens', $card);
    }

    public function test_an_open_counts_once_a_minute_and_shows_only_on_the_actor_page(): void
    {
        $actor = $this->actor('Liam Neeson');
        $this->movie($this->me, $actor);
        Carbon::setTestNow('2026-11-12 10:00:00');

        $this->actingAs($this->me)->postJson("/api/actors/{$actor->id}/open")->assertJsonPath('counted', true)->assertJsonPath('opens', 1);
        $this->postJson("/api/actors/{$actor->id}/open")->assertJsonPath('counted', false)->assertJsonPath('opens', 1);

        Carbon::setTestNow('2026-11-12 10:01:01');
        $this->postJson("/api/actors/{$actor->id}/open")->assertJsonPath('counted', true)->assertJsonPath('opens', 2);

        $this->getJson("/api/cast/{$actor->id}")
            ->assertOk()
            ->assertJsonPath('actor.opens', 2)
            ->assertJsonPath('actor.favorite', false);

        // სხვას თავისი მთვლელი აქვს
        $this->actingAs($this->other)->getJson("/api/cast/{$actor->id}")->assertJsonPath('actor.opens', 0);
    }

    public function test_opens_reset_for_one_actor_or_for_all_and_keep_the_favourite(): void
    {
        $a = $this->actor('Anna');
        $b = $this->actor('Boris');
        $this->movie($this->me, $a, $b);
        $this->movie($this->other, $a);

        $this->actingAs($this->other)->postJson("/api/actors/{$a->id}/open")->assertOk();
        $this->actingAs($this->me)->putJson("/api/actors/{$a->id}/favorite", ['favorite' => true])->assertOk();
        $this->postJson("/api/actors/{$a->id}/open")->assertOk();
        $this->postJson("/api/actors/{$b->id}/open")->assertOk();

        $this->deleteJson("/api/actors/{$a->id}/opens")->assertOk()->assertJsonPath('reset', 1);
        $this->getJson("/api/cast/{$a->id}")->assertJsonPath('actor.opens', 0)->assertJsonPath('actor.favorite', true);
        $this->getJson("/api/cast/{$b->id}")->assertJsonPath('actor.opens', 1);

        $this->deleteJson('/api/actors/opens')->assertOk()->assertJsonPath('reset', 1);
        $this->getJson("/api/cast/{$b->id}")->assertJsonPath('actor.opens', 0);

        // სხვისი მთვლელი ხელუხლებელია
        $this->assertSame(1, ActorMark::withoutGlobalScopes()->where('user_id', $this->other->id)->value('opens'));
    }

    public function test_the_gallery_view_lists_only_actors_with_media_and_brings_stack_thumbs(): void
    {
        $pictured = $this->actor('Pictured');
        $filmed = $this->actor('Filmed');
        $plain = $this->actor('Plain');
        $this->movie($this->me, $pictured, $filmed, $plain);

        $this->photo($pictured, 'p1');
        $this->photo($pictured, 'p2');
        $this->video($filmed);

        $items = $this->actingAs($this->me)->getJson('/api/actors?media=1&thumbs=1&sort=name')->assertOk()->json('items');

        $this->assertSame(['Filmed', 'Pictured'], array_column($items, 'name'));
        $this->assertSame([], $items[0]['thumbs']);
        $this->assertEqualsCanonicalizing(['gallery/images/p1.jpg', 'gallery/images/p2.jpg'], $items[1]['thumbs']);

        // ესკიზები მხოლოდ მოთხოვნით მოდის
        $this->assertArrayNotHasKey('thumbs', $this->getJson('/api/actors?media=1')->json('items.0'));
    }
}
