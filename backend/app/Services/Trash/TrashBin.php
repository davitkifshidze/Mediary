<?php

namespace App\Services\Trash;

use App\Models\AuditLog;
use App\Models\CastMember;
use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Models\Message;
use App\Models\Module;
use App\Models\TrashedFile;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Chat\ChatService;
use App\Services\Modules\CustomFieldService;
use App\Services\Storage\StorageMeter;
use App\Support\AlbumLock;
use App\Support\SafeMime;
use App\Support\StorageFolder;
use App\Support\TrashDomain;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

/**
 * **ურნა — ერთი ადგილი ყველაფრისთვის, რაც იშლება** (Tasks §29).
 *
 * შენი სიტყვები: „იქ ყველა წაშლილი ჩავარდეს, ნებისმიერი რამ: ფოტო, ბმული,
 * ფილმი, სერიალი, გალერეიდან თუ საიდანაც იქნება — და 30 დღე აღდგენის
 * შესაძლებლობა იყოს".
 *
 * ⚠️ **სამი სახის ელემენტი, ერთი გზა** (`TrashDomain::kinds()`): ჩანაწერი
 * და რიგიანი ფაილი თავის `trashed_at`-ს ატარებს (`HasTrash`), ჩატისა და
 * ველის ფაილი კი `trashed_files`-შია. კონტროლერი და გასუფთავების ბრძანება
 * მხოლოდ ამ სერვისს იძახებენ — ორი ადგილი, რომელიც „რა არის ურნაში"-ს
 * ცალ-ცალკე დაწერდა, პირველივე ახალ სახეზე დაშორდებოდა.
 *
 * ⚠️ **ფაილი ურნაში ადგილს იკავებს** (29.4) — კვოტა მხოლოდ საბოლოო წაშლისას
 * თავისუფლდება, ამიტომ სია თითო ელემენტის და მთელი ურნის მოცულობას ამბობს.
 * ჩანაწერის მოცულობაში მისი ფაილებიც ითვლება (პოსტერი, ფოტოები, ველის
 * ფაილები) — საბოლოო წაშლა სწორედ მათ ათავისუფლებს.
 *
 * ⚠️ **აღდგენის წესები (29.5)**: ფაილი, რომლის ჩანაწერიც თვითონ ურნაშია,
 * ჩანაწერთან ერთად ბრუნდება (სხვაგვარად ის უხილავ ჩანაწერს მიებმებოდა);
 * გამორთული მოდულის ელემენტი ჩანს, მაგრამ აღდგენას მოდულის ჩართვა
 * სჭირდება; ჩაკეტილი ალბომის ფოტო ურნაშიც ჩაკეტილია (ესკიზი არ იგზავნება).
 */
final class TrashBin
{
    /** თითო ჯგუფზე რამდენი რიგი ჩანს */
    public const PER_GROUP = 50;

    /**
     * ჩანაწერის ესკიზის სვეტი — დისკის გზა და, თუ ის ცარიელია, დაშორებული ბმული.
     *
     * @var array<string, array{0: string, 1?: string}>
     */
    private const RECORD_PREVIEW = [
        'movie' => ['poster_path'],
        'series' => ['poster_path'],
        'anime' => ['poster_path'],
        'video' => ['thumbnail_path', 'thumbnail_url'],
        'song' => ['thumbnail_path'],
        'bookmark' => ['thumbnail_path', 'image_url'],
        'course' => ['thumbnail_path'],
        'place' => ['photo_path'],
        'book' => ['cover_path'],
        'game' => ['cover_path'],
        'board_game' => ['image_path'],
    ];

    public function __construct(
        private StorageMeter $meter,
        private CustomFieldService $custom,
        private ChatService $chat,
        private AuditLogger $audit,
    ) {}

    /* ============================================================
       სია
       ============================================================ */

