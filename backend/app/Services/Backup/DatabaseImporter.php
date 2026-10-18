<?php

namespace App\Services\Backup;

use App\Models\User;
use App\Services\Import\ImportException;
use App\Support\ImportSource;
use App\Support\ModuleTables;
use App\Support\RestoreScope;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use ZipArchive;

/**
 * **ბაზის JSON-ის ZIP → ცხრილების ჩანაცვლება** (მხოლოდ სუპერადმინი).
 *
 * „ბაზის" ჩანართის ექსპორტის (`DatabaseExporter::zip()`) შებრუნება: არქივი
 * ჯერ იტვირთება და ითვლება (რომელი ცხრილია შიგნით, რამდენი რიგი, ემთხვევა
 * თუ არა სვეტები), მერე **არჩეული** ცხრილები ჩანაცვლდება — ცხრილის ყველა
 * რიგი იშლება და არქივისა იწერება.
 *
 * ⚠️ **ჩანაცვლება მხოლოდ აქაა**: ჩვეულებრივი იმპორტი მხოლოდ ამატებს.
 * ⚠️ **უსაფრთხოების ასლი ჯერ** (`BackupRunner::safetyDump()`, კონტროლერში) —
 * შეუქცევადი ოპერაცია იმ ასლის გარეშე, რომელიც მას შექცევადს ხდის, არ იწყება.
 * ⚠️ **`users` და ინფრასტრუქტურა აკრძალულია** (`RestoreScope::BLOCKED`) —
 * ცხრილის აღდგენის იგივე წესი.
 *
 * ⚠️ **უცხო გასაღებები ჩანაცვლების დროს გამორთულია** — ცხრილები ერთმანეთზე
 * მიუთითებს და ნებისმიერი რიგით ჩაწერა შუალედში „გატეხილი" იქნებოდა;
 * MySQL-ზე გამორთულ შემოწმებას კასკადიც არ მოსდევს, ე.ი. მშობლის
 * ჩანაცვლება შვილებს არ შლის. ⚠️ ამიტომ **ცხრილის საჭიროებებიც** ჩანს
 * (`ModuleTables::requires()`) — მოდულის ცხრილები ერთად უნდა ჩანაცვლდეს.
 *
 * ⚠️ **ფაილი ხაზ-ხაზ იკითხება** — ექსპორტი თითო რიგს ცალკე ხაზზე წერს,
 * ე.ი. მილიონრიგიანი ცხრილი მეხსიერებაში მთლიანად არ იშლება.
 */
class DatabaseImporter
{
    private const ROOT = 'imports/database';

    /** რამდენ რიგს წერს ერთი `INSERT` */
    private const BATCH = 200;

    /**
     * არქივის ატვირთვა და აღწერა.
     *
     * @return array{token: string, created_at: ?string, driver: ?string, tables: list<array<string, mixed>>}
     */
    public function stage(User $user, UploadedFile $file): array
    {
        $this->sweep();

        $token = Str::random(40);
        $this->disk()->putFileAs(self::ROOT, $file, $this->name($user, $token));

        try {
            return ['token' => $token, ...$this->inspect($this->path($user, $token))];
        } catch (ImportException $e) {
            $this->discard($user, $token);

            throw $e;
        }
    }

    /**
     * არჩეული ცხრილების ჩანაცვლება.
     *
     * @param  list<string>  $tables
     * @return array<string, array{deleted: int, inserted: int, dropped_columns: list<string>}>
     */
    public function replace(User $user, string $token, array $tables): array
    {
        $zip = $this->open($this->path($user, $token));

        try {
            $this->assertReplaceable($zip, $tables);

            $result = [];

            Schema::withoutForeignKeyConstraints(function () use ($zip, $tables, &$result) {
                DB::transaction(function () use ($zip, $tables, &$result) {
                    foreach ($tables as $table) {
                        $result[$table] = $this->replaceTable($zip, $table);
                    }
                });
            });

            return $result;
        } finally {
            $zip->close();
        }
    }

    /**
     * ჩანაცვლებადია? — **უსაფრთხოების ასლამდე** მოწმდება, რომ უცნობ ცხრილზე
     * ასლი ტყუილად არ შეიქმნას.
     *
     * @param  list<string>  $tables
     *
     * @throws ImportException
     */
    public function check(User $user, string $token, array $tables): void
    {
        $zip = $this->open($this->path($user, $token));

        try {
            $this->assertReplaceable($zip, $tables);
        } finally {
            $zip->close();
        }
    }

    public function discard(User $user, string $token): void
    {
        if (preg_match('/^[A-Za-z0-9]{40}$/', $token)) {
            $this->disk()->delete(self::ROOT.'/'.$this->name($user, $token));
        }
    }

    /* ---------- შიგნეული ---------- */

    /** @return array{created_at: ?string, driver: ?string, tables: list<array<string, mixed>>} */
    private function inspect(string $path): array
    {
        $zip = $this->open($path);

        try {
            return $this->inspectZip($zip);
        } finally {
            $zip->close();
        }
    }

