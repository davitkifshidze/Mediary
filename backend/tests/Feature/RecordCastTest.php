<?php

namespace Tests\Feature;

use App\Models\CastMember;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Role;
use App\Models\User;
use App\Support\CastSync;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **მსახიობის ხელით მართვა ჩანაწერზე (ეტაპი 1, 2026-09-13).**
 *
 * აქ სამი ისეთი ფაქტია, რომელიც კოდის კითხვით არ ჩანს და ჩუმად ტყდება:
 *
 *  1. **`/sync` ხელით დამატებულს არ შლის** — `->sync()` ყველაფერს თიშავდა,
 *     რაც TMDB-ის სიაში არ იყო;
 *  2. **ლექსიკონში დუბლი არ ჩნდება** — `cast_members` გლობალურია;
 *  3. **მოხსნა ლექსიკონის რიგს არ ეხება** — იმავე ადამიანს სხვისი ფილმიც
 *     ეყრდნობა.
 */
class RecordCastTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Movie $movie;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('cassie');
        $this->movie = Movie::create(['user_id' => $this->user->id, 'year' => 2020]);
        $this->movie->setTranslation('en', ['title' => 'The Kraken']);
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

    /** ხელით შეყვანა (TMDB-ის გარეშე) + როლი + მოხსნა */
    public function test_a_cast_member_can_be_added_by_hand_and_detached(): void
    {
        $id = $this->actingAs($this->user)
            ->postJson("/api/media/cast/movie/{$this->movie->id}", [
                'name' => 'Nino Kasradze',
                'name_ka' => 'ნინო ქასრაძე',
                'gender' => CastMember::GENDER_FEMALE,
                'character' => 'Mother',
            ])
            ->assertCreated()
            ->assertJsonPath('data.name_ka', 'ნინო ქასრაძე')
            ->assertJsonPath('data.character', 'Mother')
            // ⚠️ ხელით დამატებული ცხადად ინიშნება — სწორედ ეს იცავს `/sync`-ისგან
            ->assertJsonPath('data.is_manual', true)
            ->assertJsonPath('data.has_tmdb', false)
            ->json('data.id');

        $this->assertSame(1, $this->movie->cast()->count());

        // როლის შესწორება
        $this->actingAs($this->user)
            ->patchJson("/api/media/cast/movie/{$this->movie->id}/{$id}", ['character' => 'Grandmother'])
            ->assertOk()
            ->assertJsonPath('data.character', 'Grandmother');

        // მოხსნა — ⚠️ ბმული ქრება, ლექსიკონის რიგი რჩება
        $this->actingAs($this->user)
            ->deleteJson("/api/media/cast/movie/{$this->movie->id}/{$id}")
            ->assertOk();

        $this->assertSame(0, $this->movie->cast()->count());
        $this->assertNotNull(CastMember::find($id));
    }

    /** ⚠️ ორჯერ ერთი და იგივე ადამიანი — ლექსიკონში ერთი რიგი */
    public function test_the_same_person_is_not_duplicated_in_the_global_dictionary(): void
    {
        $second = $this->makeUser('dato');
        $other = Movie::create(['user_id' => $second->id, 'year' => 2021]);

        $this->actingAs($this->user)
            ->postJson("/api/media/cast/movie/{$this->movie->id}", ['name' => 'Keanu Reeves'])
            ->assertCreated();

        // სხვა ანგარიში, სხვა ფილმი, იგივე სახელი — სხვა რეგისტრით და ჰარეებით
        $this->actingAs($second)
            ->postJson("/api/media/cast/movie/{$other->id}", ['name' => '  keanu   reeves '])
            ->assertCreated();

        $this->assertSame(1, CastMember::where('name', 'like', 'Keanu%')->count());
        $this->assertSame(1, CastMember::count());
    }

    /** იმავე ჩანაწერზე მეორედ მიბმა — 409, და არა მეორე რიგი */
    public function test_attaching_the_same_person_twice_is_a_conflict(): void
    {
        $body = ['name' => 'Ia Shugliashvili'];

        $id = $this->actingAs($this->user)
            ->postJson("/api/media/cast/movie/{$this->movie->id}", $body)
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($this->user)
            ->postJson("/api/media/cast/movie/{$this->movie->id}", ['cast_member_id' => $id])
            ->assertStatus(409)
            ->assertJsonPath('message', 'cast_already_attached');

        $this->assertSame(1, $this->movie->cast()->count());
    }

    /** არცერთი წყარო არ მოვიდა — 422, ცარიელი რიგი არ იქმნება */
    public function test_a_request_without_a_source_is_rejected(): void
    {
        $this->actingAs($this->user)
            ->postJson("/api/media/cast/movie/{$this->movie->id}", ['character' => 'Someone'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'cast_source_required');

        $this->assertSame(0, CastMember::count());
    }

    /**
     * ⚠️ **ეტაპის მთავარი ტესტი.** წყაროდან სინქრონი ხელით დამატებულს
     * **არ შლის**, TMDB-ის საკუთარი მსახიობები კი ჩვეულებრივად ახლდება.
     */
    public function test_a_hand_added_cast_member_survives_a_source_sync(): void
    {
        $manualId = $this->actingAs($this->user)
            ->postJson("/api/media/cast/movie/{$this->movie->id}", ['name' => 'Local Actor'])
            ->assertCreated()
            ->json('data.id');

        $fromSource = CastMember::create(['name' => 'TMDB Actor', 'tmdb_person_id' => 777]);
        $this->movie->cast()->attach($fromSource->id, ['character' => 'Hero', 'billing_order' => 0]);

        // ახალი სინქრონი — წყაროს სიაში მხოლოდ სხვა ადამიანია
        $replacement = CastMember::create(['name' => 'Another TMDB Actor', 'tmdb_person_id' => 888]);
        CastSync::fromSource($this->movie, [
            $replacement->id => ['character' => 'Villain', 'billing_order' => 0],
        ]);

        $ids = $this->movie->cast()->pluck('cast_members.id')->all();

        $this->assertContains($manualId, $ids, 'ხელით დამატებული გაქრა — სწორედ ეს ხარვეზი ასწორდება');
        $this->assertContains($replacement->id, $ids);
        // წყაროდან მოსული, რომელიც ახალ სიაში აღარაა, ჩვეულებრივ ითიშება
        $this->assertNotContains($fromSource->id, $ids);
    }

    /** ⚠️ ორივეგან მყოფი ხელით დამატებული ისევ ხელითად რჩება */
    public function test_a_manual_member_stays_manual_when_the_source_also_knows_them(): void
    {
        $id = $this->actingAs($this->user)
            ->postJson("/api/media/cast/movie/{$this->movie->id}", [
                'name' => 'Shared Person',
            ])
            ->assertCreated()
            ->json('data.id');

        CastSync::fromSource($this->movie, [$id => ['character' => 'Lead', 'billing_order' => 0]]);

        $pivot = $this->movie->cast()->whereKey($id)->first()->pivot;
        $this->assertTrue((bool) $pivot->is_manual);
        $this->assertSame('Lead', $pivot->character);
    }

    /** სხვისი ჩანაწერი — 404 (და არა 403) */
    public function test_another_users_record_is_not_found(): void
    {
        $second = $this->makeUser('mari');

        $this->actingAs($second)
            ->postJson("/api/media/cast/movie/{$this->movie->id}", ['name' => 'Nobody'])
            ->assertNotFound();
    }

    /**
     * ⚠️ **update-ის უფლება საკმარისია.** მეთოდიდან გამოყვანილი მოქმედება
     * POST-ს `create`-ად, DELETE-ს `delete`-ად წაიკითხავდა და მხოლოდ
     * რედაქტირების უფლებიანი მომხმარებელი ცრუ 403-ს მიიღებდა.
     */
    public function test_update_permission_is_enough_to_attach_and_detach(): void
    {
        $role = Role::create([
            'key' => 'editor',
            'name_ka' => 'რედაქტორი',
            'name_en' => 'Editor',
            'permissions' => ['movie' => ['view', 'update']],
        ]);
        // ⚠️ `assignRole()` მხოლოდ აყენებს ველს — შენახვა ცალკეა
        $this->user->assignRole('editor')->save();
        $this->assertSame($role->id, $this->user->refresh()->role_id);

        // როლი მართლა ვიწროა: ახალი ჩანაწერის შექმნა აკრძალულია
        $this->actingAs($this->user)
            ->postJson('/api/movies', ['title_en' => 'Nope'])
            ->assertStatus(403);

        $id = $this->actingAs($this->user)
            ->postJson("/api/media/cast/movie/{$this->movie->id}", ['name' => 'Editor Pick'])
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($this->user)
            ->deleteJson("/api/media/cast/movie/{$this->movie->id}/{$id}")
            ->assertOk();
    }

    /** ლექსიკონის ძებნა — ქართული სახელიც იძებნება (TMDB-ს ის არ შეუძლია) */
    public function test_local_search_finds_a_georgian_name(): void
    {
        $this->actingAs($this->user)
            ->postJson("/api/media/cast/movie/{$this->movie->id}", [
                'name' => 'Nino Kasradze',
                'name_ka' => 'ნინო ქასრაძე',
            ])
            ->assertCreated();

        $items = $this->actingAs($this->user)
            ->getJson('/api/cast/search?q=ქასრაძე&type=movie&id='.$this->movie->id)
            ->assertOk()
            ->json('items');

        $this->assertCount(1, $items);
        $this->assertSame('local', $items[0]['source']);
        // ⚠️ „უკვე აბია ამ ფილმს" — თორემ იგივე ადამიანი მეორედ დაემატებოდა
        $this->assertTrue($items[0]['attached']);
    }
}
