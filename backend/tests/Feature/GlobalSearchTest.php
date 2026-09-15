<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\Bookmark;
use App\Models\BookNote;
use App\Models\CastMember;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Song;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **ჯვარედინი ძებნა (აუდიტი 2026-09-14, §D6).**
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
