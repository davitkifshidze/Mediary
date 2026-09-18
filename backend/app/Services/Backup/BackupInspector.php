<?php

namespace App\Services\Backup;

use App\Models\DatabaseBackup;
use App\Support\AppTime;
use App\Support\Like;
use App\Support\RestoreScope;
use App\Support\StorageFolder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * **ბაზის ასლის ვიუერი — დროებით ბაზაში იმპორტით (Tasks §11.3).**
 *
 * შენი სიტყვები: „კონკრეტული თეიბლის ჩანაწერების ნახვა — რამე ვიუვერი
 * რომ იყოს".
 *
 * ⚠️ **პარსერი განზრახ არ დაიწერა.** `mysqldump` `--complete-insert`-ს არ
 * იყენებს, ე.ი. სვეტების სახელები `INSERT`-ში საერთოდ არ წერია და
 * `CREATE TABLE`-ის პარსერიც დასჭირდებოდა; ტუპლების დაშლა კი ნამდვილი
 * მდგომარეობის მანქანაა (`\0 \n \r \\ \' \" \Z`, მძიმეები და ფრჩხილები
 * ტექსტის შიგნით) — ანუ კოდი, რომელიც **ჩუმად** ცდება. ამას ზემოდან
 * ყოველი გვერდი მთელ ფაილს ახლიდან დაშლიდა (`gzseek` შემთხვევითი წვდომა
 * არ არის).
 *
 * ⚠️ **იმპორტი გაზომილია: 4.2 მბ SQL → 1.5 წამი.** შემდეგ ყოველი კითხვა
 * ნამდვილი SQL-ია — გვერდები, სორტირება, ფილტრი, `COUNT(*)`.
 *
 * ⚠️ **პატიოსანი ფასი**: MySQL-ის დისკზე მონაცემის მეორე ასლი ჩნდება,
 * რომელსაც **კვოტა ვერ ხედავს** (ის ფაილი არაა). ინტერფეისი ამას ცხადად
 * ამბობს და ვიუერის დახურვა ბაზას შლის.
 *
 * ⚠️ **ცხრილისა და სვეტის სახელი არასდროს ინტერპოლირდება „როგორც მოვიდა".**
 * ისინი `information_schema`-ს მიხედვით მოწმდება და მხოლოდ ცნობილი სახელი
 * ეწერება query-ში — SQL-ინექციის ერთადერთი კარი სწორედ იდენტიფიკატორია
 * (მნიშვნელობებს bindings ფარავს).
 *
 * ⚠️ **მხოლოდ MySQL.** sqlite-ზე (ტესტები) `available()` false-ია და
 * endpoint 503-ს აბრუნებს — `mysqldump_unavailable`-ის იგივე წესი.
 */
class BackupInspector
{
    /**
     * მიტოვებული ვიუერის ვადა (Tasks GAP-16).
     *
     * ⚠️ ორი საათი იმიტომ, რომ ეს **სამუშაო სესიის** ხანგრძლივობაა: ღია
     * ტაბს არ ვწყვეტთ, მიტოვებულს კი დიდხანს არ ვტოვებთ.
     */
    public const STALE_HOURS = 2;

    /** ერთ გვერდზე მაქსიმუმ რამდენი რიგი */
    public const MAX_PER_PAGE = 200;

    public function __construct(private DatabaseDumper $dumper) {}

    /**
     * ⚠️ **ორივე პირობა საჭიროა და მეორე გამორჩენილი იყო (Tasks GAP-16).**
     * კლასის docblock ამბობს „sqlite-ზე `available()` false-ია", სინამდვილეში
     * კი მხოლოდ `mysql` **ბინარს** ეკითხებოდა — ე.ი. დეველოპერულ მანქანაზე,
     * სადაც XAMPP-ის კლიენტი დაყენებულია, sqlite-ზეც `true` ბრუნდებოდა და
     * `drop database` sqlite-ს პირდაპირ მიდიოდა (`near "database": syntax
     * error`). ეს ქცევა GAP-16-ის `deleting` ჰუკამდე უბრალოდ არავის ეხებოდა,
     * რადგან ვიუერს ტესტი არ ხსნიდა.
     */
    public function available(): bool
    {
        return DB::connection()->getDriverName() === 'mysql' && $this->dumper->restoreAvailable();
    }

    /**
     * დროებითი ბაზის სახელი.
     *
     * ⚠️ **მოქმედი ბაზის სახელიდან იწარმოება** — ე.ი. ორი ინსტალაცია ერთ
     * სერვერზე ერთმანეთს არ გადააწერს. `id` კი იმას უზრუნველყოფს, რომ ორი
     * ასლი ერთდროულად იყოს გახსნილი.
     */
    public function databaseName(DatabaseBackup $backup): string
    {
        return $this->mainDatabase().'_inspect_'.$backup->id;
    }

    public function isOpen(DatabaseBackup $backup): bool
    {
        if (! $this->available()) {
            return false;
        }

        return DB::select(
            'select schema_name from information_schema.schemata where schema_name = ?',
            [$this->databaseName($backup)],
        ) !== [];
    }

