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

    /** დროებითი `.env`-ის საქაღალდე — ტესტი დეველოპერის ნამდვილ ფაილს არ კითხულობს */
    private string $envDir;

    /**
     * ⚠️ **`doctor` `.env` ფაილს კითხულობს** (Tasks §30.8), ე.ი. ამ ტესტების
     * გარეშე შედეგი დამოკიდებული იქნებოდა იმაზე, **ვისი მანქანა** უშვებს
     * მათ — ზუსტად ის, რისთვისაც `phpunit.xml`-ს ოდესღაც გასაღებები
     * ეჩამაგრა. გზა დროებით, სუფთა ფაილზე გადადის.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $this->envDir = sys_get_temp_dir().DIRECTORY_SEPARATOR.'mediary-doctor-'.uniqid();
        mkdir($this->envDir);
        $this->writeEnv("APP_NAME=Mediary\n");
        $this->app->useEnvironmentPath($this->envDir);
    }

    protected function tearDown(): void
    {
        @unlink($this->envDir.DIRECTORY_SEPARATOR.'.env');
        @rmdir($this->envDir);

        parent::tearDown();
    }

    private function writeEnv(string $contents): void
    {
        file_put_contents($this->envDir.DIRECTORY_SEPARATOR.'.env', $contents);
    }

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
     * ეკრანის სურათებსა და CI-ს არტეფაქტებში ხვდება — მხოლოდ ცვლადის სახელი ჩანს.
     */
    public function test_the_report_never_prints_a_secret(): void
    {
        $this->writeEnv("TMDB_API_KEY=super-secret-value\n");
        $this->binaries(true);
        $this->makeUser();

        $this->artisan('mediary:doctor')
            ->expectsOutputToContain('TMDB_API_KEY')
            ->doesntExpectOutputToContain('super-secret-value')
            ->assertFailed();
    }

    /**
     * **Tasks §30.8 — `.env`-ში წყაროს გასაღები FAIL-ია.** აპი მას აღარ
     * კითხულობს (გასაღები მომხმარებლისაა), ე.ი. ჩაწერილი საიდუმლო მხოლოდ
     * ფაილში მოგზაურობს და ადამიანს ატყუებს, რომ „ხომ ჩაწერილია".
     * ⚠️ IGDB-ის `client_id` თვითონ საიდუმლო არაა, მაგრამ წყვილის ნაწილია.
     */
    public function test_a_source_key_left_in_env_fails(): void
    {
        $this->writeEnv("SERPER_API_KEY=abc123\nIGDB_CLIENT_ID=twitch-id\n");
        $this->binaries(true);
        $this->makeUser();

        // რიგი რეესტრისაა (`CredentialProviders::LEGACY_ENV`) და არა ფაილისა
        $this->artisan('mediary:doctor')
            ->expectsOutputToContain('IGDB_CLIENT_ID, SERPER_API_KEY')
            ->assertFailed();
    }

    /** ცარიელი ხაზი (`TMDB_API_KEY=`) გასაღები არაა — ის FAIL-ს არ იწვევს */
    public function test_an_empty_legacy_line_is_not_a_key(): void
    {
        $this->writeEnv("TMDB_API_KEY=\nGEMINI_API_KEY=\"\"\n");
        $this->binaries(true);
        $this->makeUser();
        Cache::put(SendNoteRemindersCommand::HEARTBEAT, now()->toIso8601String(), 60);

        $this->artisan('mediary:doctor')->assertSuccessful();
    }

    /** მოდელი და ლიმიტი საიდუმლო არაა — უბრალოდ აღარ მოქმედებს: WARN */
    public function test_a_leftover_setting_is_only_a_warning(): void
    {
        $this->writeEnv("GEMINI_MODEL=gemini-x\nSERPAPI_MONTHLY_LIMIT=100\n");
        $this->binaries(true);
        $this->makeUser();

        $this->artisan('mediary:doctor')
            ->expectsOutputToContain('GEMINI_MODEL, SERPAPI_MONTHLY_LIMIT')
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
