<?php

namespace App\Services\Calendar;

use App\Models\Anime;
use App\Models\Game;
use App\Models\NoteEntry;
use App\Models\Series;
use App\Models\User;
use App\Support\AppTime;
use Illuminate\Database\Eloquent\Model;

/**
 * **FEAT-10 — „მალე".**
 *
 * მომავალი მოვლენა (შემდეგი ეპიზოდი, თამაშის გამოსვლა, ჩანიშვნის ვადა)
 * აპში არსად ჩანდა: სტატუსი `todo`/`doing` + თარიღი უკვე ინფორმაციაა,
 * რომელიც ჩუმად კარგავს ღირებულებას.
 *
 * ⚠️ **წიგნი და ბორდგეიმი აქ ვერ იქნებიან და ეს არ არის გამორჩენა**:
 * მათ მხოლოდ `year` აქვთ და არა თარიღი. „2026" ვერ დადგება კალენდარში
 * კონკრეტულ დღეს, ხოლო 1 იანვრით მისი ჩასმა გამოგონილი ფაქტი იქნებოდა —
 * ზუსტად ისეთი, რომლებსაც ეს პროექტი თანმიმდევრულად უარყოფს.
 *
 * ⚠️ **ფილმიც გარეთაა იმავე მიზეზით** — `movies`-ს `release_date` სვეტი
 * არ აქვს, მხოლოდ `year`.
 *
 * ⚠️ **ჩანიშვნა შიგნითაა, თუმცა მისი ვადა მომხმარებელმა თვითონ დაწერა.**
 * სწორედ ეს არის მიზეზი: `note_entries.due_at` დღეს **მხოლოდ** ჩანიშვნების
 * სექციაში ჩანს, ე.ი. სხვა მოდულში მუშაობისას ის უხილავია. §16.5 ჩანიშვნებს
 * **საჯარო პროფილზე** კრძალავს და არა ჩემსავე დეშბორდზე.
 */
class Upcoming
{
    /** ნაგულისხმევი ფანჯარა დღეებში */
    public const DEFAULT_DAYS = 30;

    public const MAX_DAYS = 365;

    /** ჭერი ერთ მოდულზე — დეშბორდის ბლოკი სიას არ უნდა დაემსგავსოს */
    private const PER_MODULE = 50;

    /**
     * მოდული → [მოდელი, თარიღის სვეტი].
     *
     * ⚠️ **სვეტი ერთია თითო მოდულზე და მეორე წყარო არ არსებობს.**
     * სერიალზე `tv_episodes.air_date` (FEAT-09) მაცდური კანდიდატია, მაგრამ
     * ის მხოლოდ ცხადი ჩამოტვირთვის შემდეგ არსებობს — ე.ი. კალენდარი
     * სრულიად სხვა ქმედების მიხედვით ჩნდებოდა და ქრებოდა.
     *
     * @var array<string, array{model: class-string<Model>, column: string}>
     */
    private const SOURCES = [
        'series' => ['model' => Series::class, 'column' => 'next_air_at'],
        'anime' => ['model' => Anime::class, 'column' => 'next_air_at'],
        'game' => ['model' => Game::class, 'column' => 'release_date'],
        'note' => ['model' => NoteEntry::class, 'column' => 'due_at'],
    ];

    /** @return list<string> */
    public static function modules(): array
    {
        return array_keys(self::SOURCES);
    }

    /**
     * მომდევნო `$days` დღის მოვლენები, თარიღის ზრდის მიხედვით.
     *
     * @param  list<string>  $modules  ჩართული მოდულები (დანარჩენი არ იკითხება)
     * @return list<array<string, mixed>>
     */
    public function events(User $user, array $modules, int $days = self::DEFAULT_DAYS): array
    {
        $days = max(1, min($days, self::MAX_DAYS));

        /* ⚠️ ფანჯარა **დღევანდელი დღიდან** იწყება და არა „ახლა"-დან:
           დღეს საღამოს გასული ეპიზოდი დღესვე უნდა ჩანდეს. */
        $from = AppTime::now()->startOfDay();
        $to = $from->copy()->addDays($days)->endOfDay();

        $events = [];

        foreach (self::SOURCES as $module => $source) {
            if (! in_array($module, $modules, true)) {
                continue;
            }

            $model = $source['model'];
            $column = $source['column'];

            $rows = $model::withoutGlobalScope('owner')
                ->where('user_id', $user->getKey())
                ->whereNotNull($column)
                ->whereBetween($column, [$from, $to])
                ->orderBy($column)
                ->limit(self::PER_MODULE)
                ->get();

            foreach ($rows as $row) {
                $events[] = $this->event($module, $row, $column);
            }
        }

        usort($events, fn (array $a, array $b) => [$a['date'], $a['module']] <=> [$b['date'], $b['module']]);

        return $events;
    }

    /** @return array<string, mixed> */
    private function event(string $module, Model $row, string $column): array
    {
        $date = $row->{$column};

        return [
            'module' => $module,
            'id' => $row->id,
            'date' => $date instanceof \DateTimeInterface ? $date->format('Y-m-d') : (string) $date,
            'title' => $this->title($module, $row),
            /* ⚠️ სეზონი/ეპიზოდი ცალკე რიცხვებია და არა „S05E03" — წარწერას
               ინტერფეისი აგებს, თორემ სერვერი ენაზე დამოკიდებულ ტექსტს
               დაბრუნებდა (და ეს ტექსტი ორ ადგილას იარსებებდა). */
            'season' => $module === 'series' || $module === 'anime' ? $row->next_season : null,
            'episode' => $module === 'series' || $module === 'anime' ? $row->next_episode : null,
        ];
    }

    private function title(string $module, Model $row): string
    {
        if ($module === 'note') {
            return (string) $row->title;
        }

        return (string) ($row->title_ka ?: $row->title_en ?: $row->title ?: '');
    }
}
