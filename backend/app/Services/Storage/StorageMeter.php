<?php

namespace App\Services\Storage;

use App\Models\BoardGameFile;
use App\Models\BookFile;
use App\Models\DatabaseBackup;
use App\Models\GalleryImage;
use App\Models\GameFile;
use App\Models\Message;
use App\Models\NoteEntryFile;
use App\Models\SongFile;
use App\Models\User;
use App\Models\VideoFile;
use App\Services\Notify\Notifier;
use App\Support\CustomFields;
use App\Support\NotificationType;
use App\Support\StorageFolder;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use ZipArchive;

/**
 * საცავის მრიცხველი (Tasks 17.1/17.3).
 *
 * `users.storage_used_bytes` **დაქეშილია**: ატვირთვა/წაშლა მას დელტით ცვლის
 * (`storeUpload`/`deleteUpload`/`addFor`), სრული გადათვლა კი `recalculate()`-ია —
 * ის დისკს კითხავს და ამიტომ ძვირია (`POST /api/storage/recalculate`).
 *
 * ⚠️ **რა ითვლება (გადაწყდა 19.4-ში, ვარიანტი B):** მხოლოდ user-ის ატვირთვები —
 * ავატარი, **ხელით** ატვირთული პოსტერი (`poster_source = 'upload'`), ვიდეოს
 * თამბნეილი, სექციების ფაილები (`video_files`) და გალერეის ჩამოტვირთული
 * ფოტოები (`gallery_images`). TMDB-იდან ჩამოტვირთული პოსტერები
 * და მსახიობების ფოტოები **არ ითვლება**: მათ user არ ირჩევს და ორ ანგარიშზე
 * ერთი და იგივე ფაილია.
 *
 * ეს კლასი „რა ითვლება"-ს **ერთადერთი წყაროა** — ადმინის გვერდიც (1.3) აქედან
 * იღებს ფაილების სიას, რომ ორი განსხვავებული ჯამი არ გაჩნდეს.
 */
class StorageMeter
{
    /**
     * ⚠️ **დისკი ერთი აღარაა (Tasks §17.5).** `notes/` პრივატულ დისკზე ცხოვრობს,
     * დანარჩენი — public-ზე. რომელი, ამას **მხოლოდ** `StorageFolder::diskFor()`
     * წყვეტს, ე.ი. აქ ჩაწერილი კონსტანტა აღარ არსებობს: ერთი დავიწყებული
     * `self::DISK` პრივატულ ფაილს public-ზე დაწერდა.
     */
    private function disk(string $pathOrFolder): Filesystem
    {
        return Storage::disk(StorageFolder::diskFor($pathOrFolder));
    }

    /** გაფრთხილების ზღვრები — ერთი წყარო backend-ისთვისაც და UI-სთვისაც */
    public const WARN_AT = 80;

    public const CRITICAL_AT = 95;

    /**
     * ატვირთვების საქაღალდეები public დისკზე (17.5-ის ობოლების სკანერი
     * **მხოლოდ** აქ იყურება — უცნობ დირექტორიაში ფაილს არ ეხება).
     *
     * ⚠️ სია `StorageFolder`-იდან მოდის (ერთი წყარო — 2026-09-04): ფესვები
     * მოდულებისაა, `LEGACY_ROOTS` კი ძველი ბრტყელი საქაღალდეებია, რომ
     * მიგრაციის შემდეგ იქ დარჩენილი ობოლები სკანერს დაენახოს.
     *
     * ⚠️ `PRIVATE_FOLDERS` ცალკე დგას (§7.1) და **აუცილებელია**: `orphans()`
     * დისკს საქაღალდის მიხედვით ირჩევს, ე.ი. საჯარო `videos`-ის სკანი
     * პრივატულ `videos/downloads`-ს ვერასდროს დაინახავდა და იქაური ობოლი
     * სამუდამოდ დარჩებოდა.
     */
    public const UPLOAD_FOLDERS = [
        ...StorageFolder::ROOTS,
        ...StorageFolder::PRIVATE_FOLDERS,
        ...StorageFolder::LEGACY_ROOTS,
    ];

    /**
     * ახლახან შეცვლილი ფაილი ობოლად **არ ითვლება** — ატვირთვა შეიძლება ჯერ
     * მიმდინარეობს ან ჩანაწერი ერთი წამის შემდეგ იწერება.
     */
    private const ORPHAN_MIN_AGE_MINUTES = 60;

    /**
     * API-ს პასუხი: ჯამი და ზღვრები **დაქეშილი მრიცხველიდან** (ე.ი. იაფია —
     * `UserResource`-შიც ჯდება). `$withModules` დისკს კითხავს, ამიტომ მხოლოდ
     * `GET /api/storage`-ზე ირთვება.
     */
    public function usage(User $user, bool $withModules = false): array
    {
        $quota = (int) $user->storage_quota_bytes;
        $used = (int) $user->storage_used_bytes;

        $extra = [];

        if ($withModules) {
            $allocations = $this->allocations($user);

            $extra = [
                'modules' => $this->breakdown($user),
                // §17.2 — ცალკე ლიმიტები და გაუნაწილებელი ნაშთი („საერთო აუზი")
                'allocations' => $allocations,
                'allocated' => array_sum($allocations),
                'unallocated' => max(0, $quota - array_sum($allocations)),
            ];
        }

        return [
            'used' => $used,
            'quota' => $quota,
            'remaining' => max(0, $quota - $used),
            'percent' => $quota > 0 ? min(100, (int) round($used / $quota * 100)) : 0,
            'warn_at' => self::WARN_AT,
            'critical_at' => self::CRITICAL_AT,
            ...$extra,
        ];
    }