    /**
     * @return array{keep_days: int, bytes: int, data: list<array<string, mixed>>}
     */
    public function listing(User $user): array
    {
        $modules = Module::all()->keyBy('key');
        $recordSizes = $this->recordSizes($user);
        $locked = array_flip(AlbumLock::hiddenIds());
        $groups = [];
        $bytes = 0;

        foreach (TrashDomain::kinds() as $kind) {
            if (! $this->visible($user, $kind)) {
                continue;
            }

            $query = $this->query($user, $kind);
            $total = (clone $query)->count();

            if ($total === 0) {
                continue;
            }

            $category = TrashDomain::category($kind);
            $groupBytes = $category === 'record'
                ? array_sum(array_map(
                    fn (int $id) => $recordSizes["{$kind}:{$id}"] ?? 0,
                    (clone $query)->pluck('id')->map(fn ($id) => (int) $id)->all(),
                ))
                : ($kind === 'gallery_video' ? 0 : (int) (clone $query)->sum('size'));

            $rows = (clone $query)->orderByDesc('trashed_at')->orderByDesc('id')->limit(self::PER_GROUP)->get();
            $parents = $this->parents($kind, $rows);
            $moduleKey = $this->moduleOf($kind);
            $module = $moduleKey ? $modules->get($moduleKey) : null;

            $groups[] = [
                'kind' => $kind,
                'category' => $category,
                'module' => $moduleKey ?? ($kind === 'database_backup' ? 'backup' : ($kind === 'chat_file' ? 'chat' : null)),
                'name_ka' => $category === 'record' ? $module?->name_ka : null,
                'name_en' => $category === 'record' ? $module?->name_en : null,
                'icon' => $module?->icon,
                'color' => $module?->color,
                'total' => $total,
                'bytes' => $groupBytes,
                'items' => $rows->map(fn (Model $row) => $this->item($user, $kind, $row, $parents[$row->getKey()] ?? null, $recordSizes, $locked))->all(),
            ];

            $bytes += $groupBytes;
        }

        return [
            'keep_days' => TrashDomain::KEEP_DAYS,
            'bytes' => $bytes,
            'data' => $groups,
        ];
    }

    /**
     * ერთი რიგი ფრონტისთვის.
     *
     * @param  array{kind: string, id: int, title: string, trashed: bool}|null  $parent
     * @param  array<string, int>  $recordSizes
     * @param  array<int, int>  $locked
     * @return array<string, mixed>
     */
    private function item(User $user, string $kind, Model $row, ?array $parent, array $recordSizes, array $locked): array
    {
        $category = TrashDomain::category($kind);
        $isLocked = $row instanceof GalleryImage && $row->album_id && isset($locked[(int) $row->album_id]);
        $blocked = $this->blocked($user, $kind, $row, $parent, strict: false);

        return [
            'id' => (int) $row->getKey(),
            'title' => $this->titleOf($kind, $row),
            'subtitle' => $parent['title'] ?? $this->albumName($row),
            'trashed_at' => $row->trashed_at?->toIso8601String(),
            /* ⚠️ რჩება თუ არა დრო — სერვერი ითვლის, რადგან ვადა
               `TrashDomain::KEEP_DAYS`-შია და კლიენტში მისი ასლი
               პირველივე შეცვლაზე დაშორდებოდა. */
            'expires_in_days' => max(0, TrashDomain::KEEP_DAYS - (int) $row->trashed_at?->diffInDays(now())),
            'size' => match (true) {
                $category === 'record' => $recordSizes["{$kind}:{$row->getKey()}"] ?? 0,
                $kind === 'gallery_video' => 0,
                default => (int) $row->getAttribute('size'),
            },
            'preview' => $isLocked ? null : $this->preview($kind, $row),
            'locked' => $isLocked,
            'parent' => $parent,
            'restorable' => $blocked === null,
            'blocked' => $blocked,
        ];
    }

    /**
     * ურნის ელემენტების query ერთ სახეზე.
     *
     * ⚠️ **ველის ფაილზე მხოლოდ ის მოდულები**, რომლებზეც წაშლის უფლება მაქვს —
     * ერთი `kind` თერთმეტ მოდულს ემსახურება და უფლება მოდულისაა.
     */
    private function query(User $user, string $kind): Builder
    {
        $userId = (int) $user->getKey();

        return match (TrashDomain::category($kind)) {
            'record' => TrashDomain::model($kind)::trashOf($userId),
            'item' => TrashDomain::ITEMS[$kind]['model']::trashOf($userId),
            default => TrashedFile::withoutGlobalScope('owner')
                ->where('user_id', $userId)
                ->where('kind', $kind)
                ->when($kind === 'field_file', fn (Builder $q) => $q->whereIn(
                    'record_type',
                    array_values(array_filter(TrashDomain::domains(), fn (string $m) => $user->hasPermission($m, 'delete'))),
                )),
        };
    }

