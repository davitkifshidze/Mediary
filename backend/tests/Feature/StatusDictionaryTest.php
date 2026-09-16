<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Movie;
use App\Models\Status;
use App\Models\User;
use App\Models\Video;
use App\Support\StatusDomain;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **სტატუსი როგორც per-user ლექსიკონი (Tasks §6.2/§6.4).**
 *
 * ექვს დომენზე `status` enum-ს ადგილი `statuses` ცხრილმა დაიკავა. აქ ის
 * მოწმდება, რაც გამორჩენისას **ჩუმად** ჩავარდებოდა:
 *  · ნაგულისხმევი ნაკრები თავისით ჩნდება და ახალი ჩანაწერი მასზე ჯდება;
 *  · გადარქმევა `key`-ს არ ცვლის, ე.ი. ძველი ბმულები (`?view=watched`) ცოცხლობს;
 *  · „დასრულებული" **როლით** იზომება და არა სახელით — სწორედ ამიტომ არსებობს
 *    `role` სვეტი (`MatchService`, `PurgeService`, ფრანჩაიზის ბეჯი);
 *  · წაშლა ჩანაწერს არ კარგავს (გადატანა ან ცარიელი);
 *  · ლექსიკონი **ჩემია** — სხვის სტატუსს ვერც ვნახავ და ვერც მივანიჭებ.
 */
class StatusDictionaryTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('dato');
    }

    private function makeUser(string $name): User
    {
        $user = User::create([
            'name' => $name,
            'username' => $name,
            'email' => "{$name}@example.com",
            'password' => 'password',
        ]);
        $user->modules()->sync(Module::pluck('id')->all());

        return $user->refresh();
    }

    /** ლექსიკონის რიგი გასაღებით (ნაკრები ლენივია, ე.ი. ჯერ უნდა შეიქმნას) */
    private function dictionaryRow(User $user, string $domain, string $key): Status
    {
        Status::ensureDefaults($user->id, $domain);

        return Status::withoutGlobalScope('owner')
            ->where('user_id', $user->id)
            ->forDomain($domain)
            ->where('key', $key)
            ->firstOrFail();
    }

    /* ---------- ლექსიკონი ---------- */

    /** ნაკრები ლენივად ჩნდება — ექვსივე დომენზე, თითოს თავისი */
    public function test_defaults_appear_for_every_domain(): void
    {
        foreach (StatusDomain::keys() as $domain) {
            $keys = $this->actingAs($this->user)
                ->getJson("/api/statuses/{$domain}")
                ->assertOk()
                ->json('data.*.key');

            $this->assertSame(StatusDomain::defaultKeys($domain), $keys, "`{$domain}`-ის ნაკრები არ ემთხვევა");
        }
    }

    /** ახალი ჩანაწერი ნაგულისხმევ სტატუსზე ჯდება (ძველი enum-ის `default`-ის შემცვლელი) */
    public function test_a_new_record_gets_the_default_status(): void
    {
        $this->actingAs($this->user);

        $movie = Movie::create(['year' => 2020]);

        $this->assertSame('undecided', $movie->status_key);
        $this->assertSame('todo', $movie->status_role);
    }

    /**
     * ⚠️ **ვიდეოს სტატუსი ახლა აქვს** — ეს თვითონ §6.4-ის მოთხოვნაა
     * („ვიდეოზეც"), და მოდულს ის აქამდე საერთოდ არ ჰქონდა.
     */
    public function test_video_has_a_status_now(): void
    {
        $id = $this->actingAs($this->user)
            ->postJson('/api/videos', [
                'title' => 'Clip',
                'url' => 'https://youtu.be/abc',
                'status' => 'to_watch',
                'type_id' => $this->actingAs($this->user)->getJson('/api/video-types')->json('data.0.id'),
            ])
            ->assertStatus(201)
            ->json('data.id');

        $this->actingAs($this->user)
            ->patchJson("/api/videos/{$id}/status", ['status' => 'watching'])
            ->assertOk()
            ->assertJsonPath('data.status.key', 'watching')
            ->assertJsonPath('data.status.role', 'doing');

        $this->actingAs($this->user)
            ->getJson('/api/videos?status=watching')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    /** დამატება · გადალაგება · წაშლა გადატანით */
    public function test_add_reorder_and_delete_with_move(): void
    {
        $this->actingAs($this->user);

        $created = $this->postJson('/api/statuses/movie', [
            'name_ka' => 'მიტოვებული',
            'name_en' => 'Abandoned',
            'role' => 'done',
        ])->assertStatus(201)->json('data');

        $this->assertSame('abandoned', $created['key']);

        $movie = Movie::create(['year' => 2001]);
        $movie->applyStatusKey('abandoned');
        $movie->save();

        // გადალაგება — რიგი მოწოდებული id-ების მიხედვით
        $ids = collect($this->getJson('/api/statuses/movie')->json('data'))->pluck('id')->reverse()->values()->all();
        $this->postJson('/api/statuses/movie/reorder', ['ids' => $ids])
            ->assertOk()
            ->assertJsonPath('data.0.id', $ids[0]);

        $target = $this->dictionaryRow($this->user, 'movie', 'watched');

        $this->deleteJson("/api/statuses/movie/{$created['id']}", ['move_to' => $target->id])
            ->assertOk()
            ->assertJsonPath('moved', 1);

        $this->assertSame('watched', $movie->refresh()->status_key);
    }

    /** `move_to`-ს გარეშე ჩანაწერი **რჩება**, უბრალოდ სტატუსის გარეშე */
    public function test_delete_without_move_leaves_the_record_alive(): void
    {
        $this->actingAs($this->user);

        $movie = Movie::create(['year' => 2002]);
        $status = $this->dictionaryRow($this->user, 'movie', 'undecided');

        $this->deleteJson("/api/statuses/movie/{$status->id}")->assertOk();

        $this->assertNotNull($movie->refresh());
        $this->assertNull($movie->status_id);
        $this->assertNull($movie->status_key);
    }

    /** ნაგულისხმევის წაშლაზე მისი ადგილი პირველივე დარჩენილს გადადის */
    public function test_deleting_the_default_promotes_the_next_one(): void
    {
        $this->actingAs($this->user);

        $default = $this->dictionaryRow($this->user, 'movie', 'undecided');

        $this->deleteJson("/api/statuses/movie/{$default->id}")->assertOk();

        $this->assertSame('to_watch', Status::defaultFor($this->user->id, 'movie')?->key);
    }

    /* ---------- გადარქმევა და როლი ---------- */

    /**
     * ⚠️ **გადარქმევა `key`-ს არ ეხება.** სწორედ გასაღები აკავშირებს ლექსიკონს
     * ძველ ბმულებთან (`?view=watched`) და ნაგულისხმევებთან — მისი ცვლა მათ
     * ჩუმად გაწყვეტდა.
     */
    public function test_renaming_keeps_the_key(): void
    {
        $this->actingAs($this->user);

        $status = $this->dictionaryRow($this->user, 'movie', 'watched');

        $this->patchJson("/api/statuses/movie/{$status->id}", [
            'name_ka' => 'ვნახე',
            'name_en' => 'Seen it',
            'role' => 'done',
        ])->assertOk()->assertJsonPath('data.key', 'watched');

        $this->assertSame('ვნახე', $status->refresh()->name_ka);
    }

    /**
     * ⚠️ **„დასრულებული" როლია და არა სახელი.** გადარქმეულ სტატუსზეც
     * `watched_at` უნდა ჩაიწეროს, თორემ ყველა, ვინც ნაგულისხმევს შეცვლის,
     * ჩუმად დაკარგავდა „როდის ვნახე"-ს.
     */
    public function test_done_is_decided_by_the_role_not_by_the_name(): void
    {
        $this->actingAs($this->user);

        $movie = Movie::create(['year' => 2003]);

        $custom = $this->postJson('/api/statuses/movie', [
            'name_ka' => 'ჩავაბარე',
            'name_en' => 'Finished it',
            'role' => 'done',
        ])->assertStatus(201)->json('data');

        $this->patchJson("/api/movies/{$movie->id}/status", ['status' => $custom['key']])
            ->assertOk()
            ->assertJsonPath('data.status.role', 'done');

        $this->assertNotNull($movie->refresh()->watched_at);

        // უკან `todo`-ზე — თარიღი უნდა გაიწმინდოს
        $this->patchJson("/api/movies/{$movie->id}/status", ['status' => 'to_watch'])->assertOk();
        $this->assertNull($movie->refresh()->watched_at);
    }

    /**
     * ფრანჩაიზის ბეჯიც როლზე დგას: ნაგულისხმევი „ნანახი" გადარქმეულია,
     * ბეჯი კი მაინც უნდა აინთოს.
     */
    public function test_franchise_badge_follows_the_role(): void
    {
        $this->actingAs($this->user);

        $seen = Movie::create(['year' => 2004, 'tmdb_collection_id' => 77]);
        $seen->applyStatusKey('watched');
        $seen->save();

        $next = Movie::create(['year' => 2005, 'tmdb_collection_id' => 77]);

        $this->dictionaryRow($this->user, 'movie', 'watched')->update(['name_ka' => 'ნანახია', 'name_en' => 'Seen']);

        Movie::annotateFranchise([$next]);

        $this->assertTrue($next->franchise_next);
    }

    /* ---------- მფლობელობა ---------- */

    /** ლექსიკონი **ჩემია** — სხვისი სტატუსი არც სიაშია და არც მისანიჭებელი */
    public function test_the_dictionary_is_per_user(): void
    {
        $other = $this->makeUser('nino');

        $mine = $this->actingAs($this->user)
            ->postJson('/api/statuses/movie', ['name_ka' => 'ჩემი', 'name_en' => 'Mine', 'role' => 'doing'])
            ->assertStatus(201)->json('data');

        $keys = $this->actingAs($other)->getJson('/api/statuses/movie')->assertOk()->json('data.*.key');
        $this->assertNotContains($mine['key'], $keys);

        $movie = Movie::create(['user_id' => $other->id, 'year' => 2006]);

        $this->actingAs($other)
            ->patchJson("/api/movies/{$movie->id}/status", ['status' => $mine['key']])
            ->assertStatus(422);

        // სხვისი რიგის რედაქტირებაც მიუწვდომელია
        $this->actingAs($other)
            ->patchJson("/api/statuses/movie/{$mine['id']}", ['name_ka' => 'ა', 'name_en' => 'a', 'role' => 'todo'])
            ->assertStatus(404);
    }

    /** ორი ანგარიშის ერთი და იგივე ჩანაწერი თავის სტატუსს ინახავს */
    public function test_two_users_keep_separate_statuses_for_the_same_record(): void
    {
        $other = $this->makeUser('lasha');

        $mine = Movie::create(['user_id' => $this->user->id, 'tmdb_id' => 42]);
        $theirs = Movie::create(['user_id' => $other->id, 'tmdb_id' => 42]);

        $mine->applyStatusKey('watched');
        $mine->save();

        $this->assertSame('watched', $mine->refresh()->status_key);
        $this->assertSame('undecided', $theirs->refresh()->status_key);
        $this->assertNotSame($mine->status_id, $theirs->status_id);
    }

    /** უცნობი გასაღები — 422, და არა ჩუმად „სტატუსის გარეშე" */
    public function test_an_unknown_key_is_rejected(): void
    {
        $this->actingAs($this->user);

        $movie = Movie::create(['year' => 2007]);

        $this->patchJson("/api/movies/{$movie->id}/status", ['status' => 'nonsense'])->assertStatus(422);
        $this->assertSame('undecided', $movie->refresh()->status_key);
    }

    /** მოდულის gate — ჩაურთველ მოდულზე ლექსიკონიც მიუწვდომელია */
    public function test_the_module_gate_applies(): void
    {
        $outsider = User::create([
            'name' => 'guest',
            'username' => 'guest',
            'email' => 'guest@example.com',
            'password' => 'password',
        ]);

        $this->actingAs($outsider->refresh())->getJson('/api/statuses/movie')->assertStatus(403);
    }

    /** ვიდეოს ლექსიკონი ვიდეოსია — დომენები ერთმანეთს არ ერევა */
    public function test_domains_do_not_share_rows(): void
    {
        $this->actingAs($this->user);

        $this->postJson('/api/statuses/video', ['name_ka' => 'გადავხედე', 'name_en' => 'Skimmed', 'role' => 'doing'])
            ->assertStatus(201);

        $movieKeys = $this->getJson('/api/statuses/movie')->json('data.*.key');
        $this->assertNotContains('skimmed', $movieKeys);

        $video = Video::create(['title' => 'x', 'url' => 'https://youtu.be/z']);
        $this->assertSame('video', $video->refresh()->status->module);
    }

    /* ---------- ეტაპი 8: წაშლა ჩანაწერებით ---------- */

    /**
     * ⚠️ **ჩანაწერებიც იშლება — და მოდელის გავლით.** `deleted` ივენთი სწორედ
     * ის არის, რაც ფაილს, კვოტასა და გალერეას ასუფთავებს; query-ზე `delete()`
     * მას ჩუმად გვერდს აუვლიდა. სხვა სტატუსის ჩანაწერი ადგილზე რჩება.
     */
    public function test_deleting_a_status_can_delete_its_records(): void
    {
        $this->actingAs($this->user);

        $watched = $this->dictionaryRow($this->user, 'movie', 'watched');

        $gone = Movie::create(['year' => 2010]);
        $gone->applyStatusKey('watched');
        $gone->save();

        $kept = Movie::create(['year' => 2011]);

        $fired = 0;
        Movie::deleted(function () use (&$fired) {
            $fired++;
        });

        $this->deleteJson("/api/statuses/movie/{$watched->id}", ['delete_records' => true])
            ->assertOk()
            ->assertJsonPath('deleted', 1)
            ->assertJsonPath('moved', 0);

        $this->assertSame(1, $fired);
        $this->assertNull(Movie::find($gone->id));
        $this->assertNotNull(Movie::find($kept->id));
    }

    /** ორი ურთიერთგამომრიცხავი ბრძანება — 422, და არაფერი იშლება */
    public function test_move_to_and_delete_records_together_are_rejected(): void
    {
        $this->actingAs($this->user);

        $watched = $this->dictionaryRow($this->user, 'movie', 'watched');
        $target = $this->dictionaryRow($this->user, 'movie', 'to_watch');

        $movie = Movie::create(['year' => 2012]);
        $movie->applyStatusKey('watched');
        $movie->save();

        $this->deleteJson("/api/statuses/movie/{$watched->id}", [
            'move_to' => $target->id,
            'delete_records' => true,
        ])->assertStatus(422)->assertJsonValidationErrors('move_to');

        $this->assertNotNull(Movie::find($movie->id));
        $this->assertNotNull(Status::find($watched->id));
    }

    /**
     * ⚠️ **`all`/`favorite` სტატუსის გასაღები არ ხდება.** „Favorite" სახელის
     * სტატუსი `?view=favorite`-ს რჩეულებთან გაყოფდა.
     */
    public function test_a_status_never_takes_a_reserved_key(): void
    {
        $this->actingAs($this->user);

        $this->postJson('/api/statuses/movie', ['name_ka' => 'რჩეული', 'name_en' => 'Favorite', 'role' => 'done'])
            ->assertStatus(201)
            ->assertJsonPath('data.key', 'favorite-2');

        $this->postJson('/api/statuses/movie', ['name_ka' => 'ყველა', 'name_en' => 'All', 'role' => 'todo'])
            ->assertStatus(201)
            ->assertJsonPath('data.key', 'all-2');
    }

    /* ---------- ეტაპი 8: საიდბარის განლაგება ---------- */

    /** განლაგება `module_user.settings`-ში ჯდება — და იქ მდგარ სხვა პარამეტრებს არ წაშლავს */
    public function test_sidebar_sections_are_stored_next_to_other_module_settings(): void
    {
        $this->actingAs($this->user);

        $this->putJson('/api/modules/movie/settings', ['settings' => ['gallery' => ['limit' => 7]]])->assertOk();

        $layout = [
            'hidden' => ['favorite', 'watched'],
            'placement' => [['id' => 'all', 'at' => 'start'], ['id' => 'favorite', 'at' => 'to_watch']],
        ];

        $this->putJson('/api/statuses/movie/sections', $layout)
            ->assertOk()
            ->assertJsonPath('status_sections.hidden', ['favorite', 'watched']);

        $movie = collect($this->getJson('/api/modules')->json('data'))->firstWhere('key', 'movie');

        $this->assertSame($layout, $movie['user_settings']['status_sections']);
        $this->assertSame(['limit' => 7], $movie['user_settings']['gallery']);
    }

    /** განლაგებაში ადგილი მხოლოდ ფსევდო-განყოფილებას ინახება — სტატუსის რიგი `sort_order`-შია */
    public function test_only_a_pseudo_section_can_be_placed(): void
    {
        $this->actingAs($this->user);

        $this->putJson('/api/statuses/movie/sections', [
            'hidden' => [],
            'placement' => [['id' => 'watched', 'at' => 'start']],
        ])->assertStatus(422)->assertJsonValidationErrors('placement.0.id');
    }

    /**
     * ⚠️ **წაშლილი სტატუსი განლაგებიდანაც ქრება.** `hidden`-ში რომ დარჩეს,
     * იმავე სახელით ხელახლა შექმნილი სტატუსი დამალული დაიბადებოდა; „რჩეული",
     * რომელიც მის შემდეგ დგას, წინა მეზობელზე გადაება და ადგილს არ იცვლის.
     */
    public function test_deleting_a_status_forgets_it_in_the_layout(): void
    {
        $this->actingAs($this->user);

        $watching = $this->dictionaryRow($this->user, 'movie', 'watching');

        $this->putJson('/api/statuses/movie/sections', [
            'hidden' => ['watching', 'favorite'],
            'placement' => [['id' => 'favorite', 'at' => 'watching']],
        ])->assertOk();

        $this->deleteJson("/api/statuses/movie/{$watching->id}")->assertOk();

        $movie = collect($this->getJson('/api/modules')->json('data'))->firstWhere('key', 'movie');
        $layout = $movie['user_settings']['status_sections'];

        $this->assertSame(['favorite'], $layout['hidden']);
        $this->assertSame([['id' => 'favorite', 'at' => 'to_watch']], $layout['placement']);
    }
}