    /**
     * ამ user-ის ატვირთული ფაილები — „რა ითვლება"-ს ერთადერთი განმარტება.
     * `module` = მოდულის `key` (ან `account` ავატარზე, რომელიც მოდულს არ ეკუთვნის).
     *
     * `owner_type`/`owner_id` = ჩანაწერი, რომელსაც ფაილი ჰკიდია. სწორედ ისინი
     * აძლევს `deleteOwnFile()`-ს საშუალებას, ცნობილი გზით წაშალოს ფაილი
     * (სვეტის გაცარიელება ან `video_files`/`gallery_images` რიგის წაშლა) — 17.5.
     *
     * `private` = ფაილი პრივატულ დისკზეა (§17.5), ე.ი. `/storage/*`-ით **არ**
     * იხსნება — UI-მ ხატულა უნდა აჩვენოს და არა გატეხილი `<img>`.
     *
     * @return Collection<int, array{kind: string, module: string, owner_type: string, owner_id: int|null, path: string, private: bool, name: string|null, size: int, mime: string|null, created_at: string|null}>
     */
    public function files(User $user, ?string $only = null): Collection
    {
        $files = collect();

        /* ⚠️ **ეს მხოლოდ სისწრაფის მინიშნებაა და არა სიმართლე** (Tasks PERF-03):
           რომელი რიგი რომელ მოდულს ეკუთვნის, კვლავ ქვემოთ ჩაწერილი `module`
           წყვეტს, `usedByModule()` კი მასზევე ფილტრავს. ე.ი. გამოტოვებული
           ბლოკი მხოლოდ ნელია და არასდროს არასწორი — ხოლო იმას, რომ გამოტოვება
           პასუხს **საერთოდ** არ ცვლის, `StorageManagementTest` ამოწმებს
           ყოველ მოდულზე. სწორედ ეს ინარჩუნებს „რა ითვლება"-ს ერთ განმარტებას:
           ეს იგივე კოდია, უბრალოდ ზედმეტ ცხრილს აღარ ეკითხება. */
        $skip = fn (string $module): bool => $only !== null && $only !== $module;

        /** @param array{kind: string, module: string, owner_type: string, owner_id?: int|null, path: ?string, name?: ?string, size?: ?int, mime?: ?string, created_at?: mixed} $file */
        $add = function (array $file) use ($files) {
            $path = $file['path'] ?? null;
            if (! $path) {
                return;
            }

            $files->push([
                'kind' => $file['kind'],
                'module' => $file['module'],
                'owner_type' => $file['owner_type'],
                'owner_id' => $file['owner_id'] ?? null,
                'path' => $path,
                /* ⚠️ **პრივატულობა აქედან უნდა მოდიოდეს და არა ფრონტიდან** (§17.5).
                   `/storage/*` ამ ფაილებს ვერ ხედავს, ე.ი. საცავის გვერდი მათზე
                   `<img>`-საც და ბმულსაც გატეხილს ხატავდა. SPA-ში ფესვების სიის
                   გამეორება იმ წესს არღვევდა, რომ დისკს **მხოლოდ**
                   `StorageFolder` წყვეტს — ერთი დავიწყებული ასლი პრივატულ
                   ფაილს საჯარო url-ით გამოაჩენდა. */
                'private' => StorageFolder::isPrivate($path),
                'name' => ($file['name'] ?? null) ?: basename($path),
                'size' => $file['size'] ?? $this->fileSize($path),
                'mime' => $file['mime'] ?? null,
                'created_at' => ($file['created_at'] ?? null)?->toIso8601String(),
            ]);
        };

        $add([
            'kind' => 'avatar',
            'module' => 'account',
            'owner_type' => 'user',
            'owner_id' => (int) $user->getKey(),
            'path' => $user->avatar_path,
            'created_at' => $user->updated_at,
        ]);

        // ხელით ატვირთული პოსტერები; TMDB-ის ჩამოტვირთული აქ არ ხვდება (19.4/B)
        foreach (['movies' => 'movie', 'series' => 'series', 'animes' => 'anime'] as $relation => $module) {
            if ($skip($module)) {
                continue;
            }

            $records = $user->{$relation}()
                ->withoutGlobalScope('owner')
                ->where('poster_source', 'upload')
                ->whereNotNull('poster_path')
                ->get(['id', 'poster_path', 'created_at']);

            foreach ($records as $record) {
                $add([
                    'kind' => 'poster',
                    'module' => $module,
                    'owner_type' => $module,
                    'owner_id' => (int) $record->id,
                    'path' => $record->poster_path,
                    'created_at' => $record->created_at,
                ]);
            }
        }

        // `thumbnail_url` პლატფორმის ბმულია (ჩვენთან არ ინახება) — მხოლოდ `thumbnail_path`
        $videos = $skip('video') ? collect() : $user->videos()
            ->withoutGlobalScope('owner')
            ->whereNotNull('thumbnail_path')
            ->get(['id', 'title', 'thumbnail_path', 'created_at']);

        foreach ($videos as $video) {
            $add([
                'kind' => 'thumbnail',
                'module' => 'video',
                'owner_type' => 'video',
                'owner_id' => (int) $video->id,
                'path' => $video->thumbnail_path,
                'name' => $video->title,
                'created_at' => $video->created_at,
            ]);
        }

        /* §7.1 — ლოკალურად ჩამოწერილი ვიდეო.
           ⚠️ **ყველაზე დიდი ფაილია მთელ კვოტაში**, ე.ი. საცავის გვერდზე
           აუცილებლად უნდა ჩანდეს — თორემ „საიდან მოდის ეს გიგაბაიტები"
           უპასუხო რჩებოდა. ზომა **ჩაწერილია** და არა დისკიდან წაკითხული
           (`StoredFile`-ის წესი), `private` კი `videos/downloads`-ის გამო
           true-ა და გვერდი ჩამკეტს ხატავს ნაცვლად გატეხილი ბმულისა. */
        $downloads = $skip('video') ? collect() : $user->videos()
            ->withoutGlobalScope('owner')
            ->whereNotNull('download_path')
            ->get(['id', 'title', 'download_path', 'download_name', 'download_size', 'downloaded_at']);

        foreach ($downloads as $video) {
            $add([
                'kind' => 'video',
                'module' => 'video',
                'owner_type' => 'video_download',
                'owner_id' => (int) $video->id,
                'path' => $video->download_path,
                'name' => $video->download_name ?: $video->title,
                'size' => (int) $video->download_size,
                'created_at' => $video->downloaded_at,
            ]);
        }

        // სიმღერის ატვირთული ფოტო — იმავე წესით, რაც ვიდეოს თამბნეილი
        $songs = $skip('song') ? collect() : $user->songs()
            ->withoutGlobalScope('owner')
            ->whereNotNull('thumbnail_path')
            ->get(['id', 'title', 'thumbnail_path', 'created_at']);

        foreach ($songs as $song) {
            $add([
                'kind' => 'thumbnail',
                'module' => 'song',
                'owner_type' => 'song',
                'owner_id' => (int) $song->id,
                'path' => $song->thumbnail_path,
                'name' => $song->title,
                'created_at' => $song->created_at,
            ]);
        }

        // ბუკმარკის ატვირთული ფოტო — იმავე წესით, რაც სიმღერის თამბნეილი.
        // ⚠️ og:image აქ **არ ხვდება**: ის დაშორებული URL-ია და დისკს არ იკავებს.
        $bookmarks = $skip('bookmark') ? collect() : $user->bookmarks()
            ->withoutGlobalScope('owner')
            ->whereNotNull('thumbnail_path')
            ->get(['id', 'title', 'thumbnail_path', 'created_at']);

        foreach ($bookmarks as $bookmark) {
            $add([
                'kind' => 'thumbnail',
                'module' => 'bookmark',
                'owner_type' => 'bookmark',
                'owner_id' => (int) $bookmark->id,
                'path' => $bookmark->thumbnail_path,
                'name' => $bookmark->title,
                'created_at' => $bookmark->created_at,
            ]);
        }

        // წიგნის **ხელით ატვირთული** ყდა; Open Library-დან ჩამოტვირთული აქ არ ხვდება (19.4/B)
        $books = $skip('book') ? collect() : $user->books()
            ->withoutGlobalScope('owner')
            ->where('cover_source', 'upload')
            ->whereNotNull('cover_path')
            ->get(['id', 'title_ka', 'title_en', 'cover_path', 'created_at']);

        foreach ($books as $book) {
            $add([
                'kind' => 'cover',
                'module' => 'book',
                'owner_type' => 'book',
                'owner_id' => (int) $book->id,
                'path' => $book->cover_path,
                'name' => $book->title_en ?: $book->title_ka,
                'created_at' => $book->created_at,
            ]);
        }

        // წიგნის ფაილები (pdf/epub) — ერთეულზე ყველაზე მძიმეები
        $bookFiles = $skip('book') ? collect() : BookFile::withoutGlobalScope('owner')
            ->where('user_id', $user->id)
            ->get(['id', 'kind', 'path', 'original_name', 'mime', 'size', 'created_at']);

        foreach ($bookFiles as $f) {
            $add([
                'kind' => $f->kind === 'image' ? 'image' : 'doc',
                'module' => 'book',
                'owner_type' => 'book_file',
                'owner_id' => (int) $f->id,
                'path' => $f->path,
                'name' => $f->original_name,
                'size' => $f->size,
                'mime' => $f->mime,
                'created_at' => $f->created_at,
            ]);
        }

        // ბორდგეიმის **ხელით ატვირთული** ფოტო; BGG-დან ჩამოტვირთული აქ არ ხვდება (19.4/B)
        $boardGames = $skip('board_game') ? collect() : $user->boardGames()
            ->withoutGlobalScope('owner')
            ->where('image_source', 'upload')
            ->whereNotNull('image_path')
            ->get(['id', 'title', 'image_path', 'created_at']);

        foreach ($boardGames as $game) {
            $add([
                'kind' => 'image',
                'module' => 'board_game',
                'owner_type' => 'board_game',
                'owner_id' => (int) $game->id,
                'path' => $game->image_path,
                'name' => $game->title,
                'created_at' => $game->created_at,
            ]);
        }

        // ბორდგეიმის ფაილები — წესების PDF და გალერეის ფოტოები
        $boardGameFiles = $skip('board_game') ? collect() : BoardGameFile::withoutGlobalScope('owner')
            ->where('user_id', $user->id)
            ->get(['id', 'kind', 'path', 'original_name', 'mime', 'size', 'created_at']);

        foreach ($boardGameFiles as $f) {
            $add([
                'kind' => $f->kind === 'image' ? 'image' : 'doc',
                'module' => 'board_game',
                'owner_type' => 'board_game_file',
                'owner_id' => (int) $f->id,
                'path' => $f->path,
                'name' => $f->original_name,
                'size' => $f->size,
                'mime' => $f->mime,
                'created_at' => $f->created_at,
            ]);
        }

        // თამაშის **ხელით ატვირთული** ყდა; RAWG-დან ჩამოტვირთული აქ არ ხვდება (19.4/B)
        $games = $skip('game') ? collect() : $user->games()
            ->withoutGlobalScope('owner')
            ->where('cover_source', 'upload')
            ->whereNotNull('cover_path')
            ->get(['id', 'title_ka', 'title_en', 'cover_path', 'created_at']);

        foreach ($games as $game) {
            $add([
                'kind' => 'cover',
                'module' => 'game',
                'owner_type' => 'game',
                'owner_id' => (int) $game->id,
                'path' => $game->cover_path,
                'name' => $game->title_en ?: $game->title_ka,
                'created_at' => $game->created_at,
            ]);
        }

        // თამაშის ფაილები — ატვირთული სქრინშოტები და დოკუმენტები
        $gameFiles = $skip('game') ? collect() : GameFile::withoutGlobalScope('owner')
            ->where('user_id', $user->id)
            ->get(['id', 'kind', 'path', 'original_name', 'mime', 'size', 'created_at']);

        foreach ($gameFiles as $f) {
            $add([
                'kind' => $f->kind === 'doc' ? 'doc' : 'image',
                'module' => 'game',
                'owner_type' => 'game_file',
                'owner_id' => (int) $f->id,
                'path' => $f->path,
                'name' => $f->original_name,
                'size' => $f->size,
                'mime' => $f->mime,
                'created_at' => $f->created_at,
            ]);
        }

        // ჩანაწერების ატვირთვები (§13.1) — სქრინშოტი/ვიდეო/დოკუმენტი
        $noteFiles = $skip('note') ? collect() : NoteEntryFile::withoutGlobalScope('owner')
            ->where('user_id', $user->id)
            ->get(['id', 'kind', 'path', 'original_name', 'mime', 'size', 'created_at']);

        foreach ($noteFiles as $f) {
            $add([
                'kind' => $f->kind === 'image' ? 'image' : ($f->kind === 'video' ? 'video' : 'doc'),
                'module' => 'note',
                'owner_type' => 'note_entry_file',
                'owner_id' => (int) $f->id,
                'path' => $f->path,
                'name' => $f->original_name,
                'size' => $f->size,
                'mime' => $f->mime,
                'created_at' => $f->created_at,
            ]);
        }

        // ვიდეოზე მიმაგრებული ფაილები — ზომა ცხრილშივე ინახება, ე.ი. დისკს არ ვეკითხებით
        $videoFiles = $skip('video') ? collect() : VideoFile::withoutGlobalScope('owner')
            ->where('user_id', $user->id)
            ->get(['id', 'kind', 'path', 'original_name', 'mime', 'size', 'created_at']);

        foreach ($videoFiles as $f) {
            $add([
                'kind' => $f->kind === 'doc' ? 'doc' : 'image',
                'module' => 'video',
                'owner_type' => 'video_file',
                'owner_id' => (int) $f->id,
                'path' => $f->path,
                'name' => $f->original_name,
                'size' => $f->size,
                'mime' => $f->mime,
                'created_at' => $f->created_at,
            ]);
        }

        // §7.4 — სიმღერაზე მიმაგრებული ფაილები; ზომა ცხრილშივეა (დისკს არ ვეკითხებით)
        $songFiles = $skip('song') ? collect() : SongFile::withoutGlobalScope('owner')
            ->where('user_id', $user->id)
            ->get(['id', 'kind', 'path', 'original_name', 'mime', 'size', 'created_at']);

        foreach ($songFiles as $f) {
            $add([
                'kind' => $f->kind === 'doc' ? 'doc' : 'image',
                'module' => 'song',
                'owner_type' => 'song_file',
                'owner_id' => (int) $f->id,
                'path' => $f->path,
                'name' => $f->original_name,
                'size' => $f->size,
                'mime' => $f->mime,
                'created_at' => $f->created_at,
            ]);
        }

        // Tasks 10 — გალერეის ფოტო **გალერეის** მოდულს ეკუთვნის და არა მშობელს:
        // მსახიობის ფოტოზე `imageable_type` = `cast_member`, რაც მოდული არ არის
        $galleryImages = $skip('gallery') ? collect() : GalleryImage::withoutGlobalScope('owner')
            ->where('user_id', $user->id)
            ->get(['id', 'path', 'original_name', 'mime', 'size', 'created_at']);

        foreach ($galleryImages as $g) {
            $add([
                'kind' => 'image',
                'module' => 'gallery',
                'owner_type' => 'gallery_image',
                'owner_id' => (int) $g->id,
                'path' => $g->path,
                'name' => $g->original_name,
                'size' => $g->size,
                'mime' => $g->mime,
                'created_at' => $g->created_at,
            ]);
        }

        /* §16.4 — ჩატში გაგზავნილი მედია **გამგზავნის** კვოტიდან იხარჯება.
           ⚠️ `module` აქ `chat`-ია და არა რომელიმე მოდულის key: ჩატი
           `modules` ცხრილში არ არის (იგივე მდგომარეობა, რაც `account`-ს აქვს),
           ე.ი. ცალკე ლიმიტს ვერ იღებს და საერთო აუზში რჩება. */
        $attachments = $skip('chat') ? collect() : Message::where('user_id', $user->id)
            ->whereNotNull('attachment_path')
            ->get(['id', 'type', 'attachment_path', 'attachment_name', 'attachment_mime', 'attachment_size', 'created_at']);

        foreach ($attachments as $m) {
            $add([
                'kind' => $m->type === 'image' ? 'image' : ($m->type === 'video' ? 'video' : 'doc'),
                'module' => 'chat',
                'owner_type' => 'message',
                'owner_id' => (int) $m->id,
                'path' => $m->attachment_path,
                'name' => $m->attachment_name,
                'size' => $m->attachment_size,
                'mime' => $m->attachment_mime,
                'created_at' => $m->created_at,
            ]);
        }

        /* §22 — ბაზის დამპი.
           ⚠️ `module` აქ `backup`-ია: `modules` ცხრილში რიგი არ აქვს
           (`chat`/`account`-ის მდგომარეობა), ე.ი. ცალკე ლიმიტს ვერ იღებს
           და საერთო აუზიდან იხარჯება.
           ⚠️ **ყველაზე დიდი ერთეული ფაილია მთელ კვოტაში**, ე.ი. საცავის
           გვერდზე მისი დანახვა ზუსტად ის შემთხვევაა, რისთვისაც ის სია
           არსებობს. */
        $backups = $skip('backup') ? collect() : DatabaseBackup::where('user_id', $user->id)
            ->whereNotNull('path')
            ->get(['id', 'path', 'name', 'size', 'created_at']);

        foreach ($backups as $backup) {
            $add([
                'kind' => 'backup',
                'module' => 'backup',
                'owner_type' => 'database_backup',
                'owner_id' => (int) $backup->id,
                'path' => $backup->path,
                'name' => $backup->name,
                'size' => $backup->size,
                'created_at' => $backup->created_at,
            ]);
        }

        /* §6 ფაზა 4b — მორგებულ `ფაილი` ველზე ატვირთული ფაილი.
           ⚠️ **მოდული ცხრილიდან მოდის** (`movie_field_values` → `movie`) და
           სწორედ ის ემთხვევა საქაღალდის ფესვსაც (`movies/fields`), ე.ი. §17.2-ის
           ლიმიტი და აქაური ჯამი ერთსა და იმავე მოდულს აწერს. */
        foreach (CustomFields::TABLE_BY_MODULE as $module => $table) {
            if ($skip($module)) {
                continue;
            }

            $rows = DB::table($table)
                ->where('user_id', $user->getKey())
                ->whereNotNull('value_path')
                ->get(['id', 'value_path', 'value_name', 'value_mime', 'value_size', 'created_at']);

            foreach ($rows as $row) {
                $add([
                    'kind' => 'field',
                    'module' => $module,
                    'owner_type' => 'field_value',
                    'owner_id' => (int) $row->id,
                    'path' => $row->value_path,
                    'name' => $row->value_name,
                    // ⚠️ **ჩაწერილი ზომა** და არა დისკიდან წაკითხული (იხ. `StoredFile`)
                    'size' => (int) $row->value_size,
                    'mime' => $row->value_mime,
                    'created_at' => $row->created_at ? Carbon::parse($row->created_at) : null,
                ]);
            }
        }

        return $files;
    }

