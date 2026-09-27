<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\CastMember;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Role;
use App\Models\User;
use App\Support\CastSync;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * **ჩანაწერის მსახიობები — დამალვა, წაშლა, გადალაგება (Tasks §16).**
 *
 * ⚠️ ამ ფაილის თითქმის ყველა ტესტი **სინქრონიზაციას** უშვებს, და ეს შემთხვევითი
 * არ არის: სამივე მოქმედება UI-ში აქამდეც შეიძლებოდა აშენებულიყო, მაგრამ
 * `CastSync::fromSource()` TMDB-ის სიას თავიდან წერდა — წაშლილი მსახიობი
 * უკან ბრუნდებოდა, ხელით შეცვლილ როლს TMDB-ის როლი ეწერებოდა. HTTP-ის
 * ტესტი სინქრონიზაციის გარეშე მწვანე დარჩებოდა იმ ხარვეზზეც, რომლის
 * გამოც ეს ამოცანა არსებობს.
 */
class CastCurationTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Movie $movie;

    /** @var list<CastMember> TMDB-იდან „მოსული" სამი მსახიობი, TMDB-ის რიგით */
    private array $tmdb = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('cassie');
        $this->movie = Movie::create(['user_id' => $this->user->id, 'year' => 2020]);
        $this->movie->setTranslation('en', ['title' => 'The Kraken']);

        foreach (['Anna', 'Boris', 'Clara'] as $i => $name) {
            $this->tmdb[] = CastMember::create(['name' => $name, 'tmdb_person_id' => 100 + $i]);
        }

        CastSync::fromSource($this->movie, $this->source());
    }

    private function makeUser(string $name, array $modules = ['movie']): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::whereIn('key', $modules)->pluck('id')->all());

        return $user->refresh();
    }

    /**
     * TMDB-ის ნაკრები — enricher-ის ზუსტი ფორმა (`id => [character, billing_order]`).
     *
     * @param  list<CastMember>|null  $members
     * @return array<int, array{character: string, billing_order: int}>
     */
    private function source(?array $members = null, string $suffix = ''): array
    {
        $sync = [];
        foreach ($members ?? $this->tmdb as $i => $member) {
            $sync[$member->id] = ['character' => "Role of {$member->name}{$suffix}", 'billing_order' => $i];
        }

        return $sync;
    }

    /** ჩანაწერის ხილული სია — ზუსტად ის, რასაც გვერდი ხატავს (რიგით) */
    private function names(): array
    {
        return $this->movie->cast()->get()->pluck('name')->all();
    }

    private function pivot(CastMember $member): ?object
    {
        return DB::table('castables')
            ->where('castable_type', 'movie')
            ->where('castable_id', $this->movie->id)
            ->where('cast_member_id', $member->id)
            ->first();
    }

    private function url(string $suffix = ''): string
    {
        return "/api/media/cast/movie/{$this->movie->id}{$suffix}";
    }

    /* ============================ წაშლა ============================ */

    /** ⚠️ **ამოცანის მთავარი ხარვეზი** — TMDB-ის მსახიობის წაშლა სინქრონიზაციაზე უკან ბრუნდებოდა */
    public function test_a_removed_tmdb_member_never_comes_back_from_a_sync(): void
    {
        [, $boris] = $this->tmdb;

        $this->actingAs($this->user)->deleteJson($this->url("/{$boris->id}"))->assertOk();

        $this->assertSame(['Anna', 'Clara'], $this->names());
        // რიგი რჩება — „საფლავის ქვაა", რომ წყარომ ვეღარ დააბრუნოს
        $this->assertTrue((bool) $this->pivot($boris)->is_removed);

        // იგივე TMDB-ის სია, თანაც ახალი როლებით — ბორისი მასშია
        CastSync::fromSource($this->movie, $this->source(suffix: ' (new)'));

        $this->assertSame(['Anna', 'Clara'], $this->names(), 'წაშლილი მსახიობი სინქრონიზაციამ დააბრუნა');
        $this->assertTrue((bool) $this->pivot($boris)->is_removed);
        // საფლავის ქვას წყარო საერთოდ არ ეხება — არც როლს უცვლის
        $this->assertSame('Role of Boris', $this->pivot($boris)->character);

        $cast = $this->actingAs($this->user)->getJson("/api/movies/{$this->movie->id}")->assertOk()->json('data.cast');
        $this->assertSame(['Anna', 'Clara'], array_column($cast, 'name'));

        $this->actingAs($this->user)->getJson($this->url())
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    /**
     * ⚠️ **`is_manual` არ წყვეტს, რჩება თუ არა საფლავის ქვა.** ხელით დამატებული,
     * რომელსაც TMDB-იც იცნობს, ჩვეულებრივ მოხსნაზე შემდეგივე სინქრონიზაციით
     * დაბრუნდებოდა — კითხვა მხოლოდ ისაა, შეუძლია თუ არა წყაროს მისი პოვნა.
     */
    public function test_a_hand_added_person_the_source_knows_also_stays_deleted(): void
    {
        $known = CastMember::create(['name' => 'Dmitri', 'tmdb_person_id' => 555]);

        $this->actingAs($this->user)
            ->postJson($this->url(), ['cast_member_id' => $known->id])
            ->assertCreated()
            ->assertJsonPath('data.is_manual', true);

        $this->actingAs($this->user)->deleteJson($this->url("/{$known->id}"))->assertOk();

        CastSync::fromSource($this->movie, $this->source([...$this->tmdb, $known]));

        $this->assertNotContains('Dmitri', $this->names());
    }

    /** ვისაც წყარო ვერასდროს იპოვის (TMDB-ის id-ის გარეშე), მასზე საფლავის ქვა ზედმეტია */
    public function test_a_person_the_source_cannot_find_is_really_detached(): void
    {
        $id = $this->actingAs($this->user)
            ->postJson($this->url(), ['name' => 'ნინო ქასრაძე'])
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($this->user)->deleteJson($this->url("/{$id}"))->assertOk();

        $this->assertNull($this->pivot(CastMember::find($id)));
        // ⚠️ ლექსიკონის რიგი რჩება — სხვისი ფილმიც ეყრდნობა
        $this->assertNotNull(CastMember::find($id));
    }

    /** წაშლილი „არსად ჩანს" — მსახიობის ფილმოგრაფიაშიც */
    public function test_a_removed_member_leaves_the_actor_page_filmography(): void
    {
        [$anna] = $this->tmdb;

        $this->actingAs($this->user)->getJson("/api/cast/{$anna->id}")
            ->assertOk()
            ->assertJsonCount(1, 'movies');

        $this->actingAs($this->user)->deleteJson($this->url("/{$anna->id}"))->assertOk();

        $this->actingAs($this->user)->getJson("/api/cast/{$anna->id}")
            ->assertOk()
            ->assertJsonCount(0, 'movies');

        // `whereHas`-ზე აგებული ყველა ჭრილი (გალერეა, ძებნა) იმავე უკუ-რელაციას კითხულობს
        $this->actingAs($this->user);
        $this->assertFalse(CastMember::whereKey($anna->id)->whereHas('movies')->exists());
    }

    /** ხელახლა დამატება **აღდგენაა** — არც 409 და არც პირველადი გასაღების 500 */
    public function test_re_adding_a_removed_member_restores_the_link(): void
    {
        [, $boris] = $this->tmdb;

        $this->actingAs($this->user)->deleteJson($this->url("/{$boris->id}"))->assertOk();

        $this->actingAs($this->user)
            ->postJson($this->url(), ['cast_member_id' => $boris->id])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Boris')
            // TMDB-ის ძველი როლი არ იკარგება, თუ ახალი არ დაწერე
            ->assertJsonPath('data.character', 'Role of Boris')
            ->assertJsonPath('data.is_manual', true);

        $this->assertContains('Boris', $this->names());
        $this->assertFalse((bool) $this->pivot($boris)->is_removed);

        $log = AuditLog::where('action', AuditLog::ACTION_CAST_ATTACH)->latest('id')->first();
        $this->assertTrue($log->context['restored'] ?? false);
    }

    /* ============================ დამალვა ============================ */

    /** დამალული ჩანაწერზე რჩება — და სინქრონიზაცია მას ვერ აჩენს, ვერც ხსნის */
    public function test_a_hidden_member_stays_hidden_through_syncs(): void
    {
        [, , $clara] = $this->tmdb;

        $this->actingAs($this->user)
            ->patchJson($this->url("/{$clara->id}"), ['is_hidden' => true])
            ->assertOk()
            ->assertJsonPath('data.is_hidden', true)
            // ⚠️ დამალვა როლის ცვლილება არაა
            ->assertJsonPath('data.is_edited', false);

        // ⚠️ დამალული **ჩანს** `cast()`-ში — ის მხოლოდ ჩანაწერის სიიდან იმალება
        $this->assertContains('Clara', $this->names());

        CastSync::fromSource($this->movie, $this->source());
        $this->assertTrue((bool) $this->pivot($clara)->is_hidden);

        // TMDB-მ ის ზედა 12-იდან ამოიღო — შეხებული რიგი მაინც რჩება
        CastSync::fromSource($this->movie, $this->source([$this->tmdb[0], $this->tmdb[1]]));
        $this->assertNotNull($this->pivot($clara), 'დამალული TMDB-ის სიიდან გასვლისას მოიხსნა');
        $this->assertTrue((bool) $this->pivot($clara)->is_hidden);

        // და როცა TMDB დააბრუნებს — ხილულად არ დაბრუნდება
        CastSync::fromSource($this->movie, $this->source());
        $this->assertTrue((bool) $this->pivot($clara)->is_hidden);

        $this->actingAs($this->user)
            ->patchJson($this->url("/{$clara->id}"), ['is_hidden' => false])
            ->assertOk()
            ->assertJsonPath('data.is_hidden', false);
    }

    /** ხელუხლებელი რიგი ძველებურად იქცევა: TMDB-იდან გასული ითიშება */
    public function test_an_untouched_member_still_follows_the_source(): void
    {
        CastSync::fromSource($this->movie, $this->source([$this->tmdb[0], $this->tmdb[2]]));

        $this->assertSame(['Anna', 'Clara'], $this->names());
        $this->assertNull($this->pivot($this->tmdb[1]));
    }

    /* ======================== როლი და რიგი ========================= */

    /** ⚠️ **მეორე ჩუმი ხარვეზი** — `PATCH`-ით შეცვლილ როლს სინქრონიზაცია TMDB-ის როლს აწერდა */
    public function test_an_edited_role_survives_a_sync(): void
    {
        [$anna] = $this->tmdb;

        $this->actingAs($this->user)
            ->patchJson($this->url("/{$anna->id}"), ['character' => 'ნამდვილი როლი'])
            ->assertOk()
            ->assertJsonPath('data.is_edited', true);

        CastSync::fromSource($this->movie, $this->source(suffix: ' (TMDB edit)'));

        $this->assertSame('ნამდვილი როლი', $this->pivot($anna)->character);
        // ხელუხლებელი მეზობელი TMDB-ის ახალ როლს ჩვეულებრივ იღებს
        $this->assertSame('Role of Boris (TMDB edit)', $this->pivot($this->tmdb[1])->character);
    }

    /** იგივე მნიშვნელობის ხელახლა გაგზავნა ცვლილება არაა — არც `is_edited`, არც ლოგი */
    public function test_resending_the_same_role_is_not_an_edit(): void
    {
        [$anna] = $this->tmdb;

        $this->actingAs($this->user)
            ->patchJson($this->url("/{$anna->id}"), ['character' => 'Role of Anna', 'billing_order' => 0])
            ->assertOk()
            ->assertJsonPath('data.is_edited', false);

        $this->assertSame(0, AuditLog::where('action', AuditLog::ACTION_CAST_UPDATE)->count());
    }

    /**
     * **მთელი სია ერთად** — რიგები `0..n-1`-ად, დამალულები ბოლოში; და
     * სინქრონიზაცია დალაგებულ სიას აღარ ცვლის, ახალ ადამიანს კი ბოლოში ამატებს.
     */
    public function test_a_reordered_list_is_kept_by_the_next_sync(): void
    {
        [$anna, $boris, $clara] = $this->tmdb;

        $this->actingAs($this->user)
            ->putJson($this->url('/order'), ['ids' => [$clara->id, $anna->id, $boris->id]])
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Clara')
            ->assertJsonPath('data.2.name', 'Boris');

        $this->assertSame(['Clara', 'Anna', 'Boris'], $this->names());
        $this->assertSame(0, (int) $this->pivot($clara)->billing_order);
        $this->assertTrue((bool) $this->pivot($anna)->is_edited);

        // TMDB: ძველი თანმიმდევრობა, ბორისის გარეშე, და ახალი ადამიანი მეორე ადგილზე
        $dora = CastMember::create(['name' => 'Dora', 'tmdb_person_id' => 900]);
        CastSync::fromSource($this->movie, $this->source([$anna, $dora, $clara]));

        $this->assertSame(
            ['Clara', 'Anna', 'Boris', 'Dora'],
            $this->names(),
            'დალაგებული სია სინქრონიზაციამ აურია, ან ახალი მსახიობი შუაში ჩასვა',
        );
    }

    /** ⚠️ სიმრავლე ზუსტად უნდა ემთხვეოდეს — ზედმეტი id მიბმა იქნებოდა, აკლებული ჩუმი მოხსნა */
    public function test_the_order_must_name_exactly_the_records_cast(): void
    {
        [$anna, $boris, $clara] = $this->tmdb;
        $stranger = CastMember::create(['name' => 'Stranger', 'tmdb_person_id' => 999]);

        $this->actingAs($this->user)
            ->putJson($this->url('/order'), ['ids' => [$anna->id, $boris->id]])
            ->assertStatus(422)
            ->assertJsonPath('message', 'cast_order_mismatch');

        $this->actingAs($this->user)
            ->putJson($this->url('/order'), ['ids' => [$anna->id, $boris->id, $clara->id, $stranger->id]])
            ->assertStatus(422)
            ->assertJsonPath('message', 'cast_order_mismatch');

        // წაშლილი სიაში აღარ ითვლება, დამალული — ითვლება
        $this->actingAs($this->user)->deleteJson($this->url("/{$boris->id}"))->assertOk();
        $this->actingAs($this->user)->patchJson($this->url("/{$clara->id}"), ['is_hidden' => true])->assertOk();

        $this->actingAs($this->user)
            ->putJson($this->url('/order'), ['ids' => [$anna->id]])
            ->assertStatus(422);

        $this->actingAs($this->user)
            ->putJson($this->url('/order'), ['ids' => [$clara->id, $anna->id]])
            ->assertOk();
    }

    /** ⚠️ `PUT …/order` ქვემოთა `PUT …/{castMember}`-საც ემთხვევა — „order" id-ად არ უნდა წაიკითხოს */
    public function test_the_order_route_is_not_read_as_a_member_id(): void
    {
        $this->actingAs($this->user)
            ->putJson($this->url('/order'), [])
            ->assertStatus(422)
            ->assertJsonValidationErrors('ids');
    }

    /** ⚠️ რედაქტირების უფლება საკმარისია — `PUT`/`PATCH` ორივე ჩანაწერის შეცვლაა */
    public function test_update_permission_is_enough_to_reorder_and_hide(): void
    {
        Role::create([
            'key' => 'editor',
            'name_ka' => 'რედაქტორი',
            'name_en' => 'Editor',
            'permissions' => ['movie' => ['view', 'update']],
        ]);
        $this->user->assignRole('editor')->save();
        $this->user->refresh();

        [$anna, $boris, $clara] = $this->tmdb;

        $this->actingAs($this->user)
            ->putJson($this->url('/order'), ['ids' => [$boris->id, $anna->id, $clara->id]])
            ->assertOk();

        $this->actingAs($this->user)
            ->patchJson($this->url("/{$anna->id}"), ['is_hidden' => true])
            ->assertOk();
    }

    /** სხვისი ჩანაწერი — 404, და არა 403 */
    public function test_another_users_record_is_not_found(): void
    {
        $other = $this->makeUser('mari');
        [$anna] = $this->tmdb;

        $this->actingAs($other)->putJson($this->url('/order'), ['ids' => [$anna->id]])->assertNotFound();
        $this->actingAs($other)->patchJson($this->url("/{$anna->id}"), ['is_hidden' => true])->assertNotFound();
        $this->actingAs($other)->deleteJson($this->url("/{$anna->id}"))->assertNotFound();

        $this->assertFalse((bool) $this->pivot($anna)->is_hidden);
    }

    /* ======================= ჩანაწერის წაშლა ======================== */

    /** ⚠️ ფილტრიანი `cast()->detach()` საფლავის ქვას ორფნად დატოვებდა */
    public function test_deleting_the_record_removes_its_tombstones_too(): void
    {
        [$anna] = $this->tmdb;
        $this->actingAs($this->user)->deleteJson($this->url("/{$anna->id}"))->assertOk();

        $this->movie->delete();

        $this->assertSame(0, DB::table('castables')->where('castable_id', $this->movie->id)->where('castable_type', 'movie')->count());
    }

    /* ============================ ლოგი ============================= */

    /** `castables` მოდელი არაა — ლოგში ჩაწერა ცხადია, ძველი და ახალი მნიშვნელობით */
    public function test_the_audit_log_records_hide_role_order_and_delete(): void
    {
        [$anna, $boris, $clara] = $this->tmdb;

        $this->actingAs($this->user)->patchJson($this->url("/{$anna->id}"), ['is_hidden' => true])->assertOk();
        $this->actingAs($this->user)->patchJson($this->url("/{$boris->id}"), ['character' => 'Lead'])->assertOk();
        $this->actingAs($this->user)
            ->putJson($this->url('/order'), ['ids' => [$clara->id, $boris->id, $anna->id]])
            ->assertOk();
        $this->actingAs($this->user)->deleteJson($this->url("/{$clara->id}"))->assertOk();

        $updates = AuditLog::where('action', AuditLog::ACTION_CAST_UPDATE)->orderBy('id')->get();
        $this->assertCount(3, $updates);

        // ⚠️ სუბიექტი **ჩანაწერია** — „ვინ დამალა ეს მსახიობი ამ ფილმში" ფილმის ისტორიაა
        $this->assertSame('movie', $updates[0]->subject_type);
        $this->assertSame($this->movie->id, $updates[0]->subject_id);
        $this->assertSame(['is_hidden' => false], $updates[0]->old_values);
        $this->assertSame(['is_hidden' => true], $updates[0]->new_values);
        $this->assertSame('Anna', $updates[0]->context['cast_member']);

        $this->assertSame(['character' => 'Role of Boris'], $updates[1]->old_values);
        $this->assertSame(['character' => 'Lead'], $updates[1]->new_values);

        $this->assertSame(['order' => 'Anna · Boris · Clara'], $updates[2]->old_values);
        $this->assertSame(['order' => 'Clara · Boris · Anna'], $updates[2]->new_values);

        $detach = AuditLog::where('action', AuditLog::ACTION_CAST_DETACH)->latest('id')->first();
        $this->assertTrue($detach->context['sync_blocked']);
    }
}
