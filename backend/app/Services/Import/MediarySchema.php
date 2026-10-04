<?php

namespace App\Services\Import;

use App\Support\AppTime;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * **Tasks §59.6 — ფაილის მნიშვნელობა → სვეტის ტიპი.**
 *
 * ⚠️ **ფაილი მომხმარებლისაა და არა ბაზის** — JSON-ს ხელით შეცვლა შეუძლია,
 * CSV-ს Excel თარიღებს უცვლის. MySQL-ის მკაცრი რეჟიმი `''`-ს მთელ რიცხვის
 * სვეტში ან `"დიდი"`-ს თარიღში რიგს **ჩააგდებდა**, sqlite კი ჩუმად ჩაწერდა.
 * ამიტომ ყოველი მნიშვნელობა სვეტის ტიპზე (ან მოდელის cast-ზე) გადადის, ხოლო
 * ის, რაც ვერ გადავიდა, `null` ხდება — ჩანაწერი ჩაიწერება, ერთი ველი კი ცარიელი რჩება.
 *
 * ⚠️ **მხოლოდ ცხრილის ნამდვილი სვეტი იწერება** (`columns()`): ფაილში
 * ჩამატებული `user_id` ან უცნობი ველი უბრალოდ არ არსებობს — `forceFill()`
 * მხოლოდ თეთრ სიაზე გადის.
 */
final class MediarySchema
{
    /** @var array<string, array<string, array{type: string, nullable: bool, length: int|null}>> */
    private static array $columns = [];

    /**
     * ცხრილის სვეტები (პროცესზე ერთხელ).
     *
     * @return array<string, array{type: string, nullable: bool, length: int|null}>
     */
    public static function columns(string $table): array
    {
        return self::$columns[$table] ??= collect(Schema::getColumns($table))
            ->mapWithKeys(fn (array $c) => [$c['name'] => [
                'type' => strtolower((string) $c['type_name']),
                'nullable' => (bool) $c['nullable'],
                'length' => preg_match('/\((\d+)\)/', (string) ($c['type'] ?? ''), $m) ? (int) $m[1] : null,
            ]])
            ->all();
    }

    /**
     * მნიშვნელობა სვეტისთვის; `null` — ცარიელი ან გადაუყვანადი.
     *
     * @param  array{type: string, nullable: bool, length: int|null}  $column
     */
    public static function coerce(Model $model, string $field, array $column, mixed $value): mixed
    {
        if ($value === null) {
            return null;
        }

        $cast = strtolower((string) ($model->getCasts()[$field] ?? ''));
        $castType = explode(':', $cast)[0];

        if (in_array($castType, ['array', 'json', 'collection', 'object'], true)) {
            return self::toList($value);
        }

        if (is_array($value) || is_object($value)) {
            return null;
        }

        if ($castType === 'boolean' || $castType === 'bool'
            || ($column['type'] === 'tinyint' && preg_match('/^(is|has|sync)_/', $field))) {
            return self::toBool($value);
        }

        return match (true) {
            in_array($column['type'], ['integer', 'int', 'bigint', 'smallint', 'mediumint', 'tinyint'], true) => is_numeric($value) ? (int) $value : (is_bool($value) ? (int) $value : null),
            in_array($column['type'], ['decimal', 'numeric', 'double', 'float', 'real'], true) => is_numeric($value) ? (float) $value : null,
            $column['type'] === 'date' => self::moment($value, 'Y-m-d'),
            in_array($column['type'], ['datetime', 'timestamp'], true) => self::moment($value, 'Y-m-d H:i:s'),
            $column['type'] === 'time' => is_string($value) && preg_match('/^\d{1,2}:\d{2}(:\d{2})?$/', trim($value)) ? trim($value) : null,
            default => self::text($value, $column['length'] ?? ($column['type'] === 'varchar' ? 255 : null)),
        };
    }

    /** თარიღი/მომენტი აპლიკაციის ზონაში (ექსპორტი კედლის საათით წერს — `RecordExporter::normalize()`) */
    public static function moment(mixed $value, string $format = 'Y-m-d H:i:s'): ?string
    {
        if (! is_string($value) && ! is_int($value)) {
            return null;
        }

        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }

        try {
            return Carbon::parse($value, AppTime::zone())->format($format);
        } catch (Throwable) {
            return null;
        }
    }

    /** @return list<mixed>|array<string, mixed>|null */
    private static function toList(mixed $value): ?array
    {
        if (is_array($value)) {
            return $value;
        }

        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        $decoded = json_decode($value, true);

        if (is_array($decoded)) {
            return $decoded;
        }

        // CSV-ის ` | `-ით შეკრული სია (`RecordExporter::flat()`)
        return array_values(array_filter(array_map('trim', explode(' | ', $value)), fn (string $v) => $v !== ''));
    }

    private static function toBool(mixed $value): ?bool
    {
        if (is_bool($value)) {
            return $value;
        }

        if (is_numeric($value)) {
            return (bool) (int) $value;
        }

        return is_string($value) ? filter_var($value, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE) : null;
    }

    private static function text(mixed $value, ?int $length): ?string
    {
        if (is_bool($value)) {
            $value = $value ? '1' : '0';
        }

        if (! is_scalar($value)) {
            return null;
        }

        $value = (string) $value;

        return $length !== null ? mb_substr($value, 0, $length) : $value;
    }
}
