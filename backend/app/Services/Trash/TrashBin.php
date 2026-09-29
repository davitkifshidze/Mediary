<?php

namespace App\Services\Trash;

use App\Http\Controllers\Api\RecordCastController;
use App\Models\AuditLog;
use App\Models\CastMember;
use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Models\Message;
use App\Models\Module;
use App\Models\TrashedFile;
use App\Models\TrashedMessage;
use App\Models\TrashEntry;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use App\Services\Chat\ChatService;
use App\Services\Modules\CustomFieldService;
use App\Services\Storage\StorageMeter;
use App\Support\AlbumLock;
use App\Support\AuditLogTrash;
use App\Support\ColumnTrash;
use App\Support\DictionaryTrash;
use App\Support\MediaDomain;
use App\Support\SafeMime;
use App\Support\StatusDomain;
use App\Support\StorageFolder;
use App\Support\TrashDomain;
use App\Support\UserSettings;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Carbon;
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
 * ⚠️ **ხუთი სახის ელემენტი, ერთი გზა** (`TrashDomain::kinds()`): ჩანაწერი
 * და რიგიანი ელემენტი თავის `trashed_at`-ს ატარებს (`HasTrash`), ჩატისა და
 * ველის ფაილი, მთავარი ფოტო და ავატარი `trashed_files`-შია, მსახიობის
 * ბმული `trash_entries`-ში, ჩატის წერილი კი `trashed_messages`-ში — ⚠️ ეს
 * უკანასკნელი მხოლოდ „ჯერ კიდევ აღდგება"-ს ამბობს: წერილი ისედაც რჩება და
 * მისი ურნის რიგის წაშლა მას დამალულს ტოვებს.
 * კონტროლერი და გასუფთავების ბრძანება მხოლოდ ამ სერვისს იძახებენ — ორი
 * ადგილი, რომელიც „რა არის ურნაში"-ს ცალ-ცალკე დაწერდა, პირველივე ახალ
 * სახეზე დაშორდებოდა.
 *
 * ⚠️ **ფაილი ურნაში ადგილს იკავებს** (29.4) — კვოტა მხოლოდ საბოლოო წაშლისას
 * თავისუფლდება, ამიტომ სია თითო ელემენტის და მთელი ურნის მოცულობას ამბობს.
 * ჩანაწერის მოცულობაში მისი ფაილებიც ითვლება (პოსტერი, ფოტოები, ველის
 * ფაილები) — საბოლოო წაშლა სწორედ მათ ათავისუფლებს.
 *
 * ⚠️ **აღდგენის წესები (29.5)**: ელემენტი, რომლის ჩანაწერიც თვითონ ურნაშია,
 * ჩანაწერთან ერთად ბრუნდება (სხვაგვარად ის უხილავ ჩანაწერს მიებმებოდა);
 * გამორთული მოდულის ელემენტი ჩანს, მაგრამ აღდგენას მოდულის ჩართვა
 * სჭირდება; ჩაკეტილი ალბომის ფოტო ურნაშიც ჩაკეტილია (ესკიზი არ იგზავნება).
 */
final class TrashBin
{
    /** თითო ჯგუფზე რამდენი რიგი ჩანს */
    public const PER_GROUP = 50;

    /** ჩანიშვნის სათაურის სიგრძე — ტექსტი თვითონ სათაურია */
    private const EXCERPT = 80;

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

    /**
     * სახეები, რომელთა სათაური **მშობლისაა** — თვითონ მომენტია (ნახვა,
     * შეხსენება), რომელსაც გვერდი `when`-იდან ხატავს.
     */
    private const TITLED_BY_PARENT = ['media_watch', 'note_reminder'];

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
     * @return array{keep_days: int, max_days: int, bytes: int, data: list<array<string, mixed>>}
     */
    public function listing(User $user): array
    {
        // ⚠️ Tasks §29.6 — ვადა ამ ანგარიშისაა და არა კოდის მუდმივა
        $days = UserSettings::trashDays($user);
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
            $groupBytes = match (true) {
                $category === 'record' => array_sum(array_map(
                    fn (int $id) => $recordSizes["{$kind}:{$id}"] ?? 0,
                    (clone $query)->pluck('id')->map(fn ($id) => (int) $id)->all(),
                )),
                $this->sized($kind) => (int) (clone $query)->sum('size'),
                default => 0,
            };

            $rows = (clone $query)->orderByDesc('trashed_at')->orderByDesc('id')->limit(self::PER_GROUP)->get();

            // ⚠️ ეტაპი 5 — სათაური, თანამოსაუბრე და „აღდგება?" ერთი ჩატვირთვით, თითო რიგზე მოთხოვნის გარეშე
            if ($category === 'message') {
                $rows->load(['message.hides', 'message.conversation.participants']);
            }

            $parents = $this->parents($kind, $rows);
            $moduleKey = $this->moduleOf($kind);
            $module = $moduleKey ? $modules->get($moduleKey) : null;

            $groups[] = [
                'kind' => $kind,
                'category' => $category,
                'module' => $moduleKey ?? match ($kind) {
                    'database_backup' => 'backup',
                    'chat_file', 'chat_message' => 'chat',
                    // ეტაპი 7 — აუდიტის ლოგის გასუფთავება (ფერი ინსტრუმენტისაა)
                    AuditLogTrash::KIND => 'audit',
                    default => null,
                },
                'name_ka' => $category === 'record' ? $module?->name_ka : null,
                'name_en' => $category === 'record' ? $module?->name_en : null,
                'icon' => $module?->icon,
                'color' => $module?->color,
                'total' => $total,
                'bytes' => $groupBytes,
                'items' => $rows->map(fn (Model $row) => $this->item($user, $kind, $row, $parents[$row->getKey()] ?? null, $recordSizes, $locked, $days))->all(),
            ];

            $bytes += $groupBytes;
        }