    /**
     * ერთი ატვირთული ფაილის წაშლა user-ის მოთხოვნით (17.5).
     *
     * ⚠️ `path` **`files()`-ში** ეძებება, ე.ი. სხვისი ფაილი და TMDB-ის საერთო
     * პოსტერი აქედან პრინციპულად ვერ წაიშლება — რაც არ ითვლება კვოტაში,
     * ის ამ სიაშიც არ არის.
     */
    public function deleteOwnFile(User $user, string $path): bool
    {
        $file = $this->files($user)->firstWhere('path', $path);

        return $file ? $this->deleteResolved($user, $file) : false;
    }

    /**
     * **§6.2 — მონიშნულების ან ყველას წაშლა ერთი მოქმედებით.**
     *
     * ⚠️ `files()` **ერთხელ** იკითხება და არა თითო გზაზე: ის ბაზასაც ეკითხება
     * და დისკსაც, ე.ი. 600 ფაილზე ციკლური `deleteOwnFile()` 600 სრულ სკანს
     * ნიშნავდა. სნეპშოტი ერთი მოქმედების დასაწყისშია აღებული — იმავე
     * მოთხოვნის შიგნით მას ვერავინ შეცვლის.
     *
     * @param  list<string>  $paths
     * @return array{files: int, bytes: int}
     */
    public function deleteOwnFiles(User $user, array $paths): array
    {
        $known = $this->files($user)->keyBy('path');
        $deleted = 0;
        $bytes = 0;

        foreach (array_unique($paths) as $path) {
            $file = $known->get($path);

            if ($file && $this->deleteResolved($user, $file)) {
                $deleted++;
                $bytes += (int) $file['size'];
            }
        }

        return ['files' => $deleted, 'bytes' => $bytes];
    }

