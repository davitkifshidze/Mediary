<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\Game;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\Status;
use App\Models\User;
use App\Services\Stats\LibraryStats;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * **წლიური მიზნები (FEAT-21).**
 *
 * მიზანი თვითონ `users.settings`-შია (მიგრაციის გარეშე), ე.ი. backend-ის
 * მხარეს შესამოწმებელი **პროგრესია**: „წელს რამდენი დავასრულე" მოდულებად.
 */
class YearGoalsTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(ModulesSeeder::class);

        $this->user = User::factory()->create();
        $this->user->assignRole('super_admin')->save();
        $this->actingAs($this->user);

        Status::ensureDefaults($this->user->id, 'movie');
    }

    private function watched(string $title, string $when): Movie
    {
        $movie = Movie::create(['user_id' => $this->user->id]);
        $movie->setTranslation('en', ['title' => $title]);

        // ⚠️ `applyStatusKey()` — `watched_at`-ს **მხოლოდ ის** წერს (§6.4)
        Carbon::setTestNow(Carbon::parse($when, 'UTC'));
        $movie->applyStatusKey('watched');
        $movie->save();
        Carbon::setTestNow();

        return $movie;
    }

    public function test_the_summary_counts_this_year_per_module(): void
    {
        $year = (int) now()->format('Y');

        $this->watched('A', "{$year}-02-10 12:00:00");
        $this->watched('B', "{$year}-05-01 12:00:00");
        $this->watched('C', ($year - 1).'-05-01 12:00:00');

        $body = $this->getJson('/api/stats/summary')->assertOk()->json();

        $this->assertSame(2, $body['done_by_module']['movie']);
        // ⚠️ იგივე რიცხვი ჯამშიც — ორი წყარო ერთი კითხვისთვის აკრძალულია
        $this->assertSame(2, $body['totals']['done_year']);
    }

    /**
     * **ყველა ჩანაწერიან მოდულს შეუძლია მიზანი (FEAT-21-ის ნარჩენი, 2026-09-20).**
     *
     * ⚠️ ეს ტესტი **შებრუნდა და ეს თვითონ შედეგია**: აქამდე ის ამტკიცებდა,
     * რომ წიგნს, თამაშს, ბორდგეიმსა და ჩანაწერს მიზანი **არ** შეუძლიათ —
     * ე.ი. ტასქის დროშისებრი მაგალითი („წელს 24 წიგნი") არ მუშაობდა.
     * ახლა ოთხივეს თავისი სვეტი აქვს.
     */
    public function test_every_record_module_can_take_a_goal(): void
    {
        $goal = LibraryStats::goalModules(LibraryStats::modules());

        foreach (LibraryStats::modules() as $key) {
            if (isset(self::NO_GOAL[$key])) {
                $this->assertNotContains($key, $goal, "`{$key}` is listed as having no goal");

                continue;
            }

            $this->assertContains($key, $goal, "`{$key}` has no completion date");
        }
    }

    /**
     * ცხადი გამონაკლისები — **მიზეზით** (`ExportDomain::NOT_EXPORTED`-ის
     * ყალიბი), რომ მომავალი მოდული თარიღის გარეშე ჩუმად არ გავიდეს.
     *
     * @var array<string, string>
     */
    private const NO_GOAL = [
        'board_game' => 'Tasks §12 — სტატუსი და შეძენის თარიღი ამოღებულია (Q10)',
    ];

    /**
     * **enum-სტატუსიანი სამი მოდული — `TracksCompletion`-ის ერთადერთი მწერალი.**
     *
     * ⚠️ თარიღი სტატუსს მიჰყვება ორივე მიმართულებით: „გაკეთებულზე" ჩნდება
     * და უკან დაბრუნებაზე იშლება. უამისოდ სტატისტიკა დაუსრულებელ ჩანაწერს
     * სამუდამოდ ჩათვლიდა.
     */
    #[DataProvider('completionCases')]
    public function test_the_completion_date_follows_the_status(
        string $model,
        string $column,
        string $done,
        string $notDone,
        array $extra = [],
    ): void {
        $record = $model::create(['user_id' => $this->user->id, 'status' => $notDone] + $extra);
        $this->assertNull($record->{$column}, 'an unfinished record carries no date');

        $record->status = $done;
        $record->save();
        $this->assertNotNull($record->fresh()->{$column});

        $record->status = $notDone;
        $record->save();
        $this->assertNull($record->fresh()->{$column}, 'going back must clear the date');
    }

    public static function completionCases(): array
    {
        return [
            'book' => [Book::class, 'finished_at', 'read', 'reading'],
            'game' => [Game::class, 'finished_at', 'finished', 'playing'],
        ];
    }

    /**
     * **ჩანაწერს ახალი მექანიზმი არ დასჭირვებია** — `HasStatus::applyStatus()`
     * უკვე იყო ერთადერთი მწერალი, უბრალოდ სვეტის სახელი `null`-ი იყო.
     */
    public function test_a_note_records_when_it_was_finished(): void
    {
        Status::ensureDefaults($this->user->id, 'note');

        $note = NoteEntry::create(['user_id' => $this->user->id, 'title' => 'A']);
        $this->assertNull($note->finished_at);

        $note->applyStatusKey('done');
        $note->save();
        $this->assertNotNull($note->fresh()->finished_at);

        $note->applyStatusKey('open');
        $note->save();
        $this->assertNull($note->fresh()->finished_at);
    }

    /**
     * **ერთხელ ჩაწერილი თარიღი აღარ იცვლება.**
     *
     * ⚠️ `??`-ის ნაცვლად `?:`-ით დაწერილი მწერალი ყოველ შენახვაზე დღევანდელ
     * თარიღს ჩასვამდა — „წელს რამდენი წავიკითხე" ყოველ რედაქტირებაზე
     * შეიცვლებოდა და შარშანდელი წიგნი წლევანდელში გადმოვიდოდა.
     */
    public function test_an_existing_completion_date_is_never_rewritten(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-03-05 10:00:00', 'UTC'));
        $book = Book::create(['user_id' => $this->user->id, 'status' => 'read']);
        Carbon::setTestNow();

        $book->rating = 9;
        $book->save();

        $this->assertSame('2026-03-05', $book->fresh()->finished_at->toDateString());
    }

    /** ერთი წიგნი წელს — ჯამშიც და მოდულის რიცხვშიც */
    public function test_a_finished_book_reaches_the_goal_progress(): void
    {
        $year = (int) now()->format('Y');

        Carbon::setTestNow(Carbon::parse("{$year}-04-02 09:00:00", 'UTC'));
        Book::create(['user_id' => $this->user->id, 'status' => 'read']);
        Carbon::setTestNow();

        $body = $this->getJson('/api/stats/summary')->assertOk()->json();

        $this->assertSame(1, $body['done_by_module']['book']);
        $this->assertContains('book', $body['goal_modules']);
    }

    /** ცარიელი მოდული სიაში მაინც დგას — ნულით და არა გამოტოვებული */
    public function test_a_module_with_nothing_done_still_reports_zero(): void
    {
        $body = $this->getJson('/api/stats/summary')->assertOk()->json();

        $this->assertArrayHasKey('movie', $body['done_by_module']);
        $this->assertSame(0, $body['done_by_module']['movie']);
        $this->assertContains('movie', $body['goal_modules']);
    }

    /**
     * Tasks §12.5 — **რატომ აკლია მოდული**: სამაგიდო თამაშს დასრულების
     * თარიღი აღარ აქვს, ე.ი. `goal_modules`-იდან გადის და `no_goal_modules`-ში
     * ჩნდება; გალერეა (ჩანაწერის გარეშე) არც ერთ სიაში არ ხვდება.
     */
    public function test_a_module_without_a_date_is_reported_as_unable_to_take_a_goal(): void
    {
        $body = $this->getJson('/api/stats/summary')->assertOk()->json();

        $this->assertNotContains('board_game', $body['goal_modules']);
        $this->assertContains('board_game', $body['no_goal_modules']);
        $this->assertNotContains('gallery', $body['no_goal_modules']);
        $this->assertNotContains('movie', $body['no_goal_modules']);
    }

    /** მიზნები `users.settings`-ში ინახება — ცალკე ცხრილის გარეშე */
    public function test_goals_survive_a_settings_round_trip(): void
    {
        $this->putJson('/api/auth/settings', [
            'settings' => ['goals' => ['movie' => ['2026' => 50]]],
        ])->assertOk();

        $this->assertSame(
            50,
            $this->user->fresh()->settings['goals']['movie']['2026'],
        );
    }
}