    /**
     * ასლის გახსნა — დროებითი ბაზის შექმნა და დამპის ჩატვირთვა.
     *
     * ⚠️ **ჯერ ვშლით, მერე ვქმნით**: ნახევრად ჩატვირთული წინა მცდელობა
     * ვიუერს ჩუმად არასრულ სურათს აჩვენებდა.
     */
    public function open(DatabaseBackup $backup): void
    {
        $this->assertAvailable();

        $path = $this->absolutePath($backup);
        $name = $this->databaseName($backup);

        /* ⚠️ **მიტოვებულები აქვე იხურება** (Tasks GAP-16): scheduler-ი ამ
           მანქანაზე ხშირად საერთოდ არ ეშვება, ე.ი. მარტო დაგეგმილ ბრძანებას
           დაყრდნობა ნიშნავდა, რომ პრაქტიკაში არაფერი გასუფთავდებოდა. ორი
           ასლის ერთდროულად გახსნა კვლავ შეიძლება — ახლად გახსნილი ვიუერი
           „მიტოვებული" არ არის. */
        $this->pruneStale();

        DB::statement("drop database if exists `{$name}`");
        DB::statement("create database `{$name}` character set utf8mb4 collate utf8mb4_unicode_ci");

        try {
            $this->dumper->restore($path, $name);
        } catch (RuntimeException $e) {
            DB::statement("drop database if exists `{$name}`");

            throw $e;
        }

        // ⚠️ `saveQuietly()` — ვიუერის გახსნა ჩანაწერის რედაქტირება არაა და
        // `AuditObserver`-ს ლოგი „ასლი შეიცვალა"-თი არ უნდა აევსოს
        $backup->forceFill(['inspected_at' => AppTime::now()])->saveQuietly();
    }

    /** ვიუერის დახურვა — დროებითი ბაზა ქრება */
    public function close(DatabaseBackup $backup): void
    {
        if (! $this->available()) {
            return;
        }

        $name = $this->databaseName($backup);
        DB::statement("drop database if exists `{$name}`");
        $backup->forceFill(['inspected_at' => null])->saveQuietly();
    }

    /**
     * **ღია ვიუერების სია** (Tasks GAP-16) — `<db>_inspect_<id>` სქემები.
     *
     * ⚠️ MySQL-ის სქემებიდან იკითხება და არა `database_backups`-იდან: სწორედ
     * ისაა საინტერესო, რაც ბაზაშია და ჩანაწერს **აღარ** შეესაბამება (წაშლილი
     * ასლის ნარჩენი). `id` სახელიდან გამოითვლება.
     *
     * @return list<array{database: string, backup_id: int}>
     */
    public function openDatabases(): array
    {
        if (! $this->available()) {
            return [];
        }

        $prefix = $this->mainDatabase().'_inspect_';

        $rows = DB::select(
            'select schema_name as name from information_schema.schemata where schema_name like ? order by schema_name',
            [Like::escape($prefix).'%'],
        );

        $out = [];

        foreach ($rows as $row) {
            $id = substr((string) $row->name, strlen($prefix));

            // ⚠️ მხოლოდ ზუსტად რიცხვიანი ბოლო — თორემ ხელით შექმნილი
            // მსგავსი სახელის ბაზას ეს კოდი „ვიუერად" ჩათვლიდა და წაშლიდა
            if ($id !== '' && ctype_digit($id)) {
                $out[] = ['database' => (string) $row->name, 'backup_id' => (int) $id];
            }
        }

        return $out;
    }

    /**
     * **მიტოვებული ვიუერების დახურვა** (Tasks GAP-16).
     *
     * ორი შემთხვევა ითვლება მიტოვებულად და ორივე რეალურია: ასლის ჩანაწერი
     * **აღარ არსებობს** (ძველი ნარჩენი, `deleting` ჰუკამდელი), ან ვიუერი
     * `STALE_HOURS`-ზე დიდი ხნის წინ გაიხსნა — ე.ი. ტაბი დახურეს ღილაკის
     * დაჭერის გარეშე.
     *
     * ⚠️ **`inspected_at`-ის არქონა მიტოვებულად ითვლება**: ეს ან მიგრაციამდე
     * გახსნილი ვიუერია, ან ხელით შექმნილი რიგი — ორივეს სამუდამო სიცოცხლე
     * ზუსტად ის ხარვეზია, რომელსაც ეს კოდი ხურავს (იგივე წესი, რაც
     * `Video::downloadStale()`-ს აქვს ცარიელ საწყის დროზე).
     *
     * @return list<string> დახურული ბაზების სახელები
     */
    public function pruneStale(?int $hours = null): array
    {
        $cutoff = AppTime::now()->subHours($hours ?? self::STALE_HOURS);
        $closed = [];

        foreach ($this->openDatabases() as $row) {
            $backup = DatabaseBackup::find($row['backup_id']);
            $at = $backup?->inspected_at;

            if ($backup !== null && $at !== null && $at->greaterThan($cutoff)) {
                continue;
            }

            DB::statement("drop database if exists `{$row['database']}`");
            $backup?->forceFill(['inspected_at' => null])->saveQuietly();
            $closed[] = $row['database'];
        }

        return $closed;
    }