    /**
     * **§6.2 — მონიშნულების/ყველას ჩამოტვირთვა ერთ zip-ად.**
     *
     * ⚠️ **პრივატული დისკის ფაილიც ხვდება არქივში და ეს განზრახაა.** §17.5-ის
     * წესი ის არის, რომ პრივატული ფაილი **ავტორიზაციისა და მფლობელობის
     * შემოწმების გარეშე** არ უნდა გავიდეს — `/storage/*` სწორედ ამიტომ ვერ
     * ხედავს `notes/`-სა და `chat/`-ს. აქ ორივე შემოწმებულია: მარშრუტი
     * `auth:sanctum`-ის უკანაა და გზა **user-ის საკუთარ `files()`-ში** იძებნება,
     * ე.ი. სხვისი ფაილი არქივში პრინციპულად ვერ ჩავარდება. ცალკეული ფაილის
     * „ჩამოტვირთვის" ღილაკი პრივატულზე მაინც არ ჩანს — ის `/storage/*`-ზე
     * მიდის და 404-ს დააბრუნებდა.
     *
     * ⚠️ **`addFile()` და არა `addFromString()`** — ჩანაწერის ვიდეო 100 MB-მდეა,
     * ე.ი. შიგთავსის მეხსიერებაში წაკითხვა ერთ არქივზე PHP-ის ლიმიტს ამოწურავდა.
     *
     * @param  list<string>  $paths
     * @return string|null დროებითი zip-ის აბსოლუტური გზა (`null` — არაფერი მოიძებნა)
     */
    public function archiveOwnFiles(User $user, array $paths): ?string
    {
        $known = $this->files($user)->keyBy('path');

        $picked = [];
        foreach (array_unique($paths) as $path) {
            if ($file = $known->get($path)) {
                $picked[] = $file;
            }
        }

        if (! $picked) {
            return null;
        }

        $zipPath = tempnam(sys_get_temp_dir(), 'mediary-files-');
        $zip = new ZipArchive;

        if ($zip->open($zipPath, ZipArchive::OVERWRITE | ZipArchive::CREATE) !== true) {
            // ⚠️ `tempnam()`-მა ფაილი **უკვე შექმნა** — გაუხსნელად დატოვება
            // `%TEMP%`-ში ნაგავს აგროვებდა (`deleteFileAfterSend()` მხოლოდ
            // წარმატებულ გზას ფარავს)
            @unlink($zipPath);

            return null;
        }

        // ერთი და იმავე სახელი ორ მოდულში შეიძლება იყოს — არქივში სახელი
        // უნიკალური უნდა იყოს, თორემ მეორე ფაილი პირველს ჩუმად გადააწერს
        $used = [];

        foreach ($picked as $file) {
            $disk = $this->disk($file['path']);

            if (! $disk->fileExists($file['path'])) {
                continue;
            }

            $name = $file['module'].'/'.($file['name'] ?: basename($file['path']));
            $suffix = 2;
            while (isset($used[$name])) {
                $ext = pathinfo($name, PATHINFO_EXTENSION);
                $base = $ext ? substr($name, 0, -(strlen($ext) + 1)) : $name;
                $name = $base.'-'.$suffix++.($ext ? '.'.$ext : '');
            }
            $used[$name] = true;

            $zip->addFile($disk->path($file['path']), $name);
        }

        $zip->close();

        return $zipPath;
    }

