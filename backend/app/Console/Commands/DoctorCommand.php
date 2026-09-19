<?php

namespace App\Console\Commands;

use App\Models\DatabaseBackup;
use App\Models\User;
use App\Services\Backup\BackupInspector;
use App\Services\Backup\DatabaseDumper;
use App\Services\Storage\StorageMeter;
use App\Services\Video\YtDlp;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

/**
 * **„რა არ მუშაობს ამ მანქანაზე" — ერთი პასუხი** (Tasks FEAT-05).
 *
 * ⚠️ აპს ბევრი **„მდგომარეობა და არა ავარია"** 503 აქვს (`ytdlp_unavailable`,
 * `mysqldump_unavailable`, `background_unavailable`), scheduler-ი ხელით
 * ეშვება, ხოლო `storage_used_bytes` დრიფტს მხოლოდ `mediary:storage-recalc`-ის
 * გაშვება ამჟღავნებს. ე.ი. ყოველი მათგანი მხოლოდ **მაშინ** ჩანდა, როცა
 * ღილაკი უკვე არ მუშაობდა — CLAUDE.md-ის ინციდენტების უმეტესობა ზუსტად ესაა.
 *
 * ⚠️ **სამი დონე და არა ორი.** `WARN` არ არის „პატარა შეცდომა": `ffmpeg`-ის
 * არქონა ლეგიტიმური კონფიგურაციაა (ჩამოწერა იმუშავებს, უბრალოდ დაბალი
 * ხარისხით), `APP_DEBUG=true` კი ლოკალურად **სწორია**. მათი `FAIL`-ად
 * ჩათვლა ბრძანებას მუდმივად წითელს გახდიდა და პირველივე კვირაში
 * გამორთვამდე მიიყვანდა.
 *
 * ⚠️ **გასაღები არსად არ იბეჭდება** — მხოლოდ „არის თუ არა". `/credentials`-ის
 * `reveal` ცალკე, ავტორიზებული endpoint-ია სწორედ იმიტომ, რომ გასაღები
 * ლოგებში, ეკრანის სურათებსა და CI-ს გამონატანში არ ხვდებოდეს.
 */
class DoctorCommand extends Command
{
    protected $signature = 'mediary:doctor {--user= : მხოლოდ ამ id/ელფოსტის მრიცხველი}';

    protected $description = 'შეამოწმებს ბინარებს, scheduler-ს, საცავის მრიცხველს და კრიტიკულ პარამეტრებს';

    /** მრიცხველის დასაშვები სხვაობა — ატვირთვა შეიძლება ახლა მიდიოდეს */
    private const DRIFT_TOLERANCE = 0;

    /** რამდენ ხანს ჩაითვლება scheduler-ი „ცოცხლად" */
    private const HEARTBEAT_MINUTES = 10;

    private bool $failed = false;

    public function handle(YtDlp $ytdlp, DatabaseDumper $dumper, StorageMeter $meter, BackupInspector $inspector): int
    {
        $this->line('');
        $this->migrations();
        $this->binaries($ytdlp, $dumper);
        $this->scheduler();
        $this->storage($meter);
        $this->viewers($inspector);
        $this->settings();
        $this->line('');

        if ($this->failed) {
            $this->error('ერთი შემოწმება მაინც ჩავარდა — იხ. FAIL ზემოთ.');

            return self::FAILURE;
        }

        $this->info('ყველაფერი წესრიგშია.');

        return self::SUCCESS;
    }

    /* ---------- შემოწმებები ---------- */

    /**
     * გაშვებული მიგრაციები (2026-09-19).
     *
     * ⚠️ **ეს შემოწმება ცოცხალმა შეცდომამ დაბადა.** ხუთი მიგრაცია
     * გაუშვებელი იყო, ე.ი. `tv_episodes` არ არსებობდა და ეპიზოდების
     * ჩამოტვირთვა ნედლი SQL-შეცდომით ვარდებოდა („Base table or view not
     * found"), ხოლო „მალე" კალენდარი უხმოდ ცარიელი იყო (`next_air_at`
     * სვეტიც აკლდა). **სიმპტომი ორ სხვადასხვა ფუნქციაზე გამოჩნდა და
     * არცერთი არ ამბობდა ნამდვილ მიზეზს.**
     *
     * ⚠️ **აქ კოდი არ სწორდება — სწორდება კითხვა.** „რატომ არ მუშაობს"
     * პასუხი ერთ ბრძანებაშია და არა ლოგის კითხვაში.
     *
     * ⚠️ **FAIL და არა WARN**: გაუშვებელი მიგრაცია აპს არ ანელებს — ის მას
     * **ტეხავს**, უბრალოდ იმ ერთ ადგილას, რომელიც ჯერ არ გაგიხსნია.
     */
    private function migrations(): void
    {
        $this->section('ბაზა');

        try {
            $pending = collect($this->laravel['migrator']->getMigrationFiles(
                $this->laravel['migrator']->paths() + [$this->laravel->databasePath('migrations')],
            ))->keys()
                ->diff($this->laravel['migrator']->getRepository()->getRan())
                ->values();
        } catch (\Throwable $e) {
            $this->check('მიგრაციები', false, 'ვერ წაიკითხა — '.$e->getMessage());

            return;
        }

        $this->check(
            'მიგრაციები',
            $pending->isEmpty(),
            $pending->isEmpty()
                ? 'ყველა გაშვებულია'
                : $pending->count().' გაუშვებელი — `php artisan migrate` ('.$pending->first().'…)',
        );
    }

