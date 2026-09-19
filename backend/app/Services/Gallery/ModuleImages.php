<?php

namespace App\Services\Gallery;

use App\Models\Anime;
use App\Models\BoardGame;
use App\Models\BoardGameFile;
use App\Models\Book;
use App\Models\BookFile;
use App\Models\Bookmark;
use App\Models\Course;
use App\Models\CourseFile;
use App\Models\Game;
use App\Models\GameFile;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\NoteEntryFile;
use App\Models\Place;
use App\Models\PlaceFile;
use App\Models\Series;
use App\Models\Song;
use App\Models\SongFile;
use App\Models\User;
use App\Models\Video;
use App\Models\VideoFile;
use App\Support\StorageFolder;
use Illuminate\Database\Eloquent\Model;

/**
 * **სხვა მოდულების ფოტოები გალერეაში (Tasks §8.3).**
 *
 * მოთხოვნა სიტყვასიტყვით: „სხვა რამეებზეც, სადაც ნებისმიერი ფოტო დაემატება
 * … ყველაფერი გალერეაში დაყავი ჯგუფებად, გვერდებად, სექციებად".
 *
 * ⚠️ **ეს `gallery_images` არ არის და არც უნდა გახდეს.** გალერეის ცხრილი
 * **ჩამოწერილ/იმპორტირებულ** ფოტოებს ინახავს; მოდულის ყდა, თამბნეილი და
 * `<module>_files`-ის სურათი **ჩანაწერის ნაწილია** — მისი წაშლა ჩანაწერის
 * რედაქტირებაა და არა გალერეის მოქმედება. ამიტომ ეს ჭრილი **მხოლოდ
 * კითხვადია**: აჩვენებს და ჩანაწერზე გადაგიყვანს.
 *
 * ⚠️ **ერთი რუკა, ორი სახის წყარო.** `RECORD_SOURCES` — თვითონ ჩანაწერის
 * ყდა/თამბნეილი; `FILE_SOURCES` — `<module>_files` სექციური ცხრილები
 * `kind = 'image'`-ით. ახალი მოდული = ერთი რიგი; გამორჩენას
 * `RegistryConsistencyTest` იჭერს, თორემ მოდული ჩუმად გაქრებოდა ამ ჭრილიდან.
 *
 * ⚠️ **`note` პრივატულ დისკზეა** (`StorageFolder::isPrivate()`), ე.ი. მისი
 * ფაილი `/storage/*`-ით **არ იხსნება**. რიგი ამიტომ `private`-ს ცხადად
 * აბრუნებს და `url`-ად მფლობელობაშემოწმებულ API-ის მისამართს (`/note-files/{id}`)
 * წერს — ფრონტს პრივატულობის საკუთარი სია არ უნდა ჰქონდეს (არსებული წესი).
 *
 * ⚠️ **TMDB-ის პოსტერი აქ განზრახ არ ჩანს ცალკე ფოტოდ** — ის ჩანაწერის
 * ბარათზე ისედაც ყოველთვის თვალწინაა და ჯგუფის დასტის პირველი კარტიც ისაა.
 * აქ „ფოტოებია", და ერთი და იმავე სურათის ორჯერ ჩვენება ჯგუფის რიცხვს
 * გააორმაგებდა.
 */
class ModuleImages
{
    /**
     * ერთ მოდულზე მაქსიმუმ რამდენი რიგი წაიკითხება.
     *
     * ⚠️ ჭრილი მეხსიერებაში ლაგდება (სხვადასხვა ცხრილია, ერთი SQL ვერ
     * დაალაგებს), ე.ი. ჭერი აუცილებელია. ჭრა **ცხადად ბრუნდება**
     * (`truncated`) — ჩუმად მოჭრილი სია „სულ ეს არის"-ად იკითხებოდა.
     */
    public const MAX_ROWS = 2000;

