<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Storage\StorageMeter;
use Illuminate\Console\Command;

/**
 * `users.storage_used_bytes`-ის სრული გადათვლა (Tasks 17.1).
 *
 * მრიცხველი ჩვეულებრივ დელტით ცვლილება (ატვირთვა/წაშლა); ეს ბრძანება მაშინაა,
 * როცა ის ეჭვქვეშაა — მიგრაციის შემდეგ პირველი გაშვება, ხელით წაშლილი ფაილი,
 * ან ბაზის აღდგენა ბექაპიდან.
 */
class RecalculateStorageCommand extends Command
{
    protected $signature = 'mediary:storage-recalc {--user= : მხოლოდ ამ id/ელფოსტის მომხმარებელი}';

    protected $description = 'გადათვლის დაკავებულ ადგილს დისკიდან და ჩაწერს დაქეშილ მრიცხველში';

    public function handle(StorageMeter $meter): int
    {
        $query = User::query();

        if ($who = $this->option('user')) {
            $query->where(is_numeric($who) ? 'id' : 'email', $who);
        }

        $users = $query->orderBy('id')->get();
        if ($users->isEmpty()) {
            $this->error('მომხმარებელი ვერ მოიძებნა.');

            return self::FAILURE;
        }

        foreach ($users as $user) {
            $before = (int) $user->storage_used_bytes;
            $after = $meter->recalculate($user);

            $this->line(sprintf(
                '%-28s %10s → %10s%s',
                $user->email,
                $this->human($before),
                $this->human($after),
                $before === $after ? '' : '  (განსხვავება)',
            ));
        }

        return self::SUCCESS;
    }

    private function human(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $i = 0;
        $value = (float) $bytes;

        while ($value >= 1024 && $i < count($units) - 1) {
            $value /= 1024;
            $i++;
        }

        return round($value, $i === 0 ? 0 : 1).' '.$units[$i];
    }
}
