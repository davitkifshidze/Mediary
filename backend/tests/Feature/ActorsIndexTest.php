<?php

namespace Tests\Feature;

use App\Models\Anime;
use App\Models\CastMember;
use App\Models\CastMemberTag;
use App\Models\GalleryImage;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Role;
use App\Models\Series;
use App\Models\TrashEntry;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **მსახიობების გვერდი `/actors` (Tasks §35.2).**
 *
 * „ჩემი" მსახიობი — ჩემს ჩანაწერზეა ან ჩემი ფოტო აქვს; სხვისი ჩანაწერის,
 * ურნაში მყოფი ფილმის და ჩანაწერიდან წაშლილი (საფლავის ქვა) მსახიობი —
 * არა. რიცხვები ჩემი ბიბლიოთეკისაა, ფილტრები და დახარისხება სერვერზეა.
 */
class ActorsIndexTest extends TestCase
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

    private function makeUser(string $name, array $modules = ['movie', 'series', 'anime', 'gallery']): User
    {
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::whereIn('key', $modules)->pluck('id')->all());

        return $user->refresh();
    }

    private function actor(string $name, ?string $nameKa = null, array $extra = []): CastMember
    {
        static $tmdb = 100;
        $member = CastMember::create(['name' => $name, 'tmdb_person_id' => ++$tmdb, ...$extra]);
        $member->setTranslation('ka', $nameKa);

        return $member;
    }

    private function movie(User $user, CastMember ...$cast): Movie
    {
        $movie = Movie::create(['user_id' => $user->id, 'year' => 2020]);
        foreach ($cast as $i => $member) {
            $movie->castLinks()->attach($member->id, ['billing_order' => $i]);
        }

        return $movie;
    }

    private function photo(CastMember $member): GalleryImage
    {
        return GalleryImage::create([
            'user_id' => $this->me->id,
            'imageable_type' => $member->getMorphClass(),
            'imageable_id' => $member->id,
            'source' => 'web',
            'category' => 'still',
            'path' => 'gallery/images/'.$member->id.'.jpg',
            'size' => 100,
        ]);
    }

    /** @return list<string> */
    private function names(string $query = ''): array
    {
        return array_column($this->actingAs($this->me)->getJson('/api/actors'.$query)->assertOk()->json('items'), 'name');
    }

    public function test_the_pool_is_my_records_and_my_photos_only(): void
    {
        $liam = $this->actor('Liam Neeson', 'ლიამ ნისონი');
        $kate = $this->actor('Kate Beckinsale');
        $theirs = $this->actor('Somebody Else');
        $trashed = $this->actor('In The Trash');
        $removed = $this->actor('Removed Link');
        $pictured = $this->actor('Only Photos');

        $this->movie($this->me, $liam, $kate);
        $this->movie($this->other, $theirs);
        $this->movie($this->me, $trashed)->moveToTrash();
        $this->movie($this->me, $removed)->castLinks()->updateExistingPivot($removed->id, ['is_removed' => true]);
        $this->photo($pictured);

        $series = Series::create(['user_id' => $this->me->id, 'year' => 2010]);
        $series->castLinks()->attach($liam->id, ['billing_order' => 0]);
        $anime = Anime::create(['user_id' => $this->me->id, 'year' => 2001]);
        $anime->castLinks()->attach($liam->id, ['billing_order' => 0]);

        $response = $this->actingAs($this->me)->getJson('/api/actors?sort=records&locale=en')->assertOk();

        $this->assertSame(['Liam Neeson', 'Kate Beckinsale', 'Only Photos'], array_column($response->json('items'), 'name'));
        $response->assertJsonPath('total', 3)
            ->assertJsonPath('items.0.name_ka', 'ლიამ ნისონი')
            ->assertJsonPath('items.0.counts', ['movie' => 1, 'series' => 1, 'anime' => 1])
            ->assertJsonPath('items.0.records', 3)
            ->assertJsonPath('items.2.records', 0)
            ->assertJsonPath('items.2.photos', 1);
    }

    /** გამორთული დომენის ჩანაწერები არ ითვლება — ავზი ჩართული მოდულებიდანაა */
    public function test_a_disabled_domain_does_not_count(): void
    {
        $member = $this->actor('Series Only');
        $series = Series::create(['user_id' => $this->me->id, 'year' => 2010]);
        $series->castLinks()->attach($member->id, ['billing_order' => 0]);

        $this->assertSame(['Series Only'], $this->names());

        $this->me->modules()->sync(Module::whereIn('key', ['movie', 'gallery'])->pluck('id')->all());
        $this->me = $this->me->refresh();

        $this->assertSame([], $this->names());
    }

    /** ქართულ ინტერფეისზე ქართული სახელით ლაგდება, ინგლისურზე — ორიგინალით */
    public function test_names_sort_by_the_interface_language(): void
    {
        $this->movie($this->me, $this->actor('Zurab', 'ანა'), $this->actor('Anna', 'ზურაბი'));

        $this->assertSame(['Zurab', 'Anna'], $this->names('?locale=ka'));
        $this->assertSame(['Anna', 'Zurab'], $this->names('?locale=en'));
    }

    public function test_filters_narrow_the_list_and_the_gender_facet_ignores_its_own_filter(): void
    {
        $nino = $this->actor('Nino', 'ნინო', ['gender' => CastMember::GENDER_FEMALE, 'known_for' => 'Acting', 'details_synced_at' => now()]);
        $gio = $this->actor('Gio', 'გიო', ['gender' => CastMember::GENDER_MALE, 'known_for' => 'Directing']);
        $ana = $this->actor('Ana', 'ანა', ['gender' => CastMember::GENDER_FEMALE, 'known_for' => 'Acting']);

        $this->movie($this->me, $nino, $gio, $ana);
        $this->movie($this->me, $nino);
        $this->photo($gio);

        $female = $this->actingAs($this->me)->getJson('/api/actors?gender=female&locale=en')->assertOk();
        $this->assertSame(['Ana', 'Nino'], array_column($female->json('items'), 'name'));
        // ⚠️ მთვლელი სქესის ფილტრის გარეშე ითვლება — „კაცები" ნულზე არ ჩამოდის
        $female->assertJsonPath('facets.gender', ['all' => 3, 'female' => 2, 'male' => 1])
            ->assertJsonPath('options.known_for', ['Acting', 'Directing']);

        $this->assertSame(['Gio'], $this->names('?known_for=Directing'));
        $this->assertSame(['Gio'], $this->names('?photos=with'));
        $this->assertSame(['Ana', 'Nino'], $this->names('?photos=without&locale=en'));
        $this->assertSame(['Nino'], $this->names('?records_min=2'));
        $this->assertSame(['Nino'], $this->names('?synced=yes'));
        $this->assertSame(['Ana', 'Gio'], $this->names('?synced=no&locale=en'));
        // ძებნა ქართულ სახელშიც
        $this->assertSame(['Nino'], $this->names('?q='.urlencode('ნინ')));
    }

    /** ⚠️ ტეგი JSON-შია და ქართული მასში escape-ით წერია — ფილტრი PHP-შია */
    public function test_a_georgian_tag_filters_and_tags_are_only_mine(): void
    {
        $nino = $this->actor('Nino');
        $gio = $this->actor('Gio');
        $this->movie($this->me, $nino, $gio);

        CastMemberTag::withoutGlobalScope('owner')->create(['user_id' => $this->me->id, 'cast_member_id' => $nino->id, 'tags' => ['დრამა', 'Comedy']]);
        CastMemberTag::withoutGlobalScope('owner')->create(['user_id' => $this->other->id, 'cast_member_id' => $gio->id, 'tags' => ['დრამა']]);

        $response = $this->actingAs($this->me)->getJson('/api/actors?tag='.urlencode('დრამა'))->assertOk();

        $this->assertSame(['Nino'], array_column($response->json('items'), 'name'));
        $response->assertJsonPath('items.0.tags', ['დრამა', 'Comedy'])
            ->assertJsonPath('options.tags', ['Comedy', 'დრამა']);
    }

    public function test_pages(): void
    {
        $cast = [];
        foreach (['A', 'B', 'C', 'D', 'E'] as $letter) {
            $cast[] = $this->actor("Actor {$letter}");
        }
        $this->movie($this->me, ...$cast);

        $this->actingAs($this->me)->getJson('/api/actors?per_page=2&page=3&locale=en')
            ->assertOk()
            ->assertJsonPath('total', 5)
            ->assertJsonPath('last_page', 3)
            ->assertJsonPath('items.0.name', 'Actor E');
    }

    /**
     * „წაშლა ჩემი ჩანაწერებიდან" — ყველა ჩემს ჩანაწერზე, ურნაში და საფლავის ქვით;
     * სხვისი ჩანაწერი და ლექსიკონის რიგი ხელუხლებელია.
     */
    public function test_removing_an_actor_from_all_my_records(): void
    {
        $liam = $this->actor('Liam Neeson');
        $mine = [$this->movie($this->me, $liam), $this->movie($this->me, $liam)];
        $theirs = $this->movie($this->other, $liam);

        $this->actingAs($this->me)->deleteJson("/api/actors/{$liam->id}/records")
            ->assertOk()
            ->assertJsonPath('removed', 2)
            ->assertJsonPath('skipped', 0);

        foreach ($mine as $movie) {
            $this->assertSame(0, $movie->cast()->count());
            // ⚠️ TMDB-ის მსახიობი — საფლავის ქვა, რომ სინქრონმა ის არ დააბრუნოს
            $this->assertSame(1, $movie->castLinks()->wherePivot('is_removed', true)->count());
        }

        $this->assertSame(2, TrashEntry::withoutGlobalScope('owner')->where('kind', 'cast_link')->where('user_id', $this->me->id)->count());
        $this->assertSame(1, $theirs->cast()->count());
        $this->assertNotNull($liam->fresh());
        $this->assertSame([], $this->names());
    }

    /** ⚠️ მოხსნა ჩანაწერის რედაქტირებაა — `update`-ის გარეშე დომენი არ ეხება */
    public function test_removal_skips_domains_without_the_update_permission(): void
    {
        Role::create(['key' => 'viewer', 'name_ka' => 'მნახველი', 'name_en' => 'Viewer', 'permissions' => ['movie' => ['view']]]);
        $this->me->assignRole('viewer')->save();

        $liam = $this->actor('Liam Neeson');
        $movie = $this->movie($this->me->refresh(), $liam);

        $this->actingAs($this->me)->deleteJson("/api/actors/{$liam->id}/records")
            ->assertOk()
            ->assertJsonPath('removed', 0)
            ->assertJsonPath('skipped', 1);

        $this->assertSame(1, $movie->cast()->count());
    }
}