    /* ============================================================
       მოქმედებები
       ============================================================ */

    /**
     * აღდგენა.
     *
     * ⚠️ **ყველა უარი ცვლილებამდე მოწმდება** — ველის ფაილზე „ველი სავსეა"
     * მშობლის აღდგენის **შემდეგ** რომ გაირკვეს, ჩანაწერი დაბრუნდებოდა,
     * ფაილი კი არა, და პასუხი მაინც შეცდომა იქნებოდა.
     *
     * @return array{restored: true, with_parent: bool}
     */
    public function restore(User $user, string $kind, int $id): array
    {
        $row = $this->find($user, $kind, $id);
        $parent = $this->parents($kind, collect([$row]))[$row->getKey()] ?? null;

        if ($reason = $this->blocked($user, $kind, $row, $parent, strict: true)) {
            $this->fail($reason, 409);
        }

        $withParent = false;

        DB::transaction(function () use ($user, $row, $parent, &$withParent) {
            if ($parent && $parent['trashed']) {
                TrashDomain::model($parent['kind'])::trashOf((int) $user->getKey())->find($parent['id'])?->restoreFromTrash();
                $withParent = true;
            }

            if ($row instanceof TrashedFile) {
                $reason = $row->kind === 'chat_file'
                    ? $this->chat->restoreAttachment($row)
                    : $this->custom->restoreFile($user, $row);

                if ($reason) {
                    $this->fail($reason, 409);
                }

                $this->audit->log(AuditLog::ACTION_RESTORE, [
                    'module' => $row->kind === 'chat_file' ? 'chat' : $row->record_type,
                    'subject_type' => $row->kind,
                    'subject_id' => $row->record_id,
                    'subject_label' => $row->name,
                    'new_values' => ['trashed' => false],
                ]);

                return;
            }

            // ⚠️ ჟურნალს `HasTrash` წერს — ყველა დომენი, ერთი ადგილი
            $row->restoreFromTrash();
        });

        return ['restored' => true, 'with_parent' => $withParent];
    }

    /**
     * ახლავე წაშლა — **ნამდვილად**.
     *
     * ⚠️ **აქ `delete()`-ია და არა `moveToTrash()`** — ელემენტი უკვე ურნაშია,
     * ე.ი. მოვლენები უნდა გაისროლოს: ფაილი დისკიდან, კვოტა, გალერეა და
     * pivot-ები სწორედ ახლა თავისუფლდება.
     */
    public function destroy(User $user, string $kind, int $id): void
    {
        $row = $this->find($user, $kind, $id);

        if ($row instanceof TrashedFile) {
            $this->audit->log(AuditLog::ACTION_DELETE, [
                'module' => $row->kind === 'chat_file' ? 'chat' : $row->record_type,
                'subject_type' => $row->kind,
                'subject_id' => $row->record_id,
                'subject_label' => $row->name,
                'old_values' => ['path' => $row->path, 'size' => $row->size],
            ]);
        }

        $row->delete();
    }

    /**
     * ურნის დაცლა — ყველა (ან ერთი) ხილული სახე.
     *
     * ⚠️ **ჩანაწერები პირველ რიგშია**: მათი `deleting` თავის ფაილებსაც შლის
     * (ურნაში მყოფსაც), ე.ი. შემდეგ სახეებზე ისინი უკვე აღარ მოიძებნება და
     * ორჯერ ვერ დაითვლება. ⚠️ `lazyById` და არა `chunk()`, რომელიც offset-ით
     * დადის და წაშლისას ყოველ მეორე გვერდს ჩუმად ტოვებს.
     */
    public function empty(User $user, ?string $only = null): int
    {
        $deleted = 0;

        foreach (TrashDomain::kinds() as $kind) {
            if (($only !== null && $only !== $kind) || ! $this->visible($user, $kind)) {
                continue;
            }

            foreach ($this->query($user, $kind)->lazyById() as $row) {
                $row->delete();
                $deleted++;
            }
        }

        return $deleted;
    }

