<?php

namespace App\Support;

use App\Models\BoardGame;
use App\Models\Book;
use App\Models\Bookmark;
use App\Models\Course;
use App\Models\CustomRecord;
use App\Models\NoteEntry;
use App\Models\Place;
use App\Models\Status;
use App\Models\Video;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * **კლასიფიკატორის რიგი ურნაში** — სტატუსი, ჟანრი, ტიპი, კატეგორია.
 *
 * შენი გადაწყვეტილება: კლასიფიკატორის რიგიც ურნაში მიდის, და
 * ⚠️ **მისი აღდგენა გადატანილ ჩანაწერებს თავისით უკან ვერ აბრუნებს** — ეს
 * მიღებულია: `move_to`/`clear_records` ჩანაწერებს წაშლისთანავე ცვლის.
 * არჩევითი გაუმჯობესება აქაა: რიგი იმახსოვრებს, რომელი ჩანაწერები
 * გადავიდა (`trash_meta`), და აღდგენა **შემოგთავაზებს** მათ დაბრუნებას —
 * მხოლოდ მათ, ვინც მას შემდეგ არ შეცვლილა (ისევ იქ დევს, სადაც წაშლამ
 * დატოვა). „მხოლოდ რიგი" ჩვეულებრივი აღდგენაა.
 *
 * ⚠️ **ჟანრის pivot ცხადად იხსნება** — რიგი აღარ იშლება, ე.ი. FK-ის
 * კასკადი, რომელიც `song_genre_song`/`game_genre_game`-ს წმენდდა, აღარ
 * ეშვება. სხვაგვარად ჩანაწერი ურნაში მყოფ ჟანრზე დარჩებოდა მიბმული.
 * ⚠️ **მაგრამ მხოლოდ ცოცხალი ჩანაწერისა**: ურნაში მყოფი
 * (და „ჩანაწერებიც წაიშალოს"-ით ახლა გადატანილი) ბმულს ინარჩუნებს —
 * ორივე ერთად ბრუნდება, ხოლო ჟანრის საბოლოო წაშლისას FK-ის კასკადი მას
 * თვითონ მოაშორებს. დამალულ ჟანრს relation ისედაც ვერ ხედავს (`trash` scope).
 *
 * ⚠️ **ჩანაწერები მოდელით ბრუნდება** (`DictionaryRecords::move()`), და
 * სტატუსზე `applyStatus()`-ით — `watched_at`-ს მხოლოდ ის
 * წერს და აუდიტიც მხოლოდ მოდელის გზაზე ჩანს.
 */
final class DictionaryTrash
{
    /**
     * სახე → ჩანაწერის მოდელი და სვეტი, ან ჟანრის pivot-ის ურთიერთობა.
     *
     * @var array<string, array{records?: class-string<Model>, column?: string, pivot?: string, status?: true}>
     */
    public const MAP = [
        'status' => ['status' => true],
        'video_type' => ['records' => Video::class, 'column' => 'type_id'],
        'song_genre' => ['pivot' => 'songs'],
        'book_genre' => ['records' => Book::class, 'column' => 'genre_id'],
        'board_game_genre' => ['records' => BoardGame::class, 'column' => 'genre_id'],
        'game_genre' => ['pivot' => 'games'],
        'note_category' => ['records' => NoteEntry::class, 'column' => 'category_id'],
        'bookmark_category' => ['records' => Bookmark::class, 'column' => 'category_id'],
        'course_category' => ['records' => Course::class, 'column' => 'category_id'],
        'place_category' => ['records' => Place::class, 'column' => 'category_id'],
        // პირადი მოდულის კლასიფიკატორი (ერთი სვეტი, ბუკმარკის ფორმა)
        'custom_category' => ['records' => CustomRecord::class, 'column' => 'category_id'],
    ];

    public static function has(string $kind): bool
    {
        return isset(self::MAP[$kind]);
    }

    /**
     * რიგის ურნაში გადატანა.
     *
     * @param  list<int>  $ids  ჩანაწერები, რომლებიც `move_to`/`clear_records`-მა ახლა გადაიტანა
     * @param  int|null  $to  სად წავიდნენ (`null` — ცარიელზე)
     * @param  list<int>  $lessonIds  კურსის ვიდეოები, რომლებიც თავის სამიზნეზე გადავიდა
     * @param  int|null  $lessonsTo  სად წავიდნენ ისინი
     */
    public static function trash(Model $row, string $kind, array $ids = [], ?int $to = null, array $lessonIds = [], ?int $lessonsTo = null, array $dates = []): void
    {
        $map = self::MAP[$kind];

        /* ⚠️ კურსის ვიდეოებს საკუთარი ჯგუფი აქვს: „ჩანაწერებიანად" წაშლისას და
           ცარიელად დატოვებისას ისინი სხვა ადგილას მიდიან, ვიდრე სიაში მყოფი —
           აღდგენამ თითო ჯგუფი იქ უნდა ეძებოს, სადაც წაშლამ დატოვა. */
        $meta = $ids ? ['ids' => array_values(array_map('intval', $ids)), 'to' => $to] : [];

        if ($lessonIds) {
            $meta['lessons'] = ['ids' => array_values(array_map('intval', $lessonIds)), 'to' => $lessonsTo];
        }

        // „დასრულებული" სტატუსის ჩანაწერების დასრულების თარიღები (id → თარიღი)
        if ($ids && $dates) {
            $meta['dates'] = $dates;
        }

        $row->trash_meta = $meta ?: null;

        if (isset($map['pivot'])) {
            // `trash` scope-ით relation მხოლოდ ცოცხალ ჩანაწერებს აბრუნებს
            $relation = $row->{$map['pivot']}();
            $live = $relation->pluck($relation->getRelated()->getQualifiedKeyName())->all();

            if ($live) {
                $relation->detach($live);
            }
        }

        // ⚠️ ნაგულისხმევი ურნაში აღარ არის ნაგულისხმევი — `StatusController` შემდეგს აწინაურებს
        if ($row instanceof Status) {
            $row->is_default = false;
        }

        $row->moveToTrash();
    }

    /**
     * **დასრულების თარიღები** (id → სვეტის ნედლი მნიშვნელობა) — „დასრულებული"
     * სტატუსის წაშლამდე. გადატანა სვეტს წმენდს, აღდგენამ კი ზუსტად ის უნდა
     * დააბრუნოს: `applyStatus()` ცარიელ სვეტს `now()`-ით ავსებდა და ყველა
     * ჩანაწერს დღევანდელი თარიღი ეწერებოდა (სტატისტიკა, მიზანი, ახალი ნახვები).
     *
     * @return array<string, string>
     */
    public static function doneDates(Builder $records): array
    {
        $column = $records->getModel()->doneColumn();

        if (! $column) {
            return [];
        }

        return $records->toBase()
            ->whereNotNull($column)
            ->pluck($column, 'id')
            ->mapWithKeys(fn ($date, $id) => [(string) $id => (string) $date])
            ->all();
    }

    /**
     * ჩანაწერი აღდგენილ სტატუსზე — **დამახსოვრებული** დასრულების თარიღით.
     *
     * ⚠️ თარიღის გარეშე (ჩანაწერს ის არ ჰქონდა) სვეტი ცარიელი რჩება და არა `now()`.
     * ⚠️ მედიაზე ნახვის რიგი, რომელიც წაშლისას ურნაში წავიდა (`HasWatchLog`),
     * იმავე თარიღით ბრუნდება — `saved` კაკვი მას პოულობს და ახალს არ წერს.
     */
    private static function restoreStatus(Model $record, Status $status, ?string $date): void
    {
        $record->applyStatus($status);
        $column = $record->doneColumn();

        if (! $column || $status->role !== 'done') {
            return;
        }

        if ($date && method_exists($record, 'watches')) {
            $record->watches()->withoutGlobalScopes(['owner', 'trash'])
                ->where('user_id', $record->user_id)
                ->whereNotNull('trashed_at')
                ->where('watched_at', $date)
                ->get()
                ->each->restoreFromTrash();
        }

        $record->{$column} = $date;
    }

    /** რამდენ ჩანაწერს დააბრუნებს აღდგენა — სიისთვის */
    public static function remembered(Model $row): int
    {
        return count($row->trash_meta['ids'] ?? []) + count($row->trash_meta['lessons']['ids'] ?? []);
    }

    /**
     * **ჩანაწერების დაბრუნება** — მხოლოდ მათი, ვინც ისევ იქ დევს, სადაც
     * წაშლამ დატოვა.
     *
     * ⚠️ **ურნაში მყოფი ჩანაწერიც ბრუნდება** (`trash` scope-ის გარეშე) — მისი
     * ჟანრი/სტატუსი ხომ მომხმარებელს არ შეუცვლია.
     *
     * @return int რამდენი დაბრუნდა
     */
    public static function restoreRecords(Model $row, string $kind): int
    {
        $ids = array_map('intval', $row->trash_meta['ids'] ?? []);
        $to = $row->trash_meta['to'] ?? null;
        $map = self::MAP[$kind];
        $moved = 0;

        if ($ids && isset($map['pivot'])) {
            $relation = $row->{$map['pivot']}();
            $related = $relation->getRelated();
            $valid = $related::withoutGlobalScopes(['owner', 'trash'])
                ->where('user_id', $row->user_id)
                ->whereIn('id', $ids)
                ->pluck('id')
                ->all();

            $relation->syncWithoutDetaching($valid);
            $moved = count($valid);
        } elseif (! isset($map['pivot'])) {
            // ორი ჯგუფი: სიაში მყოფი ჩანაწერები და კურსის ვიდეოები — თითო იქ იძებნება, სადაც წაშლამ დატოვა
            $groups = [
                [$ids, $to],
                [array_map('intval', $row->trash_meta['lessons']['ids'] ?? []), $row->trash_meta['lessons']['to'] ?? null],
            ];

            foreach ($groups as [$groupIds, $groupTo]) {
                if (! $groupIds) {
                    continue;
                }

                $model = isset($map['status']) ? StatusDomain::model((string) $row->module) : $map['records'];
                $column = isset($map['status']) ? 'status_id' : $map['column'];

                $records = $model::withoutGlobalScopes(['owner', 'trash'])
                    ->where('user_id', $row->user_id)
                    ->whereIn('id', $groupIds)
                    ->when($groupTo, fn ($q) => $q->where($column, $groupTo), fn ($q) => $q->whereNull($column));

                $dates = (array) ($row->trash_meta['dates'] ?? []);

                $moved += isset($map['status'])
                    ? DictionaryRecords::move($records, fn ($record) => self::restoreStatus($record, $row, $dates[(string) $record->getKey()] ?? null))
                    : DictionaryRecords::move($records, fn ($record) => $record->{$column} = $row->getKey());
            }
        }

        self::forget($row);

        return $moved;
    }

    /** დამახსოვრებული ჩანაწერები აღარ სჭირდება — რიგი ურნაში აღარ არის */
    public static function forget(Model $row): void
    {
        if ($row->trash_meta !== null) {
            $row->trash_meta = null;
            $row->saveQuietly();
        }
    }
}
