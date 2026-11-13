<?php

namespace App\Services\Sync;

use App\Models\User;
use App\Services\Cast\CastPool;
use App\Services\Episodes\EpisodeSync;
use App\Support\MediaDomain;
use App\Support\SyncOutcome;
use Illuminate\Database\Eloquent\Builder;

/**
 * **„რამდენია გასაშვები"** — სინქრონიზაციის გვერდების ბარათების რიცხვები.
 *
 * ბარათი ერთი შეხედვით ამბობს, რა მდგომარეობაშია ბიბლიოთეკა: რამდენ ჩანაწერს ჯერ არ
 * გაუვლია სინქრონიზაცია, რამდენ სერიალს აქვს ჩამოსატვირთი სეზონები და რამდენ მსახიობს
 * ჯერ არ განახლებია მონაცემები.
 *
 * ⚠️ **რიცხვი იმავე query-დან მოდის, რასაც გაშვების გეგმა კითხულობს** — ცალკე დათვლა
 * პირველივე წესის ცვლილებაზე დაშორდებოდა და ბარათი ერთს იტყოდა, ფანჯარა — სხვას:
 * მონაცემები — „დამუშავებულების დამალვის" წესი (`SyncOutcome::pending()`), სეზონები —
 * `EpisodeSync::due()`, მსახიობები — „ვისაც ჯერ არ განახლებია" (`CastPool`).
 * ⚠️ `null` — ეს ბარათი ამ ანგარიშს (ან ამ მოდულს) არ აქვს: მოდული გამორთულია, უფლება
 * აკლია ან მოდულს სეზონები არ აქვს (ფილმი).
 */
final class SyncOverview
{
    /**
     * @param  string|null  $type  ერთი მოდული (`/movies/sync`…) ან `null` — ყველა ჩართული
     * @return array{sync: ?int, episodes: ?int, cast: ?int}
     */
    public function pending(User $user, ?string $type = null): array
    {
        $requested = $type === null ? null : [$type];

        // ჩანაწერის სინქრონიზაცია მისი რედაქტირებაა — მოდული და `update`
        $types = array_values(array_filter(
            MediaDomain::enabledFor($user, $requested),
            fn (string $domain) => $user->hasPermission($domain, 'update'),
        ));
        $tv = array_values(array_intersect($types, MediaDomain::TV_TYPES));
        $castTypes = CastPool::typesFor($user, $requested);

        return [
            SyncHistory::KIND_SYNC => $types === [] ? null : $this->sum($types, fn (string $domain) => self::unsynced($domain)),
            SyncHistory::KIND_EPISODES => $tv === [] ? null : $this->sum($tv, fn (string $domain) => EpisodeSync::due($domain)),
            SyncHistory::KIND_CAST => $castTypes === [] ? null : self::castNeverSynced($castTypes, (int) $user->getKey())->count(),
        ];
    }

    /**
     * ჩანაწერები, რომლებსაც სინქრონიზაცია ჯერ არ გაუვლია (ან ბოლოს ცარიელი დაბრუნდა /
     * ჩავარდა): TMDB id აქვს, „აღარ განაახლო" არ არის, ჩაკეტილი არ არის.
     */
    public static function unsynced(string $type): Builder
    {
        return SyncOutcome::pending(
            MediaDomain::query($type)->withoutLocked()->whereNotNull('tmdb_id')->where('sync_paused', false),
        );
    }

    /**
     * ამ ბიბლიოთეკის მსახიობები, რომელთა მონაცემები ჯერ არ განახლებულა: TMDB id აქვთ და
     * ჩემი „აღარ განაახლო" არ ადევთ — მსახიობების გეგმის ნაგულისხმევი ფარგლები.
     *
     * @param  list<string>  $types
     */
    public static function castNeverSynced(array $types, int $userId): Builder
    {
        return CastPool::query($types)
            ->whereNull('details_synced_at')
            ->whereNotNull('tmdb_person_id')
            ->whereDoesntHave('syncPauses', fn ($pause) => $pause->where('user_id', $userId));
    }

    /**
     * @param  list<string>  $types
     * @param  callable(string): Builder  $query
     */
    private function sum(array $types, callable $query): int
    {
        return array_sum(array_map(fn (string $type) => $query($type)->count(), $types));
    }
}