    /**
     * ჩანაწერის საკუთარი ყდა/თამბნეილი.
     *
     * @var array<string, array{0: class-string<Model>, 1: string}>
     */
    public const RECORD_SOURCES = [
        'movie' => [Movie::class, 'poster_path'],
        'series' => [Series::class, 'poster_path'],
        'anime' => [Anime::class, 'poster_path'],
        'video' => [Video::class, 'thumbnail_path'],
        'song' => [Song::class, 'thumbnail_path'],
        'book' => [Book::class, 'cover_path'],
        'board_game' => [BoardGame::class, 'image_path'],
        'game' => [Game::class, 'cover_path'],
        'bookmark' => [Bookmark::class, 'thumbnail_path'],
        'course' => [Course::class, 'thumbnail_path'],
        'place' => [Place::class, 'photo_path'],
    ];

    /**
     * სექციური ცხრილები — მომხმარებლის **ატვირთული** სურათები.
     *
     * @var array<string, array{0: class-string<Model>, 1: string, 2: class-string<Model>, 3: ?string}>
     *                                                                                                  [ფაილის მოდელი, მშობლის FK, მშობლის მოდელი, პრივატული API-ის პრეფიქსი]
     */
    public const FILE_SOURCES = [
        'video' => [VideoFile::class, 'video_id', Video::class, null],
        'song' => [SongFile::class, 'song_id', Song::class, null],
        'book' => [BookFile::class, 'book_id', Book::class, null],
        'board_game' => [BoardGameFile::class, 'board_game_id', BoardGame::class, null],
        'game' => [GameFile::class, 'game_id', Game::class, null],
        'course' => [CourseFile::class, 'course_id', Course::class, null],
        'place' => [PlaceFile::class, 'place_id', Place::class, null],
        // ⚠️ ჩანაწერების ფაილი პრივატულ დისკზეა და მხოლოდ ამ მარშრუტით გამოდის
        'note' => [NoteEntryFile::class, 'note_entry_id', NoteEntry::class, '/note-files/'],
    ];

    /** ყველა მოდული, რომელსაც ამ ჭრილში ფოტო აქვს (რეესტრის შემოწმებისთვის) */
    public static function modules(): array
    {
        return array_values(array_unique(array_merge(
            array_keys(self::RECORD_SOURCES),
            array_keys(self::FILE_SOURCES),
        )));
    }

    /**
     * ჯგუფები — თითო მოდული ერთი ბარათი (რაოდენობა, მოცულობა, ესკიზები).
     *
     * @return list<array<string, mixed>>
     */
    public function groups(User $user, int $previews = 5): array
    {
        $out = [];

        foreach (self::modules() as $module) {
            if (! $user->hasModule($module)) {
                continue;
            }

            $rows = $this->rows($user, $module);

            if (! $rows) {
                continue;
            }

            $out[] = [
                'kind' => 'module',
                'module' => $module,
                'id' => 0,
                'photos' => count($rows),
                'bytes' => array_sum(array_column($rows, 'size')),
                'previews' => array_slice(array_column($rows, 'url'), 0, $previews),
                /* ⚠️ **„ყველა პრივატულია" და არა „პირველი პრივატულია".** ეს
                   დროშა ბადეს `privateDisk`-ად გადაეცემა, ე.ი. მთელ ჯგუფზე
                   მოქმედებს; პირველი რიგის კითხვა რიგის თანმიმდევრობაზე
                   დამოკიდებულს ხდიდა (რიგები თარიღით ლაგდება, არა დისკით). */
                'private' => ! in_array(false, array_column($rows, 'private'), true),
            ];
        }

        return $out;
    }

    /**
     * ერთი მოდულის ფოტოები, გვერდებით.
     *
     * @return array{items: list<array<string, mixed>>, total: int, truncated: bool}
     */
    public function photos(User $user, string $module, int $page, int $perPage): array
    {
        if (! $user->hasModule($module)) {
            return ['items' => [], 'total' => 0, 'truncated' => false];
        }

        $rows = $this->rows($user, $module);
        $total = count($rows);

        return [
            'items' => array_slice($rows, max(0, ($page - 1) * $perPage), $perPage),
            'total' => $total,
            'truncated' => $total >= self::MAX_ROWS,
        ];
    }

