<?php

namespace App\Support;

use App\Models\BoardGame;
use App\Models\Book;
use App\Models\Bookmark;
use App\Models\Course;
use App\Models\NoteEntry;
use App\Models\Place;
use App\Models\Status;
use App\Models\Video;
use Illuminate\Database\Eloquent\Model;

/**
 * **კლასიფიკატორის რიგი ურნაში (Tasks §29, ეტაპი 3)** — სტატუსი, ჟანრი, ტიპი, კატეგორია.
 *
 * შენი გადაწყვეტილება (Q21 — „დ"): კლასიფიკატორის რიგიც ურნაში მიდის, და
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
 * ⚠️ **მაგრამ მხოლოდ ცოცხალი ჩანაწერისა** (Tasks §29.8): ურნაში მყოფი
 * (და „ჩანაწერებიც წაიშალოს"-ით ახლა გადატანილი) ბმულს ინარჩუნებს —
 * ორივე ერთად ბრუნდება, ხოლო ჟანრის საბოლოო წაშლისას FK-ის კასკადი მას
 * თვითონ მოაშორებს. დამალულ ჟანრს relation ისედაც ვერ ხედავს (`trash` scope).
 *
 * ⚠️ **ჩანაწერები მოდელით ბრუნდება** (`DictionaryRecords::move()`), და
 * სტატუსზე `applyStatus()`-ით — BUG-05-ის წესი: `watched_at`-ს მხოლოდ ის
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
     */
    public static function trash(Model $row, string $kind, array $ids = [], ?int $to = null): void
    {
        $map = self::MAP[$kind];

        $row->trash_meta = $ids ? ['ids' => array_values(array_map('intval', $ids)), 'to' => $to] : null;

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

    /** რამდენ ჩანაწერს დააბრუნებს აღდგენა — სიისთვის */
    public static function remembered(Model $row): int
    {
        return count($row->trash_meta['ids'] ?? []);
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
        } elseif ($ids) {
            $model = isset($map['status']) ? StatusDomain::model((string) $row->module) : $map['records'];
            $column = isset($map['status']) ? 'status_id' : $map['column'];

            $records = $model::withoutGlobalScopes(['owner', 'trash'])
                ->where('user_id', $row->user_id)
                ->whereIn('id', $ids)
                ->when($to, fn ($q) => $q->where($column, $to), fn ($q) => $q->whereNull($column));

            $moved = isset($map['status'])
                ? DictionaryRecords::move($records, fn ($record) => $record->applyStatus($row))
                : DictionaryRecords::move($records, fn ($record) => $record->{$column} = $row->getKey());
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
