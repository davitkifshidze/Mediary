<?php

namespace App\Services\Backup;

use App\Models\DatabaseBackup;
use App\Support\RestoreScope;
use Illuminate\Support\Facades\DB;

/**
 * **ნაწილობრივი აღდგენა — ერთი ცხრილი ან ერთი ჩანაწერი (Tasks §11.4/§11.5).**
 *
 * შენი სიტყვები: „შეგეძლოს კონკრეტული თეიბლის აღდგენა, ან კონკრეტული
 * ჩანაწერის, ან სრული".
 *
 * ⚠️ **`REPLACE INTO` არასდროს.** ის `DELETE`+`INSERT`-ია და **კასკადებს
 * ისვრის**: `REPLACE INTO users` ანგარიშის 61 შვილეულ ცხრილს წაშლიდა.
 * სწორი ფორმა `INSERT … ON DUPLICATE KEY UPDATE`-ია — Laravel-ში
 * `upsert()`.
 *
 * ⚠️ **`ON DUPLICATE KEY` ნებისმიერ უნიკალურ ინდექსზეც ისვრის** (მაგ.
 * `unique(user_id, imdb_id)`), ე.ი. სხვა `id`-ის მქონე ჩანაწერმა შეიძლება
 * **სხვა რიგი** გადააწეროს. ამიტომ ჯერ მოწმდება და, თუ ასეა, სახელდება —
 * ჩუმი გადაწერა აქ ყველაზე ძვირი შეცდომაა.
 *
 * ⚠️ **მშობლის არარსებობაზე უარი და მშობლის დასახელება** — და არასდროს
 * `SET FOREIGN_KEY_CHECKS = 0`. გამორთული შემოწმება „წარმატებულ" აღდგენას
 * დაწერდა და ბაზას გატეხილ მიმართებას დაუტოვებდა.
 *
 * ⚠️ **იდენტიფიკატორი ყოველთვის `id` არაა**: `castables`, `genreables`,
 * `module_user` შედგენილი გასაღებია, `cache`/`sessions` კი სტრიქონული.
 * გასაღები `information_schema`-დან იკითხება და არა იგულისხმება.
 *
 * ⚠️ **`TRUNCATE` უვარგისია** — InnoDB უარს ამბობს ცხრილზე, რომელზეც
 * უცხო გასაღები მიუთითებს. ამიტომ ცხრილის აღდგენა `DELETE`-ია და სწორედ
 * ის ისვრის კასკადებს, რაზეც `RestoreScope` აფრთხილებს.
 */
class PartialRestore
{
    public function __construct(private BackupInspector $inspector) {}

    /**
     * **ერთი ცხრილის აღდგენა.**
     *
     * @return array{deleted: int, inserted: int}
     */
    public function table(DatabaseBackup $backup, string $table): array
    {
        $this->inspector->assertOpen($backup);
        $table = $this->inspector->assertTable($backup, $table);

        abort_if(RestoreScope::isBlocked($table), 422, 'table_restore_blocked');

        $scratch = $this->inspector->databaseName($backup);

        return DB::transaction(function () use ($table, $scratch) {
            $deleted = DB::table($table)->delete();

            /* ⚠️ `INSERT … SELECT` და არა PHP-ის ციკლი: მილიონი რიგი
               მეხსიერებაში ჩამოტარებას არ ექვემდებარება, და ტრანზაქციაც
               ერთი განცხადებით სრულდება. */
            DB::statement("insert into `{$table}` select * from `{$scratch}`.`{$table}`");

            $inserted = (int) DB::selectOne("select count(*) as total from `{$table}`")->total;

            return ['deleted' => $deleted, 'inserted' => $inserted];
        });
    }

