<?php

namespace App\Services\Import;

use App\Models\User;
use App\Support\AppTime;
use App\Support\CustomModules;
use App\Support\ExportDomain;
use App\Support\ImportSource;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * **Tasks §59.6 — „ეს ჩანაწერი უკვე მაქვს?"** (დუბლიკატის შემოწმება).
 *
 * წესები `ImportSource::IDENTITY`-შია (TMDB-ის ნომერი / ბმული / სათაური + წელი…);
 * აქ ისინი **გასაღებებად** იქცევა (`tmdb_id:603`, `title:the matrix|1999`) და
 * ფაილის რიგი არსებულს მხოლოდ საერთო გასაღებით ემთხვევა.
 *
 * ⚠️ **ასიმეტრიაა განზრახ**: ფაილის რიგი ზუსტი იდენტობით მოდის, თუ აქვს
 * (`incoming()`) — სათაური მხოლოდ მაშინ, როცა id საერთოდ არ აქვს; არსებული
 * ჩანაწერი კი **ორივეთი** (`existing()`). ასე id-იანი რიგი სხვა, იმავე
 * სახელის ფილმს ვერ „დაემთხვევა", ხოლო id-ის გარეშე (ხელით დამატებული)
 * რიგი TMDB-დან დამატებულ იმავე ფილმს სათაურითა და წლით მაინც იპოვის.
 *
 * ⚠️ **ურნაში მყოფიც და ჩაკეტილიც ითვლება** (`withoutGlobalScopes()`):
 * ურნიდან აღდგენადს თავიდან შექმნა `unique(user_id, imdb_id)`-ზე
 * ჩავარდებოდა, ჩაკეტილი კი — დამალულია, მაგრამ არსებობს.
 *
 * ⚠️ **ქართული შედარება PHP-შია** (CLAUDE.md): SQL მხოლოდ კანდიდატებს
 * არჩევს (ზუსტი ტოლობით), გადაწყვეტილება კი ნორმალიზებულ გასაღებებზეა.
 */
final class MediaryIdentity
{
    /** რამდენ კანდიდატს ვამოწმებთ — სათაურით ძებნა ფართოა, id-ით კი ერთი-ორი */
    private const CANDIDATES = 50;

    /**
     * ფაილის რიგის გასაღებები: ზუსტი იდენტობა, ან (მისი არქონისას) სათაური.
     *
     * @param  array<string, mixed>  $values
     * @return list<string>
     */
    public static function incoming(string $module, array $values): array
    {
        $identity = ImportSource::identity($module);
        if ($identity === null) {
            return [];
        }

        $ids = self::ids($identity, $values);

        return $ids !== [] ? $ids : self::titles($identity, $values);
    }

    /**
     * არსებული ჩანაწერის გასაღებები — ორივე.
     *
     * @param  array<string, mixed>  $values
     * @return list<string>
     */
    public static function existing(string $module, array $values): array
    {
        $identity = ImportSource::identity($module);
        if ($identity === null) {
            return [];
        }

        return array_values(array_unique([...self::ids($identity, $values), ...self::titles($identity, $values)]));
    }

