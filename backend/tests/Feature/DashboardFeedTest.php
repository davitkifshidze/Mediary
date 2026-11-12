<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\Module;
use App\Models\Movie;
use App\Models\NoteCategory;
use App\Models\NoteEntry;
use App\Models\Status;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

/**
 * **მთავარი გვერდის არჩევითი ზოლები** — „ვაგრძელებ" და „ბოლოს დამატებული".
 *
 * ⚠️ მოწმდება ის, რაც ჩუმად გაჟონავდა ან არასწორს აჩვენებდა: სხვისი და ურნაში მყოფი
 * ჩანაწერი არ ჩანს; გამორთული მოდული არ იკითხება; „ვაგრძელებ" მხოლოდ დაწყებულს აჩვენებს
 * (ლექსიკონზე — როლი, enum-ზე — მნიშვნელობა); ჩანიშვნის პრივატული ფოტო პასუხში არ გადის.
 */
class DashboardFeedTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ModulesSeeder::class);

        $this->user = $this->makeUser('nia', ['movie', 'book', 'note']);
        $this->actingAs($this->user);
    }

    private function makeUser(string $name, array $modules): User
    {
        $user = User::create(['name' => $name, 'username' => $name, 'email' => "{$name}@example.com", 'password' => 'password']);
        $user->modules()->sync(Module::whereIn('key', $modules)->pluck('id')->all());

        return $user->refresh();
    }

    private function movie(User $owner, string $title, string $role): Movie
    {
        $movie = Movie::withoutGlobalScopes()->create([
            'user_id' => $owner->id, 'year' => 2020,
            'status_id' => Status::withoutGlobalScopes()->where('user_id', $owner->id)->where('module', 'movie')->where('role', $role)->value('id'),
        ]);
        $movie->setTranslation('en', ['title' => $title]);

        return $movie;
    }

    public function test_continuing_lists_what_was_started_and_not_finished(): void
    {
        Status::ensureDefaults($this->user->id, 'movie');
        $watching = $this->movie($this->user, 'Dune', 'doing');
        $this->movie($this->user, 'Seen already', 'done');
        $this->movie($this->user, 'Some day', 'todo');
        $reading = Book::create(['user_id' => $this->user->id, 'title_en' => 'Hyperion', 'status' => 'reading']);
        Book::create(['user_id' => $this->user->id, 'title_en' => 'Finished book', 'status' => 'read']);

        $rows = $this->getJson('/api/dashboard/continuing')->assertOk()->json('data');

        $this->assertEqualsCanonicalizing(
            [['movie', $watching->id, 'Dune'], ['book', $reading->id, 'Hyperion']],
            array_map(fn (array $row) => [$row['module'], $row['id'], $row['title']], $rows),
        );
        // ბარათი ვიწროა: მოდული, id, სათაურები, ფოტო და თარიღი — სხვა არაფერი
        $this->assertSame(['module', 'id', 'title', 'title_ka', 'photo', 'at'], array_keys($rows[0]));
    }

    public function test_recent_is_newest_first_and_never_shows_trashed_foreign_or_disabled_records(): void
    {
        Status::ensureDefaults($this->user->id, 'movie');
        $old = $this->movie($this->user, 'Old', 'todo');
        $old->forceFill(['created_at' => now()->subDays(3)])->saveQuietly();
        $new = Book::create(['user_id' => $this->user->id, 'title_en' => 'New book', 'status' => 'to_read']);
        $trashed = Book::create(['user_id' => $this->user->id, 'title_en' => 'Trashed', 'status' => 'to_read']);
        $trashed->moveToTrash();

        $other = $this->makeUser('otar', ['movie']);
        Status::ensureDefaults($other->id, 'movie');
        $this->movie($other, 'Not mine', 'todo');

        $titles = array_column($this->getJson('/api/dashboard/recent')->assertOk()->json('data'), 'title');
        $this->assertSame(['New book', 'Old'], $titles);

        // წიგნების მოდული გამოირთო — მისი ჩანაწერი აღარ იკითხება
        $this->user->modules()->sync(Module::whereIn('key', ['movie', 'note'])->pluck('id')->all());
        // ⚠️ ჩართული მოდულების სია მომხმარებლის ობიექტზე იმახსოვრება — ახალი მოთხოვნა ახალ ობიექტს კითხულობს
        $this->actingAs($this->user->fresh());
        $titles = array_column($this->getJson('/api/dashboard/recent')->assertOk()->json('data'), 'title');
        $this->assertSame(['Old'], $titles);
        $this->assertNotNull($new->fresh());

        Auth::forgetGuards();
        $this->getJson('/api/dashboard/recent')->assertUnauthorized();
    }

    public function test_a_private_photo_never_leaves_through_the_feed(): void
    {
        NoteCategory::ensureDefaults($this->user->id);
        NoteEntry::create([
            'user_id' => $this->user->id, 'title' => 'დაზღვევა', 'photo_path' => 'notes/photos/secret.png',
            'category_id' => NoteCategory::where('user_id', $this->user->id)->value('id'),
        ]);
        Book::create(['user_id' => $this->user->id, 'title_en' => 'With cover', 'status' => 'to_read', 'cover_path' => 'books/covers/x.jpg', 'cover_source' => 'upload']);
        // მხოლოდ ქართული სათაური: `title()` მეთოდია და არა სვეტი — ბარათი ამაზე არ უნდა ჩავარდეს
        Book::create(['user_id' => $this->user->id, 'title_ka' => 'ვეფხისტყაოსანი', 'status' => 'to_read']);

        $rows = collect($this->getJson('/api/dashboard/recent')->assertOk()->json('data'))->keyBy('title');

        $this->assertNull($rows['დაზღვევა']['photo']);
        $georgian = collect($this->getJson('/api/dashboard/recent')->json('data'))->firstWhere('title_ka', 'ვეფხისტყაოსანი');
        $this->assertSame([null, 'ვეფხისტყაოსანი'], [$georgian['title'], $georgian['title_ka']]);
        $this->assertSame('books/covers/x.jpg', $rows['With cover']['photo']);
        $this->assertStringNotContainsString('notes/photos', json_encode($rows));
    }
}
