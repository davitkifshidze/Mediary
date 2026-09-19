<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\BookGenre;
use App\Models\Module;
use App\Models\User;
use App\Services\Storage\StorageMeter;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * წიგნების მოდული (`book`, Tasks §12).
 *
 * ამოწმებს იმას, რაც ამ მოდულში ადვილად შეიძლება გატყდეს: მოდულის gate,
 * per-user ჟანრების ლექსიკონი, პროგრესის ორი ერთეულის სინქრონი, ISBN-ის
 * per-user უნიკალურობა, ფაილები/ციტატები და კვოტის აღრიცხვა.
 */
class BookModuleTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('bela', ['book']);
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

    /**
     * ⚠️ სტატუსი და ჟანრი სავალდებულოა — ჩანაწერი ვერცერთის გარეშე ვერ იქმნება.
     */
    private function bookDefaults(?User $user = null): array
    {
        $user ??= $this->user;

        return [
            'status' => 'to_read',
            'genre_id' => $this->actingAs($user)->getJson('/api/book-genres')->json('data.0.id'),
        ];
    }

    private function makeBook(array $overrides = []): int
    {
        return $this->actingAs($this->user)
            ->postJson('/api/books', $overrides + $this->bookDefaults() + [
                'title_ka' => 'ვეფხისტყაოსანი',
                'title_en' => 'The Knight in the Panther\'s Skin',
            ])
            ->assertStatus(201)
            ->json('data.id');
    }

    /**
     * ქართული შეკითხვა ხელით შევსებას ნიშნავს და არა ცარიელ სიას (§5.7).
     *
     * ⚠️ მთავარი ის არის, რომ **გარე გამოძახება საერთოდ არ ხდება**: Open
     * Library ქართულს ვერ პასუხობს, ე.ი. რექვესთი ისედაც ფუჭი იქნებოდა და
     * პასუხი „ასეთი წიგნი არ არსებობს"-ად წაიკითხებოდა.
     */
    public function test_a_georgian_query_is_answered_without_calling_the_source(): void
    {
        Http::fake();

        $this->actingAs($this->user)
            ->postJson('/api/books/lookup/candidates', ['query' => 'ვეფხისტყაოსანი'])
            ->assertOk()
            ->assertJsonPath('notice', 'manual_only')
            ->assertJsonCount(0, 'results');

        Http::assertNothingSent();
    }

    /**
     * წყაროს ჩავარდნა **503-ია და არა 500** (შენი შეცდომა, 2026-09-14).
     *
     * ⚠️ `cURL error 28` (timeout) `OpenLibraryClient`-იდან გამონაკლისით
     * ამოდიოდა და ერთი შხეება წიგნის დამატებას წითელ ტოსტით აცდებდა.
     * ⚠️ „წყარო არ პასუხობს" და „ვერაფერი ვიპოვე" სხვა ფაქტებია.
     */
    public function test_an_open_library_outage_is_503_and_not_500(): void
    {
        Http::fake(fn () => throw new ConnectionException('cURL error 28: Timeout'));

        $this->actingAs($this->user)
            ->postJson('/api/books/lookup/candidates', ['query' => 'dune'])
            ->assertStatus(503)
            ->assertJsonPath('message', 'openlibrary_unavailable');
    }

    /** წყარო მუშაობს, ვერაფერი იპოვა — ეს **200-ია ცარიელი სიით** */
    public function test_no_results_is_not_reported_as_an_outage(): void
    {
        Http::fake(['openlibrary.org/*' => Http::response(['docs' => []])]);

        $this->actingAs($this->user)
            ->postJson('/api/books/lookup/candidates', ['query' => 'zzzzzz'])
            ->assertOk()
            ->assertJsonCount(0, 'results');
    }

    /** მოდულის gate + §12-ის ველების ნაკრები */
    public function test_module_gate_and_field_set(): void
    {
        $outsider = $this->makeUser('nomodule', []);
        $this->actingAs($outsider)->getJson('/api/books')->assertStatus(403);

        $genreId = $this->actingAs($this->user)->getJson('/api/book-genres')->json('data.0.id');

        $this->actingAs($this->user)
            ->postJson('/api/books', [
                'title_ka' => 'ვეფხისტყაოსანი',
                'title_en' => 'The Knight in the Panther\'s Skin',
                'author' => 'შოთა რუსთაველი',
                'publisher' => 'საბჭოთა საქართველო',
                'isbn' => '9789941234567',
                'year' => 1712,
                'pages' => 400,
                'language' => 'ka',
                'genre_id' => $genreId,
                'series_name' => 'ქართული კლასიკა',
                'series_number' => 1,
                'format' => 'print',
                'status' => 'reading',
                'rating' => 10,
                'tags' => ['კლასიკა', 'კლასიკა', ' პოემა '],
                'links' => [['label' => 'biblusi', 'url' => 'https://biblusi.ge/book/1']],
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.author', 'შოთა რუსთაველი')
            ->assertJsonPath('data.pages', 400)
            ->assertJsonPath('data.genre_id', $genreId)
            ->assertJsonPath('data.series_number', 1)
            ->assertJsonPath('data.status', 'reading')
            ->assertJsonPath('data.rating', 10)
            ->assertJsonPath('data.links.0.url', 'https://biblusi.ge/book/1')
            // 16.5 — ხილვადობა default-ად პირადია
            ->assertJsonPath('data.visibility', 'private')
            // ტეგების დუბლი რეგისტრისა და სივრცის მიუხედავად იჭრება
            ->assertJsonPath('data.tags', ['კლასიკა', 'პოემა']);
    }

    /** უსათაურო წიგნი არ იქმნება — ერთი ენა მაინც სავალდებულოა */
    public function test_a_title_is_required_in_at_least_one_language(): void
    {
        $this->actingAs($this->user)
            ->postJson('/api/books', ['author' => 'უცნობი'])
            ->assertStatus(422);

        $this->actingAs($this->user)
            ->postJson('/api/books', ['title_en' => 'Only English'] + $this->bookDefaults())
            ->assertStatus(201);
    }

    /**
     * პროგრესი ორ ერთეულშია და **ერთმანეთს ვერ ეწინააღმდეგება**:
     * გვერდი პროცენტს ითვლის და პირიქით; 100% სტატუსსაც აწევს.
     */
    public function test_progress_keeps_page_and_percent_in_sync(): void
    {
        $id = $this->makeBook(['pages' => 200]);

        $this->actingAs($this->user)
            ->patchJson("/api/books/{$id}/progress", ['page' => 50])
            ->assertOk()
            ->assertJsonPath('data.progress_page', 50)
            ->assertJsonPath('data.progress_percent', 25)
            // პროგრესის დაწყება „ვკითხულობ"-ს ნიშნავს
            ->assertJsonPath('data.status', 'reading');

        $this->actingAs($this->user)
            ->patchJson("/api/books/{$id}/progress", ['percent' => 50])
            ->assertOk()
            ->assertJsonPath('data.progress_page', 100)
            ->assertJsonPath('data.progress_percent', 50);

        $this->actingAs($this->user)
            ->patchJson("/api/books/{$id}/progress", ['percent' => 100])
            ->assertOk()
            ->assertJsonPath('data.status', 'read');

        // აუდიოწიგნზე გვერდები არ არსებობს — მხოლოდ პროცენტი რჩება
        $audio = $this->makeBook(['title_en' => 'Audio', 'format' => 'audio', 'isbn' => null]);
        $this->actingAs($this->user)
            ->patchJson("/api/books/{$audio}/progress", ['percent' => 40])
            ->assertOk()
            ->assertJsonPath('data.progress_percent', 40)
            ->assertJsonPath('data.progress_page', null);
    }

    /** „წაკითხული" პროგრესსაც ავსებს — ბარათი 40%-ზე არ ჩერდება */
    public function test_marking_as_read_completes_the_progress(): void
    {
        $id = $this->makeBook(['pages' => 300]);

        $this->actingAs($this->user)->patchJson("/api/books/{$id}/progress", ['page' => 30]);

        $this->actingAs($this->user)
            ->patchJson("/api/books/{$id}/status", ['status' => 'read'])
            ->assertOk()
            ->assertJsonPath('data.progress_percent', 100)
            ->assertJsonPath('data.progress_page', 300);
    }

    /** ⚠️ ISBN უნიკალურია **user-ზე**: ორმა ანგარიშმა ერთი წიგნი უნდა შეძლოს */
    public function test_isbn_is_unique_per_user_only(): void
    {
        $this->makeBook(['isbn' => '9789941234567']);

        $this->actingAs($this->user)
            ->postJson('/api/books', ['title_en' => 'Same isbn', 'isbn' => '9789941234567'])
            ->assertStatus(422);

        $other = $this->makeUser('otto', ['book']);
        $this->actingAs($other)
            ->postJson('/api/books', ['title_en' => 'Same isbn', 'isbn' => '9789941234567'] + $this->bookDefaults($other))
            ->assertStatus(201);
    }

    /** ჟანრი **per-user** ლექსიკონია — სხვისი ჟანრის id 422-ია */
    public function test_genre_dictionary_is_per_user(): void
    {
        $other = $this->makeUser('otto', ['book']);
        $theirGenre = $this->actingAs($other)->getJson('/api/book-genres')->json('data.0.id');

        $this->actingAs($this->user)
            ->postJson('/api/books', ['title_en' => 'X', 'genre_id' => $theirGenre])
            ->assertStatus(422);

        // ჟანრის წაშლაზე წიგნები არ იკარგება — გადადის ან ჟანრის გარეშე რჩება.
        // დეფაულტები ლენივია: პირველი `index` მათ ქმნის
        $this->actingAs($this->user)->getJson('/api/book-genres')->assertOk();
        $mine = BookGenre::withoutGlobalScope('owner')->where('user_id', $this->user->id)->get();
        $id = $this->makeBook(['genre_id' => $mine[0]->id]);

        $this->actingAs($this->user)
            ->deleteJson("/api/book-genres/{$mine[0]->id}", ['move_to' => $mine[1]->id])
            ->assertOk()
            ->assertJsonPath('moved', 1);

        $this->assertSame(
            $mine[1]->id,
            Book::withoutGlobalScope('owner')->find($id)->genre_id,
        );
    }

    /** ციტატა ჩვეულებრივი ჩანიშვნისგან `is_quote`-ით და გვერდით განსხვავდება */
    public function test_notes_and_quotes_live_in_one_table(): void
    {
        $id = $this->makeBook();

        $this->actingAs($this->user)
            ->postJson("/api/books/{$id}/notes", ['body' => 'უბრალო ჩანიშვნა'])
            ->assertStatus(201)
            ->assertJsonPath('data.is_quote', false);

        $this->actingAs($this->user)
            ->postJson("/api/books/{$id}/notes", [
                'body' => 'რასაცა გასცემ შენია',
                'is_quote' => true,
                'page' => 12,
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.is_quote', true)
            ->assertJsonPath('data.page', 12);

        $this->actingAs($this->user)->getJson("/api/books/{$id}/notes")
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->actingAs($this->user)->getJson("/api/books/{$id}/notes?quotes=1")
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    /**
     * ფაილი კვოტაზე გადის და წიგნის წაშლა მას დისკიდანაც შლის
     * (SQL cascade მოდელის ივენთს არ აგდებს — იხ. `Book::booted()`).
     */
    public function test_files_count_towards_the_quota_and_are_removed_with_the_book(): void
    {
        Storage::fake('public');
        $meter = app(StorageMeter::class);

        $id = $this->makeBook();

        $file = UploadedFile::fake()->create('book.epub', 500);
        $path = $this->actingAs($this->user)
            ->postJson("/api/books/{$id}/files", ['kind' => 'book', 'files' => [$file]])
            ->assertStatus(201)
            ->json('data.0.url');

        // საქაღალდე მოდულისაა (2026-09-04)
        $this->assertStringStartsWith('books/files/ebooks/', $path);

        $used = (int) $this->user->refresh()->storage_used_bytes;
        $this->assertGreaterThan(0, $used);
        $this->actingAs($this->user)->getJson('/api/storage')
            ->assertOk()
            ->assertJsonPath('modules.book', $used);

        /* ⚠️ **კალათა (FEAT-11)** — `DELETE /api/<module>/{id}` ჩანაწერს
           აღარ შლის, კალათაში გადააქვს; ფაილი და კვოტა მაშინ თავისუფლდება,
           როცა ის კალათიდანაც წაიშლება. ტესტი სწორედ ამ სრულ გზას გადის. */
        $this->actingAs($this->user)->deleteJson("/api/books/{$id}")->assertNoContent();
        $this->actingAs($this->user)->deleteJson("/api/trash/book/{$id}")->assertNoContent();

        Storage::disk('public')->assertMissing($path);
        $this->assertSame(0, (int) $this->user->refresh()->storage_used_bytes);
        $this->assertSame(0, $meter->recalculate($this->user->refresh()));
    }

    /** სხვისი წიგნი 404-ია (`BelongsToUser`-ის global scope) */
    public function test_another_users_book_is_not_found(): void
    {
        $other = $this->makeUser('otto', ['book']);
        $id = $this->makeBook();

        $this->actingAs($other)->getJson("/api/books/{$id}")->assertStatus(404);
        $this->actingAs($other)->deleteJson("/api/books/{$id}")->assertStatus(404);
    }
}
