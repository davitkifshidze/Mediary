<?php

namespace Tests\Feature;

use App\Models\Module;
use App\Models\Movie;
use App\Models\Series;
use App\Models\Status;
use App\Models\User;
use Database\Seeders\ModulesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * **Tasks §15 — „საყურებელი" ბრუნდება ფილმებში, სერიალებსა და ანიმეში.**
 *
 * მიგრაცია `2026_09_27_000006` ორ მდგომარეობას ასწორებს — (ა) `to_watch`
 * „ვუყურებ"-ად გადაკეთდა და `watching` ხდება, (ბ) `to_watch` აღარაა და
 * „გადაუწყვეტელის" შემდეგ ბრუნდება — და Q12-ის პირობას იცავს: ძველი რიგის
 * კვალი (ჩანაწერები, საიდბარი, აუდიტის ლოგი) ძველ რიგს მიჰყვება, ახალ
 * „საყურებელს" კი არაფერი ძველი.
 */
class RestoreToWatchStatusTest extends TestCase
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

    private function migrate(): void
    {
        (require database_path('migrations/2026_09_27_000006_restore_to_watch_status.php'))->up();
    }

    /** ლექსიკონის რიგი გასაღებით */
    private function row(User $user, string $domain, string $key): ?Status
    {
        return Status::withoutGlobalScope('owner')
            ->where('user_id', $user->id)
            ->where('module', $domain)
            ->where('key', $key)
            ->first();
    }

    /** @return list<string> გასაღებები ლექსიკონის რიგით */
    private function keys(User $user, string $domain): array
    {
        return Status::withoutGlobalScope('owner')
            ->where('user_id', $user->id)
            ->where('module', $domain)
            ->ordered()
            ->pluck('key')
            ->all();
    }

    /** სერიალის/ანიმეს ცოცხალი მდგომარეობა: `to_watch` „ვუყურებ"-ად, `watching` წაშლილი */
    private function repurpose(User $user, string $domain, array $extra = []): Status
    {
        Status::ensureDefaults($user->id, $domain);

        $this->row($user, $domain, 'watching')->delete();
        $toWatch = $this->row($user, $domain, 'to_watch');
        $toWatch->forceFill(['name_ka' => 'ვუყურებ', 'name_en' => 'Watching', 'role' => 'doing', ...$extra])->save();

        return $toWatch;
    }

    private function layout(User $user, string $domain, array $layout, array $rest = []): void
    {
        DB::table('module_user')
            ->where('user_id', $user->id)
            ->where('module_id', Module::where('key', $domain)->value('id'))
            ->update(['settings' => json_encode([...$rest, 'status_sections' => $layout])]);
    }

    /** @return array<string, mixed> */
    private function settings(User $user, string $domain): array
    {
        return json_decode((string) DB::table('module_user')
            ->where('user_id', $user->id)
            ->where('module_id', Module::where('key', $domain)->value('id'))
            ->value('settings'), true);
    }

    /** ხელით ჩაწერილი ლოგი — ⚠️ მოგონილ `subject_id`-ზე, ნამდვილ ჩანაწერს რომ არ დაემთხვეს */
    private function log(?User $actor, string $subjectType, ?array $old, ?array $new, string $action = 'update'): int
    {
        return DB::table('audit_logs')->insertGetId([
            'user_id' => $actor?->id,
            'action' => $action,
            'module' => $subjectType,
            'subject_type' => $subjectType,
            'subject_id' => 9000,
            'old_values' => $old === null ? null : json_encode($old),
            'new_values' => $new === null ? null : json_encode($new),
            'created_at' => now(),
        ]);
    }

    /** @return array{0: ?array, 1: ?array} */
    private function logValues(int $id): array
    {
        $row = DB::table('audit_logs')->find($id);

        return [json_decode((string) $row->old_values, true), json_decode((string) $row->new_values, true)];
    }

    /* ---------- (ბ) ---------- */

    /** ფილმების ცოცხალი მდგომარეობა: „საყურებელი" წაშლილია → „გადაუწყვეტელის" შემდეგ ბრუნდება */
    public function test_a_deleted_to_watch_comes_back_after_undecided(): void
    {
        $this->actingAs($this->user);
        Status::ensureDefaults($this->user->id, 'movie');
        $this->row($this->user, 'movie', 'to_watch')->delete();

        $watching = $this->row($this->user, 'movie', 'watching');
        $movie = Movie::create(['user_id' => $this->user->id]);
        $movie->applyStatus($watching);
        $movie->save();

        $this->migrate();

        $this->assertSame(['undecided', 'to_watch', 'watching', 'watched'], $this->keys($this->user, 'movie'));

        $toWatch = $this->row($this->user, 'movie', 'to_watch');
        $this->assertSame('საყურებელი', $toWatch->name_ka);
        $this->assertSame('To watch', $toWatch->name_en);
        $this->assertSame('todo', $toWatch->role);
        $this->assertSame('Clock', $toWatch->icon);
        $this->assertFalse($toWatch->is_default);

        $orders = Status::withoutGlobalScope('owner')->where('user_id', $this->user->id)
            ->where('module', 'movie')->ordered()->pluck('sort_order')->all();
        $this->assertSame($orders, array_values(array_unique($orders)), 'რიგი ორჯერ ერთ ადგილს იკავებს');

        // ⚠️ ჩანაწერი თავის „ვუყურებ"-ზე რჩება — ახალ რიგს არაფერი მიჰყვება
        $this->assertSame($watching->id, $movie->refresh()->status_id);
    }

    /** ⚠️ მკვდარი `to_watch` განლაგებაში ახალ რიგს არ მიება — თორემ დამალული დაიბადებოდა */
    public function test_nothing_stale_follows_the_new_to_watch(): void
    {
        Status::ensureDefaults($this->user->id, 'movie');
        $this->row($this->user, 'movie', 'to_watch')->delete();

        $this->layout($this->user, 'movie', [
            'hidden' => ['to_watch', 'watched'],
            'placement' => [['id' => 'all', 'at' => 'start'], ['id' => 'favorite', 'at' => 'to_watch']],
        ], ['fields' => ['year' => ['enabled' => false]]]);

        $this->migrate();

        $settings = $this->settings($this->user, 'movie');

        $this->assertSame(['watched'], $settings['status_sections']['hidden']);
        $this->assertSame(
            [['id' => 'all', 'at' => 'start'], ['id' => 'favorite', 'at' => 'end']],
            $settings['status_sections']['placement'],
            'მკვდარი ანკერი SPA-ში ბოლოს იხატებოდა — იქვე უნდა დარჩეს',
        );
        // pivot-ის JSON-ის სხვა გასაღებები ხელუხლებელია
        $this->assertSame(['year' => ['enabled' => false]], $settings['fields']);
    }

    /** „გადაუწყვეტელი" წაშლილია → „საყურებელი" პირველი ხდება */
    public function test_without_undecided_to_watch_goes_first(): void
    {
        Status::ensureDefaults($this->user->id, 'anime');
        $this->row($this->user, 'anime', 'undecided')->delete();
        $this->row($this->user, 'anime', 'to_watch')->delete();

        $this->migrate();

        $this->assertSame(['to_watch', 'watching', 'watched'], $this->keys($this->user, 'anime'));
    }

    /* ---------- (ა) ---------- */

    /**
     * სერიალის ცოცხალი მდგომარეობა: `to_watch` „ვუყურებ"-ია → გასაღები
     * `watching` ხდება თავისი კვალით, „საყურებელი" კი თავიდან იბადება.
     */
    public function test_a_repurposed_to_watch_becomes_watching_with_its_trace(): void
    {
        $this->actingAs($this->user);
        $old = $this->repurpose($this->user, 'series');

        $series = Series::create(['user_id' => $this->user->id]);
        $series->applyStatus($old);
        $series->save();

        $this->layout($this->user, 'series', [
            // ⚠️ `watching` აქ წაშლილ რიგს ეკუთვნის — გადარქმეული მის გამო არ უნდა დაიმალოს
            'hidden' => ['watching'],
            'placement' => [['id' => 'favorite', 'at' => 'to_watch'], ['id' => 'all', 'at' => 'watching']],
        ]);

        $admin = $this->makeUser('root');
        $ownerLog = $this->log($this->user, 'series', ['status' => 'undecided'], ['status' => 'to_watch']);
        $purgeLog = $this->log($admin, 'series', ['user_id' => $this->user->id, 'status' => 'to_watch'], null, 'delete');
        $videoLog = $this->log($this->user, 'video', ['status' => 'undecided'], ['status' => 'to_watch']);

        // მეორე ანგარიშის ხელუხლებელი ნაკრები — მისი `to_watch` ისევ „საყურებელია"
        $other = $this->makeUser('nino');
        Status::ensureDefaults($other->id, 'series');
        $otherLog = $this->log($other, 'series', ['status' => 'undecided'], ['status' => 'to_watch']);

        $this->migrate();

        // ძველი რიგი — იგივე id, ახალი გასაღები; ხატულა ნაგულისხმევი იყო და მიჰყვება
        $renamed = Status::withoutGlobalScope('owner')->find($old->id);
        $this->assertSame('watching', $renamed->key);
        $this->assertSame('ვუყურებ', $renamed->name_ka);
        $this->assertSame('doing', $renamed->role);
        $this->assertSame('Eye', $renamed->icon);

        // ახალი „საყურებელი" — სხვა რიგია, „გადაუწყვეტელის" შემდეგ
        $toWatch = $this->row($this->user, 'series', 'to_watch');
        $this->assertNotSame($old->id, $toWatch->id);
        $this->assertSame(['საყურებელი', 'todo', 'Clock'], [$toWatch->name_ka, $toWatch->role, $toWatch->icon]);
        $this->assertSame(['undecided', 'to_watch', 'watching', 'watched'], $this->keys($this->user, 'series'));

        // ⚠️ Q12 — ყველაფერი ძველ რიგს მიჰყვება, ახალს არაფერი
        $this->assertSame($old->id, $series->refresh()->status_id);
        $this->assertSame('watching', $series->status_key);

        $layout = $this->settings($this->user, 'series')['status_sections'];
        $this->assertSame([], $layout['hidden']);
        $this->assertSame([['id' => 'favorite', 'at' => 'watching'], ['id' => 'all', 'at' => 'end']], $layout['placement']);

        $this->assertSame([['status' => 'undecided'], ['status' => 'watching']], $this->logValues($ownerLog));
        $this->assertSame([['user_id' => $this->user->id, 'status' => 'watching'], null], $this->logValues($purgeLog));

        // ⚠️ AuditObserver-ის ნამდვილი ჩანაწერიც (`applyStatus()` → update) გადაიწერა
        $observed = DB::table('audit_logs')->where('subject_type', 'series')
            ->where('subject_id', $series->id)->where('action', 'update')->latest('id')->first();
        $this->assertSame('watching', json_decode((string) $observed->new_values, true)['status']);

        // ხელუხლებელი: სხვა ანგარიში და სხვა მოდული (ვიდეოს `to_watch` მართლაც „საყურებელია")
        $this->assertSame(['status' => 'to_watch'], $this->logValues($otherLog)[1]);
        $this->assertSame(['status' => 'to_watch'], $this->logValues($videoLog)[1]);
        $this->assertSame(['undecided', 'to_watch', 'watching', 'watched'], $this->keys($other, 'series'));
    }

    /** დამალული ძველი რიგი დამალული რჩება, ახალი „საყურებელი" კი — არა */
    public function test_a_hidden_repurposed_row_stays_hidden(): void
    {
        $this->repurpose($this->user, 'anime');
        $this->layout($this->user, 'anime', ['hidden' => ['to_watch', 'watched'], 'placement' => []]);

        $this->migrate();

        $this->assertSame(['watching', 'watched'], $this->settings($this->user, 'anime')['status_sections']['hidden']);
    }

    /** ხელით არჩეული ხატულა გადარქმევას გადაურჩება */
    public function test_a_hand_picked_icon_survives_the_rename(): void
    {
        $old = $this->repurpose($this->user, 'anime', ['icon' => 'Tv']);

        $this->migrate();

        $this->assertSame('Tv', Status::withoutGlobalScope('owner')->find($old->id)->icon);
        $this->assertSame('watching', Status::withoutGlobalScope('owner')->find($old->id)->key);
    }

    /** მეორე გაშვება არაფერს ცვლის — „საყურებელი" უკვე არის */
    public function test_a_second_run_changes_nothing(): void
    {
        $this->repurpose($this->user, 'series');
        Status::ensureDefaults($this->user->id, 'movie');
        $this->row($this->user, 'movie', 'to_watch')->delete();

        $this->migrate();
        $snapshot = DB::table('statuses')->orderBy('id')->get()->toArray();

        $this->migrate();

        $this->assertEquals($snapshot, DB::table('statuses')->orderBy('id')->get()->toArray());
    }

    /* ---------- ხელუხლებელი ---------- */

    /** ხელუხლებელი ნაკრები და ჯერ გაუხსნელი ლექსიკონი */
    public function test_pristine_and_empty_dictionaries_are_untouched(): void
    {
        Status::ensureDefaults($this->user->id, 'movie');
        $before = DB::table('statuses')->orderBy('id')->get()->toArray();

        $this->migrate();

        $this->assertEquals($before, DB::table('statuses')->orderBy('id')->get()->toArray());
        // ანიმე არასდროს გახსნილა — ნაკრებს `ensureDefaults()` თავისით დათესავს
        $this->assertSame([], $this->keys($this->user, 'anime'));
    }

    /**
     * ⚠️ ორი „საყურებელი" არ ჩნდება: ანგარიშმა ის ხელით შექმნა სხვა
     * გასაღებით, ან `to_watch`-ს სხვა სახელი დაარქვა და `todo` დატოვა.
     */
    public function test_an_account_that_already_has_its_to_watch_is_left_alone(): void
    {
        Status::ensureDefaults($this->user->id, 'movie');
        $this->row($this->user, 'movie', 'to_watch')->delete();
        Status::withoutGlobalScope('owner')->create([
            'user_id' => $this->user->id, 'module' => 'movie', 'key' => 'mine',
            'name_ka' => 'საყურებელი ', 'name_en' => 'Later', 'role' => 'todo', 'sort_order' => 9,
        ]);

        Status::ensureDefaults($this->user->id, 'series');
        $this->row($this->user, 'series', 'to_watch')->forceFill(['name_ka' => 'სანახავი', 'name_en' => 'Queue'])->save();

        $this->migrate();

        $this->assertSame(['undecided', 'watching', 'watched', 'mine'], $this->keys($this->user, 'movie'));
        $this->assertSame('სანახავი', $this->row($this->user, 'series', 'to_watch')->name_ka);
        $this->assertSame(['undecided', 'to_watch', 'watching', 'watched'], $this->keys($this->user, 'series'));
    }

    /**
     * ⚠️ ორაზროვანი მდგომარეობა ადამიანს რჩება: `to_watch` `done`-ად
     * გადაკეთდა (`watching` მას სხვის ფერს მისცემდა), ან ორივე გასაღები ცოცხალია.
     */
    public function test_ambiguous_states_are_left_for_a_human(): void
    {
        Status::ensureDefaults($this->user->id, 'movie');
        $this->row($this->user, 'movie', 'watching')->delete();
        $this->row($this->user, 'movie', 'to_watch')
            ->forceFill(['name_ka' => 'მიტოვებული', 'name_en' => 'Dropped', 'role' => 'done'])->save();

        Status::ensureDefaults($this->user->id, 'series');
        $this->row($this->user, 'series', 'to_watch')
            ->forceFill(['name_ka' => 'ვუყურებ', 'name_en' => 'Watching', 'role' => 'doing'])->save();

        $before = DB::table('statuses')->orderBy('id')->get()->toArray();

        $this->migrate();

        $this->assertEquals($before, DB::table('statuses')->orderBy('id')->get()->toArray());
    }
}
