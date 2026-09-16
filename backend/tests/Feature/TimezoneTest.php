<?php

namespace Tests\Feature;

use App\Models\NoteEntry;
use App\Models\NoteReminder;
use App\Models\User;
use App\Support\AppTime;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * **Tasks §8 — სერვერის დრო საქართველოსია.**
 *
 * შენი სიტყვები: „ყველგან ისე გადაიკეტოს, რომ დრო იყოს იმ ქვეყნის მიხედვით,
 * სადაც არის ლოკაცია; ამ ეტაპზე თბილისი".
 *
 * ⚠️ **ეს ტესტი ერთ კონკრეტულ ხაფანგს იჭერს და არა „კონფიგი სწორია"-ს.**
 * Eloquent ჩაწერისას ზონას **არ** გარდაქმნის, წაკითხვისას კი აპლიკაციის
 * ზონით კითხულობს. ე.ი. ცხადი წანაცვლებით მოსული მომენტი
 * (`2026-10-01T00:00:00+00:00`) ბაზაში თავისი კედლის საათით ჩაიწერებოდა და
 * უკან **4 საათით ადრე** დაბრუნდებოდა. სწორედ ამიტომ არსებობს
 * `App\Support\AppTime` და `NoteReminder`-ის სამი მუტატორი.
 */
class TimezoneTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_application_runs_on_georgian_time(): void
    {
        $this->assertSame('Asia/Tbilisi', config('app.timezone'));
        $this->assertSame('Asia/Tbilisi', AppTime::zone());
        // PHP-ის ნაგულისხმევი ზონაც იგივეა — `date()`/`strtotime()` ამას მიჰყვება
        $this->assertSame('Asia/Tbilisi', date_default_timezone_get());
    }

    /**
     * **(ა) ჩაწერილი და წაკითხული დრო იმავე მომენტს აღნიშნავს.**
     *
     * ⚠️ შესვლა განზრახ **უცხო ზონაშია** (`+00:00`): აპლიკაციის ზონაში
     * მოსული მნიშვნელობა ისედაც გადარჩებოდა და ტესტი უაზრო იქნებოდა.
     */
    public function test_a_moment_survives_the_round_trip(): void
    {
        $user = User::create([
            'name' => 'tz', 'username' => 'tz', 'email' => 'tz@example.com', 'password' => 'password',
        ]);

        $note = NoteEntry::create(['user_id' => $user->id, 'title' => 'დრო']);

        $moment = Carbon::parse('2026-10-01T00:00:00+00:00');

        $reminder = NoteReminder::create([
            'user_id' => $user->id,
            'note_entry_id' => $note->id,
            'mode' => NoteReminder::MODE_ONCE,
            'remind_at' => $moment,
            'timezone' => 'UTC',
            'channels' => ['browser'],
            'is_active' => true,
        ]);

        $this->assertTrue(
            $reminder->fresh()->remind_at->equalTo($moment),
            'ბაზიდან წაკითხული მომენტი იგივე უნდა იყოს, რაც ჩაიწერა',
        );
    }

    /**
     * **(ბ) სერვერზე აწყობილი ფაილის სახელი ქართულ საათს ატარებს.**
     *
     * `BackupRunner` სახელს `now()`-ით აწყობს, ე.ი. ის აპლიკაციის ზონას
     * მიჰყვება — ტესტი მას სწორედ ამ ზონის საათს ადარებს.
     */
    public function test_a_server_side_file_name_uses_the_local_clock(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-01T00:00:00+00:00'));

        // 00:00 UTC = 04:00 თბილისში
        $this->assertSame('2026-10-01-0400', now()->format('Y-m-d-Hi'));

        Carbon::setTestNow();
    }

    /**
     * **(გ) შეხსენების გამოთვლა იმავე მომენტს აბრუნებს.**
     *
     * ⚠️ `times_of_day` **კედლის საათია** და თავისი `timezone` აქვს — ე.ი.
     * აპლიკაციის ზონის ცვლილება მას **არ უნდა შეეხოს**. ეს ორმაგი
     * წანაცვლების რეალური რისკი იყო (§8.4).
     */
    public function test_a_wall_clock_reminder_is_unaffected_by_the_app_timezone(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-04T12:00:00+00:00'));

        $user = User::create([
            'name' => 'tz2', 'username' => 'tz2', 'email' => 'tz2@example.com', 'password' => 'password',
        ]);
        $note = NoteEntry::create(['user_id' => $user->id, 'title' => 'დრო']);

        $reminder = NoteReminder::create([
            'user_id' => $user->id,
            'note_entry_id' => $note->id,
            'mode' => NoteReminder::MODE_DAILY,
            'times_of_day' => ['09:00'],
            'timezone' => 'Asia/Tbilisi',
            'channels' => ['browser'],
            'is_active' => true,
        ]);

        // 12:00 UTC = 16:00 თბილისში → დღევანდელი 09:00 გასულია, ე.ი. ხვალინდელი
        $this->assertSame(
            '2026-09-05T05:00:00+00:00',
            $reminder->computeNextAt()->utc()->toIso8601String(),
        );

        Carbon::setTestNow();
    }
}
