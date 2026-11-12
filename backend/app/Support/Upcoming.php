<?php

namespace App\Support;

use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * **„მალე" — რა გამოდის წინ.**
 *
 * ერთი განსაზღვრება სამ ადგილას: „მალე" სექციის სია, გამოსვლის დღის შეტყობინება
 * და TMDB-იდან მოსული ფაქტების ჩაწერა (`stamp()`).
 *
 * - **ფილმი** მალეა, როცა პრემიერა დღეს ან წინ არის; უთარიღო ფილმი — როცა TMDB
 *   ამბობს, რომ ის ჯერ მზადდება ან მხოლოდ გამოცხადდა.
 * - **სერიალი / ანიმე** მალეა, როცა პირველი ეთერი წინ არის, ან შემდეგი სერია
 *   (`next_air_at`) დღეს ან წინაა — ახალი სეზონიც ასე ჩნდება.
 *
 * ⚠️ თარიღები `whereDate`-ით ედრება: `date`-ად კასტებული სვეტი sqlite-ში დროით
 * ინახება (`2026-12-01 00:00:00`) და სტრიქონული შედარება დღევანდელს „ხვალინდელად" წაიკითხავდა.
 */
final class Upcoming
{
    /** TMDB-ის მდგომარეობები, რომლებიც „ჯერ არ გამოსულა"-ს ნიშნავს (ფილმი და TV ერთად) */
    public const UNRELEASED = ['Rumored', 'Planned', 'In Production', 'Post Production', 'Pilot'];

    /**
     * TMDB-ის დეტალებიდან გამოსვლის თარიღისა და მდგომარეობის ჩაწერა მოდელზე (შენახვის გარეშე).
     *
     * ⚠️ ეს TMDB-ის ფაქტია და არა ჩანაწერის ველი, რომელსაც ხელით წერენ — ყოველთვის
     * იწერება, „გადაწერის" გადამრთველს არ ეკითხება. ცარიელი პასუხი ძველს არ შლის:
     * TMDB ზოგ ენაზე თარიღს არ აბრუნებს.
     *
     * @return bool შეიცვალა თუ არა რამე
     */
    public static function stamp(Model $record, array $details, bool $tv): bool
    {
        $date = (string) ($details[$tv ? 'first_air_date' : 'release_date'] ?? '');
        $date = preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) ? $date : null;
        $status = trim((string) ($details['status'] ?? '')) ?: null;

        $before = [$record->release_date?->format('Y-m-d'), $record->tmdb_status];

        if ($date !== null) {
            $record->release_date = $date;
        }
        if ($status !== null) {
            $record->tmdb_status = mb_substr($status, 0, 40);
        }

        return $before !== [$record->release_date?->format('Y-m-d'), $record->tmdb_status];
    }

    /**
     * შემდეგი სერიის ეთერი (`next_episode_to_air`) მოდელზე, შენახვის გარეშე — სერიალი და ანიმე.
     * ⚠️ ცარიელი პასუხი ძველს **შლის**: შემდეგი სერია აღარ არის დაგეგმილი.
     *
     * @return bool შეიცვალა თუ არა რამე
     */
    public static function stampNextAir(Model $record, array $details): bool
    {
        $next = $details['next_episode_to_air'] ?? null;
        $before = [$record->next_air_at?->format('Y-m-d'), $record->next_season, $record->next_episode];

        $record->next_air_at = ($next['air_date'] ?? '') ?: null;
        $record->next_season = isset($next['season_number']) ? (int) $next['season_number'] : null;
        $record->next_episode = isset($next['episode_number']) ? (int) $next['episode_number'] : null;

        return $before !== [$record->next_air_at?->format('Y-m-d'), $record->next_season, $record->next_episode];
    }

    /** სია ვიწროვდება იმაზე, რაც წინ არის (ან ჯერ მხოლოდ გამოცხადებულია) */
    public static function scope(Builder $query, bool $tv, ?CarbonInterface $today = null): Builder
    {
        $day = ($today ?? AppTime::now())->format('Y-m-d');
        $model = $query->getModel();
        $release = $model->qualifyColumn('release_date');

        return $query->where(function (Builder $q) use ($model, $release, $day, $tv) {
            $q->whereDate($release, '>=', $day)
                ->orWhere(fn (Builder $unknown) => $unknown
                    ->whereNull($release)
                    ->whereIn($model->qualifyColumn('tmdb_status'), self::UNRELEASED));

            if ($tv) {
                $q->orWhereDate($model->qualifyColumn('next_air_at'), '>=', $day);
            }
        });
    }

    /** მხოლოდ ის, რაც ზუსტად ამ დღეს გამოდის — გამოსვლის დღის შეტყობინება */
    public static function scopeOn(Builder $query, bool $tv, CarbonInterface $day): Builder
    {
        $date = $day->format('Y-m-d');
        $model = $query->getModel();

        return $query->where(function (Builder $q) use ($model, $date, $tv) {
            $q->whereDate($model->qualifyColumn('release_date'), $date);

            if ($tv) {
                $q->orWhereDate($model->qualifyColumn('next_air_at'), $date);
            }
        });
    }

    /**
     * რა გამოდის ამ ჩანაწერზე და როდის.
     *
     * `kind`: `premiere` — ფილმის პრემიერა ან სერიალის პირველი ეთერი; `season` — ახალი
     * სეზონის პირველი სერია; `episode` — მიმდინარე სეზონის შემდეგი სერია; `announced` —
     * თარიღი ჯერ უცნობია.
     *
     * @return array{date: ?string, days: ?int, kind: string, season: ?int, episode: ?int}
     */
    public static function facts(Model $record, bool $tv, ?CarbonInterface $today = null): array
    {
        $today = ($today ?? AppTime::now())->copy()->startOfDay();
        $day = $today->format('Y-m-d');

        $release = $record->release_date?->format('Y-m-d');
        $next = $tv ? $record->next_air_at?->format('Y-m-d') : null;

        if ($release !== null && $release >= $day) {
            return self::fact($release, $today, 'premiere');
        }

        if ($next !== null && $next >= $day) {
            $episode = $record->next_episode !== null ? (int) $record->next_episode : null;

            return self::fact(
                $next,
                $today,
                $episode === 1 ? 'season' : 'episode',
                $record->next_season !== null ? (int) $record->next_season : null,
                $episode,
            );
        }

        return ['date' => null, 'days' => null, 'kind' => 'announced', 'season' => null, 'episode' => null];
    }

    /** @return array{date: string, days: int, kind: string, season: ?int, episode: ?int} */
    private static function fact(string $date, CarbonInterface $today, string $kind, ?int $season = null, ?int $episode = null): array
    {
        return [
            'date' => $date,
            'days' => (int) round($today->diffInDays(Carbon::parse($date, $today->getTimezone())->startOfDay(), false)),
            'kind' => $kind,
            'season' => $season,
            'episode' => $episode,
        ];
    }
}