    /**
     * ურნაში მყოფი ფაილის ჩვენება (ესკიზისთვის).
     *
     * ⚠️ **ფაილის ჩვეულებრივი მარშრუტი ამას ვერ შეძლებს** — მისი მოდელის
     * მიბმა `trash` scope-ით ურნაში მყოფს 404-ით ხვდება. ⚠️ ჩაკეტილი
     * ალბომის ფოტო მხოლოდ სესიაში გახსნილ ალბომზე გამოდის (`AlbumLock`).
     */
    public function file(User $user, string $kind, int $id): Response
    {
        $row = $this->find($user, $kind, $id);

        if ($row instanceof GalleryImage && $row->album_id) {
            $album = GalleryAlbum::withoutGlobalScope('owner')->find($row->album_id);
            abort_if($album && ! AlbumLock::isUnlocked($album), 404);
        }

        // ⚠️ მხოლოდ ფაილის მქონე სახეები — ჩანაწერს, ბმულს და ბაზის ასლს ესკიზი არ აქვს
        abort_if(TrashDomain::category($kind) === 'record' || in_array($kind, ['gallery_video', 'database_backup'], true), 404);

        $path = (string) $row->getAttribute('path');
        abort_if($path === '', 404);

        $disk = Storage::disk(StorageFolder::diskFor($path));
        abort_unless($disk->exists($path), 404);

        // ⚠️ SEC-04/SEC-08 — ტიპი შიგთავსიდან, აქტიური შიგთავსი ჩამოიტვირთება
        return SafeMime::response($disk, $path, $row->getAttribute('original_name') ?? $row->getAttribute('name'));
    }

    /**
     * **ვადაგასულის საბოლოო წაშლა** — `trash:prune`.
     *
     * ⚠️ **წაშლა მოდელით** (`PurgeService`-ის წესი) — სწორედ მოვლენები
     * ათავისუფლებს ფაილს დისკიდან და კვოტას. ⚠️ ჩანაწერები პირველია: მათ
     * ფაილებს მშობლის `deleting` თვითონ შლის.
     *
     * @return array<string, int> სახე → რამდენი წაიშალა (ან იწაშლებოდა `$dry`-ზე)
     */
    public static function prune(int $days, bool $dry = false): array
    {
        $counts = [];

        foreach (TrashDomain::kinds() as $kind) {
            $query = match (TrashDomain::category($kind)) {
                'record' => TrashDomain::model($kind)::expiredTrash($days),
                'item' => TrashDomain::ITEMS[$kind]['model']::expiredTrash($days),
                default => TrashedFile::withoutGlobalScope('owner')
                    ->where('kind', $kind)
                    ->where('trashed_at', '<=', now()->subDays($days)),
            };

            $count = (clone $query)->count();

            if ($count === 0) {
                continue;
            }

            if (! $dry) {
                foreach ($query->lazyById() as $row) {
                    $row->delete();
                }
            }

            $counts[$kind] = $count;
        }

        return $counts;
    }

    /* ============================================================
       დამხმარეები
       ============================================================ */

    /**
     * ხილვადობა — ვის რა ეკუთვნის ურნაში.
     *
     * ⚠️ **უფლება `delete`-ია და არა `view`** (FEAT-11): ურნა წაშლის
     * გაგრძელებაა. ⚠️ **მოდულის ჩართულობა აქ არ მოწმდება** (29.5) —
     * გამორთული მოდულის ელემენტი ჩანს, მაგრამ აღდგენა მას ითხოვს
     * (`blocked()`). ბაზის ასლი მხოლოდ `super_admin`-ს ეკუთვნის.
     */
    private function visible(User $user, string $kind): bool
    {
        return match (true) {
            $kind === 'database_backup' => $user->isSuperAdmin(),
            TrashDomain::category($kind) === 'file' => true,
            default => ($module = $this->moduleOf($kind)) !== null && $user->hasPermission($module, 'delete'),
        };
    }

    /** სახის მოდული — ჩანაწერზე თვითონ, რიგიან ფაილზე `ITEMS`-იდან */
    private function moduleOf(string $kind): ?string
    {
        return match (TrashDomain::category($kind)) {
            'record' => $kind,
            'item' => TrashDomain::ITEMS[$kind]['module'],
            default => null,
        };
    }