    /**
     * ერთი, **უკვე ამოცნობილი** ფაილის წაშლა (`files()`-ის რიგი).
     *
     * @param  array<string, mixed>  $file
     */
    private function deleteResolved(User $user, array $file): bool
    {
        $path = (string) $file['path'];
        $ownerId = $file['owner_id'];

        // ჩანაწერის წაშლა თვითონ შლის ფაილს და ათავისუფლებს კვოტას
        // (`StoredFile` trait), ე.ი. აქ დელტას ხელით არ ვცვლით
        $fileModel = match ($file['owner_type']) {
            'video_file' => VideoFile::class,
            'song_file' => SongFile::class,
            'book_file' => BookFile::class,
            'board_game_file' => BoardGameFile::class,
            'game_file' => GameFile::class,
            'note_entry_file' => NoteEntryFile::class,
            'gallery_image' => GalleryImage::class,
            /* §22 — ბაზის დამპი. ⚠️ აქ არყოფნა ნიშნავდა, რომ საცავის
               ბიბლიოთეკაში ფაილი ჩანდა, „წაშლა" კი ჩუმად აბრუნებდა `false`-ს
               — ე.ი. ღილაკი არაფერს აკეთებდა. ჩანაწერი `StoredFile`-ს
               იყენებს, ე.ი. წაშლა ფაილსაც შლის და კვოტასაც ათავისუფლებს. */
            'database_backup' => DatabaseBackup::class,
            default => null,
        };

        if ($fileModel) {
            return (bool) $fileModel::withoutGlobalScope('owner')
                ->whereKey($ownerId)
                ->where('user_id', $user->getKey())
                ->first()?->delete();
        }

        /* §6 ფაზა 4b — მორგებული ველის ატვირთვა. ⚠️ **მთელი რიგი იშლება**
           და არა მარტო სვეტები: `file` ველზე ფაილი *არის* მნიშვნელობა, ე.ი.
           უფაილო რიგი ჩანაწერს „შევსებულად" აჩვენებდა. იგივე ქცევა, რაც
           `CustomFieldService::clearFile()`-ს აქვს — საცავის გვერდი და
           ბარათი ვერ უნდა დაშორდნენ ერთმანეთს. */
        if ($file['owner_type'] === 'field_value') {
            $table = CustomFields::table($file['module']);
            $row = DB::table($table)->where('user_id', $user->getKey())->where('id', $ownerId)->first();

            if (! $row) {
                return false;
            }

            /* ⚠️ **რიგი და მრიცხველი ერთ ტრანზაქციაში, ფაილი — commit-ის
               შემდეგ** (Tasks BUG-13; ზუსტად ის რიგი, რაც `AlbumVault`-ს
               აქვს BUG-03/BUG-04-ის შემდეგ).

               ძველად სამივე ცალკე გვერდითი ეფექტი იყო და **ფაილი პირველი
               იშლებოდა**: `DELETE`-ის ჩავარდნაზე ფაილი გამქრალია, კვოტა
               ჩამოკლებული, რიგი კი კვლავ `value_path`/`value_size`-ს
               აცხადებს — ე.ი. მომდევნო `recalculate()` არარსებული ფაილის
               ბაიტებს **ხელახლა ამატებს** და მრიცხველი სამუდამოდ იბერება.

               ⚠️ საპირისპირო მიმდევრობა უვნებელია: commit-ის შემდეგ
               დისკის წაშლის ჩავარდნა მხოლოდ ობოლ ფაილს ტოვებს, რომელსაც
               ადმინის ობოლების სკანერი იბრუნებს — ბაზა კი სწორია. */
            DB::transaction(function () use ($table, $ownerId, $user, $row) {
                DB::table($table)->where('id', $ownerId)->delete();
                $this->addFor((int) $user->getKey(), -(int) $row->value_size);
            });

            $this->deleteUpload(null, $row->value_path);

            return true;
        }

        if ($file['owner_type'] === 'user') {
            $user->forceFill(['avatar_path' => null])->save();
            $this->deleteUpload((int) $user->getKey(), $path);

            return true;
        }

        /* §7.1 — ლოკალურად ჩამოწერილი ვიდეო. ⚠️ **მოდელის მეთოდით იშლება**
           და არა აქ ხელით: `deleteDownload()` შვიდივე სვეტს ერთად ასუფთავებს,
           თორემ გზის გარეშე დარჩენილი `ready` სტატუსით ბარათი „ჩამოწერილს"
           აჩვენებდა და გახსნა 404-ს დააბრუნებდა. */
        if ($file['owner_type'] === 'video_download') {
            $video = $user->videos()->withoutGlobalScope('owner')->whereKey($ownerId)->first();

            if (! $video) {
                return false;
            }

            $video->deleteDownload();
            $video->save();

            return true;
        }

        /* ჩატის მიმაგრება (§16.4) — **იგივე ქცევა, რაც ჩატშია** (`DECISIONS.md`
           §1): ფაილი ორივესთან ქრება, შეტყობინების რიგი კი რჩება. სხვაგვარად
           საცავის გვერდიდან წაშლა საუბრიდან მთელ რიგს აცლიდა. */
        if ($file['owner_type'] === 'message') {
            $message = Message::where('user_id', $user->getKey())->whereKey($ownerId)->first();

            if (! $message) {
                return false;
            }

            // ჩაწერილი ზომა თავისუფლდება და არა დისკიდან წაკითხული (იხ. `StoredFile`)
            $this->deleteUpload(null, $path);
            $this->addFor((int) $user->getKey(), -(int) $message->attachment_size);

            $message->forceFill([
                'attachment_path' => null,
                'attachment_mime' => null,
                'attachment_size' => null,
            ])->save();

            return true;
        }

        // პოსტერი/თამბნეილი/ყდა — სვეტი ცარიელდება, ჩანაწერი რჩება
        $relation = match ($file['owner_type']) {
            'movie' => 'movies',
            'series' => 'series',
            'video' => 'videos',
            'song' => 'songs',
            'bookmark' => 'bookmarks',
            'book' => 'books',
            'board_game' => 'boardGames',
            'game' => 'games',
            default => null,
        };

        if (! $relation) {
            return false;
        }

        $record = $user->{$relation}()->withoutGlobalScope('owner')->whereKey($ownerId)->first();

        if (! $record) {
            return false;
        }

        // `poster_source`/`cover_source` ერთად უნდა მოიხსნას, თორემ
        // „ხელით ატვირთული" ნიშანი უფაილო ჩანაწერზე დარჩება
        $record->forceFill(match ($relation) {
            'videos', 'songs', 'bookmarks' => ['thumbnail_path' => null],
            'books', 'games' => ['cover_path' => null, 'cover_source' => null],
            'boardGames' => ['image_path' => null, 'image_source' => null],
            default => ['poster_path' => null, 'poster_source' => null],
        })->save();

        $this->deleteUpload((int) $user->getKey(), $path);

        return true;
    }

    /**
     * ხარჯი მოდულებად (17.5-ის „რა რამდენს იკავებს"-ის ბაზისი).
     *
     * @return array<string, int>
     */
    public function breakdown(User $user): array
    {
        return $this->files($user)
            ->groupBy('module')
            ->map(fn (Collection $group) => (int) $group->sum('size'))
            ->all();
    }

    /* ---------- §17.2 — გადანაწილება მოდულებზე ---------- */

    /**
     * user-ის ლიმიტები მოდულებზე: `[key => bytes]`.
     * ⚠️ სიაში მხოლოდ **ცხადად დაყენებული** ლიმიტები ხვდება — `null`
     * (ლიმიტის გარეშე) აქ საერთოდ არ ჩანს, თორემ „0 ბაიტი" და „ლიმიტი
     * არ აქვს" ერთმანეთს აგერევა.
     *
     * @return array<string, int>
     */
    public function allocations(User $user): array
    {
        $out = [];

        foreach ($user->modules()->get() as $module) {
            $limit = $module->pivot->storage_limit_bytes;
            if ($limit !== null) {
                $out[$module->key] = (int) $limit;
            }
        }

        return $out;
    }

