<?php

namespace Tests\Feature;

use App\Models\CastMember;
use App\Models\GalleryImage;
use App\Models\Module;
use App\Models\Movie;
use App\Models\TrashEntry;
use App\Models\User;
use App\Support\CastMemberTrash;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * **ხელით შექმნილი მსახიობის წაშლა ურნაში.**
 *
 * ⚠️ მოწმდება: მხოლოდ შემქმნელი და მხოლოდ კერძოზე (TMDB-ის — 403, სხვისი —
 * 404); მსახიობი, მისი ბმულები ჩანაწერებზე და ფოტოები **ერთად ქრება** (სია,
 * გვერდი, ჩანაწერის მსახიობები, გალერეა) და ურნაში **ერთ ელემენტად** ჩანს;
 * აღდგენა სამივეს აბრუნებს (ცალკე წაშლილი ფოტო კი ურნაში რჩება); საბოლოო
 * წაშლა და ვადის გასვლა ყველაფერს შლის — ფაილებსაც და კვოტასაც ათავისუფლებს.
 */
class CastTrashTest extends TestCase
{
    use RefreshDatabase;

    private User $nino;

    private User $gio;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);
        Storage::fake('public');

        $this->nino = $this->makeUser('nino');
        $this->gio = $this->makeUser('gio');
    }

    public function test_only_the_creator_trashes_a_hand_made_actor(): void
    {
        $tmdb = CastMember::create(['tmdb_person_id' => 6384, 'name' => 'Keanu Reeves']);
        $mine = $this->manual();

        $this->actingAs($this->nino)->deleteJson("/api/cast/{$tmdb->id}")
            ->assertForbidden()
            ->assertJsonPath('message', 'cast_member_readonly');

        $this->actingAs($this->gio)->deleteJson("/api/cast/{$mine->id}")->assertNotFound();

        $this->movieWith($mine);
        $this->photoOf($mine);

        $this->actingAs($this->nino)->deleteJson("/api/cast/{$mine->id}")
            ->assertOk()
            ->assertJson(['trashed' => true, 'links' => 1, 'photos' => 1]);
    }

    public function test_the_actor_its_links_and_photos_disappear_together_into_one_trash_item(): void
    {
        $member = $this->manual();
        $movie = $this->movieWith($member);
        $photo = $this->photoOf($member);
        $used = (int) $this->nino->fresh()->storage_used_bytes;

        // წაშლამდე — ყველგან ჩანს (ქვემოთ „აღარ ჩანს" ცარიელ შედეგს არ ამოწმებს)
        $this->actingAs($this->nino);
        $this->assertContains($member->id, array_column($this->getJson('/api/actors')->json('items'), 'id'));
        $this->assertContains($photo->id, array_column($this->getJson('/api/gallery/photos')->json('data'), 'id'));
        $this->assertCount(1, $this->getJson("/api/media/cast/movie/{$movie->id}")->json('data'));

        $this->deleteJson("/api/cast/{$member->id}")->assertOk();

        // სია, გვერდი, ჩანაწერის მსახიობები, გალერეა — ყველგან ქრება
        $this->assertNotContains($member->id, array_column($this->getJson('/api/actors')->assertOk()->json('items'), 'id'));
        $this->getJson("/api/cast/{$member->id}")->assertNotFound();
        $this->assertSame([], $this->getJson("/api/media/cast/movie/{$movie->id}")->assertOk()->json('data'));
        $this->assertNotContains($photo->id, array_column($this->getJson('/api/gallery/photos')->assertOk()->json('data'), 'id'));

        // ბმული და ფაილები ადგილზეა — ერთად დაბრუნდება
        $this->assertSame(1, DB::table('castables')->where('cast_member_id', $member->id)->count());
        Storage::disk('public')->assertExists($member->photo_path);
        $this->assertSame($used, (int) $this->nino->fresh()->storage_used_bytes);

        // ურნაში — ერთი ელემენტი; ფოტო ცალკე არ ჩანს, ზომაში კი ითვლება
        $groups = collect($this->getJson('/api/trash')->assertOk()->json('data'))->keyBy('kind');
        $this->assertArrayNotHasKey('gallery_image', $groups->all());
        $item = $groups[CastMemberTrash::KIND]['items'][0];
        $this->assertContains($item['title'], ['ნინო ქასრაძე', 'Nino Kasradze']);
        $this->assertSame(1, $item['count']);
        $this->assertTrue($item['restorable']);
        $this->assertGreaterThan(0, $item['size']);
    }

    public function test_restoring_brings_the_actor_back_with_its_links_and_photos(): void
    {
        $member = $this->manual();
        $movie = $this->movieWith($member);
        $photo = $this->photoOf($member);
        $earlier = $this->photoOf($member, 'earlier.png');

        // ⚠️ ცალკე, ადრე წაშლილი ფოტო თავის ელემენტად რჩება
        $this->actingAs($this->nino);
        $earlier->moveToTrash();

        $this->deleteJson("/api/cast/{$member->id}")->assertOk();
        $entry = TrashEntry::where('kind', CastMemberTrash::KIND)->firstOrFail();

        $this->postJson("/api/trash/cast_member/{$entry->id}/restore")->assertOk();

        $this->assertContains($member->id, array_column($this->getJson('/api/actors')->json('items'), 'id'));
        $this->assertSame([['Nino Kasradze', 'Rose']], collect($this->getJson("/api/media/cast/movie/{$movie->id}")->json('data'))
            ->map(fn (array $c) => [$c['name'], $c['character']])->all());
        $this->assertNull($photo->fresh()->trashed_at);
        $this->assertNotNull(GalleryImage::withoutGlobalScopes()->find($earlier->id)->trashed_at);
        $this->assertNull(TrashEntry::find($entry->id));
    }

    public function test_deleting_for_good_removes_everything_and_frees_the_quota(): void
    {
        $member = $this->manual();
        $this->movieWith($member);
        $photo = $this->photoOf($member);
        $photoPath = $member->photo_path;

        $this->actingAs($this->nino)->deleteJson("/api/cast/{$member->id}")->assertOk();
        $entry = TrashEntry::where('kind', CastMemberTrash::KIND)->firstOrFail();

        $this->deleteJson("/api/trash/cast_member/{$entry->id}")->assertSuccessful();

        $this->assertNull(CastMember::withoutGlobalScopes()->find($member->id));
        $this->assertSame(0, DB::table('castables')->where('cast_member_id', $member->id)->count());
        $this->assertNull(GalleryImage::withoutGlobalScopes()->find($photo->id));
        Storage::disk('public')->assertMissing($photoPath);
        Storage::disk('public')->assertMissing($photo->path);
        $this->assertSame(0, (int) $this->nino->fresh()->storage_used_bytes);
    }

    public function test_an_expired_actor_is_pruned_with_everything(): void
    {
        $member = $this->manual();
        $this->photoOf($member);

        $this->actingAs($this->nino)->deleteJson("/api/cast/{$member->id}")->assertOk();

        $this->travel(40)->days();
        $this->artisan('trash:prune', ['--days' => 30, '--force' => true])->assertSuccessful();

        $this->assertNull(CastMember::withoutGlobalScopes()->find($member->id));
        $this->assertSame(0, TrashEntry::where('kind', CastMemberTrash::KIND)->count());
        $this->assertSame(0, (int) $this->nino->fresh()->storage_used_bytes);
    }

    /* ---------- დამხმარეები ---------- */

    private function makeUser(string $name): User
    {
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::whereIn('key', ['movie', 'series', 'anime', 'gallery'])->pluck('id')->all());

        return $user->refresh();
    }

    /** ხელით შექმნილი, ფოტოთი — ნინოს კვოტაში */
    private function manual(): CastMember
    {
        $id = $this->actingAs($this->nino)
            ->post('/api/cast', [
                'name' => 'Nino Kasradze',
                'name_ka' => 'ნინო ქასრაძე',
                'photo' => UploadedFile::fake()->image('nino.jpg', 30, 45),
            ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->json('actor.id');

        return CastMember::withoutGlobalScopes()->findOrFail($id);
    }

    private function movieWith(CastMember $member): Movie
    {
        $movie = Movie::create(['user_id' => $this->nino->id, 'year' => 2010]);
        $movie->setTranslation('en', ['title' => 'Street Days']);
        $movie->castLinks()->attach($member->id, [
            'character' => 'Rose', 'billing_order' => 0, 'is_manual' => true, 'is_hidden' => false, 'is_removed' => false, 'is_edited' => false,
        ]);

        return $movie;
    }

    /** ჩემი ფოტო მსახიობზე — გალერეაში, კვოტით */
    private function photoOf(CastMember $member, string $name = 'still.png'): GalleryImage
    {
        $path = "gallery/images/{$member->id}-{$name}";
        Storage::disk('public')->put($path, str_repeat('x', 100));
        $this->nino->forceFill(['storage_used_bytes' => (int) $this->nino->fresh()->storage_used_bytes + 100])->save();

        return GalleryImage::withoutGlobalScopes()->create([
            'user_id' => $this->nino->id,
            'imageable_type' => 'cast_member',
            'imageable_id' => $member->id,
            'source' => 'upload',
            'category' => 'actor',
            'path' => $path,
            'size' => 100,
        ]);
    }
}