    /**
     * რატომ ვერ ბრუნდება (ან `null`).
     *
     * `$strict = false` სიისთვისაა და მხოლოდ იაფ შემოწმებებს აკეთებს;
     * `true` — აღდგენისას, სადაც ველის სისავსეც მოწმდება.
     *
     * @param  array{kind: string, id: int, title: string, trashed: bool}|null  $parent
     */
    private function blocked(User $user, string $kind, Model $row, ?array $parent, bool $strict): ?string
    {
        $module = $row instanceof TrashedFile
            ? ($row->kind === 'field_file' ? $row->record_type : null)
            : $this->moduleOf($kind);

        if ($module && ! $user->hasModule($module)) {
            return 'module_disabled';
        }

        if ($parent && $parent['trashed']
            && (! $user->hasModule($parent['kind']) || ! $user->hasPermission($parent['kind'], 'delete'))) {
            return 'parent_blocked';
        }

        if ($row instanceof TrashedFile && $row->kind === 'chat_file') {
            $message = Message::find($row->record_id);

            if (! $message) {
                return 'parent_missing';
            }

            return $message->attachment_path ? 'slot_taken' : null;
        }

        if ($row instanceof TrashedFile && $row->kind === 'field_file') {
            if (! $parent) {
                return 'parent_missing';
            }

            if ($this->custom->typeOf($user, (string) $row->record_type, (string) $row->slot) !== 'file') {
                return 'field_missing';
            }
        }

        return null;
    }

    /**
     * ელემენტი ურნაში — ან 404.
     *
     * ⚠️ **`EnsureRecordOwnership` აქ ვერ დაეხმარება** — დომენი სტრიქონია და
     * მოდელი ხელით იძებნება. მფლობელი ცხადად მოწმდება და პასუხი **404**-ია
     * და არა 403 (პროექტის წესი: „ეს არსებობს" თვითონ ინფორმაციაა).
     */
    private function find(User $user, string $kind, int $id): Model
    {
        abort_unless(in_array($kind, TrashDomain::kinds(), true) && $this->visible($user, $kind), 404);

        $row = $this->query($user, $kind)->whereKey($id)->first();

        abort_unless($row !== null, 404);

        return $row;
    }

    /**
     * მშობლები ერთი მოთხოვნით თითო სახეზე — `id → {kind, id, title, trashed}`.
     *
     * @param  Collection<int, Model>  $rows
     * @return array<int, array{kind: string, id: int, title: string, trashed: bool}>
     */
    private function parents(string $kind, Collection $rows): array
    {
        $refs = [];

        foreach ($rows as $row) {
            $ref = $this->parentRef($kind, $row);

            if ($ref) {
                $refs[$row->getKey()] = $ref;
            }
        }

        $loaded = [];

        foreach (collect($refs)->groupBy(0) as $type => $group) {
            $ids = $group->pluck(1)->unique()->all();

            if ($type === 'cast_member') {
                $loaded[$type] = CastMember::whereIn('id', $ids)->get()->keyBy('id');

                continue;
            }

            $model = TrashDomain::model($type);
            $query = $model::withoutGlobalScopes()->whereIn('id', $ids);

            if (method_exists($model, 'translations')) {
                $query->with('translations');
            }

            $loaded[$type] = $query->get()->keyBy('id');
        }

        $out = [];

        foreach ($refs as $rowId => [$type, $id]) {
            $parent = $loaded[$type][$id] ?? null;

            if (! $parent) {
                continue;
            }

            $out[$rowId] = [
                'kind' => $type,
                'id' => (int) $id,
                'title' => $type === 'cast_member' ? (string) $parent->name : $this->titleOf($type, $parent),
                'trashed' => $type !== 'cast_member' && $parent->getAttribute('trashed_at') !== null,
            ];
        }

        return $out;
    }

    /** @return array{0: string, 1: int}|null */
    private function parentRef(string $kind, Model $row): ?array
    {
        if ($row instanceof TrashedFile) {
            return $row->kind === 'field_file' && $row->record_type && TrashDomain::category($row->record_type) === 'record'
                ? [$row->record_type, (int) $row->record_id]
                : null;
        }

        if ($kind === 'gallery_image' || $kind === 'gallery_video') {
            $prefix = $kind === 'gallery_image' ? 'imageable' : 'videoable';
            $type = (string) $row->getAttribute("{$prefix}_type");

            if ($type === '' || ! ($type === 'cast_member' || TrashDomain::category($type) === 'record')) {
                return null;
            }

            return [$type, (int) $row->getAttribute("{$prefix}_id")];
        }

        $relation = TrashDomain::ITEMS[$kind]['parent'] ?? null;

        if (! $relation) {
            return null;
        }

        $foreignKey = $row->{$relation}()->getForeignKeyName();

        return [TrashDomain::ITEMS[$kind]['module'], (int) $row->getAttribute($foreignKey)];
    }

