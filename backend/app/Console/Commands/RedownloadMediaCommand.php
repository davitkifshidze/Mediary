<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Sync\ItemSyncer;
use App\Support\MediaDomain;
use Illuminate\Console\Command;

/**
 * მედიის მასობრივი ჩამოტვირთვა CLI-დან.
 *
 * ძველი `POST /api/media/redownload` აქ გადმოვიდა (Tasks J5): ბრაუზერიდან
 * გამოძახებული ერთი გრძელი ციკლი `php artisan serve`-ს (ერთ-რექვესთიანი
 * dev-სერვერი) მთლიანად ბლოკავდა. UI-დან ახლა სათითაო სინქრონი მუშაობს
 * (`POST /api/media/sync/{type}/{id}`), ეს ბრძანება კი დარჩა ერთჯერადი
 * bootstrap-ისთვის — მაგ. ახალ მანქანაზე კლონის შემდეგ, სადაც storage/ ცარიელია.
 */
class RedownloadMediaCommand extends Command
{
    protected $signature = 'media:redownload
        {--type= : movie | series | anime (ცარიელი = ყველა)}
        {--missing : მხოლოდ დაკარგული ფაილები}
        {--user= : მხოლოდ ამ user id-ის ჩანაწერები (ცარიელი = ყველა მომხმარებელი)}';

    protected $description = 'პოსტერების და მსახიობთა ფოტოების ჩამოტვირთვა TMDB-დან';

    public function handle(ItemSyncer $syncer): int
    {
        if (! $syncer->configured()) {
            $this->error('TMDB_API_KEY არ არის კონფიგურირებული backend/.env-ში.');

            return self::FAILURE;
        }

        $type = $this->option('type');
        if ($type !== null && ! MediaDomain::has($type)) {
            $this->error('--type უნდა იყოს '.implode(' | ', MediaDomain::TYPES).'.');

            return self::FAILURE;
        }

        // CLI-ს ავტორიზებული user არ ჰყავს → `owner` global scope უქმია და
        // ბრძანება ყველა მომხმარებლის ჩანაწერს დაამუშავებს (იხ. BelongsToUser).
        $userId = $this->option('user');
        if ($userId !== null && ! User::whereKey($userId)->exists()) {
            $this->error("მომხმარებელი id={$userId} ვერ მოიძებნა.");

            return self::FAILURE;
        }
        if ($userId === null && User::count() > 1) {
            $this->warn('--user მითითებული არ არის: დამუშავდება ყველა მომხმარებლის ჩანაწერი.');
        }

        $opts = ['media' => true, 'only_missing' => (bool) $this->option('missing')];
        $totals = [];

        foreach (MediaDomain::TYPES as $domain) {
            $model = MediaDomain::model($domain);

            if ($type !== null && $type !== $domain) {
                continue;
            }

            $rows = $model::whereNotNull('tmdb_id')
                ->when($userId !== null, fn ($q) => $q->where('user_id', $userId))
                ->get();
            $ok = $failed = $skipped = 0;
            $bar = $this->output->createProgressBar($rows->count());
            $bar->start();

            foreach ($rows as $row) {
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
            $totals[$domain] = compact('ok', 'failed', 'skipped');
            $this->info("{$domain}: ok={$ok} skipped={$skipped} failed={$failed}");
        }

        return array_sum(array_column($totals, 'failed')) > 0 ? self::FAILURE : self::SUCCESS;
    }
}
