<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Book;
use App\Models\BookFile;
use App\Models\Bookmark;
use App\Models\BookNote;
use App\Models\CastMember;
use App\Models\GalleryImage;
use App\Models\Genre;
use App\Models\Module;
use App\Models\Movie;
use App\Models\NoteCategory;
use App\Models\NoteEntry;
use App\Models\Place;
use App\Models\Series;
use App\Models\Status;
use App\Models\User;
use App\Services\Modules\CustomFieldService;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;
use ZipArchive;

/**
 * **ექსპორტი → იმპორტი იმავე მონაცემს იძლევა.**
 *
 * ⚠️ მოწმდება: მოდულის JSON/CSV და „სრული ექსპორტის" ZIP სხვა ანგარიშზე
 * იგივე ჩანაწერებად შემოდის — „დამატებებით" (ველები, ფაილები, ჩანიშვნები,
 * გალერეა, მსახიობები, მარშრუტები); id-ები თავიდან ინომრება და სხვისი
 * ანგარიშის id (სტატუსი, კატეგორია) არსად ჯდება; არსებული გამოტოვდება;
 * ფაილი მხოლოდ ZIP-იდან მოდის და კვოტაში ითვლება (ამოწურვაზე ჩანაწერი
 * საერთოდ არ შემოდის); გარე წყაროს არავინ ეკითხება.
 */
class MediaryImportTest extends TestCase
{
    use RefreshDatabase;

    /** 1×1 PNG — `finfo` მას სურათად ცნობს */
    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    private const PDF = "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n";

    private const MODULES = ['movie', 'series', 'anime', 'book', 'note', 'bookmark', 'place'];

    private User $alice;

    private User $bob;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        Storage::fake('private');
        Storage::fake('local');