    /**
     * **ერთი ჩანაწერის აღდგენა.**
     *
     * @param  array<string, mixed>  $key  პირველადი გასაღების მნიშვნელობები
     * @return array{restored: bool}
     */
    public function row(DatabaseBackup $backup, string $table, array $key): array
    {
        $this->inspector->assertOpen($backup);
        $table = $this->inspector->assertTable($backup, $table);

        abort_if(RestoreScope::isBlocked($table), 422, 'table_restore_blocked');

        $scratch = $this->inspector->databaseName($backup);
        $primary = $this->primaryKey($table);

        abort_if($primary === [], 422, 'table_has_no_primary_key');
        abort_if(array_diff($primary, array_keys($key)) !== [], 422, 'row_key_incomplete');

        $source = DB::table(DB::raw("`{$scratch}`.`{$table}`"));
        foreach ($primary as $column) {
            $source->where($column, $key[$column]);
        }

        $row = $source->first();
        abort_unless($row, 404, 'row_not_in_backup');

        $values = (array) $row;

        $this->assertParentsExist($table, $values);
        $this->assertNoForeignUniqueClash($table, $primary, $values);

        // ⚠️ `upsert()` = `INSERT … ON DUPLICATE KEY UPDATE`; **არასდროს** `REPLACE INTO`
        DB::table($table)->upsert([$values], $primary);

        return ['restored' => true];
    }

    /**
     * ⚠️ **მშობელი უნდა არსებობდეს, თორემ უარი და მისი დასახელება.**
     *
     * @param  array<string, mixed>  $values
     */
    private function assertParentsExist(string $table, array $values): void
    {
        foreach ($this->foreignKeys($table) as $fk) {
            $value = $values[$fk['column']] ?? null;

            if ($value === null) {
                continue;
            }

            $exists = DB::table($fk['parent'])->where($fk['parent_column'], $value)->exists();

            if (! $exists) {
                abort(422, 'missing_parent:'.$fk['parent']);
            }
        }
    }

    /**
     * ⚠️ **სხვა უნიკალურ ინდექსზე დაჯახება ჩუმი გადაწერა იქნებოდა.**
     * `ON DUPLICATE KEY` ნებისმიერ უნიკალურ ინდექსზე ისვრის — ე.ი. სხვა
     * `id`-ის მქონე რიგი შეიძლება უცებ **ეს** გახდეს.
     *
     * @param  list<string>  $primary
     * @param  array<string, mixed>  $values
     */
    private function assertNoForeignUniqueClash(string $table, array $primary, array $values): void
    {
        foreach ($this->uniqueIndexes($table) as $index => $columns) {
            // პირველადი გასაღები თვითონ არის სამიზნე — ის დაჯახება არაა
            if ($columns === $primary) {
                continue;
            }

            $query = DB::table($table);
            foreach ($columns as $column) {
                $query->where($column, $values[$column] ?? null);
            }

            foreach ($primary as $column) {
                $query->where($column, '!=', $values[$column]);
            }

            if ($query->exists()) {
                abort(422, 'unique_clash:'.$index);
            }
        }
    }

    /** @return list<string> */
    private function primaryKey(string $table): array
    {
        return array_map(
            fn ($row) => (string) $row->name,
            DB::select(
                "select column_name as name from information_schema.key_column_usage
                 where table_schema = database() and table_name = ? and constraint_name = 'PRIMARY'
                 order by ordinal_position",
                [$table],
            ),
        );
    }

    /**
     * @return list<array{column: string, parent: string, parent_column: string}>
     */
    private function foreignKeys(string $table): array
    {
        return array_map(fn ($row) => [
            'column' => (string) $row->col,
            'parent' => (string) $row->parent,
            'parent_column' => (string) $row->parent_col,
        ], DB::select(
            'select column_name as col, referenced_table_name as parent, referenced_column_name as parent_col
             from information_schema.key_column_usage
             where table_schema = database() and table_name = ? and referenced_table_name is not null',
            [$table],
        ));
    }

    /**
     * უნიკალური ინდექსები (პირველადის ჩათვლით): სახელი → სვეტები.
     *
     * @return array<string, list<string>>
     */
    private function uniqueIndexes(string $table): array
    {
        $rows = DB::select(
            'select index_name as name, column_name as col from information_schema.statistics
             where table_schema = database() and table_name = ? and non_unique = 0
             order by index_name, seq_in_index',
            [$table],
        );

        $out = [];
        foreach ($rows as $row) {
            $out[(string) $row->name][] = (string) $row->col;
        }

        return $out;
    }
}