    /**
     * ლიმიტების ჩაწერა. `null` მნიშვნელობა ლიმიტს **ხსნის**.
     *
     * ⚠️ **ჯამი მთლიან კვოტას ვერ აღემატება** (§17.2-ის ცხადი წესი) —
     * წინააღმდეგ შემთხვევაში „გადანაწილება" თვითონ კვოტის გვერდის ავლა
     * იქნებოდა. ვამოწმებთ **ჩაწერამდე**, ე.ი. ნახევრად შენახული
     * მდგომარეობა ვერ გაჩნდება.
     *
     * @param  array<string, int|null>  $limits  მოდულის key → ბაიტები
     */
    public function setAllocations(User $user, array $limits): void
    {
        $current = $this->allocations($user);
        $merged = $current;

        foreach ($limits as $key => $value) {
            if ($value === null) {
                unset($merged[$key]);
            } else {
                $merged[$key] = max(0, (int) $value);
            }
        }

        if (array_sum($merged) > (int) $user->storage_quota_bytes) {
            throw new HttpResponseException(response()->json([
                'message' => 'allocation_exceeds_quota',
                'allocated' => array_sum($merged),
                'quota' => (int) $user->storage_quota_bytes,
            ], 422));
        }

        $ids = $user->modules()->get()->keyBy('key');

        foreach ($limits as $key => $value) {
            $module = $ids->get($key);
            if (! $module) {
                continue;
            }
            $user->modules()->updateExistingPivot($module->id, [
                'storage_limit_bytes' => $value === null ? null : max(0, (int) $value),
            ]);
        }
    }

    /**
     * რამდენი უჭირავს ერთ მოდულს.
     *
     * ⚠️ განზრახ `files()`-ზე გადის და არა ცალკე დათვლილ query-ზე: „რა
     * ითვლება" ერთადერთი განმარტება უნდა დარჩეს, თორემ ლიმიტი და ჯამი
     * დროთა განმავლობაში სხვადასხვას აჩვენებდა.
     *
     * ⚠️ **ეს წესი PERF-03-ის შემდეგაც უცვლელია** — `$only` ცალკე დათვლა კი
     * არა, იმავე `files()`-ის მინიშნებაა: სხვა მოდულის ცხრილს აღარ ეკითხება.
     * `where('module', …)` შემორჩა განზრახ, რომ პასუხი მინიშნების სისწორეზე
     * არ იყოს დამოკიდებული.
     *
     * ⚠️ **მეხსიერებაში შენახვა აქ არასწორი იქნებოდა და არა უბრალოდ ზედმეტი.**
     * ატვირთვა პაკეტურია (`files[]`, `UploadLimits::MAX_FILES`) და რიგები
     * ციკლის შიგნით ჩნდება, ე.ი. ერთხელ აღებული სურათი მე-2…N-ე ფაილს ძველ
     * ჯამზე შეამოწმებდა — მოდულის ლიმიტი ჩუმად გადაცდებოდა.
     */
    public function usedByModule(User $user, string $module): int
    {
        return (int) $this->files($user, $module)->where('module', $module)->sum('size');
    }

    /**
     * ობოლი ფაილები (17.5) — დისკზე არიან, ბაზაში კი **არავინ იხსენიებს**
     * (ჩანაწერი წაშლილია ან ატვირთვა ჩაწერამდე გაწყდა).
     *
     * ⚠️ **გლობალური ოპერაციაა და არა per-user.** ატვირთვები საერთო
     * საქაღალდეებში ჯდება (`movies/posters/`, `gallery/images/`…), ე.ი. ბაზაში
     * არ-მოხსენიებულ ფაილს **მფლობელი აღარ აქვს** — ვერ მივაკუთვნებთ
     * კონკრეტულ user-ს. ამიტომ endpoint-იც `super_admin`-ზეა.
     *
     * უსაფრთხოების ორი ზღუდე: სკანირება მხოლოდ `UPLOAD_FOLDERS`-შია და
     * ბოლო საათში შეცვლილ ფაილს არ ვეხებით (მიმდინარე ატვირთვა).
     *
     * @return Collection<int, array{path: string, folder: string, size: int, modified_at: string|null}>
     */
    public function orphans(): Collection
    {
        $referenced = $this->referencedPaths();
        $cutoff = now()->subMinutes(self::ORPHAN_MIN_AGE_MINUTES)->getTimestamp();

        $orphans = collect();

        foreach (self::UPLOAD_FOLDERS as $folder) {
            // ⚠️ დისკი **ფესვზეა** დამოკიდებული (§17.5): `notes/` პრივატულზეა.
            // ერთ დისკზე სკანირება პრივატულ ობოლებს სამუდამოდ დატოვებდა.
            $disk = $this->disk($folder);

            // რეკურსიულად: საქაღალდე ახლა მოდულის **ფესვია** და ქვესაქაღალდეები აქვს
            foreach ($disk->allFiles($folder) as $path) {
                if (isset($referenced[$path])) {
                    continue;
                }

                try {
                    $modified = (int) $disk->lastModified($path);
                    $size = (int) $disk->size($path);
                } catch (\Throwable) {
                    continue;
                }

                if ($modified > $cutoff) {
                    continue;
                }

                $orphans->push([
                    'path' => $path,
                    'folder' => $folder,
                    'size' => $size,
                    'modified_at' => Carbon::createFromTimestamp($modified)->toIso8601String(),
                ]);
            }
        }

        return $orphans->sortByDesc('size')->values();
    }

    /**
     * ობოლების წაშლა. მრიცხველს **არ ვცვლით**: ობოლი ფაილი განსაზღვრებით
     * არავის ჩანაწერზე არ ჰკიდია, ე.ი. `files()`-ში არც იყო და ჯამში არ ითვლებოდა.
     *
     * @return array{files: int, bytes: int}
     */
    public function cleanOrphans(): array
    {
        $orphans = $this->orphans();

        $deleted = 0;
        $bytes = 0;

        foreach ($orphans as $orphan) {
            try {
                if ($this->disk($orphan['path'])->delete($orphan['path'])) {
                    $deleted++;
                    $bytes += $orphan['size'];
                }
            } catch (\Throwable) {
                // ჩაკეტილი/უკვე წაშლილი ფაილი მთელ ნაკადს არ აჩერებს
            }
        }

        return ['files' => $deleted, 'bytes' => $bytes];
    }

    /**
     * ყველა ბაზაში მოხსენიებული ფაილის გზა — `[path => true]`, რომ ძებნა
     * O(1) იყოს. **Eloquent-ის გარეშე** (`DB::table`), რომ `owner` global
     * scope-მა სხვისი ფაილი „არ-მოხსენიებულად" არ აქციოს.
     *
     * @return array<string, true>
     */
    private function referencedPaths(): array
    {
        $paths = [];

        // ⚠️ **ყოველი ახალი ატვირთვის სვეტი აქაც უნდა ჩაიწეროს.** რაც აქ არ
        // წერია, ობოლად ჩაითვლება და ადმინის „გასუფთავებამ" წაშლის — ზუსტად
        // ეს დაემართა თამაშების ყდებსა და ფაილებს (გასწორდა 2026-09-04).
        /* ⚠️ სია **`ცხრილი.სვეტი`** სტრიქონებია და არა `ცხრილი => სვეტი` რუკა:
           ერთ ცხრილს ორი გზის სვეტიც შეიძლება ჰქონდეს (`videos.thumbnail_path`
           **და** `videos.download_path`, §7.1), რუკაში კი მეორე პირველს
           ჩუმად გადააწერდა — ე.ი. ჩამოწერილ ვიდეოებს ადმინის „გასუფთავება"
           ობოლად ჩათვლიდა და წაშლიდა. */
        $columns = [
            'users.avatar_path',
            'movies.poster_path',
            'series.poster_path',
            'animes.poster_path',
            'videos.thumbnail_path',
            'videos.download_path',
            'songs.thumbnail_path',
            'bookmarks.thumbnail_path',
            'books.cover_path',
            'board_games.image_path',
            'games.cover_path',
            'video_files.path',
            'song_files.path',
            'book_files.path',
            'board_game_files.path',
            'game_files.path',
            'note_entry_files.path',
            'gallery_images.path',
            'messages.attachment_path',
            'cast_members.photo_path',
            // §22 — ბაზის დამპი. ⚠️ აქ არყოფნა ნიშნავდა, რომ ადმინის
            // „ობოლების გასუფთავება" ცოცხალ ბექაპებს **წაშლიდა**
            'database_backups.path',
            // §6 ფაზა 4b — რვავე `<module>_field_values` (ქვემოთ ემატება)
        ];

        // ⚠️ ცხრილები **სიიდან** მოდის და არა ხელით ჩამოწერილი: ახალი მოდულის
        // დამატება `CustomFields::TABLE_BY_MODULE`-ს ეხება და აქ დავიწყება
        // მის ატვირთვებს ადმინის „გასუფთავებით" წაშლიდა
        foreach (array_keys(CustomFields::TABLES) as $fieldTable) {
            $columns[] = "{$fieldTable}.value_path";
        }

        foreach ($columns as $qualified) {
            [$table, $column] = explode('.', $qualified, 2);

            foreach (DB::table($table)->whereNotNull($column)->pluck($column) as $value) {
                if ($value) {
                    $paths[(string) $value] = true;
                }
            }
        }

        return $paths;
    }

