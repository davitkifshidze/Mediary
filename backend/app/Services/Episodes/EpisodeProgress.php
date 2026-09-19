<?php

namespace App\Services\Episodes;

use App\Models\EpisodeWatch;
use App\Models\Status;
use App\Models\TvEpisode;
use App\Models\User;
use App\Support\AppTime;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

/**
 * **FEAT-09 — „სად გავჩერდი".**
 *
 * ერთი ადგილი, სადაც „ნანახი ეპიზოდები" ჩანაწერის მდგომარეობად იქცევა:
 * სეზონების სია, პროგრესი, შემდეგი ეპიზოდი და სტატუსის ავტომატური
 * გადანაცვლება.
 *
 * ⚠️ **სტატუსი `role`-ით იწერება და არა სახელით** (§6.4): ჩემი „ვუყურებ"
 * და შენი „ვყურებ" ერთი და იგივეა, გასაღები კი სხვა — ერთადერთი, რაც
 * ორივეზე მუშაობს, როლია.
 *
 * ⚠️ **სტატუსი მხოლოდ წინ მიდის: `todo` → `doing` → `done`.** უკან
 * დაბრუნება (მონიშვნის მოხსნა `done`-იდან) **განზრახ არ ხდება**: სტატუსი
 * მომხმარებლის განცხადებაა და არა მრიცხველის ჩრდილი — „დავასრულე და
 * ახლა თავიდან ვუყურებ" სრულიად კანონიერი მდგომარეობაა, რომელსაც
 * ავტომატური დაწევა ჩუმად გააუქმებდა.
 */
class EpisodeProgress
{
    /**
     * ჩანაწერის სეზონები ჩემი მონიშვნებით.
     *
     * @return array<string, mixed>
     */
    public function overview(User $user, Model $record): array
    {
        $episodes = $this->episodes($record);
        $watched = $this->watchedIds($user, $episodes);

        $seasons = $episodes
            ->groupBy('season_number')
            ->map(fn (Collection $rows, $number) => [
                'season' => (int) $number,
                'total' => $rows->count(),
                'watched' => $rows->filter(fn (TvEpisode $e) => isset($watched[$e->id]))->count(),
                'episodes' => $rows->map(fn (TvEpisode $e) => [
                    'id' => $e->id,
                    'episode' => $e->episode_number,
                    'name' => $e->name,
                    'air_date' => $e->air_date?->format('Y-m-d'),
                    'runtime' => $e->runtime,
                    'watched' => isset($watched[$e->id]),
                    'watched_at' => $watched[$e->id] ?? null,
                ])->values()->all(),
            ])
            ->values()
            ->all();

        $total = $episodes->count();
        $seen = count($watched);

        return [
            'total' => $total,
            'watched' => $seen,
            // ⚠️ ეპიზოდების გარეშე პროგრესი **0-ია და არა 100** — „არაფერი ვიცი" არ ნიშნავს „ყველაფერი ნანახია"
            'percent' => $total > 0 ? (int) round(($seen / $total) * 100) : 0,
            'next' => $this->next($episodes, $watched),
            'seasons' => $seasons,
        ];
    }

    /**
     * ეპიზოდების მონიშვნა/მოხსნა.
     *
     * @param  list<int>  $ids  `tv_episodes.id`
     * @return int რამდენი შეიცვალა
     */
    public function mark(User $user, Model $record, array $ids, bool $watched): int
    {
        // ⚠️ id-ები **ამ ჩანაწერის** ეპიზოდებში უნდა იყოს, თორემ სხვა
        // სერიალის ეპიზოდის მონიშვნა ერთი რექვესთით იქნებოდა შესაძლებელი
        $own = $this->episodes($record)->pluck('id')->all();
        $ids = array_values(array_intersect(array_map('intval', $ids), $own));

        if ($ids === []) {
            return 0;
        }

        if (! $watched) {
            $removed = EpisodeWatch::withoutGlobalScope('owner')
                ->where('user_id', $user->getKey())
                ->whereIn('tv_episode_id', $ids)
                ->delete();

            return (int) $removed;
        }

        $now = AppTime::now();
        $existing = EpisodeWatch::withoutGlobalScope('owner')
            ->where('user_id', $user->getKey())
            ->whereIn('tv_episode_id', $ids)
            ->pluck('tv_episode_id')
            ->all();

        $fresh = array_values(array_diff($ids, $existing));

        foreach ($fresh as $id) {
            EpisodeWatch::create([
                'user_id' => $user->getKey(),
                'tv_episode_id' => $id,
                'watched_at' => $now,
            ]);
        }

        return count($fresh);
    }

