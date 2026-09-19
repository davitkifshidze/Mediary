<?php

namespace App\Services\Episodes;

use App\Models\TvEpisode;
use App\Services\Tmdb\TmdbClient;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * **FEAT-09 — ეპიზოდების ჩამოტანა TMDB-იდან.**
 *
 * ⚠️ **ეს ჩვეულებრივ სინქრონში არ ხდება და ეს განზრახაა.** ეპიზოდების
 * სია **სეზონზე ერთი გამოძახებაა** (`/tv/{id}/season/{n}` — მისი მიღება
 * `append_to_response`-ით შეუძლებელია), ე.ი. ერთი სერიალი ათამდე
 * რექვესთია. მთელ ბიბლიოთეკაზე ავტომატური გაშვება TMDB-ის ბიუჯეტს
 * ისე დახარჯავდა, რომ მომხმარებელს ეპიზოდები არც კი დასჭირვებოდა —
 * ამიტომ `sync`-ის ცხადი ღილაკია, ჩანაწერზე.
 *
 * ⚠️ **ჩაწერა `upsert`-ია და არა `insert`.** სერიალს ეპიზოდის სახელი და
 * ეთერის თარიღი ეცვლება (განსაკუთრებით ჯერ გაუშვებელ სეზონზე), ე.ი.
 * ხელახალი სინქრონი უნდა **აახლებდეს** და არა დუბლს ბადებდეს. უნიკალური
 * სამეული (`tmdb_series_id`, `season_number`, `episode_number`) ამას
 * ბაზაშიც იცავს.
 *
 * ⚠️ **`season_number = 0` არ ჩამოიტვირთება** — TMDB-ზე ეს „სპეციალური
 * გამოშვებებია" (ბექსტეიჯი, რეკაპი), რომელთა რიცხვიც სეზონების
 * რაოდენობაში არ შედის; მათი ჩათვლა პროგრესს ერთ დღეს 100%-ზე ნაკლებად
 * დატოვებდა სრულად ნანახ სერიალზე.
 */
class EpisodeSync
{
    /** უსაზღვრო ციკლის ჭერი — სერიალს რეალურად ამდენი სეზონი არ აქვს */
    private const MAX_SEASONS = 60;

    public function __construct(private readonly TmdbClient $tmdb) {}

    public function configured(): bool
    {
        return $this->tmdb->configured();
    }

    /**
     * ჩანაწერის ყველა სეზონის ჩამოტანა.
     *
     * @return array{ok: bool, seasons: int, episodes: int, error: ?string}
     */
    public function sync(Model $record): array
    {
        $tmdbId = (int) ($record->tmdb_id ?? 0);

        if (! $tmdbId) {
            // ხელით შექმნილ სერიალს TMDB-ზე წყარო არ აქვს — ეს შეცდომა არაა
            return ['ok' => false, 'seasons' => 0, 'episodes' => 0, 'error' => 'no_tmdb_id'];
        }

        if (! $this->configured()) {
            return ['ok' => false, 'seasons' => 0, 'episodes' => 0, 'error' => 'tmdb_not_configured'];
        }

        try {
            $details = $this->tmdb->tvDetails($tmdbId);
        } catch (Throwable) {
            return ['ok' => false, 'seasons' => 0, 'episodes' => 0, 'error' => 'tmdb_unavailable'];
        }

        $numbers = $this->seasonNumbers($details);
        $seasons = 0;
        $episodes = 0;

        foreach ($numbers as $number) {
            $rows = $this->season($tmdbId, $number);

            if ($rows === null) {
                continue;
            }

            $seasons++;
            $episodes += $rows;
        }

        /* ⚠️ რაოდენობები **ჩანაწერზეც** ახლდება: `series.seasons`/`episodes`
           აქამდე მხოლოდ TMDB-ის დეტალებიდან მოდიოდა და ეპიზოდების ნამდვილ
           სიას შეიძლებოდა აცდენოდა — პროგრესის მნიშვნელი კი სწორედ სიაა. */
        if ($episodes > 0) {
            $record->forceFill(['seasons' => $seasons, 'episodes' => $episodes])->save();
        }

        return ['ok' => true, 'seasons' => $seasons, 'episodes' => $episodes, 'error' => null];
    }

    /**
     * სეზონების ნომრები დეტალების პასუხიდან.
     *
     * ⚠️ **`number_of_seasons`-ით დათვლა არასწორია**: TMDB სეზონებს
     * ყოველთვის 1..N-ად არ ნომრავს (გამოტოვებული ან 0-იანი სეზონები),
     * ამიტომ სია თვითონ პასუხიდან მოდის.
     *
     * @return list<int>
     */
    private function seasonNumbers(array $details): array
    {
        $numbers = [];

        foreach ($details['seasons'] ?? [] as $season) {
            $number = (int) ($season['season_number'] ?? -1);

            if ($number > 0) {
                $numbers[] = $number;
            }
        }

        if ($numbers === []) {
            $count = min((int) ($details['number_of_seasons'] ?? 0), self::MAX_SEASONS);
            $numbers = $count > 0 ? range(1, $count) : [];
        }

        sort($numbers);

        return array_slice($numbers, 0, self::MAX_SEASONS);
    }

    /**
     * ერთი სეზონის ჩაწერა; `null` — წყარომ არ უპასუხა.
     *
     * ⚠️ **`upsert()` და არა ციკლში `updateOrInsert()`.** ორი მიზეზი:
     * ერთი query სეზონზე და არა ოცი, და — რაც უფრო მნიშვნელოვანია —
     * განახლების სია ცხადია, ე.ი. `created_at` **არ გადაიწერება** ყოველ
     * სინქრონზე (`updateOrInsert`-ის `$values` განახლებაშიც მიდის).
     */
    private function season(int $tmdbId, int $number): ?int
    {
        try {
            $data = $this->tmdb->tvSeason($tmdbId, $number);
        } catch (Throwable) {
            return null;
        }

        $episodes = $data['episodes'] ?? [];

        if (! is_array($episodes) || $episodes === []) {
            return null;
        }

        $now = now();
        $rows = [];

        foreach ($episodes as $episode) {
            $episodeNumber = (int) ($episode['episode_number'] ?? 0);

            if ($episodeNumber <= 0) {
                continue;
            }

            $rows[] = [
                'tmdb_series_id' => $tmdbId,
                'season_number' => $number,
                'episode_number' => $episodeNumber,
                'name' => $this->text($episode['name'] ?? null, 255),
                // ⚠️ TMDB ცარიელ სტრიქონს წერს უცნობ თარიღზე და არა `null`-ს
                'air_date' => ($episode['air_date'] ?? '') ?: null,
                'runtime' => ($episode['runtime'] ?? null) ? (int) $episode['runtime'] : null,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        if ($rows === []) {
            return null;
        }

        DB::table((new TvEpisode)->getTable())->upsert(
            $rows,
            ['tmdb_series_id', 'season_number', 'episode_number'],
            ['name', 'air_date', 'runtime', 'updated_at'],
        );

        return count($rows);
    }

    private function text(mixed $value, int $max): ?string
    {
        $value = trim((string) $value);

        return $value === '' ? null : mb_substr($value, 0, $max);
    }
}