    /** სრული გადათვლა დისკიდან + დაქეშილი მრიცხველის ჩაწერა */
    public function recalculate(User $user): int
    {
        $total = (int) $this->files($user)->sum('size');

        $user->forceFill(['storage_used_bytes' => $total])->save();

        return $total;
    }

    public function add(User $user, int $bytes): void
    {
        $this->addFor((int) $user->getKey(), $bytes);

        // ⚠️ მრიცხველი raw UPDATE-ით იწერება, ე.ი. მოდელის ატრიბუტი ძველია.
        // ბაზიდან ვაბრუნებთ და **არა-dirty**-ად ვნიშნავთ, თორემ მოგვიანებით
        // გამოძახებული `$user->save()` (მაგ. პროფილის განახლება) სტალე
        // რიცხვს გადააწერს და დელტა დაიკარგება.
        $user->storage_used_bytes = (int) User::whereKey($user->getKey())->value('storage_used_bytes');
        $user->syncOriginalAttribute('storage_used_bytes');
    }

    public function subtract(User $user, int $bytes): void
    {
        $this->add($user, -$bytes);
    }

    /**
     * დელტა user-ის ჩატვირთვის გარეშე — ერთი UPDATE.
     * მოდელის ივენთებიდან იძახება (`StoredFile::deleted`), სადაც ერთ
     * წაშლაზე ათეული ფაილი შეიძლება მოვიდეს.
     */
    public function addFor(int $userId, int $bytes): void
    {
        if ($bytes === 0) {
            return;
        }

        // ქვემოთ 0-ზე არ ჩავარდეს (მრიცხველი unsigned-ია); `(int)` cast-ი
        // პარამეტრს უსაფრთხოს ხდის, ე.ი. raw გამოსახულებაც უსაფრთხოა
        $delta = (int) $bytes;
        User::whereKey($userId)->update([
            'storage_used_bytes' => DB::raw(
                "CASE WHEN storage_used_bytes + ({$delta}) < 0 THEN 0 ELSE storage_used_bytes + ({$delta}) END"
            ),
        ]);
    }

    /**
     * **ადგილის ატომური დაჯავშნა** (აუდიტი 2026-09-14).
     *
     * ⚠️ **`guard()` + `add()` ატომური არ იყო.** ორი პარალელური ატვირთვა
     * ორივე გაივლიდა შემოწმებას (ორივე ხედავდა ერთსა და იმავე ნაშთს) და
     * ორივე დაამატებდა — ე.ი. კვოტა გადალახვადი იყო. „ლიმიტი, რომლის
     * გადალახვაც შეიძლება, ლიმიტი არ არის" — ეს წესი პროექტს უკვე
     * ჩაწერილი აქვს (`VideoDownloader`), მაგრამ თვითონ მრიცხველი მას
     * არ იცავდა.
     *
     * ⚠️ **ერთი პირობითი `UPDATE`** აკეთებს შემოწმებასაც და ჩაწერასაც:
     * თუ 0 რიგი შეიცვალა, ადგილი აღარ არის. იგივე compare-and-swap,
     * რითაც `ReminderDispatcher` ორმაგ გასროლას იცავს.
     *
     * @return bool დაჯავშნა მოხერხდა?
     */
    public function reserve(User $user, int $bytes): bool
    {
        if ($bytes <= 0) {
            return true;
        }

        $ok = User::whereKey($user->getKey())
            ->whereRaw('storage_used_bytes + ? <= storage_quota_bytes', [$bytes])
            ->update(['storage_used_bytes' => DB::raw('storage_used_bytes + '.(int) $bytes)]) > 0;

        if ($ok) {
            $before = (int) $user->storage_used_bytes;

            // მოდელის ატრიბუტი raw UPDATE-ის შემდეგ ძველია — იხ. `add()`
            $user->storage_used_bytes = (int) User::whereKey($user->getKey())->value('storage_used_bytes');
            $user->syncOriginalAttribute('storage_used_bytes');

            $this->warnIfCrossed($user, $before);
        }

        return $ok;
    }

    /**
     * **„საცავი ივსება" — ერთხელ, ზღვრის გადალახვისას (FEAT-19).**
     *
     * ⚠️ **გადალახვა და არა მდგომარეობა.** „80%-ზე მეტია" ყოველ
     * ატვირთვაზე ჭეშმარიტი იქნებოდა, ე.ი. მომხმარებელი ერთსა და იმავე
     * შეტყობინებას ათჯერ მიიღებდა და ბეჯს დაუჯერებლად აქცევდა. აქ
     * პირობა **ორმხრივია**: ადრე ქვემოთ იყო, ახლა ზემოთ — ე.ი. თითო
     * ზღვარზე ზუსტად ერთი შეტყობინება.
     *
     * ⚠️ **`reserve()`-შია და არა `add()`-ში**: ჯავშანი ერთადერთი
     * ადგილია, სადაც მრიცხველი **იზრდება** ატვირთვისას; `add()`/`release()`
     * კორექციებია და მათზე გაფრთხილება ცრუ იქნებოდა.
     */
    private function warnIfCrossed(User $user, int $before): void
    {
        $quota = (int) $user->storage_quota_bytes;

        if ($quota <= 0) {
            return;
        }

        $after = (int) $user->storage_used_bytes;

        foreach ([self::CRITICAL_AT, self::WARN_AT] as $threshold) {
            $line = (int) ceil($quota * $threshold / 100);

            if ($before < $line && $after >= $line) {
                app(Notifier::class)->send($user, NotificationType::STORAGE_WARNING, [
                    'percent' => min(100, (int) round($after / $quota * 100)),
                    'threshold' => $threshold,
                ]);

                // ⚠️ მხოლოდ **უმაღლესი** გადალახული ზღვარი — ერთი
                // დიდი ატვირთვა ორივეს გადაახტება და ორ შეტყობინებას დაწერდა
                return;
            }
        }
    }

    public function remaining(User $user): int
    {
        return max(0, (int) $user->storage_quota_bytes - (int) $user->storage_used_bytes);
    }

    public function fits(User $user, int $bytes): bool
    {
        return $bytes <= $this->remaining($user);
    }

    /**
     * ატვირთვამდე შემოწმება (17.3) — ლიმიტის ამოწურვაზე **იბლოკება**,
     * ჩუმად ნახევრად არ გადის. 413-ს ვაბრუნებთ, რომ ვალიდაციის
     * 422-ისგან გაირჩეოდეს და ფრონტმა ცხადი შეტყობინება აჩვენოს.
     */
    public function guard(User $user, int $bytes, ?string $folder = null): void
    {
        if (! $this->fits($user, $bytes)) {
            throw new HttpResponseException(response()->json([
                'message' => 'storage_quota_exceeded',
                'needed' => $bytes,
                'remaining' => $this->remaining($user),
                'quota' => (int) $user->storage_quota_bytes,
            ], 413));
        }

        // §17.2 — მოდულის ცალკე ლიმიტი (თუ დაყენებულია)
        if ($folder !== null) {
            $this->guardModule($user, $bytes, $folder);
        }
    }