        return [
            'keep_days' => $days,
            'max_days' => TrashDomain::maxDays(),
            'bytes' => $bytes,
            'data' => $groups,
        ];
    }

    /**
     * **ვადის შეცვლის გადახედვა** (Tasks §29.6) — `/settings`-ის გაფრთხილება.
     *
     * ⚠️ ვადის შემოკლება ურნაში **უკვე მყოფზეც** მოქმედებს მომდევნო ღამის
     * გასუფთავებისას, ამიტომ შენახვამდე უნდა ითქვას, რამდენი წაიშლება.
     * რიცხვი იმ მომენტზე ითვლება, როცა გასუფთავება ნამდვილად გაეშვება
     * (`nextPruneAt()`), და არა „ახლაზე".
     *
     * ⚠️ **ყველა სახე ითვლება და არა მხოლოდ ხილული** — გასუფთავება ყველაფერს
     * შლის, რაც ამ ანგარიშისაა (უფლება ჩამორთმეული მოდულის ელემენტსაც), ე.ი.
     * რიცხვი მეტს იტყვის და არა ნაკლებს.
     *
     * @return array{days: int, saved_days: int, default_days: int, max_days: int, prune_at: string, expiring: int}
     */
    public function retention(User $user, ?int $days = null): array
    {
        $saved = UserSettings::trashDays($user);
        $days = $days === null ? $saved : TrashDomain::clampDays($days);
        $before = self::nextPruneAt()->subDays($days);
        $expiring = 0;

        foreach (TrashDomain::kinds() as $kind) {
            $expiring += self::expiredQuery($kind, $before)->where('user_id', $user->getKey())->count();
        }

        return [
            'days' => $days,
            'saved_days' => $saved,
            'default_days' => TrashDomain::defaultDays(),
            'max_days' => TrashDomain::maxDays(),
            // §34.1 — სუპერადმინის რედაქტორისთვის: რა იქნება, თუ ცვლილებას მოხსნის
            'default_max_days' => TrashDomain::configMaxDays(),
            'max_days_ceiling' => TrashDomain::MAX_DAYS_CEILING,
            'prune_at' => (string) config('mediary.trash.prune_at', '03:30'),
            'expiring' => $expiring,
        ];
    }

    /** როდის გაეშვება მომდევნო `trash:prune` — განრიგის (`mediary.trash.prune_at`) მიხედვით */
    public static function nextPruneAt(): Carbon
    {
        $at = now()->setTimeFromTimeString((string) config('mediary.trash.prune_at', '03:30'));

        return $at->lessThanOrEqualTo(now()) ? $at->addDay() : $at;
    }

    /**
     * ერთი რიგი ფრონტისთვის.
     *
     * @param  array{kind: string, id: int, title: string, trashed: bool}|null  $parent
     * @param  array<string, int>  $recordSizes
     * @param  array<int, int>  $locked
     * @return array<string, mixed>
     */
    private function item(User $user, string $kind, Model $row, ?array $parent, array $recordSizes, array $locked, int $days): array
    {
        $category = TrashDomain::category($kind);
        $isLocked = $row instanceof GalleryImage && $row->album_id && isset($locked[(int) $row->album_id]);
        $blocked = $this->blocked($user, $kind, $row, $parent, strict: false);
        $byParent = in_array($kind, self::TITLED_BY_PARENT, true) && $parent;
        $chat = $row instanceof TrashedMessage;

        return [
            'id' => (int) $row->getKey(),
            'title' => match (true) {
                $chat => $this->messageTitle($row->message),
                $byParent => $parent['title'],
                default => $this->titleOf($kind, $row),
            },
            // ⚠️ ჩატის წერილზე — ვისთან იყო მიმოწერა (ის სერვერმა იცის, ენას არ ეკითხება)
            'subtitle' => match (true) {
                $chat => $this->messagePartner($user, $row->message),
                $byParent => null,
                default => $parent['title'] ?? $this->albumName($row),
            },
            'trashed_at' => $row->trashed_at?->toIso8601String(),
            /* ⚠️ რჩება თუ არა დრო — სერვერი ითვლის, რადგან ვადა ამ ანგარიშის
               პარამეტრია (`UserSettings::trashDays()`, ზღვრით შეკვეცილი) და
               კლიენტში მისი ასლი პირველივე შეცვლაზე დაშორდებოდა. */
            'expires_in_days' => max(0, $days - (int) $row->trashed_at?->diffInDays(now())),
            'size' => match (true) {
                $category === 'record' => $recordSizes["{$kind}:{$row->getKey()}"] ?? 0,
                $this->sized($kind) => (int) $row->getAttribute('size'),
                default => 0,
            },
            'preview' => $isLocked ? null : $this->preview($kind, $row),
            'locked' => $isLocked,
            // მომენტი, რომელიც თვითონ ელემენტია — ნახვის დრო, შეხსენების შემდეგი გაგზავნა
            'when' => match ($kind) {
                'media_watch' => $row->watched_at?->toIso8601String(),
                'note_reminder' => ($row->next_at ?? $row->remind_at)?->toIso8601String(),
                // ჩატის წერილი — როდის გაიგზავნა (ურნაში როდის მოხვდა, `trashed_at` ამბობს)
                'chat_message' => $row->message?->created_at?->toIso8601String(),
                default => null,
            },
            // ⚠️ ეტაპი 5 — „მხოლოდ ჩემთან" თუ „ორივესთან"; ტექსტი კლიენტისაა (ენა)
            'scope' => $chat ? $row->scope : null,
            // ალბომზე — რამდენ ფოტოს დააბრუნებს; კლასიფიკატორზე — რამდენ ჩანაწერს შემოგთავაზებს
            'count' => match (true) {
                $kind === 'gallery_album' => count($row->trashed_photo_ids['ids'] ?? []),
                // ეტაპი 7 — რამდენი ლოგის რიგი დაბრუნდება (სათაურს კლიენტი აწყობს — ენა)
                $kind === AuditLogTrash::KIND => AuditLogTrash::count($row),
                DictionaryTrash::has($kind) => DictionaryTrash::remembered($row),
                default => null,
            },
            // მრავალმოდულიან ჯგუფში (სტატუსი, ნახვა, ველის ფაილი) — რომელ მოდულს ეკუთვნის
            'module' => $this->rowModule($kind, $row),
            // ⚠️ კლასიფიკატორზე — შეიძლება თუ არა „ჩანაწერებთან ერთად" აღდგენა (ეტაპი 3)
            'offers_records' => DictionaryTrash::has($kind) && DictionaryTrash::remembered($row) > 0,
            'parent' => $parent,
            'restorable' => $blocked === null,
            'blocked' => $blocked,
            // ⚠️ ეტაპი 4 — სვეტი დაკავებულია, მაგრამ აღდგენა ახლანდელს ჩაანაცვლებს (ის თვითონ ურნაში გადავა)
            'replaceable' => $blocked === 'slot_taken' && in_array($kind, ['record_photo', 'avatar'], true),
        ];
    }

    /**
     * ურნის ელემენტების query ერთ სახეზე.
     *
     * ⚠️ **მრავალმოდულიან სახეზე მხოლოდ ნებადართული მოდულები** — ველის
     * ფაილი, ყურების ჟურნალი და მსახიობის ბმული რამდენიმე მოდულს ემსახურება
     * და უფლება მოდულისაა.
     */
    private function query(User $user, string $kind): Builder
    {
        $userId = (int) $user->getKey();

        return match (TrashDomain::category($kind)) {
            'record' => TrashDomain::model($kind)::trashOf($userId),
            'item' => TrashDomain::ITEMS[$kind]['model']::trashOf($userId)
                ->when(isset(TrashDomain::ITEMS[$kind]['module_column']), fn (Builder $q) => $q->whereIn(
                    TrashDomain::ITEMS[$kind]['module_column'],
                    $this->permitted($user, $this->columnModules($kind), 'delete'),
                )),
            'file' => TrashedFile::withoutGlobalScope('owner')
                ->where('user_id', $userId)
                ->where('kind', $kind)
                ->when($kind === 'field_file', fn (Builder $q) => $q->whereIn(
                    'record_type',
                    $this->permitted($user, TrashDomain::domains(), 'delete'),
                ))
                // ⚠️ მთავარი ფოტოს მოშორება ჩანაწერის რედაქტირებაა — უფლება `update`
                ->when($kind === 'record_photo', fn (Builder $q) => $q->whereIn(
                    'record_type',
                    $this->permitted($user, TrashDomain::domains(), 'update'),
                )),
            // ეტაპი 5 — ჩატის წერილი; მოდული და უფლება არ აქვს, ყველას თავისი ეკუთვნის
            'message' => TrashedMessage::withoutGlobalScope('owner')->where('user_id', $userId),
            default => TrashEntry::withoutGlobalScope('owner')
                ->where('user_id', $userId)
                ->where('kind', $kind)
                // ⚠️ აუდიტის ელემენტს მოდული არ აქვს — ის გამწმენდისაა (`AuditLogTrash`)
                ->when($kind !== AuditLogTrash::KIND, fn (Builder $q) => $q->whereIn(
                    'record_type',
                    $this->permitted($user, MediaDomain::TYPES, (string) TrashDomain::ENTRIES[$kind]['permission']),
                )),
        };
    }

    /**
     * სვეტიდან მოდულიან სახეზე — რომელი მოდულები შეიძლება იყოს იქ.
     *
     * @return list<string>
     */
    private function columnModules(string $kind): array
    {
        return $kind === 'status' ? array_keys(StatusDomain::DOMAINS) : MediaDomain::TYPES;
    }

    /**
     * @param  list<string>  $modules
     * @return list<string>
     */
    private function permitted(User $user, array $modules, string $action): array
    {
        return array_values(array_filter($modules, fn (string $m) => $user->hasPermission($m, $action)));
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
     * ⚠️ **`$withRecords` მხოლოდ კლასიფიკატორზე მოქმედებს** (Tasks §29, ეტაპი 3):
     * წაშლამ გადატანილი ჩანაწერები ბრუნდება — ის, ვინც მას შემდეგ არ შეცვლილა.
     * ნაგულისხმევი — მხოლოდ რიგი (Q21-ის „დ"-ს მიღებული შეზღუდვა).
     *
     * @return array{restored: true, with_parent: bool, records: int}
     */
    public function restore(User $user, string $kind, int $id, bool $withRecords = false, bool $replace = false): array
    {
        $row = $this->find($user, $kind, $id);
        $parent = $this->parents($kind, collect([$row]))[$row->getKey()] ?? null;

        $reason = $this->blocked($user, $kind, $row, $parent, strict: true);

        // ⚠️ ეტაპი 4 — დაკავებული სვეტი მხოლოდ ცხადი „ჩანაცვლებით" (29.2 — „სხვაგვარად ჯერ იკითხავს")
        if ($reason && ! ($reason === 'slot_taken' && $replace && in_array($kind, ['record_photo', 'avatar'], true))) {
            $this->fail($reason, 409);
        }

        $withParent = false;
        $records = 0;

        DB::transaction(function () use ($user, $kind, $row, $parent, $withRecords, $replace, &$withParent, &$records) {
            if ($parent && $parent['trashed']) {
                TrashDomain::model($parent['kind'])::trashOf((int) $user->getKey())->find($parent['id'])?->restoreFromTrash();
                $withParent = true;
            }

            // ეტაპი 7 — აუდიტის ლოგის რიგები ლოგში ბრუნდება, ელემენტი ქრება
            if ($row instanceof TrashEntry && $row->kind === AuditLogTrash::KIND) {
                $count = AuditLogTrash::restore($row);

                $this->audit->log(AuditLog::ACTION_RESTORE, [
                    'subject_type' => AuditLogTrash::KIND,
                    'subject_id' => $row->getKey(),
                    'subject_label' => (string) $count,
                    'new_values' => ['rows' => $count, 'trashed' => false],
                ]);

                return;
            }

            if ($row instanceof TrashEntry) {
                $this->restoreCastLink($row);

                return;
            }

            // ეტაპი 5 — დამალვის მოხსნა ან `removed_at`-ის გასუფთავება; ურნის რიგი ქრება
            if ($row instanceof TrashedMessage) {
                $label = $this->messageTitle($row->message);
                $reason = $this->chat->restoreMessage($row);

                if ($reason) {
                    $this->fail($reason, 409);
                }

                $this->audit->log(AuditLog::ACTION_RESTORE, [
                    'module' => 'chat',
                    'subject_type' => 'message',
                    'subject_id' => $row->message_id,
                    'subject_label' => $label,
                    'new_values' => ['scope' => $row->scope, 'trashed' => false],
                ]);

                return;
            }

            if ($row instanceof TrashedFile) {
                $reason = match ($row->kind) {
                    'chat_file' => $this->chat->restoreAttachment($row),
                    'record_photo' => ColumnTrash::restore(
                        TrashDomain::model($row->record_type)::withoutGlobalScopes()->findOrFail($row->record_id),
                        $row,
                        $replace,
                    ),
                    'avatar' => ColumnTrash::restore($user, $row, $replace),
                    default => $this->custom->restoreFile($user, $row),
                };

                if ($reason) {
                    $this->fail($reason, 409);
                }

                $this->audit->log(AuditLog::ACTION_RESTORE, [
                    'module' => match ($row->kind) {
                        'chat_file' => 'chat',
                        'avatar' => null,
                        default => $row->record_type,
                    },
                    'subject_type' => $row->kind,
                    'subject_id' => $row->record_id,
                    'subject_label' => $row->name,
                    'new_values' => ['trashed' => false],
                ]);

                return;
            }

            // ⚠️ ჟურნალს `HasTrash` წერს; გვერდითი ეფექტები `afterTrashChange()`-შია
            $row->restoreFromTrash();

            if (DictionaryTrash::has($kind)) {
                if ($withRecords) {
                    $records = DictionaryTrash::restoreRecords($row, $kind);
                } else {
                    DictionaryTrash::forget($row);
                }
            }
        });

        return ['restored' => true, 'with_parent' => $withParent, 'records' => $records];
    }

    /**
     * ახლავე წაშლა — **ნამდვილად**.
     *
     * ⚠️ **აქ `delete()`-ია და არა `moveToTrash()`** — ელემენტი უკვე ურნაშია,
     * ე.ი. მოვლენები უნდა გაისროლოს: ფაილი დისკიდან, კვოტა, გალერეა და
     * pivot-ები სწორედ ახლა თავისუფლდება. ⚠️ მსახიობის ბმულზე მხოლოდ ურნის
     * ჩანაწერი იშლება — TMDB-ის საფლავის ქვა რჩება, თორემ სინქრონიზაცია მას
     * დააბრუნებდა. ⚠️ ჩატის წერილზეც მხოლოდ ურნის რიგი იშლება (ეტაპი 5) —
     * წერილი §4.6-ის წესით ბაზაში რჩება, უბრალოდ აღარ აღდგება.
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

        // ⚠️ მხოლოდ ფაილის მქონე სახეები
        abort_unless($this->hasFile($kind), 404);

        if ($row instanceof GalleryImage && $row->album_id) {
            $album = GalleryAlbum::withoutGlobalScopes(['owner', 'trash'])->find($row->album_id);
            abort_if($album && ! AlbumLock::isUnlocked($album), 404);
        }

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
     * ნაწილებს მშობლის `deleting` თვითონ შლის.
     *
     * ⚠️ **ვადა თითო ანგარიშისაა** (Tasks §29.6): ანგარიშები ვადის მიხედვით
     * ჯგუფდება (`retentionGroups()`) და თითო ჯგუფი თავისი ზღვრით იწმინდება.
     * `$days` ყველას ერთ ვადას აძალებს — ტესტისა და ხელით გაშვებისთვის (`--days`).
     *
     * @return array<string, int> სახე → რამდენი წაიშალა (ან იწაშლებოდა `$dry`-ზე)
     */
    public static function prune(?int $days = null, bool $dry = false): array
    {
        $counts = [];

        foreach (self::retentionGroups($days) as [$keep, $scope]) {
            $before = now()->subDays($keep);

            foreach (TrashDomain::kinds() as $kind) {
                $query = $scope(self::expiredQuery($kind, $before));
                $count = (clone $query)->count();

                if ($count === 0) {
                    continue;
                }

                if (! $dry) {
                    foreach ($query->lazyById() as $row) {
                        $row->delete();
                    }
                }

                $counts[$kind] = ($counts[$kind] ?? 0) + $count;
            }
        }

        return $counts;
    }

    /**
     * ურნაში `$before`-მდე მოხვედრილი ერთ სახეზე — **ყველა ანგარიშის**
     * (ანგარიშს გამომძახებელი ირჩევს).
     */
    private static function expiredQuery(string $kind, CarbonInterface $before): Builder
    {
        return match (TrashDomain::category($kind)) {
            'record' => TrashDomain::model($kind)::trashedBefore($before),
            'item' => TrashDomain::ITEMS[$kind]['model']::trashedBefore($before),
            'file' => TrashedFile::withoutGlobalScope('owner')->where('kind', $kind)->where('trashed_at', '<=', $before),
            // ⚠️ მხოლოდ ურნის რიგი იშლება — წერილი დამალული რჩება
            'message' => TrashedMessage::withoutGlobalScope('owner')->where('trashed_at', '<=', $before),
            default => TrashEntry::withoutGlobalScope('owner')->where('kind', $kind)->where('trashed_at', '<=', $before),
        };
    }

    /**
     * ანგარიშები ვადის მიხედვით — `[დღეები, query-ს შემზღუდველი]`.
     *
     * ⚠️ **ნაგულისხმევი ჯგუფი `whereNotIn`-ია** და არა ყველა ანგარიშის
     * ჩამოთვლა: ანგარიშების უმეტესობას ვადა არ შეუცვლია, და `whereIn`
     * ყველა id-ით ყოველ ღამე ანგარიშების რიცხვზე გაიზრდებოდა.
     *
     * @return list<array{0: int, 1: \Closure(Builder): Builder}>
     */
    private static function retentionGroups(?int $days): array
    {
        if ($days !== null) {
            return [[$days, fn (Builder $query) => $query]];
        }

        $default = TrashDomain::defaultDays();
        $custom = [];

        foreach (User::query()->whereNotNull('settings')->select(['id', 'settings'])->lazyById() as $user) {
            $own = UserSettings::trashDays($user);

            if ($own !== $default) {
                $custom[$own][] = (int) $user->getKey();
            }
        }

        $others = array_merge([], ...array_values($custom));
        $groups = [[$default, fn (Builder $query) => $query->whereNotIn('user_id', $others)]];

        foreach ($custom as $own => $ids) {
            $groups[] = [(int) $own, fn (Builder $query) => $query->whereIn('user_id', $ids)];
        }

        return $groups;
    }

    /* ============================================================
       დამხმარეები
       ============================================================ */

    /**
     * ხილვადობა — ვის რა ეკუთვნის ურნაში.
     *
     * ⚠️ **უფლება `delete`-ია და არა `view`** (FEAT-11): ურნა წაშლის
     * გაგრძელებაა (მსახიობის ბმულზე — `update`, რადგან მისი მოხსნა ჩანაწერის
     * რედაქტირებაა). ⚠️ **მოდულის ჩართულობა აქ არ მოწმდება** (29.5) —
     * გამორთული მოდულის ელემენტი ჩანს, მაგრამ აღდგენა მას ითხოვს
     * (`blocked()`). ბაზის ასლი მხოლოდ `super_admin`-ს ეკუთვნის.
     */
    private function visible(User $user, string $kind): bool
    {
        $category = TrashDomain::category($kind);

        return match (true) {
            $kind === 'database_backup' => $user->isSuperAdmin(),
            $category === 'file', $category === 'message' => true,
            // ⚠️ აუდიტის ელემენტი ყოველთვის ჩანს — უფლება მხოლოდ აღდგენას ეკითხება (29.8)
            $kind === AuditLogTrash::KIND => true,
            $category === 'entry' => $this->permitted($user, MediaDomain::TYPES, (string) TrashDomain::ENTRIES[$kind]['permission']) !== [],
            $category === 'item' && isset(TrashDomain::ITEMS[$kind]['module_column']) => $this->permitted($user, $this->columnModules($kind), 'delete') !== [],
            default => ($module = $this->moduleOf($kind)) !== null && $user->hasPermission($module, 'delete'),
        };
    }

    /** სახის მოდული — ჩანაწერზე თვითონ, რიგიან ელემენტზე `ITEMS`-იდან; მრავალმოდულიანზე `null` */
    private function moduleOf(string $kind): ?string
    {
        return match (TrashDomain::category($kind)) {
            'record' => $kind,
            'item' => TrashDomain::ITEMS[$kind]['module'],
            default => null,
        };
    }

    /** ერთი რიგის მოდული — მრავალმოდულიან სახეზე რიგიდან იკითხება */
    private function rowModule(string $kind, Model $row): ?string
    {
        return match (true) {
            $row instanceof TrashEntry => $row->record_type,
            $row instanceof TrashedFile => in_array($row->kind, ['field_file', 'record_photo'], true) ? $row->record_type : null,
            isset(TrashDomain::ITEMS[$kind]['module_column']) => (string) $row->getAttribute(TrashDomain::ITEMS[$kind]['module_column']),
            default => $this->moduleOf($kind),
        };
    }

    /** აქვს თუ არა სახეს `size` სვეტი */
    private function sized(string $kind): bool
    {
        return match (TrashDomain::category($kind)) {
            'item' => TrashDomain::ITEMS[$kind]['size'],
            'file' => true,
            default => false,
        };
    }

    /** ფაილის მქონე სახე — ესკიზის მარშრუტისთვის */
    private function hasFile(string $kind): bool
    {
        return TrashDomain::category($kind) === 'file'
            || ($this->sized($kind) && $kind !== 'database_backup');
    }

    /**
     * რატომ ვერ ბრუნდება (ან `null`).
     *
     * `$strict = false` სიისთვისაა და მხოლოდ იაფ შემოწმებებს აკეთებს;
     * `true` — აღდგენისას, სადაც ველის სისავსეც მოწმდება.
     *
     * ⚠️ **კოდები `lib/errors.ts`-ის `CODES`-შია ხელით** — აქ ისინი ცვლადიდან
     * ბრუნდება და `scripts/error-codes.mjs` მათ ვერ ხედავს.
     *
     * @param  array{kind: string, id: int, title: string, trashed: bool}|null  $parent
     */
    private function blocked(User $user, string $kind, Model $row, ?array $parent, bool $strict): ?string
    {
        $module = $this->rowModule($kind, $row);

        if ($module && ! $user->hasModule($module)) {
            return 'module_disabled';
        }

        if ($parent && $parent['trashed']
            && (! $user->hasModule($parent['kind']) || ! $user->hasPermission($parent['kind'], 'delete'))) {
            return 'parent_blocked';
        }

        if ($row instanceof TrashedMessage) {
            return $this->chat->restoreBlocked($row);
        }

        if ($row instanceof TrashedFile && $row->kind === 'chat_file') {
            $message = Message::find($row->record_id);

            if (! $message) {
                return 'parent_missing';
            }

            return $message->attachment_path ? 'slot_taken' : null;
        }

        if ($row instanceof TrashedFile && in_array($row->kind, ['record_photo', 'avatar'], true)) {
            $owner = $row->kind === 'avatar'
                ? $user
                : ($parent ? TrashDomain::model($row->record_type)::withoutGlobalScopes()->find($row->record_id) : null);

            if (! $owner) {
                return 'parent_missing';
            }

            // ⚠️ სვეტი დაკავებულია — `replaceable` ღილაკი ახლანდელს ჩაანაცვლებს
            return $owner->getAttribute((string) $row->slot) ? 'slot_taken' : null;
        }

        if ($row instanceof TrashedFile && $row->kind === 'field_file') {
            if (! $parent) {
                return 'parent_missing';
            }

            if ($this->custom->typeOf($user, (string) $row->record_type, (string) $row->slot) !== 'file') {
                return 'field_missing';
            }
        }

        // ⚠️ ეტაპი 7 — როლი რომ დაკარგოს, ელემენტი ჩანს, მაგრამ აღდგენა `admin:audit`-ს ითხოვს
        if ($row instanceof TrashEntry && $row->kind === AuditLogTrash::KIND) {
            return $user->hasAdminAccess('audit', 'delete') ? null : 'permission_missing';
        }

        if ($row instanceof TrashEntry) {
            if (! $parent) {
                return 'parent_missing';
            }

            if ($this->castLinked($row)) {
                return 'already_present';
            }
        }

        return null;
    }

    /** მსახიობი ჩანაწერს უკვე ისევ ახლავს (და არა როგორც საფლავის ქვა) */
    private function castLinked(TrashEntry $entry): bool
    {
        $record = TrashDomain::model($entry->record_type)::withoutGlobalScopes()->find($entry->record_id);

        return $record !== null && $record->cast()->whereKey((int) $entry->slot)->exists();
    }

    /**
     * **მსახიობის ბმულის აღდგენა** — საფლავის ქვის მოხსნა ან ბმულის თავიდან
     * დასმა, იმავე როლით, რიგით და ნიშნებით.
     *
     * ⚠️ `is_manual = true` თავიდან დასმულზე — `CastSync` სხვაგვარად TMDB-ის
     * სიაში არმყოფ ადამიანს შემდეგივე სინქრონიზაციით მოხსნიდა.
     */
    private function restoreCastLink(TrashEntry $entry): void
    {
        $record = TrashDomain::model($entry->record_type)::withoutGlobalScopes()->findOrFail($entry->record_id);
        $member = CastMember::find((int) $entry->slot);

        if (! $member) {
            $this->fail('parent_missing', 409);
        }

        $payload = $entry->payload ?? [];
        $pivot = [
            'character' => $payload['character'] ?? null,
            'billing_order' => (int) ($payload['billing_order'] ?? 0),
            'is_manual' => ($payload['is_manual'] ?? false) || ! ($payload['tombstone'] ?? false),
            'is_hidden' => (bool) ($payload['is_hidden'] ?? false),
            'is_edited' => (bool) ($payload['is_edited'] ?? false),
            'is_removed' => false,
        ];

        if ($record->castLinks()->whereKey($member->id)->exists()) {
            $record->castLinks()->updateExistingPivot($member->id, $pivot);
        } else {
            $record->castLinks()->attach($member->id, $pivot);
        }

        RecordCastController::forgetTrashed($record, $member->id);

        $this->audit->log(AuditLog::ACTION_CAST_ATTACH, [
            'module' => $entry->record_type,
            'subject_type' => $entry->record_type,
            'subject_id' => $entry->record_id,
            'subject_label' => $member->name,
            'new_values' => ['cast_member_id' => $member->id, 'restored' => true],
        ]);
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
        if ($row instanceof TrashedFile || $row instanceof TrashEntry) {
            $applies = $row instanceof TrashEntry || in_array($row->kind, ['field_file', 'record_photo'], true);

            return $applies && $row->record_type && TrashDomain::category($row->record_type) === 'record'
                ? [$row->record_type, (int) $row->record_id]
                : null;
        }

        $relation = TrashDomain::ITEMS[$kind]['parent'] ?? null;

        if (! $relation) {
            return null;
        }

        $link = $row->{$relation}();

        // polymorphic მშობელი — ფოტო, ვიდეო-ბმული, ნახვა
        if ($link instanceof MorphTo) {
            $type = (string) $row->getAttribute($link->getMorphType());

            if ($type === '' || ! ($type === 'cast_member' || TrashDomain::category($type) === 'record')) {
                return null;
            }

            return [$type, (int) $row->getAttribute($link->getForeignKeyName())];
        }

        return [TrashDomain::ITEMS[$kind]['module'], (int) $row->getAttribute($link->getForeignKeyName())];
    }

    /**
     * სათაური — სხვადასხვა სქემა, სერვერი წყვეტს.
     *
     * ⚠️ **სერვერი და არა კლიენტი** — ნაწილს `title` აქვს, ნაწილს
     * `title_ka`/`title_en` აქსესორები, ფაილს `original_name`, მსახიობის
     * ბმულს `label`, ჩანიშვნას კი ტექსტი (`body`); ორივე მხარეს ჩაწერილი
     * რუკა პირველივე ახალ სახეზე დაშორდებოდა.
     */
    private function titleOf(string $kind, Model $row): string
    {
        foreach (['title_ka', 'title_en', 'title', 'name', 'name_ka', 'name_en', 'label', 'original_name'] as $field) {
            $value = $row->getAttribute($field);

            if (is_string($value) && $value !== '') {
                return $value;
            }
        }

        $body = $row->getAttribute('body');
        if (is_string($body) && trim($body) !== '') {
            $body = trim(preg_replace('/\s+/u', ' ', $body));

            return mb_strlen($body) > self::EXCERPT ? mb_substr($body, 0, self::EXCERPT).'…' : $body;
        }

        if ($kind === 'gallery_video' && is_string($row->getAttribute('url'))) {
            return (string) $row->getAttribute('url');
        }

        $path = $row->getAttribute('path');

        return is_string($path) && $path !== '' ? basename($path) : '#'.$row->getKey();
    }

    /**
     * ჩატის წერილის სათაური — ტექსტი, ფაილის სახელი ან გაზიარებული ჩანაწერი.
     *
     * ⚠️ მედიის წერილს ტექსტი ხშირად საერთოდ არ აქვს (ძებნის იგივე მიზეზი —
     * `attachment_name`-საც ეძებს), GIF-ის ტექსტი კი ბმულია და სათაურად
     * არაფერს ამბობს.
     */
    private function messageTitle(?Message $message): string
    {
        if (! $message) {
            return '#';
        }

        $body = trim(preg_replace('/\s+/u', ' ', (string) $message->body));

        return match (true) {
            $message->type === 'gif' => 'GIF',
            $body !== '' => mb_strlen($body) > self::EXCERPT ? mb_substr($body, 0, self::EXCERPT).'…' : $body,
            filled($message->attachment_name) => (string) $message->attachment_name,
            $message->type === Message::TYPE_RECORD && filled($message->record['title'] ?? null) => (string) $message->record['title'],
            default => '#'.$message->getKey(),
        };
    }

    /** ვისთან იყო მიმოწერა — სახელი, ან `null`, თუ მეორე მხარე აღარ არსებობს */
    private function messagePartner(User $user, ?Message $message): ?string
    {
        $other = $message?->conversation?->otherThan((int) $user->getKey());

        return $other ? ($other->name ?: $other->username) : null;
    }

    /** მშობლის გარეშე ფოტოს ქვესათაური — ალბომის სახელი */
    private function albumName(Model $row): ?string
    {
        if (! $row instanceof GalleryImage || ! $row->album_id) {
            return null;
        }

        return GalleryAlbum::withoutGlobalScopes(['owner', 'trash'])->whereKey($row->album_id)->value('name');
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
        $category = TrashDomain::category($kind);

        if ($category === 'record') {
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

        // მსახიობის ფოტო — გლობალური ლექსიკონისაა და საჯარო დისკზეა
        if ($row instanceof TrashEntry) {
            $photo = $row->payload['photo_path'] ?? null;

            return is_string($photo) && $photo !== '' ? ['src' => $photo, 'private' => false] : null;
        }

        if ($kind === 'gallery_video' || $kind === 'game_video') {
            $url = $row->getAttribute('thumbnail_url');

            return is_string($url) && str_starts_with($url, 'http') ? ['src' => $url, 'private' => false] : null;
        }

        if (! $this->hasFile($kind)) {
            return null;
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