    /** @return array{created_at: ?string, driver: ?string, tables: list<array<string, mixed>>} */
    private function inspectZip(ZipArchive $zip): array
    {
        $manifest = json_decode((string) $zip->getFromName('manifest.json'), true);

        if (! is_array($manifest) || ($manifest['app'] ?? null) !== 'mediary' || ($manifest['kind'] ?? null) !== 'database') {
            // ⚠️ „ჩემი სრული ექსპორტის" ZIP სხვა რამეა — ის ჩვეულებრივ იმპორტში შედის (დამატებით)
            throw new ImportException(($manifest['kind'] ?? null) === 'library' ? 'database_archive_library' : 'database_archive_invalid');
        }

        $current = $this->currentTables();
        $names = array_keys((array) ($manifest['tables'] ?? []));
        $tables = [];

        foreach ($names as $table) {
            if (! is_string($table) || ! preg_match('/^[A-Za-z0-9_]{1,64}$/', $table) || $zip->statName("tables/{$table}.json") === false) {
                continue;
            }

            $exists = isset($current[$table]);
            $first = $exists ? $this->firstRow($zip, $table) : null;
            $columns = $exists ? Schema::getColumnListing($table) : [];

            $tables[] = [
                'table' => $table,
                'rows' => (int) ($manifest['tables'][$table] ?? 0),
                'exists' => $exists,
                'blocked' => RestoreScope::isBlocked($table),
                'owner' => ModuleTables::owner($table) ?? 'system',
                'requires' => array_values(array_filter(
                    ModuleTables::requires($table),
                    fn (string $t) => $t !== $table && in_array($t, $names, true),
                )),
                // სვეტები, რომლებიც არქივშია და ახლა აღარ არის (ჩაწერისას იკარგება) — და პირიქით
                'dropped_columns' => $first ? array_values(array_diff(array_keys($first), $columns)) : [],
                'missing_columns' => $first ? array_values(array_diff($columns, array_keys($first))) : [],
            ];
        }

        usort($tables, fn ($a, $b) => [$a['owner'], $a['table']] <=> [$b['owner'], $b['table']]);

        return [
            'created_at' => is_string($manifest['created_at'] ?? null) ? $manifest['created_at'] : null,
            'driver' => is_string($manifest['driver'] ?? null) ? $manifest['driver'] : null,
            'tables' => $tables,
        ];
    }

    /** @param  list<string>  $tables */
    private function assertReplaceable(ZipArchive $zip, array $tables): void
    {
        $available = array_column($this->inspectZip($zip)['tables'], null, 'table');

        foreach ($tables as $table) {
            $info = $available[$table] ?? null;

            if (! $info || ! $info['exists'] || $info['blocked']) {
                throw new ImportException($info && $info['blocked'] ? 'table_restore_blocked' : 'unknown_table', ['table' => $table]);
            }
        }
    }

    /** @return array{deleted: int, inserted: int, dropped_columns: list<string>} */
    private function replaceTable(ZipArchive $zip, string $table): array
    {
        $columns = array_flip(Schema::getColumnListing($table));
        $deleted = DB::table($table)->delete();
        $inserted = 0;
        $keys = null;
        $dropped = [];
        $batch = [];

        foreach ($this->rows($zip, $table) as $row) {
            // ⚠️ სვეტების ერთი ნაკრები მთელ ცხრილზე — მრავალრიგიანი `INSERT` პირველი რიგის სვეტებს იყენებს
            $keys ??= array_values(array_intersect(array_keys($row), array_keys($columns)));

            foreach (array_diff(array_keys($row), $keys) as $extra) {
                $dropped[$extra] = true;
            }

            $clean = [];
            foreach ($keys as $key) {
                $clean[$key] = $row[$key] ?? null;
            }
            $batch[] = $clean;

            if (count($batch) >= self::BATCH) {
                DB::table($table)->insert($batch);
                $inserted += count($batch);
                $batch = [];
            }
        }

        if ($batch !== []) {
            DB::table($table)->insert($batch);
            $inserted += count($batch);
        }

        return ['deleted' => $deleted, 'inserted' => $inserted, 'dropped_columns' => array_keys($dropped)];
    }

    /**
     * ცხრილის რიგები ხაზ-ხაზ (`DatabaseExporter::tableJson()`-ის ფორმა: `[`, რიგი თითო ხაზზე, `]`).
     *
     * @return \Generator<int, array<string, mixed>>
     */
    private function rows(ZipArchive $zip, string $table): \Generator
    {
        $stream = $zip->getStream("tables/{$table}.json");

        if ($stream === false) {
            return;
        }

        try {
            while (($line = fgets($stream)) !== false) {
                $line = rtrim(trim($line), ',');

                if ($line === '' || $line === '[' || $line === ']') {
                    continue;
                }

                $row = json_decode($line, true);

                if (is_array($row)) {
                    yield $row;
                }
            }
        } finally {
            fclose($stream);
        }
    }

    /** @return array<string, mixed>|null */
    private function firstRow(ZipArchive $zip, string $table): ?array
    {
        foreach ($this->rows($zip, $table) as $row) {
            return $row;
        }

        return null;
    }

    /** @return array<string, true> */
    private function currentTables(): array
    {
        $connection = DB::connection();
        $schema = $connection->getDriverName() === 'sqlite' ? null : $connection->getDatabaseName();

        return array_fill_keys(array_column(Schema::getTables($schema), 'name'), true);
    }

    private function open(string $path): ZipArchive
    {
        $zip = new ZipArchive;

        if (! is_file($path) || $zip->open($path, ZipArchive::RDONLY) !== true) {
            throw new ImportException(is_file($path) ? 'database_archive_invalid' : 'import_expired', [], is_file($path) ? 422 : 410);
        }

        return $zip;
    }

    /** ვადაგასული ატვირთვები (`ImportSource::TTL_HOURS`) */
    private function sweep(): void
    {
        $cutoff = now()->subHours(ImportSource::TTL_HOURS)->getTimestamp();

        foreach ($this->disk()->files(self::ROOT) as $file) {
            if ($this->disk()->lastModified($file) < $cutoff) {
                $this->disk()->delete($file);
            }
        }
    }

    private function name(User $user, string $token): string
    {
        return $user->getKey().'-'.$token.'.zip';
    }

    private function path(User $user, string $token): string
    {
        return $this->disk()->path(self::ROOT.'/'.$this->name($user, $token));
    }

    private function disk(): Filesystem
    {
        return Storage::disk('local');
    }
}
