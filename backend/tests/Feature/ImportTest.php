<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Module;
use App\Models\Movie;
use App\Models\Status;
use App\Models\User;
use App\Support\ImportSource;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * **FEAT-07 — გარე სერვისის CSV-ის იმპორტი.**
 *
 * ⚠️ **ფიქსტურა ნამდვილი ფორმისაა** — BOM-ით დაწყებული Letterboxd-ის
 * `watched.csv` (სწორედ ისეთი, როგორსაც Excel ინახავს). სწორედ ის სამი
 * ბაიტი ტეხდა ხელმოწერის ამოცნობას, ე.ი. სინთეტიკური ფაილი ამ შეცდომას
 * ვერასდროს დაიჭერდა.
 */
class ImportTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);
        config()->set('services.tmdb.key', 'test-key');

        $this->user = User::create([
            'name' => 'impo',
            'username' => 'impo',
            'email' => 'impo@example.com',
            'password' => 'password',
        ]);
        $this->user->modules()->sync(Module::whereIn('key', ['movie', 'book'])->pluck('id')->all());
        $this->user->refresh();
    }

    private function csv(): UploadedFile
    {
        $path = base_path('tests/Fixtures/letterboxd-watched.csv');

        /* ⚠️ `UploadedFile::fake()` არ გამოდგება: მას შიგთავსი არ აქვს და
           `mimes:` ტიპს **სახელიდან** გამოიცნობს — ე.ი. ტესტი იმ ნაწილს
           ვერ შეამოწმებდა, სადაც CSV მართლა იკითხება. */
        return new UploadedFile($path, 'watched.csv', 'text/csv', null, true);
    }

    private function fakeTmdb(): void
    {
        Http::fake([
            'api.themoviedb.org/3/search/movie*' => Http::response(['results' => [['id' => 603]]]),
            'api.themoviedb.org/3/movie/*/credits*' => Http::response(['cast' => []]),
            'api.themoviedb.org/3/movie/*/videos*' => Http::response(['results' => []]),
            'api.themoviedb.org/3/movie/*' => Http::response([
                'id' => 603,
                'title' => 'The Matrix',
                'release_date' => '1999-03-30',
                'genres' => [],
            ]),
            '*' => Http::response([], 404),
        ]);
    }

    /** ხელმოწერით ამოცნობა + BOM-იანი პირველი სვეტი */
    public function test_a_letterboxd_file_is_recognised_and_mapped(): void
    {
        $plan = $this->actingAs($this->user)
            ->post('/api/import/plan', ['file' => $this->csv()])
            ->assertOk()
            ->json();

        $this->assertSame('letterboxd', $plan['source']);
        $this->assertSame('movie', $plan['module']);
        // ⚠️ BOM რომ დარჩენილიყო, პირველი სვეტი `\u{FEFF}Date` იქნებოდა
        $this->assertSame('Date', $plan['headers'][0]);
        $this->assertSame('Name', $plan['mapping']['title']);
        $this->assertSame(11, $plan['counts']['new']);
        /* 4.5 ვარსკვლავი ხუთბალიანზე = 9 ათბალიანზე.
           ⚠️ `assertEquals` და არა `assertSame`: JSON-ში `9.0` მთელ რიცხვად
           ბრუნდება, ე.ი. ტიპზე შედარება ფორმატს ამოწმებდა და არა მნიშვნელობას. */
        $this->assertEquals(9.0, $plan['items'][0]['rating']);
        $this->assertSame('done', $plan['items'][0]['status']);
    }

    /**
     * ⚠️ **მთავარი სცენარი**: 10 ფილმი იქმნება, უკვე არსებული კი გეგმაშივე
     * „დუბლად" ჩანს და რიგში აღარ ხვდება.
     */
    public function test_ten_films_are_created_and_a_duplicate_is_skipped(): void
    {
        $this->fakeTmdb();

        $mine = Movie::create(['user_id' => $this->user->id, 'year' => 1999]);
        $mine->setTranslation('en', ['title' => 'Already Mine']);

        $plan = $this->actingAs($this->user)
            ->post('/api/import/plan', ['file' => $this->csv()])
            ->assertOk()
            ->json();

        $this->assertSame(10, $plan['counts']['new']);
        $this->assertSame(1, $plan['counts']['duplicate']);

        $created = 0;
        foreach ($plan['items'] as $item) {
            if ($item['state'] !== 'new') {
                continue;
            }

            $res = $this->actingAs($this->user)
                ->postJson('/api/import/item', ['source' => 'letterboxd', 'row' => $item])
                ->assertOk()
                ->json();

            if ($res['ok'] && ! $res['skipped']) {
                $created++;
            }
        }

        /* ⚠️ ერთი TMDB id-ია ფეიქში, ე.ი. პირველი ქმნის და დანარჩენი ცხრა
           **გამოტოვებულია** — სწორედ ის გზა, რომელსაც ჩაწერისას მეორე
           შემოწმება იჭერს (გეგმას ეს ვერ ენახა: იქ `tmdb_id` ჯერ არ იცის). */
        $this->assertSame(1, $created);
        $this->assertSame(2, Movie::withoutGlobalScope('owner')->count());

        $movie = Movie::withoutGlobalScope('owner')->where('tmdb_id', 603)->firstOrFail();
        $this->assertSame('9.0', (string) $movie->rating);
        // Letterboxd-ის `watched.csv` განსაზღვრებით ნანახია → `role = done`
        $this->assertSame('done', $movie->status_role);
        // ფაილის თარიღი და არა „ახლა"
        $this->assertStringStartsWith('2025-02-11', (string) $movie->watched_at);
    }

    /** შემოტანილ ჩანაწერს ლოგში წყარო უწერია */
    public function test_an_imported_record_records_its_source(): void
    {
        $this->fakeTmdb();

        $this->actingAs($this->user)->postJson('/api/import/item', [
            'source' => 'letterboxd',
            'row' => ['title' => 'The Matrix', 'year' => 1999],
        ])->assertOk()->assertJsonPath('ok', true);

        $row = AuditLog::where('action', AuditLog::ACTION_IMPORT)->firstOrFail();
        $this->assertSame('movie', $row->module);
        $this->assertSame('letterboxd', $row->new_values['source']);
    }

    /**
     * ⚠️ უცნობი ფორმატი **422-ია და არა ცარიელი გეგმა** — ცარიელი სია
     * ეკრანზე „ფაილი ცარიელია"-დ იკითხება.
     */
    public function test_an_unknown_format_is_refused_but_hands_back_its_headers(): void
    {
        $file = UploadedFile::fake()->createWithContent('weird.csv', "Alpha,Beta\n1,2\n");

        $this->actingAs($this->user)
            ->post('/api/import/plan', ['file' => $file])
            ->assertStatus(422)
            ->assertJsonPath('message', 'import_source_unknown')
            ->assertJsonPath('headers', ['Alpha', 'Beta']);
    }

    /** გამორთული მოდულის ფაილს იმპორტი არ ეხება */
    public function test_a_module_i_do_not_have_is_refused(): void
    {
        $this->user->modules()->sync(Module::where('key', 'book')->pluck('id')->all());

        $this->actingAs($this->user->refresh())
            ->post('/api/import/plan', ['file' => $this->csv()])
            ->assertStatus(403);
    }

    /**
     * ⚠️ Goodreads-ის ISBN `="9780..."`-ად მოდის (Excel-ის ხრიკი) — გაწმენდის
     * გარეშე ის **არასდროს ემთხვეოდა** და ზუსტი ძებნა ჩუმად იკარგებოდა.
     */
    public function test_a_goodreads_isbn_survives_its_excel_wrapper(): void
    {
        $content = "Title,Author,ISBN13,My Rating,Exclusive Shelf\n"
            ."Dune,Frank Herbert,=\"9780441013593\",5,read\n";

        $file = UploadedFile::fake()->createWithContent('goodreads.csv', $content);

        $plan = $this->actingAs($this->user)
            ->post('/api/import/plan', ['file' => $file])
            ->assertOk()
            ->json();

        $this->assertSame('goodreads', $plan['source']);
        $this->assertSame('9780441013593', $plan['items'][0]['isbn']);
        $this->assertSame('read', $plan['items'][0]['status']);
        $this->assertEquals(10.0, $plan['items'][0]['rating']);
    }

    /** ⚠️ შეუფასებელი (`0`) არ ნიშნავს „ყველაზე ცუდს" */
    public function test_an_unrated_row_carries_no_rating(): void
    {
        $this->assertNull(ImportSource::rating('goodreads', '0'));
        $this->assertNull(ImportSource::rating('goodreads', ''));
        $this->assertSame(6.0, ImportSource::rating('goodreads', '3'));
    }

    /** ⚠️ ევროპული Excel `;`-ით ინახავს — არასწორი გამყოფი ერთსვეტიან ცხრილს იძლევა */
    public function test_a_semicolon_file_is_read_too(): void
    {
        $file = UploadedFile::fake()->createWithContent(
            'eu.csv',
            "Date;Name;Year;Letterboxd URI;Rating\n2025-01-01;Solaris;1972;https://boxd.it/s;4\n",
        );

        $plan = $this->actingAs($this->user)
            ->post('/api/import/plan', ['file' => $file])
            ->assertOk()
            ->json();

        $this->assertSame('letterboxd', $plan['source']);
        $this->assertSame('Solaris', $plan['items'][0]['title']);
        $this->assertSame(1972, $plan['items'][0]['year']);
    }

    /** სტატუსი **როლით** ისმება — გადარქმეული ლექსიკონიც უნდა მუშაობდეს */
    public function test_the_status_is_matched_by_role_not_by_name(): void
    {
        $this->fakeTmdb();

        Status::ensureDefaults($this->user->id, 'movie');
        Status::withoutGlobalScope('owner')
            ->where('user_id', $this->user->id)
            ->where('module', 'movie')
            ->where('role', 'done')
            ->update(['name_ka' => 'ვნახე', 'name_en' => 'I saw it']);

        $this->actingAs($this->user)->postJson('/api/import/item', [
            'source' => 'letterboxd',
            'row' => ['title' => 'The Matrix', 'status' => 'done'],
        ])->assertOk();

        $movie = Movie::withoutGlobalScope('owner')->firstOrFail();
        $this->assertSame('done', $movie->status_role);
        $this->assertSame('ვნახე', $movie->status->name_ka);
    }

    /** ერთი ვერნაპოვნი რიგი რიგს არ აჩერებს — `ok: false`, და არა 5xx */
    public function test_a_row_that_cannot_be_found_fails_without_breaking_the_queue(): void
    {
        Http::fake([
            'api.themoviedb.org/3/search/movie*' => Http::response(['results' => []]),
            '*' => Http::response([], 404),
        ]);

        $this->actingAs($this->user)->postJson('/api/import/item', [
            'source' => 'letterboxd',
            'row' => ['title' => 'Nothing At All'],
        ])->assertOk()->assertJsonPath('ok', false)->assertJsonPath('error', 'not_found');
    }

    /** ფიქსტურა მართლა BOM-ით იწყება — თორემ პირველი ტესტი უაზრო იქნებოდა */
    public function test_the_fixture_really_starts_with_a_bom(): void
    {
        $raw = file_get_contents(base_path('tests/Fixtures/letterboxd-watched.csv'));

        $this->assertStringStartsWith("\u{FEFF}", $raw);
    }
}
