<?php

namespace Tests\Feature;

use App\Models\ApprovalRequest;
use App\Models\CastMember;
use App\Models\CastMemberTranslation;
use App\Models\Genre;
use App\Models\MediaWatch;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **საერთო ლექსიკონები და მოდულის ჯგუფის გარეთ დარჩენილი მარშრუტები.**
 *
 * ⚠️ ჟანრი და მსახიობი ყველა ანგარიშისთვის ერთია: ერთი ანგარიშის ცვლილება
 * ყველას ჩანაწერებზე ჩანს. წაშლა დაცული იყო (ადმინის მოთხოვნა), გადარქმევა და
 * მსახიობის ქართული ტექსტი — არა.
 *
 * ⚠️ ორი მარშრუტი (`POST /genres/{genre}/items`, `DELETE /media-watches/{id}`)
 * მოდულის ჯგუფის გარეთაა და არც მოდულს ამოწმებდა, არც უფლებას: მხოლოდ ნახვის
 * უფლების მქონე როლი თავის ჩანაწერებს ცვლიდა.
 */
class SharedDictionaryAccessTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->admin = $this->makeUser('root');
        $this->admin->assignRole('super_admin')->save();
        $this->admin->refresh();

        $this->user = $this->makeUser('nino');
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', ['movie', 'series', 'anime'])->pluck('id')->all());

        return $user->refresh();
    }

    /** როლი მხოლოდ ამ უფლებებით — მომხმარებელს ენიჭება */
    private function withRole(User $user, array $permissions): User
    {
        $key = 'role-'.md5(json_encode($permissions).$user->id);
        Role::create(['key' => $key, 'name_ka' => $key, 'name_en' => $key, 'permissions' => $permissions]);
        $user->assignRole($key)->save();

        return $user->refresh();
    }

    private function genre(string $en = 'Drama', ?string $ka = 'დრამა'): Genre
    {
        $genre = Genre::create(['slug' => strtolower($en)]);
        $genre->setTranslation('en', $en);
        $genre->setTranslation('ka', $ka);

        return $genre->refresh();
    }

    /* ---------- ჟანრი: შექმნა ღიაა, გადარქმევა — ადმინის მოთხოვნით ---------- */

    public function test_anyone_creates_a_genre_but_a_rename_goes_to_the_admin(): void
    {
        $this->actingAs($this->user)->postJson('/api/genres', ['name_en' => 'Noir', 'name_ka' => 'ნუარი'])->assertCreated();

        $genre = $this->genre();

        $this->actingAs($this->user)
            ->patchJson("/api/genres/{$genre->id}", ['name_en' => 'Hacked', 'name_ka' => 'გატეხილი'])
            ->assertStatus(202)
            ->assertJsonPath('message', 'approval_required')
            ->assertJsonPath('request.type', ApprovalRequest::TYPE_GENRE_RENAME);

        // სახელი ადგილზეა — ყველას ფილმებზე ის ჯერ არ შეცვლილა
        $this->assertSame(['Drama', 'დრამა'], [$genre->refresh()->name_en, $genre->name_ka]);

        $request = ApprovalRequest::where('type', ApprovalRequest::TYPE_GENRE_RENAME)->sole();
        $this->assertSame(['Hacked', 'გატეხილი', 'Drama', 'დრამა'], [
            $request->payload['name_en'], $request->payload['name_ka'], $request->payload['old_name_en'], $request->payload['old_name_ka'],
        ]);

        // იმავე ჟანრზე მეორე თხოვნა მომლოდინეს ანახლებს და არ მრავლდება
        $this->actingAs($this->user)->patchJson("/api/genres/{$genre->id}", ['name_en' => 'Melodrama', 'name_ka' => 'მელოდრამა'])->assertStatus(202);
        $this->assertSame(1, ApprovalRequest::where('type', ApprovalRequest::TYPE_GENRE_RENAME)->count());

        $this->actingAs($this->admin)->postJson("/api/admin/requests/{$request->id}/approve")->assertOk();

        $this->assertSame(['Melodrama', 'მელოდრამა'], [$genre->refresh()->name_en, $genre->name_ka]);
    }

    public function test_an_unchanged_name_makes_no_request_and_a_super_admin_renames_at_once(): void
    {
        $genre = $this->genre();

        $this->actingAs($this->user)
            ->patchJson("/api/genres/{$genre->id}", ['name_en' => 'Drama', 'name_ka' => 'დრამა'])
            ->assertOk()
            ->assertJsonPath('data.name_en', 'Drama');
        $this->assertSame(0, ApprovalRequest::count());

        $this->actingAs($this->admin)
            ->patchJson("/api/genres/{$genre->id}", ['name_en' => 'Tragedy', 'name_ka' => ''])
            ->assertOk()
            ->assertJsonPath('data.name_en', 'Tragedy');

        $this->assertSame(['Tragedy', null], [$genre->refresh()->name_en, $genre->name_ka]);
        $this->assertSame(0, ApprovalRequest::count());
    }

    /* ---------- მსახიობის გადასამოწმებელი ქართული ტექსტი ---------- */

    public function test_only_a_super_admin_or_the_creator_settles_an_actors_georgian_text(): void
    {
        $shared = CastMember::create(['tmdb_person_id' => 6384, 'name' => 'Keanu Reeves']);
        $shared->setGeorgian('name', 'კიანუ რივსი', CastMemberTranslation::SOURCE_TRANSLATION);

        $this->actingAs($this->user)->getJson("/api/cast/{$shared->id}")
            ->assertOk()
            ->assertJsonPath('actor.name_ka_unverified', true)
            ->assertJsonPath('actor.georgian_editable', false);

        $this->actingAs($this->user)
            ->patchJson("/api/cast/{$shared->id}/georgian", ['field' => 'name', 'text' => 'ჩემი ვერსია'])
            ->assertStatus(403)
            ->assertJsonPath('message', 'cast_text_admin_only');
        $this->assertSame('კიანუ რივსი', $shared->refresh()->name_ka);
        $this->assertTrue($shared->georgianUnverified('name'));

        $this->actingAs($this->admin)->getJson("/api/cast/{$shared->id}")->assertJsonPath('actor.georgian_editable', true);
        $this->actingAs($this->admin)
            ->patchJson("/api/cast/{$shared->id}/georgian", ['field' => 'name', 'text' => 'კიანუ რივზი'])
            ->assertOk()
            ->assertJsonPath('actor.name_ka_unverified', false);
        $this->assertSame('კიანუ რივზი', $shared->refresh()->name_ka);

        // ხელით შექმნილი მსახიობი შემქმნელისაა — ის თავის ტექსტს თვითონ ადასტურებს
        $own = new CastMember;
        $own->forceFill(['name' => 'Local Actor', 'created_by' => $this->user->id])->save();
        $own->setGeorgian('name', 'ადგილობრივი', CastMemberTranslation::SOURCE_TRANSLATION);

        $this->actingAs($this->user)
            ->patchJson("/api/cast/{$own->id}/georgian", ['field' => 'name'])
            ->assertOk()
            ->assertJsonPath('actor.name_ka_unverified', false);
    }

    /* ---------- მოდულის ჯგუფის გარეთ დარჩენილი ორი მარშრუტი ---------- */

    public function test_changing_genre_links_needs_the_modules_update_permission(): void
    {
        $viewer = $this->withRole($this->makeUser('viewer'), ['movie' => ['view']]);
        $genre = $this->genre();
        $movie = Movie::create(['user_id' => $viewer->id, 'year' => 1999]);

        $this->actingAs($viewer)
            ->postJson("/api/genres/{$genre->id}/items", ['type' => 'movie', 'action' => 'attach', 'ids' => [$movie->id]])
            ->assertStatus(403)
            ->assertJsonPath('message', 'forbidden_permission')
            ->assertJsonPath('permission', 'movie.update');
        $this->assertSame(0, $movie->genres()->count());

        // ჩაურთველი მოდული — ცალკე პასუხი
        $viewer->modules()->detach(Module::where('key', 'series')->value('id'));
        $this->actingAs($viewer->refresh())
            ->postJson("/api/genres/{$genre->id}/items", ['type' => 'series', 'action' => 'attach', 'ids' => [1]])
            ->assertStatus(403)
            ->assertJsonPath('message', 'module_not_enabled');

        $editor = $this->withRole($this->makeUser('editor'), ['movie' => ['view', 'update']]);
        $mine = Movie::create(['user_id' => $editor->id, 'year' => 2001]);

        $this->actingAs($editor)
            ->postJson("/api/genres/{$genre->id}/items", ['type' => 'movie', 'action' => 'attach', 'ids' => [$mine->id]])
            ->assertOk()
            ->assertJsonPath('affected', 1);
    }

    public function test_deleting_a_watch_needs_the_update_permission_of_its_module(): void
    {
        $viewer = $this->withRole($this->makeUser('viewer'), ['movie' => ['view']]);
        $this->actingAs($viewer);
        $movie = Movie::create(['user_id' => $viewer->id, 'year' => 1999]);
        $watch = $movie->logWatch(now()->subDay());

        $this->deleteJson("/api/media-watches/{$watch->id}")
            ->assertStatus(403)
            ->assertJsonPath('message', 'forbidden_permission')
            ->assertJsonPath('permission', 'movie.update');
        $this->assertNull(MediaWatch::withoutGlobalScopes()->findOrFail($watch->id)->trashed_at);

        $editor = $this->withRole($this->makeUser('editor'), ['movie' => ['view', 'update']]);
        $this->actingAs($editor);
        $mine = Movie::create(['user_id' => $editor->id, 'year' => 2001]);
        $mineWatch = $mine->logWatch(now()->subDay());

        $this->deleteJson("/api/media-watches/{$mineWatch->id}")->assertNoContent();
        $this->assertNotNull(MediaWatch::withoutGlobalScopes()->findOrFail($mineWatch->id)->trashed_at);
    }

    /* ---------- საკუთარი მოთხოვნის დამტკიცება ---------- */

    public function test_nobody_but_a_super_admin_approves_their_own_request(): void
    {
        $reviewer = $this->withRole($this->makeUser('reviewer'), ['admin:requests' => ['view', 'update']]);
        $genre = $this->genre();

        $own = ApprovalRequest::create([
            'user_id' => $reviewer->id, 'type' => ApprovalRequest::TYPE_GENRE_RENAME, 'genre_id' => $genre->id,
            'status' => 'pending', 'payload' => ['name_en' => 'Mine', 'name_ka' => 'ჩემი'],
        ]);

        $this->actingAs($reviewer)
            ->postJson("/api/admin/requests/{$own->id}/approve")
            ->assertStatus(403)
            ->assertJsonPath('message', 'own_request');
        $this->assertSame('pending', $own->refresh()->status);
        $this->assertSame('Drama', $genre->refresh()->name_en);

        // სხვისი მოთხოვნა — ჩვეულებრივ მტკიცდება
        $theirs = ApprovalRequest::create([
            'user_id' => $this->user->id, 'type' => ApprovalRequest::TYPE_GENRE_RENAME, 'genre_id' => $genre->id,
            'status' => 'pending', 'payload' => ['name_en' => 'Theirs', 'name_ka' => 'მათი'],
        ]);
        $this->actingAs($reviewer)->postJson("/api/admin/requests/{$theirs->id}/approve")->assertOk();
        $this->assertSame('Theirs', $genre->refresh()->name_en);

        // საკუთარი თხოვნის უარყოფა ღიაა; `super_admin` საკუთარსაც ამტკიცებს
        $this->actingAs($reviewer)->postJson("/api/admin/requests/{$own->id}/reject")->assertOk();

        $adminsOwn = ApprovalRequest::create([
            'user_id' => $this->admin->id, 'type' => ApprovalRequest::TYPE_GENRE_RENAME, 'genre_id' => $genre->id,
            'status' => 'pending', 'payload' => ['name_en' => 'Final', 'name_ka' => 'ბოლო'],
        ]);
        $this->actingAs($this->admin)->postJson("/api/admin/requests/{$adminsOwn->id}/approve")->assertOk();
        $this->assertSame('Final', $genre->refresh()->name_en);
    }
}
