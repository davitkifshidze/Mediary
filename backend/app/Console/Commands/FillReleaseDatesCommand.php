<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Credentials\CredentialStore;
use App\Services\Tmdb\TmdbClient;
use App\Support\MediaDomain;
use App\Support\Redact;
use App\Support\Upcoming;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Auth;
use Throwable;

/**
 * **გამოსვლის თარიღის ერთჯერადი შევსება** არსებულ ჩანაწერებზე.
 *
 * `release_date` და `tmdb_status` ახალ ჩანაწერს დამატებისას ეწერება, ძველს კი —
 * მხოლოდ სინქრონიზაციისას; ამ ბრძანების გარეშე „მალე" სექცია იმ სათაურებს ვერ
 * დაინახავდა, რომლებიც უკვე ბიბლიოთეკაშია. თითო ჩანაწერზე ერთი TMDB-მოთხოვნაა;
 * სერიალსა და ანიმეს იმავე პასუხიდან შემდეგი სერიის თარიღიც უახლდება.
 *
 * ⚠️ **მხოლოდ გამოსვლის ფაქტები იწერება** — სათაურს, აღწერას, ქულას და სინქრონის
 * კვალს (`last_synced_at`) ბრძანება არ ეხება, ჟურნალშიც არ იწერება (`saveQuietly`):
 * ეს მონაცემის შევსებაა და არა მომხმარებლის მოქმედება.
 *
 * ⚠️ **თითო ჩანაწერი თავისი მფლობელის გასაღებით მიდის** (`media:redownload`-ის წესი):
 * TMDB-ის გასაღები მომხმარებლისაა, CLI-ს კი `Auth::id()` არ აქვს. ვისაც გასაღები
 * არ აქვს, მისი ჩანაწერები ცხადად გამოტოვდება. „აღარ განაახლო" (`sync_paused`)
 * ჩანაწერებს ბრძანება არ ეხება.
 */
class FillReleaseDatesCommand extends Command
{
    protected $signature = 'media:release-dates
        {--type= : movie | series | anime (ცარიელი = ყველა)}
        {--user= : მხოლოდ ამ user id-ის ჩანაწერები (ცარიელი = ყველა მომხმარებელი)}
        {--all : თარიღიანი ჩანაწერებიც თავიდან შემოწმდეს}
        {--delay=250 : პაუზა TMDB-ის მოთხოვნებს შორის, მილიწამებში}';

    protected $description = 'გამოსვლის თარიღისა და TMDB-ის მდგომარეობის შევსება არსებულ ფილმებზე, სერიალებსა და ანიმეზე';

    public function handle(TmdbClient $tmdb): int
    {
        $type = $this->option('type');
        if ($type !== null && ! MediaDomain::has($type)) {
            $this->error('--type უნდა იყოს '.implode(' | ', MediaDomain::TYPES).'.');

            return self::FAILURE;
        }

        $userId = $this->option('user');
        if ($userId !== null && ! User::whereKey($userId)->exists()) {
            $this->error("მომხმარებელი id={$userId} ვერ მოიძებნა.");

            return self::FAILURE;
        }

        $delay = max(0, (int) $this->option('delay'));
        $filled = $unchanged = $failed = $noKey = 0;

        /** @var array<int, User|null> $owners */
        $owners = [];
        /** @var array<int, true> $warned */
        $warned = [];

        try {
            foreach (MediaDomain::TYPES as $domain) {
                if ($type !== null && $type !== $domain) {
                    continue;
                }

                $tv = MediaDomain::isTv($domain);

                // ⚠️ `owner` scope ცხადად იხსნება: `Auth`-ში წინა ჩანაწერის მფლობელი დევს
                $rows = MediaDomain::model($domain)::withoutGlobalScope('owner')
                    ->whereNotNull('tmdb_id')
                    ->where('sync_paused', false)
                    ->when(! $this->option('all'), fn ($q) => $q->whereNull('release_date'))
                    ->when($userId !== null, fn ($q) => $q->where('user_id', $userId))
                    ->orderBy('user_id')
                    ->orderBy('id')
                    ->get();

                foreach ($rows as $row) {
                    $ownerId = (int) $row->user_id;
                    $owner = array_key_exists($ownerId, $owners) ? $owners[$ownerId] : ($owners[$ownerId] = User::find($ownerId));

                    if (! $owner) {
                        continue;
                    }

                    Auth::setUser($owner);

                    if (! $tmdb->configured()) {
                        $noKey++;

                        if (! isset($warned[$ownerId])) {
                            $warned[$ownerId] = true;
                            $this->warn("{$owner->email} — TMDB-ის პირადი გასაღები არ აქვს; მისი ჩანაწერები გამოტოვდა.");
                        }

                        continue;
                    }

                    try {
                        $details = $tv ? $tmdb->tvDetails($row->tmdb_id) : $tmdb->details($row->tmdb_id);

                        $changed = Upcoming::stamp($row, $details, $tv);
                        $changed = ($tv && Upcoming::stampNextAir($row, $details)) || $changed;

                        if ($changed) {
                            $row->saveQuietly();
                            $filled++;
                        } else {
                            $unchanged++;
                        }
                    } catch (Throwable $e) {
                        // TMDB-მ ეს id აღარ იცის ან ქსელი ჩავარდა — დანარჩენი გრძელდება
                        $failed++;
                        $this->warn("{$domain} #{$row->id} — ".Redact::secrets($e->getMessage()));
                    }

                    if ($delay > 0) {
                        usleep($delay * 1000);
                    }
                }
            }
        } finally {
            // ⚠️ ბრძანება შეიძლება სხვა ბრძანების შიგნით გაეშვას — `Auth` უკან სუფთა უნდა დარჩეს
            Auth::forgetUser();
            CredentialStore::forget();
        }

        $this->info("შეივსო: {$filled} · უცვლელი: {$unchanged} · ჩავარდა: {$failed} · გასაღების გარეშე: {$noKey}");

        // გასაღების არქონა ჩავარდნაა, როცა სხვა არაფერი გაკეთებულა
        return $noKey > 0 && $filled + $unchanged === 0 ? self::FAILURE : self::SUCCESS;
    }
}
