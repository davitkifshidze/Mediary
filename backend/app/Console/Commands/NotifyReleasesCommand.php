<?php

namespace App\Console\Commands;

use App\Models\Module;
use App\Models\User;
use App\Services\Notify\Notifier;
use App\Support\AppTime;
use App\Support\MediaDomain;
use App\Support\NotificationType;
use App\Support\Upcoming;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Throwable;

/**
 * **„დღეს გამოდის"** — შეტყობინება გამოსვლის დღეს.
 *
 * ჩემი ბიბლიოთეკის ფილმი, რომლის პრემიერაც დღესაა, და სერიალი / ანიმე, რომლის
 * პირველი ეთერი ან შემდეგი სერია დღეს გადის, თითო შეტყობინებას აგზავნის —
 * ჩანაწერზე გადასასვლელი ბმულით.
 *
 * ⚠️ **ერთ ჩანაწერზე დღეში ერთი**: ბრძანება რომ ორჯერ გაეშვას (ხელით და
 * scheduler-ით), დღევანდელი შეტყობინება უკვე არსებობს და მეორე არ იწერება.
 *
 * ⚠️ **თითო ანგარიში თავის თავად** (`Auth::setUser()`): `owner` scope და ლოკები
 * მფლობელისაა. ჩაკეტილი ჩანაწერი შეტყობინებაში არ ხვდება — სათაური შიგთავსია.
 *
 * ⚠️ `schedule:work`-ის გარეშე ეს ბრძანება არ ეშვება; ხელით — `php artisan media:release-notify`.
 */
class NotifyReleasesCommand extends Command
{
    protected $signature = 'media:release-notify';

    protected $description = 'შეტყობინება ფილმებზე, სერიალებსა და ანიმეზე, რომლებიც დღეს გამოდის';

    public function handle(Notifier $notifier): int
    {
        $today = AppTime::now()->startOfDay();
        $routes = Module::whereIn('key', MediaDomain::TYPES)->pluck('route_base', 'key');
        $sent = 0;

        try {
            foreach (User::where('is_active', true)->get() as $user) {
                // ⚠️ ერთი ანგარიშის შეცდომა დანარჩენებს არ აჩერებს
                try {
                    $sent += $this->notifyUser($user, $notifier, $today, $routes);
                } catch (Throwable $e) {
                    report($e);
                    $this->warn("{$user->email} — {$e->getMessage()}");
                }
            }
        } finally {
            Auth::forgetUser();
        }

        if ($sent > 0) {
            $this->info("გაიგზავნა {$sent} შეტყობინება.");
        }

        return self::SUCCESS;
    }

    /**
     * ერთი ანგარიშის „დღეს გამოვიდა".
     *
     * @param  Collection<string, string>  $routes
     */
    private function notifyUser(User $user, Notifier $notifier, Carbon $today, Collection $routes): int
    {
        $sent = 0;
        Auth::setUser($user);

        // რა ეცნობა დღეს უკვე — `მოდული:id`
        $told = $user->notifications()
            ->where('type', NotificationType::RELEASE_TODAY)
            ->where('created_at', '>=', now()->startOfDay())
            ->get()
            ->map(fn ($n) => ($n->data['module'] ?? '').':'.($n->data['record_id'] ?? ''))
            ->flip();

        foreach (MediaDomain::enabledFor($user) as $domain) {
            $tv = MediaDomain::isTv($domain);

            $records = Upcoming::scopeOn(MediaDomain::query($domain)->withoutLocked(), $tv, $today)->get();

            foreach ($records as $record) {
                if ($told->has("{$domain}:{$record->id}")) {
                    continue;
                }

                $facts = Upcoming::facts($record, $tv, $today);

                $notifier->send($user, NotificationType::RELEASE_TODAY, [
                    'module' => $domain,
                    'record_id' => $record->id,
                    'title_ka' => $record->title_ka,
                    'title_en' => $record->title_en,
                    'kind' => $facts['kind'],
                    'season' => $facts['season'],
                    'episode' => $facts['episode'],
                    'path' => rtrim((string) ($routes[$domain] ?? ''), '/').'/'.$record->id,
                ]);
                $sent++;
            }
        }

        return $sent;
    }
}
