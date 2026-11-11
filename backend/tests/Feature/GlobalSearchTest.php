<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\Bookmark;
use App\Models\BookNote;
use App\Models\CastMember;
use App\Models\CustomRecord;
use App\Models\Game;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Song;
use App\Models\User;
use App\Services\Search\GlobalSearch;
use Database\Seeders\ModulesSeeder;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * **ჯვარედინი ძებნა.**
 *
 * თერთმეტმოდულიან კატალოგს გლობალური ძებნა არ ჰქონდა: `VideoSearch`
 * მხოლოდ ვიდეოებს ემსახურებოდა, დანარჩენში კი ძებნა სექციის შიგნით იყო.
 */
class GlobalSearchTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;

    private User $bob;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);
        $this->alice = $this->makeUser('alice', ['movie', 'song', 'bookmark']);
        $this->bob = $this->makeUser('bob', ['movie', 'song', 'bookmark']);
    }

    private function makeUser(string $name, array $modules): User
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

    private function seedLibrary(User $owner): void
    {
        $movie = Movie::create(['user_id' => $owner->id, 'year' => 1999]);
        $movie->setTranslation('en', ['title' => 'The Matrix']);

        Song::create([
            'user_id' => $owner->id,
            'title' => 'Matrix Theme',
            'artist' => 'Don Davis',
            // ⚠️ `songs.url` სავალდებულოა — სიმღერა ბმულის გარეშე არ არსებობს
            'url' => 'https://www.youtube.com/watch?v=theme',
        ]);
        Bookmark::create([
            'user_id' => $owner->id,
            'title' => 'Matrix wiki',
            'url' => 'https://example.com/matrix',
            'domain' => 'example.com',
        ]);
    }

    /** **ერთი კითხვა — სამი მოდულის პასუხი** */
    public function test_one_query_reaches_every_enabled_module(): void
    {
        $this->seedLibrary($this->alice);

        $res = $this->actingAs($this->alice)->getJson('/api/search?q=matrix')->assertOk();

        $this->assertSame(3, $res->json('total'));
        $this->assertEqualsCanonicalizing(
            ['movie', 'song', 'bookmark'],
            array_column($res->json('groups'), 'module'),
        );
    }

    /** ⚠️ **მეორეხარისხოვანი ველიც იძებნება** — შემსრულებელი, ავტორი, დომენი */
    public function test_a_secondary_field_is_searched_too(): void
    {
        $this->seedLibrary($this->alice);

        $res = $this->actingAs($this->alice)->getJson('/api/search?q=don davis')->assertOk();

        $this->assertSame(1, $res->json('total'));
        $this->assertSame('song', $res->json('groups.0.module'));
        // ⚠️ ქვესათაური სწორედ ისაა, რაც შედეგს ცნობადს ხდის
        $this->assertSame('Don Davis', $res->json('groups.0.items.0.subtitle'));
    }

    /**
     * ⚠️ **გამორთული მოდული პასუხში არ ჩანს.** თორემ ძებნა იმ სექციას
     * გამოაჩენდა, რომელიც საიდბარშიც არ უჩანს და რომლის გახსნაც 403-ია.
     */
    public function test_a_disabled_module_never_appears(): void
    {
        $this->seedLibrary($this->alice);

        $this->alice->modules()->sync(Module::where('key', 'movie')->pluck('id')->all());

        $res = $this->actingAs($this->alice->refresh())->getJson('/api/search?q=matrix')->assertOk();

        $this->assertSame(['movie'], array_column($res->json('groups'), 'module'));
        $this->assertSame(1, $res->json('total'));
    }

    /** მფლობელობა — სხვისი ბიბლიოთეკა ძებნაშიც უხილავია */
    public function test_another_users_records_are_not_found(): void
    {
        $this->seedLibrary($this->alice);

        $this->actingAs($this->bob)->getJson('/api/search?q=matrix')
            ->assertOk()
            ->assertJsonPath('total', 0)
            ->assertJsonPath('groups', []);
    }

    /**
     * ⚠️ **ორივე ენა ერთდროულად** — მედიის სათაური თარგმანების ცხრილშია,
     * ე.ი. ქართულად შენახული ფილმი ქართული ძებნითაც უნდა მოიძებნოს.
     */
    public function test_a_georgian_title_is_found(): void
    {
        $movie = Movie::create(['user_id' => $this->alice->id, 'year' => 1999]);
        $movie->setTranslation('ka', ['title' => 'მატრიცა']);

        $this->actingAs($this->alice)->getJson('/api/search?q='.urlencode('მატრიც'))
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('groups.0.items.0.title', 'მატრიცა');
    }

    /**
     * ⚠️ **ჯამი ჭერზე მეტს ამბობს.** `count($items)` ყოველთვის ჭერს
     * იტყოდა და „კიდევ 40 არის" პასუხი დაიკარგებოდა.
     */
    public function test_the_total_is_bigger_than_the_returned_page(): void
    {
        for ($i = 0; $i < 8; $i++) {
            Song::create(['user_id' => $this->alice->id, 'title' => "Matrix {$i}", 'url' => "https://example.com/s{$i}"]);
        }

        $res = $this->actingAs($this->alice)->getJson('/api/search?q=matrix&per_module=3')->assertOk();

        $this->assertSame(8, $res->json('groups.0.total'));
        $this->assertCount(3, $res->json('groups.0.items'));
    }

    /**
     * ⚠️ **ერთსიმბოლოიან ძებნას აზრი არ აქვს** — ის ათივე ცხრილს
     * სკანირებდა და პრაქტიკულად მთელ ბიბლიოთეკას აბრუნებდა.
     */
    public function test_a_single_character_returns_nothing(): void
    {
        $this->seedLibrary($this->alice);

        $this->actingAs($this->alice)->getJson('/api/search?q=m')
            ->assertOk()
            ->assertJsonPath('total', 0);
    }

    /**
     * ⚠️ **`LIKE`-ის სპეცსიმბოლოები ეკრანირდება.** `%`-ის გარეშე ძებნა
     * ჩუმად სხვა კითხვას პასუხობდა — მთელ ცხრილს აბრუნებდა.
     */
    public function test_like_wildcards_are_escaped(): void
    {
        $this->seedLibrary($this->alice);

        $this->actingAs($this->alice)->getJson('/api/search?q=%25%25')
            ->assertOk()
            ->assertJsonPath('total', 0);
    }

    /* ================= ნაჭერი და „სად დაემთხვა" (2026-09-14) ================= */

    /**
     * **მთავარი მოთხოვნა: აღწერაში დამთხვევა და მისი გარემო.**
     *
     * ⚠️ სათაურების სია არ პასუხობდა „რატომ მომცა ეს ჩანაწერი" — ნაჭერი კი
     * ზუსტად იმ ადგილს აჩვენებს, სადაც სიტყვა ნახსენებია, წინა და მომდევნო
     * სიტყვებით.
     */
    public function test_a_description_match_comes_back_with_its_context(): void
    {
        $movie = Movie::create(['user_id' => $this->alice->id, 'year' => 1999]);
        $movie->setTranslation('en', [
            'title' => 'The Matrix',
            'description' => 'alpha beta gamma delta one two three four five six seven needle eight nine ten eleven twelve',
        ]);

        $res = $this->actingAs($this->alice)->getJson('/api/search?q=needle')->assertOk();

        $match = collect($res->json('groups.0.items.0.matches'))->firstWhere('field', 'description');

        $this->assertNotNull($match, 'აღწერის დამთხვევა საერთოდ არ დაბრუნებულა');
        $this->assertStringContainsString('needle', $match['text']);
        // გარემო — ორივე მხრიდან
        $this->assertStringContainsString('seven', $match['text']);
        $this->assertStringContainsString('eight', $match['text']);
        // ⚠️ მთელი ტექსტი კი არა, ნაჭერი: მოჭრილი მხარე მრავალწერტილით ჩანს
        $this->assertStringNotContainsString('alpha', $match['text']);
        $this->assertStringContainsString('…', $match['text']);
    }

    /**
     * აღწერა Markdown-ია: სიტყვებს შორის `**` და ბმულის ფრჩხილი
     * ფრაზის ძებნას აღარ არღვევს, ნაჭერში კი ფორმატის ნიშნები არ ჩანს.
     */
    public function test_a_formatted_description_is_found_and_shown_as_plain_text(): void
    {
        $movie = Movie::create(['user_id' => $this->alice->id, 'year' => 2020]);
        $movie->setTranslation('en', [
            'title' => 'Choices',
            'description' => 'A **red pill** and [blue](https://x.dev) one',
        ]);

        $res = $this->actingAs($this->alice)->getJson('/api/search?q='.urlencode('red pill and blue'))->assertOk();

        $match = collect($res->json('groups.0.items.0.matches'))->firstWhere('field', 'description');

        $this->assertNotNull($match, 'ფორმატიანი აღწერა ფრაზით ვერ მოიძებნა');
        $this->assertStringContainsString('red pill and blue', $match['text']);
        $this->assertStringNotContainsString('**', $match['text']);
    }

    /**
     * ⚠️ **სიტყვის შუაში პოვნაც სავალდებულოა** („ინ" → „ინფორმაცია") და
     * ნაჭერს **მთელი სიტყვა** უნდა შერჩეს — თორემ დამთხვევა კონტექსტის
     * გარეშე რჩება.
     */
    public function test_a_match_inside_a_georgian_word_keeps_the_whole_word(): void
    {
        $movie = Movie::create(['user_id' => $this->alice->id, 'year' => 2020]);
        $movie->setTranslation('ka', [
            'title' => 'ფილმი',
            'description' => 'აქ არის საინტერესო ინფორმაცია ფილმის შესახებ',
        ]);

        $res = $this->actingAs($this->alice)->getJson('/api/search?q='.urlencode('ინფ'))->assertOk();

        $match = collect($res->json('groups.0.items.0.matches'))->firstWhere('field', 'description');

        $this->assertNotNull($match);
        $this->assertStringContainsString('ინფორმაცია', $match['text']);
    }

    /**
     * ⚠️ **ჩანაწერის შვილობილი ტექსტებიც იძებნება** — წიგნის ციტატა
     * თავის ცხრილშია (`book_notes`), ე.ი. სათაურებზე მიბმული ძებნა მას
     * ვერასდროს ნახავდა.
     */
    public function test_a_quote_finds_the_book_it_belongs_to(): void
    {
        $carol = $this->makeUser('carol', ['book']);
        $book = Book::create(['user_id' => $carol->id, 'title_en' => 'Dune']);
        BookNote::create([
            'user_id' => $carol->id,
            'book_id' => $book->id,
            'body' => 'fear is the mind-killer',
            'is_quote' => true,
        ]);

        $res = $this->actingAs($carol)->getJson('/api/search?q=mind-killer')->assertOk();

        $this->assertSame('book', $res->json('groups.0.key'));
        $this->assertSame('Dune', $res->json('groups.0.items.0.title'));
        // ციტატა და ჩვეულებრივი შენიშვნა ერთ ცხრილშია — ლეიბლი მაინც განსხვავდება
        $this->assertSame('quote', $res->json('groups.0.items.0.matches.0.field'));
    }

    /**
     * ⚠️ **მსახიობი ორ ადგილას ჩანს და ორივე საჭიროა**: თავის ჯგუფში
     * (მისი გვერდი) და **იმ ფილმზე**, სადაც თამაშობს — „რა მაქვს ამ
     * მსახიობთან" სწორედ მეორეა.
     */
    public function test_a_cast_name_finds_both_the_person_and_the_film(): void
    {
        $movie = Movie::create(['user_id' => $this->alice->id, 'year' => 1994]);
        $movie->setTranslation('en', ['title' => 'Leon']);
        $member = CastMember::create(['name' => 'Jean Reno']);
        $movie->cast()->attach($member->id, ['billing_order' => 0]);

        $res = $this->actingAs($this->alice)->getJson('/api/search?q=reno')->assertOk();

        $this->assertEqualsCanonicalizing(['movie', 'cast'], array_column($res->json('groups'), 'key'));

        $group = collect($res->json('groups'))->firstWhere('key', 'movie');
        $this->assertSame('cast', $group['items'][0]['matches'][0]['field']);
        $this->assertStringContainsString('Jean Reno', $group['items'][0]['matches'][0]['text']);
    }

    /**
     * ⚠️ **`cast_members` გლობალური ლექსიკონია** — `owner` scope მასზე არ
     * მუშაობს, ე.ი. ფილტრის გარეშე ძებნა სხვისი ბიბლიოთეკის მსახიობებსაც
     * ჩამოთვლიდა (და მათი გვერდი აქ ცარიელი იქნებოდა).
     */
    public function test_another_users_cast_is_not_listed(): void
    {
        $movie = Movie::create(['user_id' => $this->alice->id, 'year' => 1994]);
        $movie->setTranslation('en', ['title' => 'Leon']);
        $member = CastMember::create(['name' => 'Jean Reno']);
        $movie->cast()->attach($member->id, ['billing_order' => 0]);

        $this->actingAs($this->bob)->getJson('/api/search?q=reno')
            ->assertOk()
            ->assertJsonPath('total', 0);
    }

    /**
     * ⚠️ **ტეგიდან მხოლოდ დამთხვეული ელემენტი ჩანს.** მთელი JSON-ი
     * ნაჭერში `["ინფო","სხვა"]`-დ გამოჩნდებოდა — ე.ი. პასუხი ტექნიკური
     * ნაგავი იქნებოდა და არა ტექსტი.
     */
    public function test_a_tag_match_shows_only_the_matching_tag(): void
    {
        Bookmark::create([
            'user_id' => $this->alice->id,
            'title' => 'Some page',
            'url' => 'https://example.com/a',
            'domain' => 'example.com',
            'tags' => ['ინფორმაცია', 'სხვა'],
        ]);

        $res = $this->actingAs($this->alice)->getJson('/api/search?q='.urlencode('ინფ'))->assertOk();

        $match = collect($res->json('groups.0.items.0.matches'))->firstWhere('field', 'tags');

        $this->assertSame('ინფორმაცია', $match['text']);
    }

    /**
     * ⚠️ **ერთი დომენის ღრმა სია** — გვერდის „ყველა შედეგი ამ სექციაში".
     * დანარჩენი ჯგუფები პასუხში აღარ მოდის, ე.ი. მოთხოვნაც მსუბუქია.
     */
    public function test_one_domain_can_be_asked_alone(): void
    {
        $this->seedLibrary($this->alice);

        $res = $this->actingAs($this->alice)->getJson('/api/search?q=matrix&domain=song')->assertOk();

        $this->assertSame(['song'], array_column($res->json('groups'), 'key'));
        $this->assertSame(1, $res->json('total'));
    }

    /* ================= რეესტრი და რიგი ================= */

    /** ყველა მოდული ჩართული + ერთი პირადი მოდული — რეესტრის სრული სია */
    private function userWithEverything(): User
    {
        $user = $this->makeUser('carol', Module::pluck('key')->all());

        $this->actingAs($user)->postJson('/api/modules', [
            'name_ka' => 'რეცეპტები',
            'name_en' => 'Recipes',
            'icon' => 'Utensils',
            'color' => '#22c55e',
            'classification' => 'genre',
            'statuses' => 'default',
        ])->assertCreated();

        return $user->refresh();
    }

    /**
     * ⚠️ **ერთი დომენის გატეხილი აღწერა მთელ ძებნას აგდებს.** თამაშის
     * ჩანიშვნების კავშირი წაიშალა, აღწერაში კი დარჩა — და ვისაც თამაშების
     * მოდული ჩართული ჰქონდა, ნებისმიერ სიტყვაზე 500-ს იღებდა. ეს ტესტი
     * მხოლოდ სამ მოდულს რთავდა, ამიტომ ვერ დაინახა.
     */
    public function test_a_search_answers_with_every_module_enabled(): void
    {
        $user = $this->userWithEverything();
        Game::create(['user_id' => $user->id, 'title_en' => 'Halo Infinite', 'status' => 'finished']);

        $res = $this->actingAs($user)->getJson('/api/search?q=halo')->assertOk();

        $this->assertSame(['game'], array_column($res->json('groups'), 'key'));
        $this->assertSame('Halo Infinite', $res->json('groups.0.items.0.title'));
    }

    /**
     * **ყოველი დომენის აღწერა ნამდვილ მოდელს ემთხვევა.**
     *
     * ⚠️ კავშირის წაშლა ძებნას ჩუმად ტეხს: `whereHas('notes')` მხოლოდ
     * მოთხოვნისას ვარდება, წინასწარ-ჩატვირთვა კი — მხოლოდ მაშინ, როცა შედეგი
     * არის. ⚠️ სვეტიც აქ მოწმდება: sqlite უცნობ სვეტს სტრიქონად კითხულობს,
     * ე.ი. შეცდომით დაწერილი სახელი ტესტებში უბრალოდ „ვერაფერს პოულობს".
     */
    public function test_every_source_describes_real_relations_and_columns(): void
    {
        $user = $this->userWithEverything();

        $sources = (new \ReflectionMethod(GlobalSearch::class, 'sources'))
            ->invoke(app(GlobalSearch::class), $user);

        // რეესტრი სრულია: ჩაშენებული დომენები + პირადი მოდული
        $this->assertGreaterThan(18, count($sources));
        $this->assertContains(CustomRecord::class, array_column($sources, 'model'));

        foreach ($sources as $domain => $spec) {
            $model = new $spec['model'];
            $own = array_merge(
                array_merge([], ...array_values($spec['columns'] ?? [])),
                array_values($spec['json'] ?? []),
                $spec['title_rank']['columns'] ?? [],
            );

            foreach ($own as $column) {
                $this->assertTrue(
                    Schema::hasColumn($model->getTable(), $column),
                    "{$domain}: `{$model->getTable()}.{$column}` არ არსებობს",
                );
            }

            $relations = $spec['relations'] ?? [];
            if (isset($spec['title_rank']['relation'])) {
                $relations[] = [
                    'relation' => $spec['title_rank']['relation'],
                    'where' => [$spec['title_rank']['column']],
                ];
            }

            foreach ($relations as $rel) {
                $name = $rel['relation'];
                $this->assertTrue(method_exists($model, $name), "{$domain}: კავშირი `{$name}` მოდელზე არ არის");

                $relation = $model->{$name}();
                $this->assertInstanceOf(Relation::class, $relation, "{$domain}: `{$name}` კავშირი არაა");

                $related = $relation->getRelated();
                // SQL-ში მხოლოდ ნამდვილი სვეტები მონაწილეობს (`where`), ნაჭერში — აქსესორებიც
                $columns = $rel['where'] ?? array_unique(array_merge([], ...array_values($rel['fields'])));

                foreach ($columns as $column) {
                    $this->assertTrue(
                        Schema::hasColumn($related->getTable(), $column),
                        "{$domain}.{$name}: `{$related->getTable()}.{$column}` არ არსებობს",
                    );
                }

                if (! empty($rel['translated'])) {
                    $this->assertInstanceOf(Relation::class, $related->translations(), "{$domain}.{$name}: თარგმანების კავშირი");
                }
            }
        }
    }

    /**
     * **ზუსტი სათაური → სათაურის დასაწყისი → სათაურში სადმე → დანარჩენი.**
     *
     * ⚠️ ყველაზე ახალი ჩანაწერი (`id desc`) აქ განზრახ ყველაზე სუსტი
     * დამთხვევაა — ძველი წესით ის პირველი იქნებოდა.
     */
    public function test_an_exact_title_comes_before_a_prefix_and_a_substring(): void
    {
        $url = fn (string $slug) => "https://example.com/{$slug}";

        Song::create(['user_id' => $this->alice->id, 'title' => 'Love', 'url' => $url('exact')]);
        Song::create(['user_id' => $this->alice->id, 'title' => 'Love Story', 'url' => $url('prefix')]);
        Song::create(['user_id' => $this->alice->id, 'title' => 'Endless Love', 'url' => $url('inside')]);
        Song::create(['user_id' => $this->alice->id, 'title' => 'Ballad', 'album' => 'Love Songs', 'url' => $url('album')]);

        $res = $this->actingAs($this->alice)->getJson('/api/search?q=love&domain=song')->assertOk();

        $this->assertSame(
            ['Love', 'Love Story', 'Endless Love', 'Ballad'],
            array_column($res->json('groups.0.items'), 'title'),
        );
    }

    /** იგივე რიგი იქ, სადაც სათაური თარგმანების ცხრილშია (ფილმი, სერიალი, ანიმე) */
    public function test_the_title_order_holds_for_translated_titles(): void
    {
        $make = function (string $title, ?string $description = null): void {
            Movie::create(['user_id' => $this->alice->id, 'year' => 2015])
                ->setTranslation('en', ['title' => $title, 'description' => $description]);
        };

        $make('Love');
        $make('Love Actually');
        $make('Crazy, Stupid, Love');
        $make('Amour', 'A film about love and old age');

        $res = $this->actingAs($this->alice)->getJson('/api/search?q=love&domain=movie')->assertOk();

        $this->assertSame(
            ['Love', 'Love Actually', 'Crazy, Stupid, Love', 'Amour'],
            array_column($res->json('groups.0.items'), 'title'),
        );
    }

    public function test_the_endpoint_requires_a_session(): void
    {
        $this->getJson('/api/search?q=matrix')->assertStatus(401);
    }

    public function test_the_query_is_required(): void
    {
        $this->actingAs($this->alice)->getJson('/api/search')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['q']);
    }
}
