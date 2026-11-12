<?php

namespace App\Support;

use App\Models\Anime;
use App\Models\CastMember;
use App\Models\GalleryAlbum;
use App\Models\Movie;
use App\Models\Person;
use App\Models\PersonalAlbum;
use App\Models\RecordLock;
use App\Models\Series;
use App\Services\Gallery\AlbumVault;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

/**
 * **ყველა ჩემი ლოკი ერთ ადგილას** — „ჩაკეტილების" გვერდი.
 *
 * ლოკი ერთი მექანიზმია (`record_locks`), მაგრამ ჩაკეტილს აქამდე მხოლოდ თითო მოდულის
 * ფილტრი აჩვენებდა და პაროლი სათითაოდ იხსნებოდა. აქ არის: რომელი ტიპები იკეტება
 * (`TYPES` — morph-ალიასი → მოდელი და მოდული), ჩემი ლოკების სია ჩანაწერის სახელით და
 * მასობრივი მოხსნა.
 *
 * ⚠️ **დაუხსნელი ჩანაწერიდან მხოლოდ სახელი გამოდის** — იგივე, რასაც ბოქლომიანი
 * ბარათი აჩვენებს (`lockedCard()`): პოსტერი, აღწერა და სხვა ველები აქ არ იკითხება.
 * ⚠️ ურნაში მყოფი ჩანაწერის ლოკი სიაში არ არის — ის ჩანაწერთან ერთად ბრუნდება.
 * ⚠️ **მოხსნა ტიპის საკუთარ გზას მიჰყვება**: გალერეის ალბომის ფოტოები დაცული
 * დისკიდან ჩვეულებრივზე ბრუნდება (`AlbumVault::reveal()`), დანარჩენზე რიგი იშლება.
 * ორივეზე სესიის ჩანაწერიც ქრება — მომავალი ლოკი „უკვე გახსნილად" არ დაიწყება.
 * ⚠️ ახალი ჩაკეტვადი მოდელი აქ უნდა დაემატოს — `RecordLockPageTest` ამას ამოწმებს.
 */
final class LockBook
{
    /** ფსევდო-ჭრილი: მსახიობს მოდულის რიგი არ აქვს (`AuditRegistry::PSEUDO_MODULES`) */
    public const CAST = 'cast';

    /**
     * morph-ალიასი → მოდელი და მოდული; რიგი გვერდის ჯგუფების რიგია.
     *
     * @var array<string, array{model: class-string<Model>, module: string}>
     */
    public const TYPES = [
        'movie' => ['model' => Movie::class, 'module' => 'movie'],
        'series' => ['model' => Series::class, 'module' => 'series'],
        'anime' => ['model' => Anime::class, 'module' => 'anime'],
        'cast_member' => ['model' => CastMember::class, 'module' => self::CAST],
        'gallery_album' => ['model' => GalleryAlbum::class, 'module' => 'gallery'],
        'personal' => ['model' => Person::class, 'module' => 'personal'],
        'personal_album' => ['model' => PersonalAlbum::class, 'module' => 'personal'],
    ];

    /** ერთ პასუხში მაქსიმუმ რამდენი ლოკი — გვერდი მათ ჯგუფებად თვითონ ფურცლავს */
    public const MAX = 1000;

    /**
     * ჩემი ლოკები ჩანაწერის სახელით, ტიპების რიგით.
     *
     * @return list<array<string, mixed>>
     */
    public static function rows(): array
    {
        $locks = self::mine()->limit(self::MAX)->get()->groupBy('lockable_type');
        $rows = [];

        foreach (self::TYPES as $type => $meta) {
            $group = $locks->get($type);

            if (! $group) {
                continue;
            }

            $records = self::records($type, $group->pluck('lockable_id')->all());
            $open = RecordLocks::unlockedIds($type);

            foreach ($group as $lock) {
                $record = $records->get((int) $lock->lockable_id);

                if (! $record) {
                    continue;
                }

                $rows[] = [
                    'id' => (int) $lock->getKey(),
                    'type' => $type,
                    'module' => $meta['module'],
                    'record_id' => (int) $lock->lockable_id,
                    ...RecordTitle::of($record),
                    'hint' => $lock->hint,
                    'unlocked' => in_array((int) $lock->lockable_id, $open, true),
                    'locked_at' => $lock->created_at?->toIso8601String(),
                ];
            }
        }

        return $rows;
    }

    /**
     * ამ ლოკების მოდულები — უფლების შესამოწმებლად, მოხსნამდე.
     *
     * @param  list<int>  $lockIds
     * @return list<string>
     */
    public static function modulesOf(array $lockIds): array
    {
        return self::mine()
            ->whereIn('id', $lockIds)
            ->distinct()
            ->pluck('lockable_type')
            ->map(fn (string $type) => self::TYPES[$type]['module'])
            ->unique()
            ->values()
            ->all();
    }

    /**
     * პაროლის მოხსნა ამ ლოკებიდან; აბრუნებს, რამდენი მოიხსნა.
     *
     * ⚠️ ანგარიშის პაროლს გამომძახებელი ამოწმებს (`LockController`) — აქ მხოლოდ მოხსნაა.
     *
     * @param  list<int>  $lockIds
     */
    public static function remove(array $lockIds): int
    {
        $locks = self::mine()->whereIn('id', $lockIds)->get()->groupBy('lockable_type');
        $removed = 0;

        foreach ($locks as $type => $group) {
            $records = self::records($type, $group->pluck('lockable_id')->all());

            foreach ($group as $lock) {
                $record = $records->get((int) $lock->lockable_id);

                if (! $record) {
                    continue;
                }

                if ($record instanceof GalleryAlbum) {
                    $record->setPassword(null);
                    // ფაილები დაცული დისკიდან ჩვეულებრივზე ბრუნდება — ალბომი აღარ არის დამალული
                    AlbumVault::reveal($record);
                } else {
                    $lock->delete();
                }

                RecordLocks::lock($record);
                $removed++;
            }
        }

        return $removed;
    }

    /** ჩემი ლოკები ცნობილ ტიპებზე (`owner` scope — სხვისი id აქ ვერაფერს იპოვის) */
    private static function mine()
    {
        return RecordLock::query()->whereIn('lockable_type', array_keys(self::TYPES))->orderBy('id');
    }

    /**
     * ლოკის ჩანაწერები — დამალულიც (ლოკის scope იხსნება), ურნის გარეთ; ორენოვან
     * დომენზე სათაურისთვის თარგმანებით.
     *
     * @param  list<int>  $ids
     * @return Collection<int, Model> id → ჩანაწერი
     */
    private static function records(string $type, array $ids): Collection
    {
        $model = self::TYPES[$type]['model'];
        $query = $model::query()->withoutGlobalScope('record_lock')->whereIn((new $model)->getKeyName(), $ids);

        if (method_exists($model, 'translations')) {
            $query->with('translations');
        }

        return $query->get()->keyBy(fn (Model $record) => (int) $record->getKey());
    }
}