    /**
     * ჩემი ჩანაწერი, რომელიც ფაილის ამ რიგს ემთხვევა (ან `null`).
     *
     * @param  array<string, mixed>  $values
     */
    public static function find(User $user, string $module, array $values): ?Model
    {
        $identity = ImportSource::identity($module);
        $keys = self::incoming($module, $values);

        if ($identity === null || $keys === []) {
            return null;
        }

        $class = ExportDomain::model($module);
        /** @var Model $model */
        $model = new $class;
        $columns = MediarySchema::columns($model->getTable());

        $query = $class::withoutGlobalScopes()
            ->where($model->qualifyColumn('user_id'), $user->getKey())
            ->when(CustomModules::isKey($module), fn (Builder $q) => $q->where($model->qualifyColumn('module'), $module));

        $ids = [];
        foreach ($identity['ids'] as $column) {
            $value = self::raw($values[$column] ?? null);
            if ($value !== null) {
                $ids[$column] = $value;
            }
        }

        if ($ids !== []) {
            $query->where(function (Builder $w) use ($ids) {
                foreach ($ids as $column => $value) {
                    $w->orWhere($column, $value);
                }
            });
        } else {
            $titles = array_values(array_filter(array_map(fn (string $c) => self::raw($values[$c] ?? null), $identity['title'])));

            if ($titles === []) {
                return null;
            }

            $query->where(function (Builder $w) use ($identity, $titles, $columns) {
                foreach ($identity['title'] as $column) {
                    if (! isset($columns[$column])) {
                        // ფილმი/სერიალი/ანიმე — სათაური თარგმანებშია (`<domain>_translations.title`)
                        $w->orWhereHas('translations', fn (Builder $t) => $t->whereIn('title', $titles));
                    } elseif ($columns[$column]['type'] === 'date') {
                        // მორიგეობის დღე — სვეტი `Y-m-d`-ია, ფაილში კი `Y-m-d H:i:s`
                        foreach ($titles as $title) {
                            $w->orWhereDate($column, substr($title, 0, 10));
                        }
                    } else {
                        $w->orWhereIn($column, $titles);
                    }
                }
            });
        }

        foreach ($query->limit(self::CANDIDATES)->get() as $candidate) {
            if (array_intersect($keys, self::existing($module, self::valuesOf($module, $candidate))) !== []) {
                return $candidate;
            }
        }

        return null;
    }

    /**
     * ჩანაწერის მნიშვნელობები იდენტობის სვეტებზე (აქსესორებიც — `title_ka`, `workplace_name`).
     *
     * @return array<string, mixed>
     */
    public static function valuesOf(string $module, Model $record): array
    {
        $identity = ImportSource::identity($module) ?? ['ids' => [], 'title' => [], 'with' => []];
        $out = [];

        foreach ([...$identity['ids'], ...$identity['title'], ...$identity['with']] as $column) {
            $out[$column] = $record->getAttribute($column);
        }

        return $out;
    }

    /**
     * ეკრანისთვის: რიგის სათაური (პირველი არაცარიელი), მორიგეობაზე — დღე და სამსახური.
     *
     * @param  array<string, mixed>  $values
     */
    public static function label(string $module, array $values): string
    {
        $identity = ImportSource::identity($module) ?? ['title' => [], 'with' => []];

        foreach ($identity['title'] as $column) {
            $value = $values[$column] ?? null;

            if (is_scalar($value) && trim((string) $value) !== '') {
                $label = trim((string) $value);

                return $module === 'duty'
                    ? trim(substr($label, 0, 10).' '.(is_scalar($values['workplace_name'] ?? null) ? $values['workplace_name'] : ''))
                    : mb_substr($label, 0, 300);
            }
        }

        return '';
    }

    /* ---------- შიგნეული ---------- */

    /** @return list<string> */
    private static function ids(array $identity, array $values): array
    {
        $out = [];

        foreach ($identity['ids'] as $column) {
            $value = self::norm($values[$column] ?? null);
            if ($value !== '') {
                $out[] = "{$column}:{$value}";
            }
        }

        return $out;
    }

    /** @return list<string> */
    private static function titles(array $identity, array $values): array
    {
        $with = implode('|', array_map(fn (string $c) => self::norm($values[$c] ?? null), $identity['with']));
        $out = [];

        foreach ($identity['title'] as $column) {
            $title = self::norm($values[$column] ?? null);
            if ($title !== '') {
                $out[] = "title:{$title}|{$with}";
            }
        }

        return array_values(array_unique($out));
    }

    /** შედარების ფორმა: ქვედა რეგისტრი, ერთი ჰარი, თარიღი კედლის საათით */
    private static function norm(mixed $value): string
    {
        if ($value instanceof DateTimeInterface) {
            $value = AppTime::at($value)?->format('Y-m-d H:i:s');
        }

        if (is_float($value) && floor($value) === $value) {
            $value = (int) $value;
        }

        if (is_bool($value)) {
            $value = $value ? '1' : '0';
        }

        if (! is_scalar($value)) {
            return '';
        }

        return mb_strtolower(trim((string) preg_replace('/\s+/u', ' ', (string) $value)));
    }

    /** SQL-ის ზუსტი ტოლობისთვის — როგორც ფაილშია, მხოლოდ ჩამოჭრილი */
    private static function raw(mixed $value): ?string
    {
        if (! is_scalar($value) || is_bool($value)) {
            return null;
        }

        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }
}