    /**
     * ცხრილების სია დროებითი ბაზიდან — რიგების **ნამდვილი** რაოდენობით.
     *
     * ⚠️ `information_schema.tables.table_rows` InnoDB-ზე **შეფასებაა** და
     * ხშირად ორჯერ ცდება; `COUNT(*)` კი ზუსტია და ამ ზომაზე იაფი.
     *
     * @return list<array{name: string, rows: int, scope: string}>
     */
    public function tables(DatabaseBackup $backup): array
    {
        $this->assertOpen($backup);

        $name = $this->databaseName($backup);

        $tables = DB::select(
            'select table_name as name from information_schema.tables
             where table_schema = ? and table_type = ? order by table_name',
            [$name, 'BASE TABLE'],
        );

        return array_map(function ($row) use ($name) {
            $table = (string) $row->name;

            return [
                'name' => $table,
                'rows' => (int) DB::selectOne("select count(*) as total from `{$name}`.`{$table}`")->total,
                // §11.4 — „აღდგენა რამდენად საშიშია" იმავე პასუხში მოდის
                'scope' => RestoreScope::scopeFor($table),
            ];
        }, $tables);
    }

    /**
     * ერთი ცხრილის რიგები — გვერდებით, სორტირებით და ფილტრით.
     *
     * ⚠️ **სორტირების სვეტიც მოწმდება**: `order by` bindings-ს არ იღებს,
     * ე.ი. ეს ერთადერთი ადგილია, სადაც მომხმარებლის ტექსტი პირდაპირ
     * query-ში ხვდებოდა.
     *
     * @return array{columns: list<string>, data: list<array<string, mixed>>, total: int}
     */
    public function rows(
        DatabaseBackup $backup,
        string $table,
        int $page = 1,
        int $perPage = 50,
        ?string $sort = null,
        string $dir = 'asc',
        ?string $q = null,
    ): array {
        $this->assertOpen($backup);

        $name = $this->databaseName($backup);
        $table = $this->assertTable($backup, $table);
        $columns = $this->columns($backup, $table);

        $perPage = min(max($perPage, 1), self::MAX_PER_PAGE);
        $page = max($page, 1);

        $query = DB::table(DB::raw("`{$name}`.`{$table}`"));

        if ($q !== null && trim($q) !== '') {
            $like = Like::contains(trim($q));

            /* ⚠️ ძებნა **ყველა სვეტზე**: დამპის ვიუერს სქემის ცოდნა არ
               აქვს, ე.ი. „რომელი სვეტია საინტერესო" კითხვა აქ პასუხგაუცემელია. */
            $query->where(function ($w) use ($columns, $like) {
                foreach ($columns as $column) {
                    $w->orWhere($column, 'like', $like);
                }
            });
        }

        $total = (clone $query)->count();

        if ($sort !== null && in_array($sort, $columns, true)) {
            $query->orderBy($sort, strtolower($dir) === 'desc' ? 'desc' : 'asc');
        }

        $rows = $query->forPage($page, $perPage)->get();

        return [
            'columns' => $columns,
            'data' => $rows->map(fn ($row) => (array) $row)->all(),
            'total' => $total,
        ];
    }

    /** @return list<string> */
    public function columns(DatabaseBackup $backup, string $table): array
    {
        $name = $this->databaseName($backup);

        return array_map(
            fn ($row) => (string) $row->name,
            DB::select(
                'select column_name as name from information_schema.columns
                 where table_schema = ? and table_name = ? order by ordinal_position',
                [$name, $table],
            ),
        );
    }

    /**
     * ⚠️ **იდენტიფიკატორის ერთადერთი კარი.** ცხრილის სახელი მხოლოდ მაშინ
     * ხვდება query-ში, თუ ის ამ დროებით ბაზაში მართლა არსებობს.
     */
    public function assertTable(DatabaseBackup $backup, string $table): string
    {
        $found = DB::select(
            'select table_name as name from information_schema.tables
             where table_schema = ? and table_name = ? and table_type = ?',
            [$this->databaseName($backup), $table, 'BASE TABLE'],
        );

        if ($found === []) {
            abort(404, 'table_not_in_backup');
        }

        return (string) $found[0]->name;
    }

    public function assertOpen(DatabaseBackup $backup): void
    {
        $this->assertAvailable();

        abort_unless($this->isOpen($backup), 409, 'backup_not_inspected');
    }

    private function assertAvailable(): void
    {
        abort_unless($this->available(), 503, 'mysqldump_unavailable');
    }

    private function mainDatabase(): string
    {
        $name = (string) config('database.default');

        return (string) config("database.connections.{$name}.database");
    }

    private function absolutePath(DatabaseBackup $backup): string
    {
        $disk = Storage::disk(StorageFolder::diskFor((string) $backup->path));

        abort_unless($backup->path && $disk->exists($backup->path), 404, 'backup_file_missing');

        return $disk->path($backup->path);
    }
}
