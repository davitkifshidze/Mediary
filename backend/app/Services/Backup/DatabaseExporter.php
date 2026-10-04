<?php

namespace App\Services\Backup;

use App\Support\ModuleTables;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use ZipArchive;

/**
 * **მთლიანი ბაზის ან არჩეული ცხრილების ექსპორტი** (Tasks §59.4, მხოლოდ სუპერადმინი).
 *
 * შენი სიტყვები: „ბაზის მთლიანი ექსპორტი; ან ნიშნავდე, ბაზაში რა თეიბლებიცაა — იმ
 * თეიბლებს". ორი ფორმატი:
 * - **JSON-ის ZIP** — ცხრილი = ფაილი (`tables/<ცხრილი>.json`, რიგების მასივი) +
 *   `manifest.json` (როდის, რომელი ცხრილები, რამდენი რიგი). ნებისმიერ დრაივერზე
 *   მუშაობს და ადამიანიც კითხულობს; ⚠️ ცხრილი **ნაკადად** იწერება (`cursor()`),
 *   ფაილად და მერე ZIP-ში — მთელი ცხრილი მეხსიერებაში არასდროს დგას.
 * - **SQL** — `mysqldump` მხოლოდ არჩეული ცხრილებით (`DatabaseDumper::dump()`-ის
 *   იგივე პარამეტრები: ერთი ტრანზაქცია, `DROP TABLE`, gzip) — `/backups`-ის ასლი
 *   ცხრილების გარეშე იგივეა, ეს კი მისი ნაწილობრივი ვარიანტი.
 *
 * ⚠️ ცხრილის სახელი მხოლოდ სქემიდან იღება (`tables()`), არასდროს მოთხოვნიდან
 * პირდაპირ — უცნობი სახელი 422-ია (`assertKnown()`).
 */
class DatabaseExporter
{
    public function __construct(private readonly DatabaseDumper $dumper) {}

    /**
     * ცხრილები — პატრონით, რიგებით, ზომით და „ამასთან ერთად საჭიროა" სიით.
     *
     * @return list<array{table: string, owner: string, rows: int, bytes: ?int, sensitive: bool, requires: list<string>}>
     */
    public function tables(): array
    {
        $out = [];

        foreach ($this->schema() as $row) {
            $table = $row['name'];
            $requires = array_values(array_filter(
                ModuleTables::requires($table),
                fn (string $t) => $t !== $table && isset($this->names()[$t]),
            ));

            $out[] = [
                'table' => $table,
                'owner' => ModuleTables::owner($table) ?? 'system',
                'rows' => (int) DB::table($table)->count(),
                'bytes' => isset($row['size']) && is_numeric($row['size']) ? (int) $row['size'] : null,
                'sensitive' => in_array($table, ModuleTables::SENSITIVE, true),
                'requires' => $requires,
            ];
        }

        usort($out, fn ($a, $b) => [$a['owner'], $a['table']] <=> [$b['owner'], $b['table']]);

        return $out;
    }

    /**
     * @param  list<string>  $tables
     * @return list<string> მხოლოდ არსებული, სქემის რიგით, დუბლის გარეშე
     */
    public function assertKnown(array $tables): array
    {
        $known = $this->names();
        $unknown = array_values(array_filter($tables, fn ($t) => ! isset($known[$t])));

        if ($unknown !== []) {
            throw new RuntimeException('unknown_table');
        }

        return array_values(array_unique($tables));
    }

    /**
     * JSON-ის ZIP დროებით ფაილში — გამომძახებელი ჩამოტვირთვის შემდეგ შლის.
     *
     * @param  list<string>  $tables
     */
    public function zip(array $tables): string
    {
        $tables = $this->assertKnown($tables);
        $path = $this->tempPath('zip');
        $zip = new ZipArchive;

        if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('zip_failed');
        }

        $counts = [];
        $parts = [];

        foreach ($tables as $table) {
            [$file, $rows] = $this->tableJson($table);
            $zip->addFile($file, "tables/{$table}.json");
            $parts[] = $file;
            $counts[$table] = $rows;
        }

        $zip->addFromString('manifest.json', (string) json_encode([
            'app' => 'mediary',
            'kind' => 'database',
            'format' => 1,
            'created_at' => now()->toIso8601String(),
            'driver' => DB::connection()->getDriverName(),
            'tables' => $counts,
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

        $zip->close();

        // ⚠️ ცალკე ფაილები ZIP-ის დახურვის **შემდეგ** იშლება — `addFile` მათ მხოლოდ მაშინ კითხულობს
        foreach ($parts as $file) {
            @unlink($file);
        }

        return $path;
    }

    /**
     * SQL (`mysqldump`, gzip) მხოლოდ არჩეული ცხრილებით.
     *
     * @param  list<string>  $tables
     */
    public function sql(array $tables): string
    {
        $tables = $this->assertKnown($tables);
        $path = $this->tempPath('sql.gz');
        $this->dumper->dump($path, true, $tables);

        return $path;
    }

    public function sqlAvailable(): bool
    {
        return $this->dumper->available();
    }

    /* ---------- შიგნეული ---------- */

    /** @return array{0: string, 1: int} ფაილი და რიგების რიცხვი */
    private function tableJson(string $table): array
    {
        $file = $this->tempPath('json');
        $handle = fopen($file, 'wb');
        if ($handle === false) {
            throw new RuntimeException('zip_failed');
        }

        fwrite($handle, '[');
        $rows = 0;
        $query = DB::table($table);
        $columns = Schema::getColumnListing($table);
        // ⚠️ თანმიმდევრული რიგი — ერთი და იგივე ასლი ერთნაირად უნდა გამოვიდეს
        if (in_array('id', $columns, true)) {
            $query->orderBy('id');
        }

        foreach ($query->cursor() as $row) {
            fwrite($handle, ($rows > 0 ? ',' : '')."\n".json_encode((array) $row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE));
            $rows++;
        }

        fwrite($handle, "\n]\n");
        fclose($handle);

        return [$file, $rows];
    }

    /** @return list<array{name: string, size?: mixed}> მიმდინარე ბაზის ცხრილები (სხვა ბაზისა — არა) */
    private function schema(): array
    {
        $connection = DB::connection();
        $schema = $connection->getDriverName() === 'sqlite' ? null : $connection->getDatabaseName();

        return array_values(array_filter(
            Schema::getTables($schema),
            fn (array $row) => ! str_starts_with((string) $row['name'], 'sqlite_'),
        ));
    }

    /** @var array<string, true>|null */
    private ?array $names = null;

    /** @return array<string, true> */
    private function names(): array
    {
        return $this->names ??= array_fill_keys(array_column($this->schema(), 'name'), true);
    }

    private function tempPath(string $extension): string
    {
        $dir = storage_path('app/private/exports');
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        return $dir.DIRECTORY_SEPARATOR.'database-'.now()->format('Ymd-His').'-'.bin2hex(random_bytes(4)).'.'.$extension;
    }
}
