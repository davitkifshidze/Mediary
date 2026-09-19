<?php

namespace App\Services\Purge;

use App\Models\Anime;
use App\Models\BoardGame;
use App\Models\BoardGameFile;
use App\Models\BoardGameNote;
use App\Models\Book;
use App\Models\BookFile;
use App\Models\Bookmark;
use App\Models\BookNote;
use App\Models\GalleryImage;
use App\Models\Game;
use App\Models\GameFile;
use App\Models\GameNote;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\NoteEntryFile;
use App\Models\Series;
use App\Models\Song;
use App\Models\SongFile;
use App\Models\SongNote;
use App\Models\Status;
use App\Models\User;
use App\Models\Video;
use App\Models\VideoFile;
use App\Models\VideoNote;
use App\Services\Storage\StorageMeter;
use App\Support\CustomFields;
use App\Support\MediaDomain;
use App\Support\StatusDomain;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * მასობრივი წაშლა (Tasks 20).
 *
 * ⚠️ **ეს ყველაზე დესტრუქციული კოდია პროექტში.** სამი წესი:
 *  1. სკოუპი **ცხადად** იწერება — `mode` + პარამეტრები; „ყველა" ცალკე რეჟიმია,
 *     ე.ი. ცარიელი ფილტრი შემთხვევით მთელ ბიბლიოთეკას ვერ წაშლის;
 *  2. `plan()` და `run()` **ერთსა და იმავე** query-ს იყენებს, ე.ი. დათვლილი
 *     და წაშლილი ერთი და იგივეა;
 *  3. წაშლა მოდელებით მიდის (და არა `delete()`-ით query-ზე), რომ
 *     `deleting` ივენთები იმუშაოს: ფაილები, კვოტა, polymorphic pivot-ები.
 *
 * `target = 'gallery'` მხოლოდ ფოტოებს შლის — ჩანაწერი რჩება („ადგილი
 * გამომინთავისუფლე, ჩანაწერები დამიტოვე").
 *
 * ნაკადი ორნაბიჯიანია და **per-item** (20.2, `/sync`-ის ანალოგიით): `plan()`
 * აბრუნებს რიგსაც (`items`), ფრონტი კი თითოეულს ცალკე რექვესთით შლის
 * (`runOne()`) — ასე პროგრესი ჩანს და გაჩერებაც შეიძლება. `run()` იმავე
 * პრიმიტივებზე დგას და სკრიპტული/ერთრექვესთიანი გაშვებისთვის რჩება.
 */
class PurgeService
{
    public const TARGETS = ['movie', 'series', 'anime', 'video', 'song', 'book', 'board_game', 'game', 'note', 'bookmark', 'gallery'];

    public const MODES = ['all', 'ids', 'genre', 'status', 'type', 'tag'];

    /**
     * რომელი სკოუპი რომელ სამიზნეს შეესაბამება — **ერთი წყარო** კონტროლერის
     * ვალიდაციისთვისაც და ფრონტის რადიო-ღილაკებისთვისაც.
     *
     * ⚠️ **`ids` თერთმეტივე სამიზნეს აქვს** (§25.1, 2026-09-15). აქამდე ის
     * მხოლოდ მედია-დომენებსა და გალერეას ეწერა, თუმცა თვითონ რეჟიმი
     * დომენისგან **დამოუკიდებელია** — `recordIds()`-ის `whereIn('id', …)`
     * და `modelQuery()` თერთმეტივეს ერთნაირად ემსახურება. ე.ი. აკლდა
     * ნებართვა და არა ლოგიკა, და შედეგი ის იყო, რომ ბუკმარკიდან ერთი
     * კონკრეტული ჩანაწერის წაშლა `/purge`-ით **საერთოდ შეუძლებელი იყო**:
     * მთელი კატეგორია უნდა წაგეშალა, ან არაფერი.
     *
     * `genre` = გლობალური polymorphic `genres` (მხოლოდ მედია-დომენებს აქვს),
     * `type` = **per-user ლექსიკონი** (`videos.type_id` ან `genre_id` სიმღერაზე /
     * წიგნზე / ბორდგეიმზე), `tag` = JSON მასივი (ბორდგეიმს ტეგები არ აქვს —
     * მას მექანიკები აქვს, რაც სხვა ღერძია).
     *
     * @var array<string, list<string>>
     */
    public const TARGET_MODES = [
        'movie' => ['ids', 'genre', 'status', 'all'],
        'series' => ['ids', 'genre', 'status', 'all'],
        // §7.1 — ანიმეს ფილმის/სერიალის იგივე ღერძები აქვს
        'anime' => ['ids', 'genre', 'status', 'all'],
        // §6.4 — ვიდეოს სტატუსი ახლა აქვს, ე.ი. სკოუპიც
        'video' => ['ids', 'type', 'tag', 'status', 'all'],
        'song' => ['ids', 'type', 'tag', 'all'],
        'book' => ['ids', 'type', 'tag', 'status', 'all'],
        'board_game' => ['ids', 'type', 'status', 'all'],
        // ⚠️ თამაშს ტეგები არ აქვს (ჟანრები და პლატფორმები ფარავს)
        'game' => ['ids', 'type', 'status', 'all'],
        // §13 — „ტიპი" აქ **კატეგორიაა** (`note_entries.category_id`)
        'note' => ['ids', 'type', 'tag', 'status', 'all'],
        // §18 — ბუკმარკზეც კატეგორიაა (`bookmarks.category_id`)
        'bookmark' => ['ids', 'type', 'tag', 'status', 'all'],
        'gallery' => ['ids', 'genre', 'status', 'all'],
    ];

    /**
     * სტატუსების **ნაგულისხმევი** ლექსიკონი დომენზე — ⚠️ ისინი **არ ემთხვევა**
     * ერთმანეთს: ფილმს `watched` აქვს, წიგნს `read`, ბორდგეიმს კი `owned`.
     *
     * ⚠️ **ექვს დომენზე ეს მხოლოდ საწყისი ნაკრებია** (§6.4): სტატუსი per-user
     * ლექსიკონია, ე.ი. ნამდვილი სია ანგარიშზეა დამოკიდებული — იხ.
     * `statusesFor()`. ეს კონსტანტა რჩება, რადგან ის იმავე ნაგულისხმევებს
     * აღწერს, რასაც `StatusDomain` (ტესტი ადარებს ორივეს) და ფრონტს
     * მოთხოვნამდე რაღაც უნდა დახატოს.
     *
     * @var array<string, list<string>>
     */
    public const TARGET_STATUSES = [
        'movie' => ['undecided', 'to_watch', 'watching', 'watched'],
        'series' => ['undecided', 'to_watch', 'watching', 'watched'],
        'anime' => ['undecided', 'to_watch', 'watching', 'watched'],
        'video' => ['undecided', 'to_watch', 'watching', 'watched'],
        'book' => Book::STATUSES,
        'board_game' => BoardGame::STATUSES,
        'game' => Game::STATUSES,
        'note' => ['open', 'done', 'archived'],
        'bookmark' => ['to_read', 'read', 'archived'],
    ];

    /**
     * **ამ ანგარიშის** სტატუსები ამ სამიზნეზე.
     *
     * ⚠️ `/purge` სხვისი ბიბლიოთეკიდან შლის, ე.ი. სია **მისი** ლექსიკონიდან
     * უნდა მოვიდეს და არა ჩემიდან — თორემ გადარქმეული სტატუსი „არასწორად"
     * ჩაითვლებოდა და 422 დაბრუნდებოდა.
     *
     * @return list<string>
     */
    public static function statusesFor(string $target, ?int $userId = null): array
    {
        if (StatusDomain::usesDictionary($target) && $userId) {
            return Status::keysFor($userId, $target);
        }

        return self::TARGET_STATUSES[$target] ?? [];
    }

    /**
     * ჭრის თუ არა ეს სამიზნე ტეგებით — **ერთადერთი წყარო `TARGET_MODES`-ია**.
     *
     * ⚠️ აქამდე პასუხი ორ ადგილას ეწერა (BUG-16): `TARGET_MODES`-ში ხუთ
     * დომენს `tag` ჰქონდა, `recordIds()`-ის ფილტრში კი ხელით ჩაწერილი
     * ოთხი იჯდა — ე.ი. ბუკმარკზე ვალიდაცია გადიოდა, ფილტრი კი არ
     * მოქმედებდა და `plan()`/`run()` **ანგარიშის ყველა ბუკმარკს** ითვლიდა
     * და შლიდა. `plan`-იც და `run`-იც ერთ query-ს იზიარებენ, ამიტომ
     * გეგმაც „სწორ" (მთლიან) რიცხვს აჩვენებდა.
     */
    public static function supportsTag(string $target): bool
    {
        return in_array('tag', self::TARGET_MODES[$target] ?? [], true);
    }

    /**
     * სექციის ცხრილები — `[ფაილის მოდელი, ჩანიშვნის მოდელი, უცხო გასაღები]`.
     * უნივერსალური `attachments`/`notes` აღარ არსებობს (2026-09-03-ის წესი),
     * ე.ი. თითო მოდულს თავისი წყვილი აქვს; ვისაც არ უწერია — არც აქვს.
     *
     * ⚠️ ჩანიშვნის მოდელი **`null`-იც შეიძლება იყოს**: „ჩანაწერების" მოდულში
     * (§13) ჩანაწერი თვითონაა ერთეული, ე.ი. მასზე მიმაგრებული ჩანიშვნა
     * აზრობრივად არ არსებობს — მხოლოდ ფაილები.
     *
     * @var array<string, array{0: class-string, 1: class-string|null, 2: string}>
     */
    private const SECTION_TABLES = [
        'video' => [VideoFile::class, VideoNote::class, 'video_id'],
        'song' => [SongFile::class, SongNote::class, 'song_id'],
        'book' => [BookFile::class, BookNote::class, 'book_id'],
        'board_game' => [BoardGameFile::class, BoardGameNote::class, 'board_game_id'],
        'game' => [GameFile::class, GameNote::class, 'game_id'],
        'note' => [NoteEntryFile::class, null, 'note_entry_id'],
    ];

    /**
     * ჩანაწერის საკუთარი ატვირთვა — `[სვეტი, წყაროს სვეტი|null]`.
     * `null` = ფაილი ყოველთვის user-ისაა (თამბნეილს TMDB არ იძლევა);
     * სხვაგან მხოლოდ `upload` ითვლება კვოტაში (19.4/B).
     *
     * @var array<string, array{0: string, 1: string|null}>
     */
    private const UPLOAD_COLUMNS = [
        'movie' => ['poster_path', 'poster_source'],
        'series' => ['poster_path', 'poster_source'],
        'anime' => ['poster_path', 'poster_source'],
        'video' => ['thumbnail_path', null],
        'song' => ['thumbnail_path', null],
        'book' => ['cover_path', 'cover_source'],
        'board_game' => ['image_path', 'image_source'],
        'game' => ['cover_path', 'cover_source'],
        'bookmark' => ['thumbnail_path', null],
    ];

    /**
     * რომელ დომენს აქვს ჟანრი **pivot-ად** და არა სვეტად — მნიშვნელობა
     * ლექსიკონის ცხრილის id-სვეტია, რომელზეც `whereHas` უნდა გაფილტროს.
     *
     * ⚠️ ერთი რუკა და არა `if` თითო დომენზე: სიმღერა მრავალჟანრიანი 2026-09-06-ს
     * გახდა (`DECISIONS.md` §5) და მაშინ გაირკვა, რომ თამაშის სპეციალური შემთხვევა
     * უკვე ორია. მომავალი მრავალჟანრიანი მოდული = ერთი სტრიქონი აქ.
     *
     * @var array<string, string>
     */
    private const GENRE_PIVOTS = [
        'game' => 'game_genres.id',
        'song' => 'song_genres.id',
    ];

    /** ერთ ტრანზაქციაში/ციკლში რამდენი ჩანაწერი წაიშალოს */
    private const CHUNK = 200;

    /** გაზომილი ტემპი — მიახლოებითი დროის შესაფასებლად (`/sync`-ის ანალოგიით) */
    public const ITEMS_PER_MINUTE = 120.0;

    public function __construct(private StorageMeter $meter) {}

    /**
     * რა წაიშლება — ცხადი შეჯამება დადასტურებამდე (20.2).
     *
     * ⚠️ **`$ids` არჩევითია და `run()` მას ცხადად გადასცემს** (Tasks PERF-10).
     * ადრე `run()` ჯერ `plan()`-ს იძახებდა (რომელიც `recordIds()`-ს აკეთებს),
     * მერე `recordIds()`-ს **თავიდან** — ე.ი. კლასის ყველაზე ძვირი query
     * ორჯერ გადიოდა, და, რაც უფრო მნიშვნელოვანია, ორ გამოძახებას შორის
     * ჩაწერილი ჩანაწერი ორ **სხვადასხვა სეტს** დაბადებდა. სწორედ ამას
     * კრძალავს კლასის მთავარი წესი: „დათვლილი" და „წაშლილი" ერთი query-დან
     * უნდა მოდიოდეს.
     *
     * @param  list<int>|null  $ids  უკვე დათვლილი სკოუპი; `null` = თვითონ დათვალოს
     * @return array{records: int, photos: int, attachments: int, notes: int, bytes: int, target: string, mode: string, items: array<int, array{type: string, id: int, title: string, year: int|null}>}
     */
    public function plan(User $user, array $input, ?array $ids = null): array
    {
        $target = $input['target'];
        $ids ??= $this->recordIds($user, $input);
        $items = $this->planItems($user, $input, $ids);

        if ($target === 'gallery') {
            [$photos, $photoBytes] = $this->galleryTotals($user, $input['media_type'] ?? 'movie', $ids);

            return [
                'target' => $target,
                'mode' => $input['mode'],
                // ჩანაწერი არ იშლება — მხოლოდ ფოტოები
                'records' => 0,
                'photos' => $photos,
                // ⚠️ გალერეის სამიზნეზე „დატოვება" აზრს კარგავს — სწორედ
                // ფოტოებია წასაშლელი; ველი ფორმისთვის მაინც ბრუნდება.
                'kept_photos' => 0,
                'attachments' => 0,
                'notes' => 0,
                'bytes' => $photoBytes,
                'items' => $items,
            ];
        }

        $totals = $this->recordTotals($user, $target, $ids);
        $keepGallery = ! empty($input['keep_gallery']);

        return [
            'target' => $target,
            'mode' => $input['mode'],
            'records' => count($ids),
            // §25.5 — „ფოტოები დამიტოვე": ისინი უკატეგორიოში გადადის და არა იშლება
            'photos' => $keepGallery ? 0 : $totals['photos'],
            'kept_photos' => $keepGallery ? $totals['photos'] : 0,
            'attachments' => $totals['attachments'],
            'notes' => $totals['notes'],
            'bytes' => $keepGallery ? $totals['bytes'] - $totals['photo_bytes'] : $totals['bytes'],
            'items' => $items,
        ];
    }

    /**
     * **ამ ანგარიშის ჩანაწერები ამ სამიზნეზე** — `ids` სკოუპის ამრჩევი (§25.2).
     *
     * ⚠️ **რატომ ცალკე endpoint და არა მოდულის თავისი სია.** `/purge` **სხვისი**
     * ბიბლიოთეკიდან შლის (`user_id`), მოდულების `index()` კი ყოველთვის
     * მოვალეს — `BelongsToUser`-ის `owner` სკოუპი ჩემს რიგებს აბრუნებს. ე.ი.
     * ფრონტის ძველი ამრჩევი ადმინს **მის საკუთარ** ფილმებს უჩვენებდა და იმ
     * id-ებს სამიზნე ანგარიშზე აგზავნიდა: იქ ისინი ან საერთოდ არ არსებობდა
     * („გამოტოვებული"), ან — უარესი — სხვა ჩანაწერს ეკუთვნოდა. აქ სკოუპი
     * ცხადად იწერება, ე.ი. სია იმ ანგარიშისაა, რომელსაც ვასუფთავებთ.
     *
     * ⚠️ **გვერდებად არ იჭრება.** `ids` სკოუპი სწორედ იმას ნიშნავს, რომ
     * მომხმარებელი სიიდან ირჩევს — მე-2 გვერდზე დარჩენილი ჩანაწერი ჩუმად
     * ამოვარდებოდა (იგივე წესი, რაც `all=1`-ის ოთხ გამომძახებელს აქვს).
     *
     * @return array<int, array{id: int, title: string, year: int|null}>
     */
    public function records(User $user, string $target, ?string $mediaType = null): array
    {
        $type = $target === 'gallery' ? ($mediaType ?: 'movie') : $target;

        $query = $this->modelQuery($user, $type)->orderBy('id');

        // ორენოვანი ტექსტი translation-ცხრილშია მხოლოდ მედია-დომენებზე
        if (in_array($type, MediaDomain::TYPES, true)) {
            $query->with('translations');
        }

        return $query->get()
            ->map(fn ($record) => [
                'id' => (int) $record->id,
                'title' => $this->titleOf($record, $type),
                'year' => in_array($type, ['video', 'note', 'bookmark'], true) ? null : $record->year,
            ])
            ->all();
    }

    /**
     * ერთი ერთეულის წაშლა — რიგის ერთი ნაბიჯი (20.2).
     *
     * `target = 'gallery'`-ზე ერთეული ჩანაწერია, მაგრამ იშლება მხოლოდ მისი
     * (და მისივე მსახიობების) ფოტოები.
     *
     * ⚠️ id-ს **სკოუპში** ვეძებთ (`modelQuery`), ე.ი. სხვისი ჩანაწერის
     * id-ის გამოცნობით წაშლა შეუძლებელია — უცნობი id უბრალოდ ნულებს აბრუნებს.
     *
     * @return array{records: int, photos: int, bytes: int, target: string, title: string|null}
     */
    public function runOne(User $user, array $input, int $id): array
    {
        $target = $input['target'];

        if ($target === 'gallery') {
            $type = $input['media_type'] ?? 'movie';
            $record = $this->modelQuery($user, $type)->find($id);

            if (! $record) {
                return ['target' => $target, 'records' => 0, 'photos' => 0, 'bytes' => 0, 'title' => null];
            }

            $deleted = $this->deleteGallery($user, $type, [$id]);

            return [
                'target' => $target,
                'records' => 0,
                'photos' => $deleted['count'],
                'bytes' => $deleted['bytes'],
                'title' => $this->titleOf($record, $type),
            ];
        }

        $record = $this->modelQuery($user, $target)->find($id);

        if (! $record) {
            return ['target' => $target, 'records' => 0, 'photos' => 0, 'bytes' => 0, 'title' => null];
        }

        // ⚠️ ჯამები **წაშლამდე** — მერე რიგები აღარ არსებობს
        $totals = $this->recordTotals($user, $target, [$id]);
        $title = $this->titleOf($record, $target);

        $kept = $this->detachGallery($user, $target, [$id], ! empty($input['keep_gallery']));

        $record->delete();

        return [
            'target' => $target,
            'records' => 1,
            'photos' => $kept ? 0 : $totals['photos'],
            'kept_photos' => $kept ? $totals['photos'] : 0,
            'bytes' => $kept ? $totals['bytes'] - $totals['photo_bytes'] : $totals['bytes'],
            'title' => $title,
        ];
    }

    /**
     * წაშლა. აბრუნებს ფაქტობრივ რიცხვებს (და არა გეგმას) — თუ სხვა სესიამ
     * ჩანაწერი უკვე წაშალა, ეს რიცხვი უფრო მცირე იქნება.
     *
     * @return array{records: int, photos: int, bytes: int, target: string}
     */
    public function run(User $user, array $input): array
    {
        $target = $input['target'];
        // ⚠️ ერთი `recordIds()` ორივესთვის (Tasks PERF-10) — იხ. `plan()`-ის docblock
        $ids = $this->recordIds($user, $input);
        $plan = $this->plan($user, $input, $ids);

        Log::warning('purge started', [
            'user_id' => $user->getKey(),
            'target' => $target,
            'mode' => $input['mode'],
            'plan' => $plan,
        ]);

        if ($target === 'gallery') {
            $photos = $this->deleteGallery($user, $input['media_type'] ?? 'movie', $ids);

            return ['target' => $target, 'records' => 0, 'photos' => $photos['count'], 'bytes' => $photos['bytes']];
        }

        $deleted = 0;

        foreach (array_chunk($ids, self::CHUNK) as $chunk) {
            $this->detachGallery($user, $target, $chunk, ! empty($input['keep_gallery']));

            // ⚠️ მოდელით ვშლით, თორემ `deleting` ივენთი არ იმუშავებს:
            // ფაილები დისკზე დარჩება და კვოტის მრიცხველი აცდება
            foreach ($this->modelQuery($user, $target)->whereIn('id', $chunk)->get() as $record) {
                $record->delete();
                $deleted++;
            }
        }

        Log::warning('purge finished', ['user_id' => $user->getKey(), 'target' => $target, 'deleted' => $deleted]);

        return [
            'target' => $target,
            'records' => $deleted,
            'photos' => $plan['photos'],
            'bytes' => $plan['bytes'],
        ];
    }

    /**
     * ჩანაწერების თანმხლები ჯამები — ერთი წყარო `plan()`-ისთვისაც და
     * `runOne()`-ისთვისაც, რომ „დათვლილი" და „წაშლილი" ვერ დაშორდეს.
     *
     * @return array{photos: int, attachments: int, notes: int, bytes: int, photo_bytes: int}
     */
    private function recordTotals(User $user, string $target, array $ids): array
    {
        if (! $ids) {
            return ['photos' => 0, 'attachments' => 0, 'notes' => 0, 'bytes' => 0, 'photo_bytes' => 0];
        }

        $morph = $this->morphAlias($target);

        // გალერეის ფოტოები — ცხრილი სექციისაა, ე.ი. `collection`-ის ფილტრი აღარაა
        $photos = GalleryImage::withoutGlobalScope('owner')->withoutGlobalScope('album_lock')
            ->where('user_id', $user->getKey())
            ->where('imageable_type', $morph)
            ->whereIn('imageable_id', $ids)
            ->get(['id', 'size']);

        // მიმაგრებული ფაილები/ჩანიშვნები — მხოლოდ იმ სექციებს, ვისაც თავისი ცხრილი აქვს
        [$fileModel, $noteModel, $foreignKey] = self::SECTION_TABLES[$target] ?? [null, null, null];

        $files = $fileModel
            ? $fileModel::withoutGlobalScope('owner')
                ->where('user_id', $user->getKey())
                ->whereIn($foreignKey, $ids)
                ->get(['id', 'size'])
            : collect();

        return [
            'attachments' => $files->count(),
            'photos' => $photos->count(),
            /* ⚠️ ცალკე რიცხვი §25.5-ისთვის: „ფოტოები დამიტოვე" რეჟიმში
               მათი მოცულობა **არ თავისუფლდება**, ე.ი. `bytes`-იდან უნდა
               გამოაკლდეს — თორემ გეგმა ჰპირდებოდა ადგილს, რომელიც
               არსად გაჩნდებოდა. */
            'photo_bytes' => (int) $photos->sum('size'),
            // ვიდეოს თამბნეილი და ხელით ატვირთული პოსტერი/ყდაც კვოტაშია
            'bytes' => (int) $photos->sum('size') + (int) $files->sum('size')
                + $this->ownUploadBytes($user, $target, $ids)
                + $this->customFieldBytes($user, $target, $ids),
            'notes' => $noteModel
                ? $noteModel::withoutGlobalScope('owner')->whereIn($foreignKey, $ids)->count()
                : 0,
        ];
    }

    /**
     * რიგი ფრონტისთვის (20.2) — id + სახელი, რომ პროგრესში ჩანდეს,
     * რომელი ჩანაწერი მუშავდება ახლა.
     *
     * @return array<int, array{type: string, id: int, title: string, year: int|null}>
     */
    private function planItems(User $user, array $input, array $ids): array
    {
        if (! $ids) {
            return [];
        }

        $target = $input['target'];
        $type = $target === 'gallery' ? ($input['media_type'] ?? 'movie') : $target;

        // გალერეაზე ერთეული ისეთი ჩანაწერია, რომელსაც **მართლა აქვს** ფოტო —
        // თორემ 500-ჩანაწერიან სკოუპზე რიგი 497 ცარიელ რექვესთს გააკეთებდა
        if ($target === 'gallery') {
            $ids = $this->galleryOwnerIds($user, $type, $ids);
        }

        if (! $ids) {
            return [];
        }

        $query = $this->modelQuery($user, $type)->whereIn('id', $ids)->orderBy('id');

        // ორენოვანი ტექსტი translation-ცხრილშია მხოლოდ მედია-დომენებზე
        // (წიგნზე ბრტყელი სვეტებია, დანარჩენებზე — ერთი `title`)
        if (in_array($type, ['movie', 'series', 'anime'], true)) {
            $query->with('translations');
        }

        return $query->get()
            ->map(fn ($record) => [
                // ⚠️ `type` დომენია და არა `target` — გალერეაზეც ჩანაწერზე გადის
                'type' => $type,
                'id' => (int) $record->id,
                'title' => $this->titleOf($record, $type),
                // ვიდეოსა და ჩანაწერს `year` სვეტი საერთოდ არ აქვს
                'year' => in_array($type, ['video', 'note', 'bookmark'], true) ? null : $record->year,
            ])
            ->all();
    }

    /**
     * სკოუპიდან ის ჩანაწერები, რომლებზეც გალერეის ფოტო მართლა არსებობს —
     * პირდაპირ მიმაგრებული ან **მათივე მსახიობის** (იხ. Tasks 10).
     *
     * ⚠️ მსახიობის ფოტო გაზიარებულია: თუ ერთი მსახიობი ორ ფილმშია, ორივე
     * ჩანაწერი მოხვდება რიგში და მეორეზე ფოტო აღარ იქნება („გამოტოვებული").
     * ეს გალერეის მოდელის თვისებაა და არა ამ ციკლის.
     */
    private function galleryOwnerIds(User $user, string $type, array $ids): array
    {
        if (! $ids) {
            return [];
        }

        $photos = fn (string $morph) => GalleryImage::withoutGlobalScope('owner')->withoutGlobalScope('album_lock')
            ->where('user_id', $user->getKey())
            ->where('imageable_type', $morph);

        $direct = $photos($this->morphAlias($type))
            ->whereIn('imageable_id', $ids)
            ->distinct()
            ->pluck('imageable_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $castWithPhotos = $photos('cast_member')
            ->distinct()
            ->pluck('imageable_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $viaCast = $castWithPhotos
            ? $this->modelQuery($user, $type)
                ->whereIn('id', $ids)
                ->whereHas('cast', fn ($q) => $q->whereIn('cast_members.id', $castWithPhotos))
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->all()
            : [];

        return array_values(array_unique([...$direct, ...$viaCast]));
    }

    /**
     * სათაური ერთი სვეტიდან (ვიდეო · სიმღერა · ბორდგეიმი) ან ორენოვანი
     * აქსესორიდან (ფილმი · სერიალი · წიგნი).
     */
    private function titleOf($record, string $type): string
    {
        if (in_array($type, ['video', 'song', 'board_game', 'note', 'bookmark'], true)) {
            return $record->title ?: '#'.$record->id;
        }

        return $record->title_ka ?: ($record->title_en ?: '#'.$record->id);
    }

    /**
     * **„ფოტოები გალერეაში დამიტოვე" (§25.5).**
     *
     * შენი სიტყვები: „ფილმს თუ შლი, მასთან მიბმული გალერეაც უნდა
     * იშლებოდეს, ან გეკითხებოდეს — ხომ არ დავტოვო ისე, უბრალოდ გალერეაში".
     *
     * ⚠️ **ფოტოს მშობელი ეხსნება და ფოტო არსად მიდის** — ის „უკატეგორიო"
     * ხდება (§26), ე.ი. გალერეაშივე რჩება და ალბომებში დახარისხებაც
     * შეიძლება. ეს ერთადერთი გზაა: `Movie::booted()`-ის
     * `deleteGalleryMedia()` სწორედ `imageable`-ით პოულობს ფოტოებს, ე.ი.
     * სანამ მშობელი დგას, წაშლა გარდაუვალია.
     *
     * ⚠️ **მოცულობა არ თავისუფლდება** და `plan()` ამას ცხადად ამბობს:
     * ფაილი დისკზე რჩება და კვოტაშიც ისევ ითვლება — „ადგილი გამომინთავისუფლე"
     * და „ფოტოები დამიტოვე" ერთდროულად შეუძლებელია.
     *
     * ⚠️ **ვიდეო-ბმულებს ეს არ ეხება.** `gallery_videos`-ის მშობელი
     * სავალდებულოა და „უკატეგორიო ვიდეოს" ჭრილი არ არსებობს — ე.ი.
     * უმშობლო რიგი ბაზაში იდებოდა და არსად გამოჩნდებოდა.
     *
     * @return bool დარჩა თუ არა ფოტოები
     */
    private function detachGallery(User $user, string $target, array $ids, bool $keep): bool
    {
        if (! $keep || ! $ids || $target === 'gallery') {
            return false;
        }

        GalleryImage::withoutGlobalScope('owner')->withoutGlobalScope('album_lock')
            ->where('user_id', $user->getKey())
            ->where('imageable_type', $this->morphAlias($target))
            ->whereIn('imageable_id', $ids)
            ->update(['imageable_type' => null, 'imageable_id' => null]);

        return true;
    }

    /** სკოუპში მოხვედრილი ჩანაწერების id-ები */
    private function recordIds(User $user, array $input): array
    {
        $target = $input['target'];
        $type = $target === 'gallery' ? ($input['media_type'] ?? 'movie') : $target;

        $query = $this->modelQuery($user, $type);

        match ($input['mode']) {
            // „ყველა" ცალკე რეჟიმია — ცარიელი ფილტრი ვერ მოხვდება აქ შემთხვევით
            'all' => null,
            'ids' => $query->whereIn('id', array_map('intval', $input['ids'] ?? [])),
            'genre' => $query->whereHas('genres', fn ($q) => $q->whereIn('slug', $input['genres'] ?? [])),
            /* ⚠️ **ორი მექანიზმი ერთდროულად** (§6.4): ექვს დომენს per-user
               ლექსიკონი აქვს (`status_id` → `statuses.key`), წიგნს/თამაშს/
               ბორდგეიმს კი enum-სვეტი. ფილტრი ორივეგან **გასაღებით** მოდის,
               ე.ი. `/purge`-ის UI-სთვის განსხვავება არ ჩანს. */
            'status' => StatusDomain::usesDictionary($type)
                ? $query->statusKey($input['status'] ?? '')
                : $query->where('status', $input['status'] ?? ''),
            // „ტიპი" = per-user ლექსიკონი: ვიდეოზე `type_id`, ჩანაწერზე
            // `category_id`, წიგნზე/ბორდგეიმზე `genre_id`.
            // ⚠️ **თამაშსა და სიმღერას ჟანრი pivot-ია** (მრავალჟანრიანია), ე.ი.
            // სვეტში ვერ მოვძებნით — `whereHas` სჭირდება ლექსიკონის თავის ცხრილზე
            'type' => isset(self::GENRE_PIVOTS[$type])
                ? $query->whereHas('genres', fn ($q) => $q->whereIn(
                    self::GENRE_PIVOTS[$type],
                    array_map('intval', $input['type_ids'] ?? []),
                ))
                : $query->whereIn(
                    match ($type) {
                        'video' => 'type_id',
                        'note' => 'category_id',
                        default => 'genre_id',
                    },
                    array_map('intval', $input['type_ids'] ?? []),
                ),
            'tag' => null,
            default => null,
        };

        // რჩეულის დაცვა — ერთი checkbox, რომელიც ყველაზე ხშირ შეცდომას იჭერს
        if (! empty($input['keep_favorites'])) {
            $query->where('is_favorite', false);
        }

        $ids = $query->pluck('id')->map(fn ($id) => (int) $id)->all();

        // ტეგები JSON სვეტია — ფილტრი PHP-ში, `Video::tagKey()`-ით
        if ($input['mode'] === 'tag') {
            /* ⚠️ სამიზნე, რომელსაც ტეგი არ აქვს, აქ **გამონაკლისია და არა
               ჩუმი „ყველა"** (BUG-16): ზემოთ `match`-ში `'tag' => null` წერია,
               ე.ი. სკოუპი ჯერ მთელი ბიბლიოთეკაა და ჭრა სწორედ აქ ხდება —
               გამოტოვება უპირობო წაშლას ნიშნავს. */
            abort_unless(self::supportsTag($type), 422, 'mode_not_supported_for_target');

            $wanted = collect($input['tags'] ?? [])->map(fn ($t) => Video::tagKey($t))->filter()->all();
            $ids = $this->modelQuery($user, $type)
                ->whereIn('id', $ids)
                ->get(['id', 'tags'])
                ->filter(fn ($row) => collect($row->tags ?? [])
                    ->map(fn ($t) => Video::tagKey((string) $t))
                    ->intersect($wanted)
                    ->isNotEmpty())
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->all();
        }

        return $ids;
    }

    /**
     * ⚠️ `withoutGlobalScope('owner') + where user_id` განზრახ: ადმინს სხვისი
     * ანგარიშის გასუფთავებაც სჭირდება (`user_id` პარამეტრით), ე.ი. სკოუპს
     * ცხადად ვწერთ და არა Auth-ზე ვეყრდნობით.
     *
     * ⚠️ **`trash` scope-იც ცხადად ითიშება (FEAT-11).** კალათაში მყოფი
     * ჩანაწერი ისევ ბაზაშია, ფაილებიც დისკზეა და კვოტაშიც ითვლება — ე.ი.
     * მისი გამოტოვება ორ რამეს გააფუჭებდა: „წაშალე ყველაფერი" ჩუმად
     * დატოვებდა ნაწილს (ანგარიშის წაშლისას ობოლი ფაილები დისკზე
     * დარჩებოდა — BUG-21-ის ზუსტი განმეორება), და `plan()`-ის „გათავისუფლდება
     * N ბაიტი" ტყუილი იქნებოდა.
     */
    private function modelQuery(User $user, string $type): Builder
    {
        $model = match ($type) {
            'series' => Series::class,
            'anime' => Anime::class,
            'video' => Video::class,
            'song' => Song::class,
            'book' => Book::class,
            'board_game' => BoardGame::class,
            'game' => Game::class,
            'note' => NoteEntry::class,
            'bookmark' => Bookmark::class,
            default => Movie::class,
        };

        return $model::withoutGlobalScopes(['owner', 'trash'])->where('user_id', $user->getKey());
    }

    private function morphAlias(string $target): string
    {
        return match ($target) {
            'series' => 'series',
            'anime' => 'anime',
            'video' => 'video',
            'song' => 'song',
            'book' => 'book',
            'board_game' => 'board_game',
            'game' => 'game',
            'note' => 'note',
            'bookmark' => 'bookmark',
            default => 'movie',
        };
    }

    /** გალერეის ფოტოების ჯამი — ჩანაწერზეც და მისივე მსახიობებზეც */
    private function galleryTotals(User $user, string $type, array $ids): array
    {
        $query = $this->galleryQuery($user, $type, $ids);

        return [$query->count(), (int) $query->sum('size')];
    }

    /**
     * გალერეის ფოტოების query: ჩანაწერზე მიმაგრებული + ამ ჩანაწერების
     * **მსახიობების** ფოტოები (მშობელი `cast_member`-ია, იხ. Tasks 10).
     */
    private function galleryQuery(User $user, string $type, array $ids)
    {
        $morph = $this->morphAlias($type);
        $castIds = $ids
            ? $this->modelQuery($user, $type)
                ->whereIn('id', $ids)
                ->with('cast:id')
                ->get()
                ->flatMap(fn ($record) => $record->cast->pluck('id'))
                ->unique()
                ->values()
                ->all()
            : [];

        return GalleryImage::withoutGlobalScope('owner')->withoutGlobalScope('album_lock')
            ->where('user_id', $user->getKey())
            ->where(function ($q) use ($morph, $ids, $castIds) {
                $q->where(fn ($inner) => $inner->where('imageable_type', $morph)->whereIn('imageable_id', $ids));
                if ($castIds) {
                    $q->orWhere(fn ($inner) => $inner->where('imageable_type', 'cast_member')->whereIn('imageable_id', $castIds));
                }
            });
    }

    /** ფოტოების წაშლა — თითოეული მოდელით, რომ კვოტა და ფაილი გასუფთავდეს */
    private function deleteGallery(User $user, string $type, array $ids): array
    {
        $count = 0;
        $bytes = 0;

        $this->galleryQuery($user, $type, $ids)->chunkById(self::CHUNK, function ($rows) use (&$count, &$bytes) {
            foreach ($rows as $image) {
                $bytes += (int) $image->size;
                $image->delete();
                $count++;
            }
        });

        return ['count' => $count, 'bytes' => $bytes];
    }

    /**
     * ჩანაწერის საკუთარი ატვირთვები, რომლებიც კვოტაში ითვლება (19.4/B).
     *
     * ⚠️ ჩამოტვირთული პოსტერი/ყდა/ფოტო **არ ითვლება და არც იშლება** — ფაილის
     * სახელი წყაროს id-ია, ე.ი. სხვის ჩანაწერსაც ემსახურება.
     */
    private function ownUploadBytes(User $user, string $target, array $ids): int
    {
        [$column, $sourceColumn] = self::UPLOAD_COLUMNS[$target] ?? [null, null];

        if (! $column) {
            return 0;
        }

        $query = $this->modelQuery($user, $target)
            ->whereIn('id', $ids)
            ->whereNotNull($column);

        if ($sourceColumn) {
            $query->where($sourceColumn, 'upload');
        }

        return (int) $query->get([$column])->sum(fn ($row) => $this->meter->sizeOf($row->{$column}));
    }

    /**
     * მორგებულ `ფაილი` ველზე ატვირთული ბაიტები (§6 ფაზა 4b).
     *
     * ⚠️ **შეფასებაშიც უნდა ჩანდეს.** წაშლას თვითონ `HasCustomFields` აკეთებს
     * (`deleting`), მაგრამ „რამდენი გათავისუფლდება" აქ ითვლება — უამისოდ
     * ციფრი ნაკლებს დაპირდებოდა, ვიდრე რეალურად მოხდებოდა.
     *
     * ⚠️ `gallery` target-ს ეს არ ეხება: იქ ჩანაწერი რჩება და ველიც მასთან ერთად.
     */
    private function customFieldBytes(User $user, string $target, array $ids): int
    {
        $table = CustomFields::table($target);

        if (! $table) {
            return 0;
        }

        return (int) DB::table($table)
            ->where('user_id', $user->getKey())
            ->whereIn('record_id', $ids)
            ->sum('value_size');
    }
}