    private function binaries(YtDlp $ytdlp, DatabaseDumper $dumper): void
    {
        $this->section('ბინარები');

        $this->check('yt-dlp', $ytdlp->available(), $ytdlp->binary() ?? 'ვერ მოიძებნა — ვიდეოს ჩამოწერა 503-ია (`YTDLP_BINARY`)');

        /* ⚠️ `ffmpeg` **WARN და არა FAIL**: ის სურვილისამებრია, ოღონდ ხარისხს
           წყვეტს — მის გარეშე `bv*+ba` ვერ ერწყმის და ერთფაილიან ვარიანტამდე
           ეცემა. ე.ი. ფუნქცია მუშაობს, მაგრამ სხვანაირად. */
        $this->check('ffmpeg', $ytdlp->ffmpeg() !== null, $ytdlp->ffmpeg() ?? 'არ არის — ჩამოწერა ერთფაილიან ხარისხზე ჩამოვა', warnOnly: true);

        $this->check('mysqldump', $dumper->available(), $dumper->dumpBinary() ?? 'ვერ მოიძებნა — `/backups` 503-ია (`MYSQLDUMP_BINARY`)');
        $this->check('mysql (restore)', $dumper->restoreAvailable(), $dumper->clientBinary() ?? 'ვერ მოიძებნა — აღდგენა გამორთულია (`MYSQL_BINARY`)');
    }

    private function scheduler(): void
    {
        $this->section('Scheduler');

        $last = Cache::get(SendNoteRemindersCommand::HEARTBEAT);

        if (! $last) {
            /* ⚠️ **WARN და არა FAIL.** scheduler-ის არყოფნა შეხსენებებს არ
               კარგავს — ბრაუზერის polling იმავე დისპეტჩერს იძახებს (§8.2);
               ის მხოლოდ დახურულ აპზე ტელეგრამის გაგზავნას აჩერებს. */
            $this->check('notes:remind', false, 'არასდროს გაშვებულა — `php artisan schedule:work`', warnOnly: true);

            return;
        }

        $ago = Carbon::parse($last)->diffInMinutes(now());

        $this->check(
            'notes:remind',
            $ago <= self::HEARTBEAT_MINUTES,
            $ago <= self::HEARTBEAT_MINUTES
                ? "ბოლო გაშვება {$ago} წუთის წინ"
                : "ბოლო გაშვება {$ago} წუთის წინ — scheduler, სავარაუდოდ, გაჩერდა",
            warnOnly: true,
        );
    }

    /**
     * ⚠️ **„dry-run" ნამდვილად dry-ია**: `recalculate()` მრიცხველს **წერს**,
     * ე.ი. მისი გამოძახება დრიფტს დაფარავდა იმავე წამს, როცა აღმოაჩენდა.
     * აქ `files()`-ის ჯამი ცალკე ითვლება და შედარებას მხოლოდ ბეჭდავს.
     */
    private function storage(StorageMeter $meter): void
    {
        $this->section('საცავის მრიცხველი');

        $query = User::query();

        if ($who = $this->option('user')) {
            $query->where(is_numeric($who) ? 'id' : 'email', $who);
        }

        $users = $query->orderBy('id')->get();

        if ($users->isEmpty()) {
            $this->check('მომხმარებლები', false, 'ვერ მოიძებნა');

            return;
        }

        foreach ($users as $user) {
            $cached = (int) $user->storage_used_bytes;
            $real = (int) $meter->files($user)->sum('size');
            $drift = abs($cached - $real);

            $this->check(
                $user->email,
                $drift <= self::DRIFT_TOLERANCE,
                $drift === 0
                    ? "მრიცხველი ემთხვევა ({$cached} ბაიტი)"
                    : "დრიფტი {$drift} ბაიტი ({$cached} ≠ {$real}) — `php artisan mediary:storage-recalc`",
                warnOnly: true,
            );
        }
    }

