<?php

namespace App\Services\Share;

use App\Models\User;
use App\Support\MediaDomain;
use App\Support\PublicDomain;
use App\Support\ShareDomain;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;

/**
 * **„ეს უკვე გაქვს?" — ერთი წესი სამი ადგილისთვის (Tasks §40.7, §40.8).**
 *
 * მიმღების გვერდის „უკვე გაქვს ✓", დამატების გეგმის „ახალი · გაქვს · ურნაშია"
 * და თვითონ დამატება ერთსა და იმავე კითხვას სვამენ. ორი წესი ეკრანზე
 * „ახალს" დახატავდა და დამატება მერე „უკვე გქონდა"-ს იტყოდა.
 *
 * იდენტობის სამი საფეხური, ამ რიგით:
 *  1. **გლობალური იდენტობა** (`PublicDomain::MATCH` — მედიაზე `tmdb_id`);
 *  2. **`imdb_id`** — ხელით შეყვანილ ფილმს TMDB-ის კოდი შეიძლება არ ჰქონდეს,
 *     IMDb-ისა კი ჰქონდეს (`unique(user_id, imdb_id)` მას ისედაც იცავს);
 *  3. **სათაური + წელი** — არც ერთი კოდი რომ არ აქვს (CSV-იმპორტის წესი):
 *     რეგისტრი და ზედმეტი ჰარი არ ითვლება, სათაური ორივე ენაზე შედარდება.
 *
 * ⚠️ **ურნაც ჩანს** (`trashed: true`) — 40.1-ის გაკვეთილი: ურნაში მყოფზე
 * „არ გაქვს" ტყუილი იქნებოდა და დამატება `unique`-ზე წაიქცეოდა. ორივე თუ
 * არის, ცოცხალი იმარჯვებს.
 * ⚠️ **ერთი query მთელ სიაზე** და არა ჩანაწერზე; მფლობელი ცხადია (`owner`
 * და `trash` scope-ების გარეშე — მნახველის ურნაც უნდა ჩანდეს).
 */
final class ShareMatcher
{
    /**
     * @param  Collection<int, Model>  $records  გამზიარებლის ჩანაწერები
     * @return array<int, array{id: int, trashed: bool}> გამზიარებლის ჩანაწერის id-ით
     */
    public static function matches(User $viewer, string $domain, Collection $records): array
    {
        if ($records->isEmpty()) {
            return [];
        }

        $media = MediaDomain::has($domain);
        $columns = PublicDomain::MATCH[$domain]['columns'] ?? [];
        $first = $columns[0] ?? null;

        $withIdentity = $records->filter(fn (Model $r) => self::identityKey($domain, $r) !== null);
        $rest = $records->reject(fn (Model $r) => self::identityKey($domain, $r) !== null);
        $byImdb = $media ? $rest->filter(fn (Model $r) => (string) $r->getAttribute('imdb_id') !== '') : collect();
        $byTitle = $media ? $rest->reject(fn (Model $r) => (string) $r->getAttribute('imdb_id') !== '') : collect();

        $identityValues = $first ? $withIdentity->pluck($first)->unique()->values()->all() : [];
        $imdbValues = $byImdb->pluck('imdb_id')->unique()->values()->all();
        $years = $byTitle->pluck('year')->unique()->values();

        if ($identityValues === [] && $imdbValues === [] && $years->isEmpty()) {
            return [];
        }

        $model = ShareDomain::model($domain);

        $rows = $model::withoutGlobalScopes(['owner', 'trash'])
            // ⚠️ თარგმანი მხოლოდ სათაურით შედარებას სჭირდება; სტატუსი — არავის
            ->withOnly($byTitle->isNotEmpty() ? ['translations'] : [])
            ->where('user_id', $viewer->id)
            ->where(function (Builder $q) use ($first, $identityValues, $imdbValues, $years) {
                if ($first && $identityValues !== []) {
                    $q->orWhereIn($first, $identityValues);
                }

                if ($imdbValues !== []) {
                    $q->orWhereIn('imdb_id', $imdbValues);
                }

                if ($years->isNotEmpty()) {
                    $q->orWhere(function (Builder $y) use ($years) {
                        $known = $years->filter(fn ($v) => $v !== null)->all();

                        if ($known !== []) {
                            $y->orWhereIn('year', $known);
                        }

                        if ($years->contains(null)) {
                            $y->orWhereNull('year');
                        }
                    });
                }
            })
            ->get();

        $out = [];

        foreach ($records as $record) {
            $key = self::identityKey($domain, $record);

            $candidates = $key !== null
                ? $rows->filter(fn (Model $row) => self::identityKey($domain, $row) === $key)
                : ($media && (string) $record->getAttribute('imdb_id') !== ''
                    ? $rows->filter(fn (Model $row) => (string) $row->getAttribute('imdb_id') === (string) $record->getAttribute('imdb_id'))
                    : ($media ? self::byTitle($record, $rows) : collect()));

            $pick = $candidates->first(fn (Model $row) => $row->getAttribute('trashed_at') === null) ?? $candidates->first();

            if ($pick) {
                $out[(int) $record->getKey()] = [
                    'id' => (int) $pick->getKey(),
                    'trashed' => $pick->getAttribute('trashed_at') !== null,
                ];
            }
        }

        return $out;
    }

    /** იდენტობის გასაღები — ცარიელ სვეტზე `null` (ასეთი ჩანაწერი იდენტობით არ ემთხვევა) */
    public static function identityKey(string $domain, Model $record): ?string
    {
        $parts = [];

        foreach (PublicDomain::MATCH[$domain]['columns'] ?? [] as $column) {
            $value = $record->getAttribute($column);

            if ($value === null || $value === '') {
                return null;
            }

            $parts[] = (string) $value;
        }

        return $parts === [] ? null : implode("\x1f", $parts);
    }

    /**
     * სათაური + წელი — მხოლოდ ის რიგები, რომლებსაც **არც** იდენტობა უმთხვევა.
     *
     * @param  Collection<int, Model>  $rows
     * @return \Illuminate\Support\Collection<int, Model>
     */
    private static function byTitle(Model $record, Collection $rows): \Illuminate\Support\Collection
    {
        $titles = self::titles($record);

        if ($titles === []) {
            return collect();
        }

        return $rows->filter(function (Model $row) use ($record, $titles) {
            $sameYear = $row->getAttribute('year') === null
                ? $record->getAttribute('year') === null
                : (int) $row->getAttribute('year') === (int) $record->getAttribute('year');

            return $sameYear && array_intersect($titles, self::titles($row)) !== [];
        })->values();
    }

    /** @return list<string> ნორმალიზებული სათაურები ორივე ენაზე */
    private static function titles(Model $record): array
    {
        $out = [];

        foreach (['title_en', 'title_ka'] as $field) {
            $value = $record->getAttribute($field);

            if (is_string($value) && trim($value) !== '') {
                $out[] = mb_strtolower(trim((string) preg_replace('/\s+/u', ' ', $value)));
            }
        }

        return array_values(array_unique($out));
    }
}