    /**
     * სათაური — სხვადასხვა სქემა, სერვერი წყვეტს.
     *
     * ⚠️ **სერვერი და არა კლიენტი** — ნაწილს `title` აქვს, ნაწილს
     * `title_ka`/`title_en` აქსესორები, ფაილს `original_name`; ორივე მხარეს
     * ჩაწერილი რუკა პირველივე ახალ სახეზე დაშორდებოდა.
     */
    private function titleOf(string $kind, Model $row): string
    {
        foreach (['title_ka', 'title_en', 'title', 'name', 'original_name'] as $field) {
            $value = $row->getAttribute($field);

            if (is_string($value) && $value !== '') {
                return $value;
            }
        }

        if ($kind === 'gallery_video' && is_string($row->getAttribute('url'))) {
            return (string) $row->getAttribute('url');
        }

        $path = $row->getAttribute('path');

        return is_string($path) && $path !== '' ? basename($path) : '#'.$row->getKey();
    }

    /** მშობლის გარეშე ფოტოს ქვესათაური — ალბომის სახელი */
    private function albumName(Model $row): ?string
    {
        if (! $row instanceof GalleryImage || ! $row->album_id) {
            return null;
        }

        return GalleryAlbum::withoutGlobalScope('owner')->whereKey($row->album_id)->value('name');
    }

    /**
     * ესკიზი — `{src, private}` ან `null`.
     *
     * ⚠️ **პირადი დისკის ფაილი ურნის საკუთარ მარშრუტზე გადის**
     * (`/trash/{kind}/{id}/file`): `/storage/*` მას ვერ ხედავს, ფაილის
     * ჩვეულებრივი მარშრუტი კი ურნაში მყოფს 404-ით ხვდება.
     *
     * @return array{src: string, private: bool}|null
     */
    private function preview(string $kind, Model $row): ?array
    {
        if (TrashDomain::category($kind) === 'record') {
            // ⚠️ ჩანაწერს (`note`) მთავარი ფოტო შეიძლება საერთოდ არ ჰქონდეს
            if (! isset(self::RECORD_PREVIEW[$kind])) {
                return null;
            }

            [$column, $remote] = self::RECORD_PREVIEW[$kind] + [1 => null];

            $path = $row->getAttribute($column);
            if (is_string($path) && $path !== '') {
                return ['src' => $path, 'private' => false];
            }

            $url = $remote ? $row->getAttribute($remote) : null;

            return is_string($url) && str_starts_with($url, 'http') ? ['src' => $url, 'private' => false] : null;
        }

        if ($kind === 'gallery_video') {
            $url = $row->getAttribute('thumbnail_url');

            return is_string($url) && str_starts_with($url, 'http') ? ['src' => $url, 'private' => false] : null;
        }

        $path = (string) $row->getAttribute('path');
        $mime = (string) $row->getAttribute('mime');

        if ($path === '' || ! ($kind === 'gallery_image' || str_starts_with($mime, 'image/'))) {
            return null;
        }

        return StorageFolder::isPrivate($path)
            ? ['src' => "/trash/{$kind}/{$row->getKey()}/file", 'private' => true]
            : ['src' => $path, 'private' => false];
    }

    /**
     * ურნაში მყოფი ჩანაწერების მოცულობა — `kind:id → bytes`.
     *
     * ⚠️ **`StorageMeter::markTrash()` წყვეტს**, რომელ ფაილს რომელი ელემენტი
     * ეკუთვნის — იგივე „რა ითვლება"-ს ერთადერთი განმარტება, რასაც კვოტა
     * იყენებს. ცალკე ჯამი აქ ურნის რიცხვს საცავის რიცხვს დააშორებდა.
     *
     * @return array<string, int>
     */
    private function recordSizes(User $user): array
    {
        $sizes = [];

        foreach ($this->meter->markTrash($user, $this->meter->files($user)) as $file) {
            $key = $file['trash'] ?? null;

            if ($key && TrashDomain::category(strstr($key, ':', true)) === 'record') {
                $sizes[$key] = ($sizes[$key] ?? 0) + (int) $file['size'];
            }
        }

        return $sizes;
    }

    /** @return never */
    private function fail(string $code, int $status): void
    {
        throw new HttpResponseException(response()->json(['message' => $code], $status));
    }
}
