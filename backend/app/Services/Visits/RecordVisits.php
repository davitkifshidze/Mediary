<?php

namespace App\Services\Visits;

use App\Models\RecordVisit;
use App\Models\User;
use App\Support\AppTime;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * **შესვლების ჟურნალის ერთადერთი მწერალი და მკითხველი** (Tasks §10, Q2).
 *
 * „შესვლა" = დეტალის გახსნა (გვერდის ან მოდალის), **საათში ერთხელ** თითო
 * მნახველზე იმავე ჩანაწერზე. ავტორიზებულზე დედუპლიკაცია ბაზით ხდება
 * (იგივე კითხვა „ბოლო შესვლასაც" სჭირდება), ანონიმზე — `Cache::add`-ით
 * IP-ის ჰეშზე, ზუსტად ისე, როგორც `PublicShareController::countView()`-ში:
 * ანონიმის ვინაობა ბაზაში არ ინახება.
 *
 * ⚠️ **მფლობელის საკუთარი შესვლები იწერება** (Q2: „შევედი N-ჯერ"), სხვისი კი
 * — მხოლოდ საჯარო პროფილიდან და გაზიარების ბმულიდან (`fromPublic()`), სადაც
 * მფლობელი თავის თავს არ ითვლის („მიმღების თვალით" ნახვა ნახვა არაა).
 *
 * ⚠️ **აუდიტის გარეშე**: `RecordVisit` `AuditRegistry::NOT_LOGGED`-შია —
 * ჩანაწერის ყოველი გახსნა ლოგში „შეიქმნა"-დ ჩაიწერებოდა.
 */
class RecordVisits
{
    public const WINDOW_MINUTES = 60;

    public const LOG_LIMIT = 20;

    /**
     * ერთი შესვლის ჩაწერა. `false` — იმავე ფანჯარაში უკვე დათვლილია.
     */
    public function record(Model $record, ?User $viewer, string $source, ?string $anonKey = null): bool
    {
        $now = AppTime::now();

        if ($viewer) {
            $recent = $this->target($record)
                ->where('user_id', $viewer->getKey())
                ->where('visited_at', '>=', $now->copy()->subMinutes(self::WINDOW_MINUTES))
                ->exists();

            if ($recent) {
                return false;
            }
        } else {
            $key = 'record-visit:'.$record->getMorphClass().':'.$record->getKey().':'.sha1((string) $anonKey);

            if (! Cache::add($key, 1, $now->copy()->addMinutes(self::WINDOW_MINUTES))) {
                return false;
            }
        }

        RecordVisit::query()->create([
            'owner_id' => (int) $record->getAttribute('user_id'),
            'user_id' => $viewer?->getKey(),
            'viewer_name' => $viewer ? mb_substr((string) ($viewer->name ?: $viewer->username), 0, 120) : null,
            'visitable_type' => $record->getMorphClass(),
            'visitable_id' => $record->getKey(),
            'source' => $source,
            'visited_at' => $now,
        ]);

        return true;
    }

    /**
     * სხვისი შესვლა საჯარო პროფილიდან ან გაზიარების ბმულიდან — მფლობელი არ ითვლება.
     */
    public function fromPublic(Model $record, Request $request, User $owner, string $source): void
    {
        $viewer = $request->user();

        if ($viewer && (int) $viewer->getKey() === (int) $owner->getKey()) {
            return;
        }

        $this->record($record, $viewer, $source, $request->ip());
    }

    /**
     * რიცხვი, ბოლო შესვლა და ჟურნალის ბოლო 20 რიგი („ვინ · როდის · საიდან").
     *
     * @return array{count: int, mine: int, last_at: ?string, entries: list<array<string, mixed>>}
     */
    public function summary(Model $record, ?User $viewer): array
    {
        $base = $this->target($record);

        /** @var ?RecordVisit $last */
        $last = (clone $base)->orderByDesc('visited_at')->orderByDesc('id')->first();

        $entries = (clone $base)
            ->with('viewer:id,name,username')
            ->orderByDesc('visited_at')
            ->orderByDesc('id')
            ->limit(self::LOG_LIMIT)
            ->get()
            ->map(fn (RecordVisit $visit) => [
                'id' => $visit->id,
                'viewer' => $visit->viewer
                    ? ['id' => $visit->viewer->id, 'name' => $visit->viewer->name, 'username' => $visit->viewer->username]
                    : null,
                // ანგარიშის წაშლის შემდეგ კავშირი ცარიელია, სახელის ასლი კი რჩება
                'viewer_name' => $visit->viewer_name,
                'is_me' => $viewer !== null && (int) $visit->user_id === (int) $viewer->getKey(),
                'source' => $visit->source,
                'visited_at' => $visit->visited_at?->toJSON(),
            ])
            ->all();

        return [
            'count' => (clone $base)->count(),
            'mine' => $viewer ? (clone $base)->where('user_id', $viewer->getKey())->count() : 0,
            'last_at' => $last?->visited_at?->toJSON(),
            'entries' => $entries,
        ];
    }

    /** @return Builder<RecordVisit> */
    private function target(Model $record): Builder
    {
        return RecordVisit::query()
            ->where('visitable_type', $record->getMorphClass())
            ->where('visitable_id', $record->getKey());
    }
}