    /**
     * პროგრესიდან სტატუსი.
     *
     * ⚠️ **ეს `mark()`-ის შიგნით არ ხდება** — მონიშვნა და სტატუსის ცვლილება
     * ორი სხვადასხვა ფაქტია და კონტროლერი ორივეს ერთ პასუხში აბრუნებს;
     * შერწყმა ნიშნავდა, რომ „რა მოხდა" ვერ გამოიკითხებოდა ცალკე.
     *
     * @return string|null ახალი როლი, თუ შეიცვალა
     */
    public function syncStatus(User $user, Model $record, int $watched, int $total): ?string
    {
        if ($total === 0) {
            return null;
        }

        $role = $record->status_role;

        $target = match (true) {
            $watched >= $total => 'done',
            $watched > 0 && $role !== 'done' => 'doing',
            default => null,
        };

        // ⚠️ მხოლოდ წინ: `done`-ზე მდგომი ჩანაწერი `doing`-ზე არ ბრუნდება
        if ($target === null || $target === $role || ($role === 'done' && $target !== 'done')) {
            return null;
        }

        $status = Status::withoutGlobalScope('owner')
            ->where('user_id', $user->getKey())
            ->where('module', $record->statusDomain())
            ->where('role', $target)
            ->ordered()
            ->first();

        if (! $status) {
            return null;
        }

        // `applyStatus()` — ერთადერთი წერტილი, სადაც `watched_at`-იც წესრიგდება
        $record->applyStatus($status);
        $record->save();

        return $target;
    }

    /** ამ ჩანაწერის ეპიზოდები (TMDB-ის id-ით) */
    private function episodes(Model $record): Collection
    {
        $tmdbId = (int) ($record->tmdb_id ?? 0);

        if (! $tmdbId) {
            return collect();
        }

        return TvEpisode::where('tmdb_series_id', $tmdbId)
            ->orderBy('season_number')
            ->orderBy('episode_number')
            ->get();
    }

    /** `tv_episodes.id` → `watched_at` */
    private function watchedIds(User $user, Collection $episodes): array
    {
        if ($episodes->isEmpty()) {
            return [];
        }

        return EpisodeWatch::withoutGlobalScope('owner')
            ->where('user_id', $user->getKey())
            ->whereIn('tv_episode_id', $episodes->pluck('id'))
            ->get()
            ->mapWithKeys(fn (EpisodeWatch $w) => [
                $w->tv_episode_id => $w->watched_at?->format('Y-m-d H:i:s'),
            ])
            ->all();
    }

    /**
     * შემდეგი სანახავი ეპიზოდი.
     *
     * ⚠️ **პირველი უნახავი და არა „ბოლო ნანახის მომდევნო".** სერიალს
     * შუაში გამოტოვებული ეპიზოდი შეიძლება ჰქონდეს (ან ეპიზოდი მოგვიანებით
     * დაემატოს), და მაშინ „მომდევნო" გამოტოვებულს სამუდამოდ დამარხავდა.
     */
    private function next(Collection $episodes, array $watched): ?array
    {
        $next = $episodes->first(fn (TvEpisode $e) => ! isset($watched[$e->id]));

        return $next ? [
            'id' => $next->id,
            'season' => $next->season_number,
            'episode' => $next->episode_number,
            'name' => $next->name,
            'air_date' => $next->air_date?->format('Y-m-d'),
        ] : null;
    }
}
