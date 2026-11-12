<?php

namespace App\Console\Commands;

use App\Models\Movie;
use App\Models\User;
use App\Services\Credentials\CredentialStore;
use App\Services\Media\FranchiseTracker;
use App\Services\Tmdb\TmdbClient;
use App\Support\Redact;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * **ფრანჩაიზების ღამის შემოწმება.**
 *
 * ყველა ფრანჩაიზი, რომლის ნაწილიც ვინმეს ბიბლიოთეკაშია, TMDB-დან ახლდება და
 * ბიბლიოთეკას ედრება: თითო დაუმატებელ ნაწილზე ერთი შეტყობინება მოდის („ფრანჩაიზს
 * ნაწილი აკლია"). დამატებისა და სინქრონიზაციის დროს იგივე შემოწმება მაშინვე ხდება —
 * ეს ბრძანება იმას იჭერს, რაც TMDB-ზე მოგვიანებით გამოცხადდა.
 *
 * ⚠️ **დღეში ერთხელ და არა ხშირად**: ახალი ნაწილი წელიწადში ერთხელ თუ ცხადდება, თითო
 * ფრანჩაიზი კი TMDB-ის ცალკე მოთხოვნაა. ფრანჩაიზების ცხრილი საერთოა, ამიტომ ორი
 * ანგარიშის საერთო ფრანჩაიზი ერთხელ იკითხება.
 *
 * ⚠️ **თითო ანგარიში თავისი გასაღებით** (`Auth::setUser()`); გასაღების გარეშე ანგარიშს
 * ფრანჩაიზები არ უახლდება, მაგრამ უკვე ჩაწერილს მაინც ედრება.
 *
 * ⚠️ `schedule:work`-ის გარეშე ეს ბრძანება არ ეშვება — `mediary:doctor` ამას ამბობს.
 */
class CheckFranchisesCommand extends Command
{
    /** „ბოლოს როდის გაეშვა" — `mediary:doctor`-ის ნიშანი (`notes:remind`-ის წესი) */
    public const HEARTBEAT = 'scheduler.franchises-check.last-run';

    /** ამაზე ახალი შემოწმება ღამით ხელახლა არ იკითხება (დღეში ერთხელ) */
    private const FRESH_MINUTES = 60 * 20;

    protected $signature = 'franchises:check
        {--user= : მხოლოდ ამ user id-ის ბიბლიოთეკა (ცარიელი = ყველა მომხმარებელი)}
        {--delay=250 : პაუზა TMDB-ის მოთხოვნებს შორის, მილიწამებში}';

    protected $description = 'ფრანჩაიზების ნაწილების განახლება TMDB-დან და შეტყობინება დაუმატებელ ნაწილებზე';

    public function handle(FranchiseTracker $tracker, TmdbClient $tmdb): int
    {
        Cache::put(self::HEARTBEAT, now()->toIso8601String(), now()->addDays(30));

        $delay = max(0, (int) $this->option('delay'));
        $users = User::where('is_active', true)
            ->when($this->option('user') !== null, fn ($q) => $q->whereKey($this->option('user')))
            ->get();

        $refreshed = $failed = $sent = 0;
        /** @var array<int, true> $seen */
        $seen = [];

        try {
            foreach ($users as $user) {
                if (! $user->hasModule('movie')) {
                    continue;
                }

                Auth::setUser($user);

                $collections = Movie::query()
                    ->whereNotNull('tmdb_collection_id')
                    ->toBase()
                    ->distinct()
                    ->pluck('tmdb_collection_id');

                if ($tmdb->configured()) {
                    foreach ($collections as $collection) {
                        // ცხრილი საერთოა — სხვა ანგარიშის მიერ ამავე გაშვებაში შემოწმებული აღარ იკითხება
                        if (isset($seen[$collection])) {
                            continue;
                        }
                        $seen[$collection] = true;

                        try {
                            $tracker->refresh((int) $collection, self::FRESH_MINUTES);
                            $refreshed++;
                        } catch (Throwable $e) {
                            // ერთი ფრანჩაიზის ჩავარდნა დანარჩენს არ აჩერებს
                            $failed++;
                            $this->warn("ფრანჩაიზი #{$collection} — ".Redact::secrets($e->getMessage()));
                        }

                        if ($delay > 0) {
                            usleep($delay * 1000);
                        }
                    }
                } elseif ($collections->isNotEmpty()) {
                    $this->warn("{$user->email} — TMDB-ის პირადი გასაღები არ აქვს; ფრანჩაიზები არ განახლდა.");
                }

                $sent += $tracker->notifyMissing($user);
            }
        } finally {
            Auth::forgetUser();
            CredentialStore::forget();
        }

        $this->info("შემოწმდა: {$refreshed} · ჩავარდა: {$failed} · გაიგზავნა შეტყობინება: {$sent}");

        return self::SUCCESS;
    }
}
