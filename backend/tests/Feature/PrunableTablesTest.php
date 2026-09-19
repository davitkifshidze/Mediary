<?php

namespace Tests\Feature;

use App\Models\BatchItem;
use App\Models\NoteEntry;
use App\Models\NoteNotification;
use App\Models\SerpSearch;
use App\Models\TranslationUsage;
use App\Models\User;
use App\Support\AppTime;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * **უსასრულოდ მზარდი ცხრილები (Tasks DEBT-24).**
 *
 * ⚠️ ოთხივე `MassPrunable`-ია და არა `Prunable`: წაშლა ერთი query-ია,
 * მოვლენების გარეშე. ოთხივე `AuditRegistry::NOT_LOGGED`-შია, ე.ი. observer-ს
 * ისედაც არაფერი ეთქმოდა — ათასობით მოდელის ჩატვირთვა მხოლოდ წასაშლელად
 * სუფთა ფუჭი ხარჯი იქნებოდა.
 */
class PrunableTablesTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::create([
            'name' => 'gia',
            'username' => 'gia',
            'email' => 'gia@example.com',
            'password' => 'password',
        ]);
    }

    /** ⚠️ `created_at` ხელით ეწერება — `Model::create()` მას ყოველთვის „ახლას" დაუდებდა */
    private function aged(string $table, array $row, int $daysAgo, string $column = 'created_at'): int
    {
        $id = \DB::table($table)->insertGetId([
            ...$row,
            'created_at' => AppTime::now()->subDays($daysAgo),
            'updated_at' => AppTime::now()->subDays($daysAgo),
        ]);

        if ($column !== 'created_at') {
            \DB::table($table)->where('id', $id)->update([$column => AppTime::now()->subDays($daysAgo)]);
        }

        return $id;
    }

    public function test_old_serp_searches_are_pruned_and_recent_ones_stay(): void
    {
        $old = $this->aged('serp_searches', ['user_id' => $this->user->id, 'engine' => 'google_images', 'query' => 'x', 'results' => 1], 120);
        $new = $this->aged('serp_searches', ['user_id' => $this->user->id, 'engine' => 'google_images', 'query' => 'y', 'results' => 1], 10);

        $this->artisan('model:prune', ['--model' => [SerpSearch::class]])->assertSuccessful();

        $this->assertNull(SerpSearch::find($old));
        $this->assertNotNull(SerpSearch::find($new));
    }

    public function test_old_translation_usages_are_pruned(): void
    {
        $old = $this->aged('translation_usages', ['user_id' => $this->user->id, 'provider' => 'gemini', 'chars' => 10, 'ok' => true], 120);
        $new = $this->aged('translation_usages', ['user_id' => $this->user->id, 'provider' => 'gemini', 'chars' => 10, 'ok' => true], 10);

        $this->artisan('model:prune', ['--model' => [TranslationUsage::class]])->assertSuccessful();

        $this->assertNull(TranslationUsage::find($old));
        $this->assertNotNull(TranslationUsage::find($new));
    }

    /**
     * ⚠️ **`owner` სკოუპი გასუფთავებას არ უნდა ჭრიდეს.** CLI-ზე `Auth::id()`
     * ცარიელია და ის ისედაც არ მოქმედებს, მაგრამ ამაზე დაყრდნობა ნიშნავდა,
     * რომ ვებიდან გაშვებული იგივე ბრძანება ჩუმად მხოლოდ ერთი ანგარიშის
     * რიგებს წაშლიდა — ამიტომ ეს ტესტი **ავტორიზებულია**.
     */
    public function test_old_batch_items_are_pruned_regardless_of_the_owner_scope(): void
    {
        $other = User::create(['name' => 'oto', 'username' => 'oto', 'email' => 'oto@example.com', 'password' => 'p']);

        $row = ['kind' => 'sync', 'type' => 'movie', 'record_id' => 1, 'status' => 'ok'];

        $mine = $this->aged('batch_items', [...$row, 'user_id' => $this->user->id, 'batch_id' => 'b1'], 60);
        $theirs = $this->aged('batch_items', [...$row, 'user_id' => $other->id, 'batch_id' => 'b1'], 60);
        $fresh = $this->aged('batch_items', [...$row, 'user_id' => $this->user->id, 'batch_id' => 'b2'], 3);

        $this->actingAs($this->user);
        $this->artisan('model:prune', ['--model' => [BatchItem::class]])->assertSuccessful();

        $left = BatchItem::withoutGlobalScope('owner')->pluck('id')->all();

        $this->assertNotContains($mine, $left);
        $this->assertNotContains($theirs, $left, 'სხვისი ძველი რიგი დარჩა — `owner` სკოუპი გასუფთავებას ჭრის');
        $this->assertContains($fresh, $left);
    }

    /**
     * ⚠️ **მხოლოდ წაკითხული შეტყობინება იშლება.** `read_at`-ის გარეშე რიგი
     * ან ჯერ ეკრანზე არ ყოფილა, ან ჩავარდნილია (`failed` + მიზეზი) — ორივე
     * ჩვენებადია, ე.ი. ვადით ბრმა წაშლა შეხსენებას უბრალოდ დაკარგავდა.
     */
    public function test_only_read_notifications_are_pruned(): void
    {
        $note = NoteEntry::create(['user_id' => $this->user->id, 'title' => 'x']);

        $base = [
            'user_id' => $this->user->id,
            'note_entry_id' => $note->id,
            'channel' => 'browser',
            'title' => 'x',
            'status' => 'sent',
            'scheduled_for' => AppTime::now()->subDays(200),
        ];

        $readOld = $this->aged('note_notifications', $base, 200, 'read_at');
        $readNew = $this->aged('note_notifications', $base, 5, 'read_at');
        $unread = $this->aged('note_notifications', $base, 200);

        $this->artisan('model:prune', ['--model' => [NoteNotification::class]])->assertSuccessful();

        $left = NoteNotification::withoutGlobalScope('owner')->pluck('id')->all();

        $this->assertNotContains($readOld, $left);
        $this->assertContains($readNew, $left);
        $this->assertContains($unread, $left, 'წაუკითხავი შეტყობინება წაიშალა');
    }

    /** ორივე ახალი დაგეგმილი ბრძანება რეგისტრირებულია */
    public function test_the_schedule_carries_both_prune_commands(): void
    {
        $commands = collect(app(Schedule::class)->events())
            ->map(fn ($event) => $event->command)
            ->implode("\n");

        $this->assertStringContainsString('model:prune', $commands);
        $this->assertStringContainsString('queue:prune-batches', $commands);
    }
}