    /**
     * **§17.2 — მოდულის ლიმიტი.** მოდული საქაღალდიდან გამომდინარეობს
     * (`StorageFolder::moduleFor()`), ე.ი. **არცერთ ატვირთვის ადგილს არ
     * სჭირდება ცვლილება** — საქაღალდეს ისინი ისედაც გადმოსცემენ.
     *
     * ⚠️ **ცალკე კოდი `module_quota_exceeded`** და არა იგივე
     * `storage_quota_exceeded`: user-ის ქმედება სხვაა — საერთო ადგილი
     * აქვს, უბრალოდ ამ მოდულს თვითონ შეუზღუდა.
     *
     * ⚠️ ლიმიტის შემცირება უკვე დახარჯულზე ქვემოთ **ფაილებს არ შლის**
     * (§17.2-ის ცხადი წესი) — უბრალოდ ახალი ატვირთვა აღარ გაივლის.
     */
    public function guardModule(User $user, int $bytes, string $folder): void
    {
        $module = StorageFolder::moduleFor($folder);
        if ($module === null) {
            return;
        }

        $limit = $this->allocations($user)[$module] ?? null;
        if ($limit === null) {
            return;
        }

        $used = $this->usedByModule($user, $module);

        if ($used + $bytes <= $limit) {
            return;
        }

        throw new HttpResponseException(response()->json([
            'message' => 'module_quota_exceeded',
            'module' => $module,
            'needed' => $bytes,
            'remaining' => max(0, $limit - $used),
            'quota' => $limit,
        ], 413));
    }

    /**
     * ატვირთვის ერთი წერტილი: ჯერ კვოტა, მერე ჩაწერა, მერე მრიცხველი.
     * ყველა ატვირთვა ამაზე უნდა გადიოდეს, თორემ მრიცხველი ჩუმად აცდება.
     */
    public function storeUpload(User $user, UploadedFile $file, string $folder): string
    {
        $size = (int) $file->getSize();
        // §17.2 — საქაღალდე მოდულსაც განსაზღვრავს, ე.ი. ლიმიტიც აქვე მოწმდება
        $this->claim($user, $size, $folder);

        // დისკი საქაღალდიდან გამომდინარეობს (§17.5) — გამომძახებელი მას არ ირჩევს
        return $this->write($user, $size, fn () => $file->store($folder, StorageFolder::diskFor($folder)));
    }

    /**
     * იგივე `storeUpload()`, ოღონდ მზა ბაიტებისთვის — ჩამოტვირთული ფაილი
     * `UploadedFile` არ არის (Tasks 10-ის გალერეა). გზა იგივეა: ჯერ კვოტა,
     * მერე ჩაწერა, მერე მრიცხველი.
     */
    public function storeContents(User $user, string $contents, string $folder, string $extension = 'jpg'): string
    {
        $size = strlen($contents);
        $this->claim($user, $size, $folder);

        $path = trim($folder, '/').'/'.Str::random(40).'.'.ltrim($extension, '.');

        return $this->write($user, $size, function () use ($folder, $path, $contents) {
            $this->disk($folder)->put($path, $contents);

            return $path;
        });
    }

    /**
     * იგივე `storeUpload()`, ოღონდ **უკვე დისკზე მდებარე** ფაილისთვის —
     * `yt-dlp`-ით ჩამოწერილი ვიდეო (Tasks §7.1).
     *
     * ⚠️ `storeContents()` აქ არ გამოდგება: ის მთელ ფაილს სტრიქონად კითხულობს
     * და 1 GB-იანი ვიდეო მეხსიერებას ამოწურავდა. ამიტომ ნაკადი იხსნება და
     * `writeStream()`-ით გადადის — ზომა კი **დისკიდან ერთხელ** იკითხება.
     *
     * ⚠️ კვოტა მაინც `guard()`-ზე გადის (ანგარიშიც და მოდულის ლიმიტიც):
     * ჩამოწერამდე მხოლოდ სავარაუდო ზომა ვიცოდით, აქ კი ნამდვილი.
     */
    public function storeLocalFile(User $user, string $absolutePath, string $folder, ?string $name = null): string
    {
        $size = is_file($absolutePath) ? (int) filesize($absolutePath) : 0;
        $this->claim($user, $size, $folder);

        $extension = strtolower(pathinfo($name ?: $absolutePath, PATHINFO_EXTENSION)) ?: 'mp4';
        $path = trim($folder, '/').'/'.Str::random(40).'.'.$extension;

        return $this->write($user, $size, function () use ($absolutePath, $folder, $path) {
            $stream = fopen($absolutePath, 'rb');

            if ($stream === false) {
                throw new \RuntimeException("ჩამოწერილი ფაილი ვერ გაიხსნა: {$absolutePath}");
            }

            try {
                $this->disk($folder)->writeStream($path, $stream);
            } finally {
                fclose($stream);
            }

            return $path;
        });
    }

    /**
     * **ადგილის აღება ჩაწერამდე** — ანგარიშისაც და მოდულისაც.
     *
     * ⚠️ ანგარიშის ნაწილი **ატომურია** (`reserve()`), მოდულისა კი ჩვეულებრივი
     * შემოწმება: მოდულის ლიმიტი მომხმარებლის საკუთარი შეზღუდვაა და მისი
     * ერთი ბაიტით გადაცდენა ანგარიშის კვოტას არ არღვევს.
     */
    private function claim(User $user, int $bytes, string $folder): void
    {
        $this->guardModule($user, $bytes, $folder);

        if (! $this->reserve($user, $bytes)) {
            throw new HttpResponseException(response()->json([
                'message' => 'storage_quota_exceeded',
                'needed' => $bytes,
                'remaining' => $this->remaining($user->refresh()),
                'quota' => (int) $user->storage_quota_bytes,
            ], 413));
        }
    }

    /**
     * ჩაწერა უკვე დაჯავშნილ ადგილზე.
     *
     * ⚠️ **ჩავარდნაზე ადგილი ბრუნდება.** ჯავშანი ჩაწერამდეა, ე.ი. დისკის
     * შეცდომა მრიცხველში „მოჩვენებით" ბაიტებს დატოვებდა — და ისინი მხოლოდ
     * `recalculate()`-ით გაქრებოდა.
     *
     * @param  callable(): string  $writer
     */
    private function write(User $user, int $bytes, callable $writer): string
    {
        try {
            return $writer();
        } catch (\Throwable $e) {
            $this->addFor((int) $user->getKey(), -$bytes);

            throw $e;
        }
    }

    /**
     * ატვირთული ფაილის მოშორება — ზომას **წაშლამდე** ითვლის და კვოტიდან
     * აკლებს. `$userId` null-ზე მხოლოდ ფაილი იშლება.
     */
    public function deleteUpload(?int $userId, ?string $path): void
    {
        if (! $path) {
            return;
        }

        $size = $this->fileSize($path);
        $this->disk($path)->delete($path);

        if ($userId && $size) {
            $this->addFor($userId, -$size);
        }
    }

    /** იგივე `fileSize()`, გარეთ — მასობრივი წაშლის შეფასებას სჭირდება (Tasks 20) */
    public function sizeOf(?string $path): int
    {
        return $this->fileSize($path);
    }

    /** დისკიდან წაკითხული ზომა; წაშლილ/მიუწვდომელ ფაილზე 0 (და არა შეცდომა) */
    private function fileSize(?string $path): int
    {
        if (! $path) {
            return 0;
        }

        try {
            $disk = $this->disk($path);

            return $disk->fileExists($path) ? (int) $disk->size($path) : 0;
        } catch (\Throwable) {
            return 0;
        }
    }
}
