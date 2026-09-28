<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Credentials\CredentialStore;
use App\Services\Sync\ItemSyncer;
use App\Support\MediaDomain;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Auth;

/**
 * მედიის მასობრივი ჩამოტვირთვა CLI-დან.
 *
 * ძველი `POST /api/media/redownload` აქ გადმოვიდა (Tasks J5): ბრაუზერიდან
 * გამოძახებული ერთი გრძელი ციკლი `php artisan serve`-ს (ერთ-რექვესთიანი
 * dev-სერვერი) მთლიანად ბლოკავდა. UI-დან ახლა სათითაო სინქრონი მუშაობს
 * (`POST /api/media/sync/{type}/{id}`), ეს ბრძანება კი დარჩა ერთჯერადი
 * bootstrap-ისთვის — მაგ. ახალ მანქანაზე კლონის შემდეგ, სადაც storage/ ცარიელია.
 *
 * ⚠️ **თითო ჩანაწერი თავისი მფლობელის გასაღებით მიდის (Tasks §30.7).**
 * §30-იდან TMDB-ის გასაღები მომხმარებლისაა და CLI-ს `Auth::id()` არ აქვს,
 * ე.ი. „საერთო გასაღები" აღარ არსებობს, რომელზეც ბრძანება დაეყრდნობოდა.
 * ამიტომ ციკლი ჩანაწერის მფლობელზე `Auth::setUser()`-ს აკეთებს —
 * `RunBatchItem`-ის ზუსტი წესი: ასე `owner` scope-იც და გასაღებიც ერთი და
 * იმავე ადამიანისაა. ⚠️ ვისაც გასაღები არ აქვს, მისი ჩანაწერები **ცხადად**
 * გამოტოვდება (ერთი ხაზი თითო ანგარიშზე) — და არა ჩუმად.
 */
class RedownloadMediaCommand extends Command
{
    protected $signature = 'media:redownload
        {--type= : movie | series | anime (ცარიელი = ყველა)}
        {--missing : მხოლოდ დაკარგული ფაილები}
        {--user= : მხოლოდ ამ user id-ის ჩანაწერები (ცარიელი = ყველა მომხმარებელი)}';

    protected $description = 'პოსტერების და მსახიობთა ფოტოების ჩამოტვირთვა TMDB-დან — თითო ჩანაწერი მფლობელის გასაღებით';

    public function handle(ItemSyncer $syncer): int
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
        if ($userId === null && User::count() > 1) {
            $this->warn('--user მითითებული არ არის: დამუშავდება ყველა მომხმარებლის ჩანაწერი (თითო — მისი გასაღებით).');
        }

        $opts = ['media' => true, 'only_missing' => (bool) $this->option('missing')];
        $totals = [];

        /** @var array<int, User|null> $owners */
        $owners = [];
        /** @var array<int, true> $warned */
        $warned = [];

        try {
            foreach (MediaDomain::TYPES as $domain) {
                $model = MediaDomain::model($domain);

                if ($type !== null && $type !== $domain) {
                    continue;
                }

                /* ⚠️ **`withoutGlobalScope('owner')` ცხადად**: წინა დომენის ციკლმა
                   `Auth`-ში ბოლო მფლობელი დატოვა, ე.ი. scope ახლა **მის**
                   ჩანაწერებზე დაიჭრებოდა და დანარჩენი ანგარიშები ჩუმად გამოტოვდებოდა. */
                $rows = $model::withoutGlobalScope('owner')
                    ->whereNotNull('tmdb_id')
                    ->when($userId !== null, fn ($q) => $q->where('user_id', $userId))
                    ->orderBy('user_id')
                    ->orderBy('id')
                    ->get();
                $ok = $failed = $skipped = $noKey = 0;
                $bar = $this->output->createProgressBar($rows->count());
                $bar->start();

                foreach ($rows as $row) {
                    $ownerId = (int) $row->user_id;
                    $owner = array_key_exists($ownerId, $owners) ? $owners[$ownerId] : ($owners[$ownerId] = User::find($ownerId));

                    if (! $owner) {
                        $skipped++;
                        $bar->advance();

                        continue;
                    }

                    Auth::setUser($owner);

                    if (! $syncer->configured()) {
                        $noKey++;

                        if (! isset($warned[$ownerId])) {
                            $warned[$ownerId] = true;
                            $this->newLine();
                            $this->warn("{$owner->email} — TMDB-ის პირადი გასაღები არ აქვს („მონაცემები“); მისი ჩანაწერები გამოტოვდა.");
                        }

                        $bar->advance();

                        continue;
                    }

                    $r = $syncer->sync($row, $opts);
                    if ($r['skipped']) {
                        $skipped++;
                    } elseif ($r['ok']) {
                        $ok++;
                    } else {
                        $failed++;
                        $this->newLine();
                        $this->warn("#{$row->id} ".($row->title_en ?: $row->title_ka).' — '.$r['error']);
                    }
                    $bar->advance();
                }

                $bar->finish();
                $this->newLine();
                $totals[$domain] = compact('ok', 'failed', 'skipped', 'noKey');
                $this->info("{$domain}: ok={$ok} skipped={$skipped} no_key={$noKey} failed={$failed}");
            }
        } finally {
            // ⚠️ ბრძანება შეიძლება სხვა ბრძანების შიგნით გაეშვას — `Auth` უკან სუფთა უნდა დარჩეს
            Auth::forgetUser();
            CredentialStore::forget();
        }

        /* ⚠️ **გასაღების არქონა ჩავარდნაა, როცა სხვა არაფერი გაკეთდა**: თუ
           არცერთ მფლობელს არ ჰქონდა გასაღები, ბრძანებამ ვერაფერი შეასრულა —
           `SUCCESS` ამას „ყველაფერი ჩამოვიდა"-დ წაიკითხავდა. */
        $failedTotal = array_sum(array_column($totals, 'failed'));
        $noKeyTotal = array_sum(array_column($totals, 'noKey'));
        $okTotal = array_sum(array_column($totals, 'ok'));

        return $failedTotal > 0 || ($noKeyTotal > 0 && $okTotal === 0) ? self::FAILURE : self::SUCCESS;
    }
}