    /**
     * **ღია ვიუერები** (Tasks GAP-16) — დამპის დროებითი ბაზები.
     *
     * ⚠️ **WARN და არა FAIL**: ღია ვიუერი ნორმალური მდგომარეობაა — ვიღაც
     * სწორედ ახლა უყურებს ასლს. სამუდამოდ დარჩენილი კი დისკზე მონაცემის
     * მეორე ასლია, **კვოტის გარეთ** და პაროლის ჰეშებით — და აქამდე მას
     * არსად ეწერა, ე.ი. `doctor`-ის მთელი აზრი ზუსტად ესაა.
     */
    private function viewers(BackupInspector $inspector): void
    {
        if (! $inspector->available()) {
            return;
        }

        $this->section('ასლის ვიუერი');

        $open = $inspector->openDatabases();

        if ($open === []) {
            $this->check('დროებითი ბაზები', true, 'არცერთი ღია არაა');

            return;
        }

        foreach ($open as $row) {
            $backup = DatabaseBackup::find($row['backup_id']);
            $at = $backup?->inspected_at;

            $detail = $backup === null
                ? 'ასლი წაშლილია — ნარჩენი ბაზა; `php artisan backups:prune-inspect`'
                : ($at === null
                    ? 'გახსნის დრო უცნობია — `php artisan backups:prune-inspect`'
                    : "გახსნილია {$at->diffForHumans()} — დახურვა ვიუერიდან ან `php artisan backups:prune-inspect`");

            $this->check($row['database'], false, $detail, warnOnly: true);
        }
    }

    private function settings(): void
    {
        $this->section('პარამეტრები');

        /* ⚠️ `APP_DEBUG=true` და არა-secure ქუქი **განვითარებისას სწორია**:
           აპი `http://mediary.local`-ზე იხსნება, სადაც secure-ქუქი საერთოდ
           არ იგზავნება (SEC-11). უპირობო FAIL ყოველ დეველოპერს ატყუებდა და
           ბრძანებას პირველსავე კვირაში გამორთვამდე მიიყვანდა.

           ⚠️ `testing`-იც აქაა: phpunit `APP_DEBUG=true`-ით გადის, ე.ი.
           მის გარეშე **საკუთარი ტესტი** იქნებოდა წითელი. */
        $local = app()->environment(['local', 'testing']);

        $this->check(
            'APP_DEBUG',
            ! config('app.debug') || $local,
            config('app.debug')
                ? ($local ? 'ჩართული (ლოკალურად ნორმაა)' : 'ჩართული — 500-ზე stack trace და კონფიგი გამოჩნდება')
                : 'გამორთული',
        );

        $this->check(
            'SESSION_SECURE_COOKIE',
            (bool) config('session.secure') || $local,
            config('session.secure')
                ? 'ჩართული'
                : ($local ? 'გამორთული (ლოკალურად `http://`-ზე აუცილებელია)' : 'გამორთული — სესიის ქუქი ღია HTTP-ზე გადის'),
        );

        $this->check('PUBLIC_PROFILES', true, config('mediary.public_profiles') ? 'ჩართული' : 'გამორთული — საჯარო პროფილიც და მატჩინგიც დახურულია', warnOnly: true);

        // ⚠️ გასაღების **მნიშვნელობა** არასდროს იბეჭდება — მხოლოდ არსებობა
        $this->check('TMDB_API_KEY', (bool) config('services.tmdb.key'), config('services.tmdb.key') ? 'ჩაწერილია' : 'ცარიელია — TMDB-ს დამოკიდებული ყველაფერი გაჩერდება (ან `/credentials`-ზე per-user)', warnOnly: true);
    }

    /* ---------- ბეჭდვა ---------- */

    private function section(string $title): void
    {
        $this->line("<options=bold>{$title}</>");
    }

    private function check(string $name, bool $ok, string $detail, bool $warnOnly = false): void
    {
        if (! $ok && ! $warnOnly) {
            $this->failed = true;
        }

        $tag = $ok ? '<fg=green>OK  </>' : ($warnOnly ? '<fg=yellow>WARN</>' : '<fg=red>FAIL</>');

        // ⚠️ `mb_str_pad`: `str_pad` ბაიტებს ითვლის, ე.ი. ქართული სახელი სვეტს არღვევს
        $this->line("  {$tag} ".mb_str_pad($name, 24).' '.$detail);
    }
}
