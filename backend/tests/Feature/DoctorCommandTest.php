<?php

namespace Tests\Feature;

use App\Console\Commands\SendNoteRemindersCommand;
use App\Models\User;
use App\Services\Backup\DatabaseDumper;
use App\Services\Video\YtDlp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * **`mediary:doctor` — „რა არ მუშაობს ამ მანქანაზე"** (Tasks FEAT-05).
 *
 * ⚠️ ტესტი **ბინარებს ცვლის მოკებით**: ნამდვილი `yt-dlp`/`mysqldump` ამ
 * მანქანაზე იყოს თუ არა, ბრძანების ლოგიკის საქმე არ არის — თორემ ტესტი
 * გარემოს მიჰყვებოდა და CI-ზე სხვა პასუხს გასცემდა.
 */
class DoctorCommandTest extends TestCase
{
    use RefreshDatabase;

    private function binaries(bool $ok): void
    {
        $ytdlp = $this->mock(YtDlp::class);
        $ytdlp->shouldReceive('available')->andReturn($ok);
        $ytdlp->shouldReceive('binary')->andReturn($ok ? '/usr/bin/yt-dlp' : null);
        $ytdlp->shouldReceive('ffmpeg')->andReturn($ok ? '/usr/bin/ffmpeg' : null);

        $dumper = $this->mock(DatabaseDumper::class);
        $dumper->shouldReceive('available')->andReturn($ok);
        $dumper->shouldReceive('restoreAvailable')->andReturn($ok);
        $dumper->shouldReceive('dumpBinary')->andReturn($ok ? '/usr/bin/mysqldump' : null);
        $dumper->shouldReceive('clientBinary')->andReturn($ok ? '/usr/bin/mysql' : null);
    }

    private function makeUser(): User
    {
        return User::create([
            'name' => 'vera', 'username' => 'vera', 'email' => 'vera@example.com', 'password' => 'password',
        ]);
    }

    /** ყველაფერი ადგილზეა → 0 */
    public function test_a_healthy_install_passes(): void
    {
        $this->binaries(true);
        $this->makeUser();
        Cache::put(SendNoteRemindersCommand::HEARTBEAT, now()->toIso8601String(), 60);

        $this->artisan('mediary:doctor')
            ->expectsOutputToContain('yt-dlp')
            ->assertSuccessful();
    }

    /**
     * ⚠️ **აკლია ბინარი → არა-ნულოვანი კოდი** — სწორედ ეს ხდის ბრძანებას
     * CI-ში გამოსადეგს; ეკრანზე ლამაზი ანგარიში, exit 0-ით, არაფერს ნიშნავს.
     */
    public function test_a_missing_binary_fails(): void
    {
        $this->binaries(false);
        $this->makeUser();

        $this->artisan('mediary:doctor')->assertFailed();
    }

    /**
     * ⚠️ **`ffmpeg`-ის და scheduler-ის არყოფნა WARN-ია და არა FAIL.**
     * პირველის გარეშე ჩამოწერა მუშაობს (უბრალოდ დაბალი ხარისხით), მეორის
     * გარეშე შეხსენებები ბრაუზერის polling-ით მოდის (§8.2). მათი FAIL-ად
     * ჩათვლა ბრძანებას მუდმივად წითელს გახდიდა და პირველივე კვირაში
     * გამორთვამდე მიიყვანდა.
     */
    public function test_a_missing_ffmpeg_or_scheduler_is_only_a_warning(): void
    {
        $ytdlp = $this->mock(YtDlp::class);
        $ytdlp->shouldReceive('available')->andReturn(true);
        $ytdlp->shouldReceive('binary')->andReturn('/usr/bin/yt-dlp');
        $ytdlp->shouldReceive('ffmpeg')->andReturn(null);

        $dumper = $this->mock(DatabaseDumper::class);
        $dumper->shouldReceive('available')->andReturn(true);
        $dumper->shouldReceive('restoreAvailable')->andReturn(true);
        $dumper->shouldReceive('dumpBinary')->andReturn('/usr/bin/mysqldump');
        $dumper->shouldReceive('clientBinary')->andReturn('/usr/bin/mysql');

        $this->makeUser();
        Cache::forget(SendNoteRemindersCommand::HEARTBEAT);

        $this->artisan('mediary:doctor')->assertSuccessful();
    }

    /**
     * **მრიცხველის დრიფტი ჩანს** — და `recalculate()` არ ეშვება.
     *
     * ⚠️ ესაა ერთადერთი შემოწმება, რომელიც **თავისთავად გაასწორებდა** იმას,
     * რასაც აღმოაჩენს: `recalculate()` მრიცხველს წერს. ამიტომ `doctor`
     * ჯამს ცალკე ითვლის და მხოლოდ ადარებს — თორემ „ყველაფერი წესრიგშია"
     * იმ წამში გახდებოდა მართალი, როცა პრობლემას პოულობდა.
     */
    public function test_a_drifted_counter_is_reported_but_not_repaired(): void
    {
        $this->binaries(true);
        $user = $this->makeUser();
        $user->forceFill(['storage_used_bytes' => 4242])->save();

        $this->artisan('mediary:doctor')
            ->expectsOutputToContain('storage-recalc')
            ->assertSuccessful();

        $this->assertSame(4242, (int) $user->refresh()->storage_used_bytes, 'doctor-მა მრიცხველი გადაწერა');
    }

    /**
     * ⚠️ **გასაღები არასდროს იბეჭდება.** დიაგნოსტიკის გამონატანი ლოგებში,
     * ეკრანის სურათებსა და CI-ს არტეფაქტებში ხვდება.
     */
    public function test_the_report_never_prints_a_secret(): void
    {
        config(['services.tmdb.key' => 'super-secret-value']);
        $this->binaries(true);
        $this->makeUser();

        $this->artisan('mediary:doctor')
            ->doesntExpectOutputToContain('super-secret-value')
            ->assertSuccessful();
    }

    /** scheduler-ის ნიშანს თვითონ ბრძანება წერს — უამისოდ doctor ვერაფერს იტყოდა */
    public function test_the_reminder_command_records_its_run(): void
    {
        Cache::forget(SendNoteRemindersCommand::HEARTBEAT);
        Carbon::setTestNow(Carbon::parse('2026-09-18 10:00:00', 'UTC'));

        $this->artisan('notes:remind')->assertSuccessful();

        $this->assertNotNull(Cache::get(SendNoteRemindersCommand::HEARTBEAT));

        Carbon::setTestNow();
    }
}