    /**
     * ერთი მოდულის ყველა სურათი — ყდაც და ატვირთულებიც, ახლიდან ძველისკენ.
     *
     * @return list<array<string, mixed>>
     */
    private function rows(User $user, string $module): array
    {
        $rows = [];

        if ($source = self::RECORD_SOURCES[$module] ?? null) {
            [$model, $column] = $source;

            $records = $model::query()
                ->withoutGlobalScope('owner')
                ->where('user_id', $user->getKey())
                ->whereNotNull($column)
                ->where($column, '!=', '')
                ->orderByDesc('id')
                ->limit(self::MAX_ROWS)
                ->get();

            foreach ($records as $record) {
                $rows[] = $this->row(
                    module: $module,
                    ownerType: $module,
                    ownerId: (int) $record->getKey(),
                    title: $this->titleOf($record),
                    path: (string) $record->{$column},
                    kind: 'cover',
                    size: null,
                    createdAt: $record->created_at?->toIso8601String(),
                    id: 'cover:'.$module.':'.$record->getKey(),
                );
            }
        }

        if ($source = self::FILE_SOURCES[$module] ?? null) {
            [$fileModel, $foreignKey, $parentModel, $privateRoute] = $source;

            $files = $fileModel::query()
                ->withoutGlobalScope('owner')
                ->where('user_id', $user->getKey())
                ->where('kind', 'image')
                ->orderByDesc('id')
                ->limit(self::MAX_ROWS)
                ->get();

            $parents = $parentModel::query()
                ->withoutGlobalScope('owner')
                ->whereIn('id', $files->pluck($foreignKey)->unique()->all())
                ->get()
                ->keyBy('id');

            foreach ($files as $file) {
                $parent = $parents->get($file->{$foreignKey});

                $rows[] = $this->row(
                    module: $module,
                    ownerType: $module,
                    ownerId: (int) $file->{$foreignKey},
                    title: $parent ? $this->titleOf($parent) : null,
                    path: (string) $file->path,
                    kind: 'file',
                    size: (int) $file->size,
                    createdAt: $file->created_at?->toIso8601String(),
                    id: 'file:'.$module.':'.$file->getKey(),
                    // პრივატული ფაილი მხოლოდ თავისი მარშრუტით გამოდის
                    privateUrl: $privateRoute ? $privateRoute.$file->getKey() : null,
                    name: $file->original_name,
                );
            }
        }

        // ⚠️ სორტირება მეხსიერებაში — ორი სხვადასხვა ცხრილია და ერთი SQL
        // მათ ვერ დაალაგებდა; სია ისედაც ჭერითაა შემოსაზღვრული
        usort($rows, fn ($a, $b) => strcmp((string) $b['created_at'], (string) $a['created_at']));

        return array_slice($rows, 0, self::MAX_ROWS);
    }

    /** @return array<string, mixed> */
    private function row(
        string $module,
        string $ownerType,
        int $ownerId,
        ?string $title,
        string $path,
        string $kind,
        ?int $size,
        ?string $createdAt,
        string $id,
        ?string $privateUrl = null,
        ?string $name = null,
    ): array {
        $private = StorageFolder::isPrivate($path);

        return [
            // ⚠️ id **სტრიქონია** — ორი სხვადასხვა ცხრილის რიგები ერთ სიაშია
            // და რიცხვითი id-ები ერთმანეთს დაეჯახებოდა
            'id' => $id,
            'module' => $module,
            'owner' => ['kind' => $ownerType, 'id' => $ownerId, 'title' => $title],
            'url' => $private && $privateUrl ? $privateUrl : $path,
            'private' => $private,
            'kind' => $kind,
            'size' => $size,
            'original_name' => $name,
            'created_at' => $createdAt,
        ];
    }

    /** სათაური ნებისმიერი მოდელიდან — ორენოვანიც და ერთენოვანიც */
    private function titleOf(Model $record): ?string
    {
        foreach (['title_ka', 'title_en', 'title', 'name'] as $attribute) {
            $value = $record->{$attribute} ?? null;

            if (is_string($value) && trim($value) !== '') {
                return $value;
            }
        }

        return null;
    }
}
