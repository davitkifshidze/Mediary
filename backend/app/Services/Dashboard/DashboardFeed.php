<?php

namespace App\Services\Dashboard;

use App\Models\Anime;
use App\Models\BoardGame;
use App\Models\Book;
use App\Models\Bookmark;
use App\Models\Course;
use App\Models\CustomRecord;
use App\Models\Game;
use App\Models\Module;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\Place;
use App\Models\Series;
use App\Models\Song;
use App\Models\User;
use App\Models\Video;
use App\Support\CustomModules;
use App\Support\ExportDomain;
use App\Support\ModuleList;
use App\Support\RecordTitle;
use App\Support\StatusDomain;
use App\Support\StorageFolder;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

/**
 * **მთავარი გვერდის ორი ზოლი** — „ვაგრძელებ" და „ბოლოს დამატებული".
 *
 * ⚠️ **მთავარი გვერდის ჯამი (`GET /dashboard`) აქ არ იზრდება**: ის ოთხ query-ზეა
 * დაჭერილი. თითო ზოლი თავის მოთხოვნას აკეთებს და მხოლოდ მაშინ, როცა მომხმარებელს
 * ბლოკი ჩართული აქვს — აქაური „თითო მოდულზე თითო query" იქ ვერ ჩაეტეოდა.
 *
 * ⚠️ query მოდელიდან იწყება, ე.ი. `owner`, `trash` და `record_lock` scope-ები
 * თავისით მოქმედებს: ურნაში მყოფი და დაუხსნელი ჩაკეტილი ჩანაწერი აქ არ ჩანს.
 * კურსში მცხოვრები ვიდეო ვიდეოების მოდულისა არ არის (`ModuleList::narrow()`).
 * ⚠️ ბარათი **ვიწროა** — მოდული, id, სათაური, მთავარი ფოტო და თარიღი. პრივატული
 * დისკის ფოტო (ჩანიშვნა) აქედან არ გადის: `/storage`-ით ის ისედაც არ გაიხსნებოდა.
 */
class DashboardFeed
{
    /** თითო მოდულიდან რამდენი იკითხება, სანამ საერთო რიგი შედგება */
    private const PER_MODULE = 6;

    /** მოდული → მოდელი (ჩანაწერებიანი მოდულები; გალერეა და მორიგეობა აქ არ ითვლება) */
    private const MODELS = [
        'movie' => Movie::class,
        'series' => Series::class,
        'anime' => Anime::class,
        'video' => Video::class,
        'song' => Song::class,
        'book' => Book::class,
        'board_game' => BoardGame::class,
        'game' => Game::class,
        'note' => NoteEntry::class,
        'bookmark' => Bookmark::class,
        'course' => Course::class,
        'place' => Place::class,
    ];

    /** enum-სტატუსიანი მოდულის „მიმდინარე" მნიშვნელობა (ლექსიკონიანებზე — როლი `doing`) */
    private const DOING = ['book' => 'reading', 'game' => 'playing', 'course' => 'taking'];

    /** „ვაგრძელებ" — დაწყებული და დაუსრულებელი, ბოლოს შეცვლილი პირველი */
    public function continuing(User $user, int $limit): array
    {
        $rows = collect();

        foreach ($this->modules($user) as $module) {
            $query = $this->query($module);

            if (StatusDomain::usesDictionary($module)) {
                $query->statusRole('doing');
            } elseif (isset(self::DOING[$module])) {
                $query->where('status', self::DOING[$module]);
            } else {
                continue;
            }

            $rows = $rows->concat($this->cards($module, $query->orderByDesc('updated_at')->orderByDesc('id'), 'updated_at'));
        }

        return $this->top($rows, $limit);
    }

    /** „ბოლოს დამატებული" — ყველა მოდულიდან, ახალი პირველი */
    public function recent(User $user, int $limit): array
    {
        $rows = collect();

        foreach ($this->modules($user) as $module) {
            $rows = $rows->concat($this->cards($module, $this->query($module)->orderByDesc('created_at')->orderByDesc('id'), 'created_at'));
        }

        return $this->top($rows, $limit);
    }

    /** @return list<string> ჩართული და ხილული ჩანაწერებიანი მოდულები, პირადებიანად */
    private function modules(User $user): array
    {
        return Module::where('is_active', true)
            ->where(fn ($q) => $q->whereIn('key', array_keys(self::MODELS))->orWhereIn('key', CustomModules::keysOf($user)))
            ->orderBy('sort_order')
            ->orderBy('id')
            ->pluck('key')
            ->filter(fn (string $key) => $user->hasModule($key) && $user->hasPermission($key, 'view'))
            ->values()
            ->all();
    }

    private function query(string $module): Builder
    {
        if (CustomModules::isKey($module)) {
            return CustomRecord::query()->forModule($module);
        }

        return ModuleList::narrow(self::MODELS[$module]::query());
    }

    /** @return Collection<int, array<string, mixed>> */
    private function cards(string $module, Builder $query, string $at): Collection
    {
        $photo = ExportDomain::photo($module)[0] ?? null;

        return $query->limit(self::PER_MODULE)->get()->map(function (Model $record) use ($module, $photo, $at) {
            $path = $photo ? $record->getAttribute($photo) : null;

            return [
                'module' => $module,
                'id' => (int) $record->getKey(),
                ...RecordTitle::of($record),
                'photo' => is_string($path) && $path !== '' && ! StorageFolder::isPrivate($path) ? $path : null,
                'at' => $record->getAttribute($at)?->toIso8601String(),
            ];
        });
    }

    /** @return list<array<string, mixed>> */
    private function top(Collection $rows, int $limit): array
    {
        return $rows->sortByDesc('at')->take($limit)->values()->all();
    }
}