        $this->seed(ModulesSeeder::class);
        $this->alice = $this->makeUser('alice', self::MODULES);
        $this->bob = $this->makeUser('bob', self::MODULES);
    }

    /* ---------- მოდულის JSON ---------- */

    public function test_a_module_json_comes_back_as_the_same_records_in_another_account(): void
    {
        $movie = $this->aliceMovie();

        $json = $this->actingAs($this->alice)->get('/api/export/movie?format=json')->assertOk()->streamedContent();
        $decoded = json_decode($json, true);
        $this->assertSame('mediary', $decoded['app']);
        $this->assertSame('where', $decoded['custom_field_definitions'][0]['key']);
        $this->assertSame('Neo', $decoded['records'][0]['cast'][0]['character']);

        $plan = $this->plan($this->bob, $json, 'mediary-movie-2026-10-05.json');
        $this->assertSame(['new' => 1, 'duplicate' => 0, 'invalid' => 0], $plan['modules'][0]['counts']);
        // ეკრანზე პირველი არაცარიელი სათაური — ქართული
        $this->assertSame('მატრიცა', $plan['modules'][0]['items'][0]['title']);

        $result = $this->item($this->bob, $plan, 'movie', 0);
        $this->assertTrue($result['ok']);
        $this->assertFalse($result['skipped']);

        $copy = Movie::withoutGlobalScopes()->findOrFail($result['id']);

        // ⚠️ ახალი id, ახალი მფლობელი — და ჩემი ლექსიკონი, არა ალისის
        $this->assertNotSame($movie->id, $copy->id);
        $this->assertSame($this->bob->id, (int) $copy->user_id);
        $this->assertSame('watched', $copy->status->key);
        $this->assertSame($this->bob->id, (int) $copy->status->user_id);
        $this->assertNotSame($movie->status_id, $copy->status_id);

        // ველები, თარგმანები, ჟანრი — როგორც ფაილშია
        $this->assertSame('The Matrix', $copy->title_en);
        $this->assertSame('მატრიცა', $copy->title_ka);
        $this->assertSame(1999, $copy->year);
        $this->assertSame(603, $copy->tmdb_id);
        $this->assertSame('tt0133093', $copy->imdb_id);
        $this->assertEquals(9.0, (float) $copy->my_rating);
        $this->assertTrue($copy->is_favorite);
        $this->assertSame('2024-01-02 20:00:00', $copy->watched_at->format('Y-m-d H:i:s'));
        $this->assertSame($movie->created_at->format('Y-m-d H:i:s'), $copy->created_at->format('Y-m-d H:i:s'));
        $this->assertSame(['Science Fiction'], $copy->genres->pluck('name_en')->all());

        // „დამატებები": დამატებითი ველი (განსაზღვრებით), მსახიობი, ნახვების ჟურნალი
        $this->assertSame('Cinema', app(CustomFieldService::class)->values($this->bob, 'movie', $copy->id)['where'] ?? null);
        $this->assertSame([['Keanu Reeves', 'Neo']], $copy->cast->map(fn ($m) => [$m->name, $m->pivot->character])->all());
        $this->assertSame(2, $copy->watches()->count());

        // ⚠️ ცალკე JSON ფაილს არ ატარებს — ალისის ატვირთული პოსტერი ბობს არ ერგება
        $this->assertNull($copy->poster_path);

        // წყარო ჟურნალშია
        $this->assertTrue(AuditLog::where('action', AuditLog::ACTION_IMPORT)->where('user_id', $this->bob->id)->exists());
    }

    public function test_what_i_already_have_is_skipped_and_counted(): void
    {
        $movie = $this->aliceMovie();
        $json = $this->actingAs($this->alice)->get('/api/export/movie?format=json')->streamedContent();

        // ჩემივე ექსპორტი უკან — „უკვე მაქვს"
        $plan = $this->plan($this->alice, $json);
        $this->assertSame(['new' => 0, 'duplicate' => 1, 'invalid' => 0], $plan['modules'][0]['counts']);
        $this->assertSame('exists', $plan['modules'][0]['items'][0]['reason']);

        // ურნაში მყოფიც „უკვე მაქვს"-ია (აღდგენა სჯობს ახალს)
        $movie->moveToTrash();
        $plan = $this->plan($this->alice, $json);
        $this->assertSame('in_trash', $plan['modules'][0]['items'][0]['reason']);

        // ერთეულზე — „ჩავარდნა" id-ით, რომ რიგმა „აღდგენა" შესთავაზოს
        $result = $this->item($this->alice, $plan, 'movie', 0);
        $this->assertFalse($result['ok']);
        $this->assertSame('record_in_trash', $result['error']);
        $this->assertSame($movie->id, $result['id']);

        // ფაილში ორჯერ მყოფი — მეორე „ფაილში ორჯერაა"; id-ის გარეშე — სათაური + წელი
        $data = json_decode($json, true);
        $row = $data['records'][0];
        unset($row['tmdb_id'], $row['imdb_id']);
        $data['records'] = [$row, $row, ['title_en' => '', 'title_ka' => null]];

        $plan = $this->plan($this->bob, (string) json_encode($data));
        $this->assertSame(['new' => 1, 'duplicate' => 1, 'invalid' => 1], $plan['modules'][0]['counts']);
        $this->assertSame('in_file', $plan['modules'][0]['items'][1]['reason']);

        $this->item($this->bob, $plan, 'movie', 0);
        // ⚠️ ჩაწერისას დუბლი თავიდან მოწმდება — მეორე ცდა გამოტოვდება
        $this->assertTrue($this->item($this->bob, $plan, 'movie', 0)['skipped']);
        $this->assertSame(1, Movie::withoutGlobalScopes()->where('user_id', $this->bob->id)->count());
    }

    /* ---------- CSV ---------- */

    public function test_a_csv_export_comes_back_and_series_and_anime_ask_which_one(): void
    {
        $this->actingAs($this->alice);
        Status::ensureDefaults($this->alice->id, 'bookmark');
        $bookmark = Bookmark::create([
            'user_id' => $this->alice->id,
            'title' => '=Formula title',
            'url' => 'https://example.com/a',
            'domain' => 'example.com',
            'tags' => ['dev', 'php'],
            'links' => [['label' => 'Docs', 'url' => 'https://example.com/docs']],
            'is_favorite' => true,
        ]);

        $csv = $this->get('/api/export/bookmark?format=csv')->assertOk()->streamedContent();

        $plan = $this->plan($this->bob, $csv, 'mediary-bookmark-2026-10-05.csv');
        $this->assertSame('bookmark', $plan['modules'][0]['module']);
        $this->assertSame(1, $plan['modules'][0]['counts']['new']);

        $copy = Bookmark::withoutGlobalScopes()->findOrFail($this->item($this->bob, $plan, 'bookmark', 0)['id']);
        // ⚠️ ფორმულის დაცვა (`'=`) უკან იხსნება; სიები და JSON-ის უჯრები — მასივებად
        $this->assertSame('=Formula title', $copy->title);
        $this->assertSame(['dev', 'php'], $copy->tags);
        $this->assertSame('https://example.com/docs', $copy->links[0]['url']);
        $this->assertTrue($copy->is_favorite);
        $this->assertNotSame($bookmark->id, $copy->id);

        // სერიალსა და ანიმეს ერთი და იგივე სვეტები აქვს — სახელის გარეშე არჩევანია საჭირო
        Series::create(['user_id' => $this->alice->id, 'year' => 2008])->setTranslation('en', ['title' => 'Breaking Bad']);
        $series = $this->actingAs($this->alice)->get('/api/export/series?format=csv')->streamedContent();

        $this->actingAs($this->bob)
            ->post('/api/import/plan', ['file' => $this->upload($series, 'shows.csv')])
            ->assertStatus(422)
            ->assertJsonPath('message', 'import_module_ambiguous')
            ->assertJsonPath('modules', ['series', 'anime']);

        $plan = $this->actingAs($this->bob)
            ->post('/api/import/plan', ['file' => $this->upload($series, 'shows.csv'), 'module' => 'anime'])
            ->assertOk()->json();
        $this->assertSame('anime', $plan['modules'][0]['module']);
        $this->assertSame(1, $plan['modules'][0]['counts']['new']);
    }

    /* ---------- „ჩემი სრული ექსპორტი" (ZIP) ---------- */

    public function test_the_full_archive_brings_back_records_with_their_files(): void
    {
        $movie = $this->aliceMovie(withFiles: true);
        $book = $this->aliceBook();
        $note = $this->aliceNote();
        $place = $this->alicePlace();

        $res = $this->actingAs($this->alice)->post('/api/export/archive', ['files' => true])->assertOk();
        $zipPath = $res->baseResponse->getFile()->getPathname();

        $zip = new ZipArchive;
        $this->assertTrue($zip->open($zipPath) === true);
        $manifest = json_decode((string) $zip->getFromName('manifest.json'), true);
        $this->assertSame('library', $manifest['kind']);
        $this->assertContains('movie', array_column($manifest['modules'], 'key'));
        $this->assertNotFalse($zip->statName('files/'.$movie->poster_path));
        $this->assertNotFalse($zip->statName('files/books/files/ebooks/dune.pdf'));
        $zip->close();

        $usedBefore = (int) $this->bob->fresh()->storage_used_bytes;
        $plan = $this->plan($this->bob, (string) file_get_contents($zipPath), 'mediary-all-2026-10-05.zip');
        @unlink($zipPath);

        $byModule = collect($plan['modules'])->keyBy('module');
        $this->assertSame(1, $byModule['movie']['counts']['new']);
        $this->assertSame(1, $byModule['book']['counts']['new']);
        $this->assertGreaterThan(0, $plan['files']);

        foreach (['movie', 'book', 'note', 'place'] as $module) {
            $this->assertTrue($this->item($this->bob, $plan, $module, 0)['ok'], $module);
        }

        // ფილმი: ატვირთული პოსტერი — ბობის ახალი ფაილი, ბობის კვოტაში
        $copy = Movie::withoutGlobalScopes()->where('user_id', $this->bob->id)->firstOrFail();
        $this->assertNotNull($copy->poster_path);
        $this->assertNotSame($movie->poster_path, $copy->poster_path);
        $this->assertSame('upload', $copy->poster_source);
        Storage::disk('public')->assertExists($copy->poster_path);
        $this->assertGreaterThan($usedBefore, (int) $this->bob->fresh()->storage_used_bytes);

        // გალერეა და `file` ტიპის დამატებითი ველი
        $image = GalleryImage::withoutGlobalScopes()->where('user_id', $this->bob->id)->firstOrFail();
        Storage::disk('public')->assertExists($image->path);
        $scan = app(CustomFieldService::class)->values($this->bob, 'movie', $copy->id)['scan'] ?? [];
        $this->assertSame('scan.pdf', $scan[0]['name'] ?? null);

        // მსახიობის TMDB-ის ფოტო საერთოა — იმავე გზაზე, ხელახლა არ იწერება
        $this->assertSame('cast/photos/6384.jpg', $copy->cast->first()->photo_path);

        // წიგნი: ფაილი და ციტატა
        $bookCopy = Book::withoutGlobalScopes()->where('user_id', $this->bob->id)->firstOrFail();
        $file = BookFile::withoutGlobalScopes()->where('book_id', $bookCopy->id)->firstOrFail();
        $this->assertSame('dune.pdf', $file->original_name);
        Storage::disk('public')->assertExists($file->path);
        $quote = BookNote::withoutGlobalScopes()->where('book_id', $bookCopy->id)->firstOrFail();
        $this->assertTrue($quote->is_quote);
        $this->assertSame(10, $quote->page);
        $this->assertNotSame($book->id, $bookCopy->id);

        // ჩანიშვნა: კატეგორია ბობის ლექსიკონში იქმნება სახელით (ალისის id არსად)
        $noteCopy = NoteEntry::withoutGlobalScopes()->where('user_id', $this->bob->id)->firstOrFail();
        $this->assertSame('რეცეპტები', $noteCopy->category->name_ka);
        $this->assertSame($this->bob->id, (int) $noteCopy->category->user_id);
        $this->assertNotSame($note->category_id, $noteCopy->category_id);
        Storage::disk('private')->assertExists($noteCopy->files()->firstOrFail()->path);

        // ადგილი: მარშრუტი
        $placeCopy = Place::withoutGlobalScopes()->where('user_id', $this->bob->id)->firstOrFail();
        $this->assertSame('Home → Cafe', $placeCopy->routes()->firstOrFail()->name);
        $this->assertNotSame($place->id, $placeCopy->id);
    }

    /** ⚠️ კვოტა ამოიწურა — ჩანაწერი საერთოდ არ შემოდის და დისკზე არაფერი რჩება */
    public function test_a_full_quota_keeps_the_whole_record_out(): void
    {
        $this->aliceMovie(withFiles: true);
        $res = $this->actingAs($this->alice)->post('/api/export/archive', ['files' => true])->assertOk();
        $zipPath = $res->baseResponse->getFile()->getPathname();

        $this->bob->forceFill(['storage_quota_bytes' => 10, 'storage_used_bytes' => 0])->save();
        $plan = $this->plan($this->bob, (string) file_get_contents($zipPath), 'mediary-all.zip');
        @unlink($zipPath);

        $result = $this->item($this->bob, $plan, 'movie', 0);

        $this->assertFalse($result['ok']);
        $this->assertSame('storage_quota_exceeded', $result['error']);
        $this->assertSame(0, Movie::withoutGlobalScopes()->where('user_id', $this->bob->id)->count());
        $this->assertSame(0, (int) $this->bob->fresh()->storage_used_bytes);
        // დისკზე მხოლოდ ალისის ფაილებია — ბობისთვის ჩაწერილი უკან წაიშალა
        $this->assertSame(['movies/posters/alice-upload.png'], Storage::disk('public')->files('movies/posters'));
        $this->assertSame(['gallery/images/g1.png'], Storage::disk('public')->files('gallery/images'));
    }

    /* ---------- წვდომა და უსაფრთხოება ---------- */

    public function test_access_tokens_and_foreign_archives_are_checked(): void
    {
        $this->aliceBook();
        $json = $this->actingAs($this->alice)->get('/api/export/book?format=json')->streamedContent();

        // ჩაურთველი მოდული — გეგმაში მიზეზით, ერთეულზე უარით
        $this->bob->modules()->detach(Module::where('key', 'book')->value('id'));
        $plan = $this->plan($this->bob->fresh(), $json);
        $this->assertSame('module_disabled', $plan['modules'][0]['reason']);
        $this->assertFalse($this->item($this->bob->fresh(), $plan, 'book', 0)['ok']);

        // სხვისი ტოკენი — ჩემთვის ასეთი ასლი არ არსებობს
        $plan = $this->plan($this->alice, $json);
        $this->actingAs($this->bob)
            ->postJson('/api/import/item', ['token' => $plan['token'], 'module' => 'book', 'index' => 0])
            ->assertStatus(410)
            ->assertJsonPath('message', 'import_expired');

        // ბაზის ZIP (სუპერადმინის ჩანართი) აქ არ შემოდის
        $zip = $this->zipWith(['manifest.json' => json_encode(['app' => 'mediary', 'kind' => 'database', 'format' => 1, 'tables' => []])]);
        $this->actingAs($this->bob)
            ->post('/api/import/plan', ['file' => new UploadedFile($zip, 'db.zip', 'application/zip', null, true)])
            ->assertStatus(422)
            ->assertJsonPath('message', 'import_database_archive');

        // ცარიელი ფაილი — „ჩანაწერი არ არის" და არა ცარიელი გეგმა
        $this->actingAs($this->bob)
            ->post('/api/import/plan', ['file' => $this->upload((string) json_encode(['module' => 'movie', 'records' => []]), 'empty.json')])
            ->assertStatus(422)
            ->assertJsonPath('message', 'import_empty');

        // გაუქმება ასლს შლის
        $this->actingAs($this->alice)->deleteJson('/api/import/'.$plan['token'])->assertNoContent();
        $this->actingAs($this->alice)
            ->postJson('/api/import/item', ['token' => $plan['token'], 'module' => 'book', 'index' => 0])
            ->assertStatus(410);
    }

    /** ⚠️ JSON-ში ჩაწერილი გზა სერვერის ფაილს ვერ „გადმოიტანს" — ფაილი მხოლოდ ZIP-იდან */
    public function test_a_path_inside_a_json_never_pulls_a_file_from_the_server(): void
    {
        Storage::disk('private')->put('notes/files/docs/secret.pdf', self::PDF);

        $json = json_encode([
            'module' => 'movie',
            'fields' => ['title_en', 'poster_path', 'poster_source'],
            'records' => [['title_en' => 'Heist', 'year' => 2001, 'poster_path' => 'notes/files/docs/secret.pdf', 'poster_source' => 'upload']],
        ]);

        $plan = $this->plan($this->bob, (string) $json);
        $copy = Movie::withoutGlobalScopes()->findOrFail($this->item($this->bob, $plan, 'movie', 0)['id']);

        $this->assertNull($copy->poster_path);
        $this->assertSame(0, (int) $this->bob->fresh()->storage_used_bytes);
    }

    public function test_the_sources_list_is_only_mediary(): void
    {
        $this->actingAs($this->bob)->getJson('/api/import/sources')
            ->assertOk()
            ->assertJsonPath('data.0.key', 'mediary')
            ->assertJsonCount(1, 'data');
    }

    /* ---------- დამხმარეები ---------- */

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

    private function aliceMovie(bool $withFiles = false): Movie
    {
        $this->actingAs($this->alice);
        Status::ensureDefaults($this->alice->id, 'movie');

        $fields = app(CustomFieldService::class);
        $fields->saveDefinitions($this->alice, 'movie', [
            ['label_en' => 'Where', 'type' => 'text'],
            ['label_en' => 'Scan', 'type' => 'file'],
        ]);

        $movie = new Movie([
            'user_id' => $this->alice->id,
            'year' => 1999,
            'tmdb_id' => 603,
            'imdb_id' => 'tt0133093',
            'my_rating' => 9,
            'is_favorite' => true,
        ]);
        $movie->applyStatusKey('watched');
        $movie->watched_at = '2024-01-02 20:00:00';
        $movie->created_at = '2023-05-06 07:08:09';

        if ($withFiles) {
            Storage::disk('public')->put('movies/posters/alice-upload.png', base64_decode(self::PNG));
            $movie->poster_path = 'movies/posters/alice-upload.png';
            $movie->poster_source = 'upload';
        }

        $movie->save();
        $movie->setTranslation('en', ['title' => 'The Matrix', 'description' => 'A **hacker** learns the truth.']);
        $movie->setTranslation('ka', ['title' => 'მატრიცა']);
        $movie->logWatch(now()->setDate(2020, 1, 1));

        $genre = Genre::create(['slug' => 'science-fiction', 'tmdb_id' => 878]);
        $genre->setTranslation('en', 'Science Fiction');
        $movie->genres()->sync([$genre->id]);

        $fields->setValues($this->alice, 'movie', $movie->id, ['where' => 'Cinema']);

        $member = CastMember::create(['tmdb_person_id' => 6384, 'name' => 'Keanu Reeves', 'photo_path' => 'cast/photos/6384.jpg']);
        $movie->castLinks()->attach($member->id, ['character' => 'Neo', 'billing_order' => 0, 'is_manual' => false, 'is_hidden' => false, 'is_removed' => false, 'is_edited' => false]);

        if ($withFiles) {
            Storage::disk('public')->put('cast/photos/6384.jpg', base64_decode(self::PNG));
            Storage::disk('public')->put('gallery/images/g1.png', base64_decode(self::PNG));
            $movie->galleryImages()->create([
                'user_id' => $this->alice->id, 'source' => 'tmdb', 'category' => 'backdrop',
                'path' => 'gallery/images/g1.png', 'size' => 68, 'mime' => 'image/png',
            ]);

            Storage::disk('public')->put('movies/fields/scan.pdf', self::PDF);
            DB::table('movie_field_values')->insert([
                'user_id' => $this->alice->id, 'record_id' => $movie->id, 'field_key' => 'scan',
                'value_path' => 'movies/fields/scan.pdf', 'value_name' => 'scan.pdf', 'value_mime' => 'application/pdf',
                'value_size' => strlen(self::PDF), 'sort_order' => 0, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        return $movie->refresh();
    }

    private function aliceBook(): Book
    {
        $this->actingAs($this->alice);

        $book = Book::create([
            'user_id' => $this->alice->id,
            'title_en' => 'Dune',
            'author' => 'Frank Herbert',
            'isbn' => '9780441013593',
            'status' => 'read',
            'rating' => 9,
        ]);

        Storage::disk('public')->put('books/files/ebooks/dune.pdf', self::PDF);
        $book->files()->create([
            'user_id' => $this->alice->id, 'kind' => 'book', 'path' => 'books/files/ebooks/dune.pdf',
            'original_name' => 'dune.pdf', 'mime' => 'application/pdf', 'size' => strlen(self::PDF), 'sort_order' => 0,
        ]);
        $book->notes()->create(['user_id' => $this->alice->id, 'body' => 'Fear is the mind-killer.', 'is_quote' => true, 'page' => 10]);

        return $book;
    }

    private function aliceNote(): NoteEntry
    {
        $this->actingAs($this->alice);
        NoteCategory::ensureDefaults($this->alice->id);

        $category = NoteCategory::create([
            'user_id' => $this->alice->id, 'key' => 'recipes', 'name_ka' => 'რეცეპტები', 'name_en' => 'Recipes', 'sort_order' => 99,
        ]);

        $note = NoteEntry::create(['user_id' => $this->alice->id, 'title' => 'Plan', 'description' => 'Line one', 'category_id' => $category->id]);

        Storage::disk('private')->put('notes/files/docs/plan.pdf', self::PDF);
        $note->files()->create([
            'user_id' => $this->alice->id, 'kind' => 'doc', 'path' => 'notes/files/docs/plan.pdf',
            'original_name' => 'plan.pdf', 'mime' => 'application/pdf', 'size' => strlen(self::PDF), 'sort_order' => 0,
        ]);

        return $note;
    }

    private function alicePlace(): Place
    {
        $this->actingAs($this->alice);

        $place = Place::create(['user_id' => $this->alice->id, 'name' => 'Cafe', 'lat' => 41.7, 'lng' => 44.8]);
        $place->routes()->create([
            'user_id' => $this->alice->id, 'name' => 'Home → Cafe', 'profile' => 'foot', 'distance_m' => 1200,
            'duration_s' => 900, 'from_lat' => 41.69, 'from_lng' => 44.79, 'geometry' => '[[44.79,41.69],[44.8,41.7]]',
        ]);

        return $place;
    }

    private function upload(string $contents, string $name): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'mediary-test-');
        file_put_contents($path, $contents);

        return new UploadedFile($path, $name, null, null, true);
    }

    /** @return array<string, mixed> */
    private function plan(User $user, string $contents, string $name = 'mediary-movie-2026-10-05.json'): array
    {
        return $this->actingAs($user)
            ->post('/api/import/plan', ['file' => $this->upload($contents, $name)])
            ->assertOk()
            ->json();
    }

    /** @return array<string, mixed> */
    private function item(User $user, array $plan, string $module, int $index): array
    {
        $source = collect($plan['modules'])->firstWhere('module', $module)['source'] ?? $module;

        return $this->actingAs($user)
            ->postJson('/api/import/item', ['token' => $plan['token'], 'module' => $source, 'index' => $index])
            ->assertOk()
            ->json();
    }

    /** @param  array<string, string>  $entries */
    private function zipWith(array $entries): string
    {
        $path = tempnam(sys_get_temp_dir(), 'mediary-zip-').'.zip';
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        foreach ($entries as $name => $contents) {
            $zip->addFromString($name, $contents);
        }
        $zip->close();

        return $path;
    }
}
