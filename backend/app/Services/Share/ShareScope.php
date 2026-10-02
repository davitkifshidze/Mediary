<?php

namespace App\Services\Share;

use App\Models\Genre;
use App\Models\ShareLink;
use App\Models\Status;
use App\Models\User;
use App\Services\Gallery\GalleryScope;
use App\Support\ShareDomain;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;

/**
 * **გაზიარების ბმულის ფარგლები — ერთი query ყველა ადგილისთვის (Tasks §40.3).**
 *
 * ⚠️ **ერთი განსაზღვრა სამ ადგილას**: შექმნის ფანჯრის რიცხვი („ბმულში 128
 * ფილმია"), მიმღების გვერდი და (40.8-ში) ბიბლიოთეკაში დამატება. ორი ასლი
 * „ბმულში 40-ია"-სა და „დაემატა 43"-ს ერთმანეთს დააშორებდა — `/purge`-ის
 * `plan()`/`runOne()`-ის წესი.
 *
 * ⚠️ **მფლობელი ცხადია** (`withoutGlobalScope('owner')` + `user_id`):
 * ბმულზე მნახველი სხვაა — ანონიმს scope საერთოდ არ აქვს (ყველა ანგარიშის
 * ფილმები დაბრუნდებოდა), შესულ უცხოს კი **მის საკუთარზე** მოჭრიდა.
 * `trash` scope რჩება — ურნაში მყოფი ბმულში არ ჩანს.
 *
 * ⚠️ **რეჟიმები `GalleryScope`-ისაა** (`all` · `status` · `favorite` ·
 * `genre` · `ids`) და ფილტრების წესიც იქ წერია — აქ მხოლოდ მფლობელი და
 * „მხოლოდ საჯაროები" ემატება. „მხოლოდ საჯარო" **ჩანაწერის** ფენაა
 * (`visibility = public`) და არა სამივე: ბმული თვითონაა თანხმობა.
 *
 * ⚠️ **ცოცხალია** (Q47): წესი ყოველ გახსნაზე ითვლება, ე.ი. ფარგალს მორგებული
 * ახალი ჩანაწერი ბმულშიც ჩნდება. ხელით მონიშნული ფიქსირებული სიაა.
 */
final class ShareScope
{
    public const MODES = ['all', 'status', 'favorite', 'genre', 'ids'];

    public const GENRE_MODES = ['any', 'all'];

    /** ხელით მონიშნულის ჭერი ერთ დომენზე */
    public const MAX_IDS = 5000;

    /** ვალიდაციის წესები — `domains` რუკისთვის ერთი ადგილი */
    public static function rules(): array
    {
        return [
            'domains' => ['required', 'array', 'min:1'],
            'domains.*' => ['array'],
            'domains.*.scope' => ['required', Rule::in(self::MODES)],
            'domains.*.statuses' => ['nullable', 'array', 'max:50'],
            'domains.*.statuses.*' => ['string', 'max:60'],
            'domains.*.genres' => ['nullable', 'array', 'max:50'],
            'domains.*.genres.*' => ['string', 'max:80'],
            'domains.*.genre_mode' => ['nullable', Rule::in(self::GENRE_MODES)],
            'domains.*.ids' => ['nullable', 'array', 'max:'.self::MAX_IDS],
            'domains.*.ids.*' => ['integer'],
            'domains.*.public_only' => ['nullable', 'boolean'],
        ];
    }

    /**
     * მოსული რუკის შემოწმება და შესანახ ფორმამდე დაყვანა.
     *
     * ⚠️ **ცარიელი არჩევანი ცხადი 422-ია** (`share_scope_incomplete`) და არა
     * „ყველაფერი": „სტატუსით" არცერთი სტატუსის გარეშე, ან „კონკრეტული" — არცერთი
     * ჩანაწერის გარეშე, მთელ ბიბლიოთეკას გაუზიარებდა (`GalleryScope`-ის წესი).
     *
     * ⚠️ **ხელით მონიშნული მფლობელის ცოცხალ ჩანაწერებზე იჭრება** — სხვისი ან
     * ურნაში მყოფი id ჩუმად ვარდება, რიცხვი კი ამიტომ პატიოსანი რჩება.
     *
     * @param  array<string, array<string, mixed>>  $domains
     * @return array<string, array<string, mixed>>
     */
    public static function normalize(User $owner, array $domains): array
    {
        $available = ShareDomain::availableFor($owner);
        $out = [];

        foreach ($domains as $domain => $spec) {
            $domain = (string) $domain;

            if (! in_array($domain, $available, true)) {
                self::fail('share_domain_unavailable', $domain);
            }

            $scope = (string) $spec['scope'];
            $clean = ['scope' => $scope, 'public_only' => (bool) ($spec['public_only'] ?? false)];

            if ($scope === 'status') {
                $keys = array_values(array_unique(array_map('strval', (array) ($spec['statuses'] ?? []))));
                $known = Status::keysFor((int) $owner->id, $domain);

                if ($keys === []) {
                    self::fail('share_scope_incomplete', $domain);
                }

                if (array_diff($keys, $known) !== []) {
                    self::fail('invalid_status', $domain);
                }

                $clean['statuses'] = $keys;
            }

            if ($scope === 'genre') {
                $slugs = array_values(array_unique(array_map('strval', (array) ($spec['genres'] ?? []))));
                // ⚠️ უცნობი slug ჩუმად ვარდება — ჟანრი გლობალურია და შეიძლება წაიშალოს
                $slugs = Genre::whereIn('slug', $slugs)->pluck('slug')->all();

                if ($slugs === []) {
                    self::fail('share_scope_incomplete', $domain);
                }

                sort($slugs);
                $clean['genres'] = $slugs;
                $clean['genre_mode'] = ($spec['genre_mode'] ?? 'any') === 'all' ? 'all' : 'any';
            }

            if ($scope === 'ids') {
                $ids = self::ownIds($owner, $domain, (array) ($spec['ids'] ?? []));

                if ($ids === []) {
                    self::fail('share_scope_incomplete', $domain);
                }

                $clean['ids'] = $ids;
            }

            $out[$domain] = $clean;
        }

        return $out;
    }

    /**
     * **ერთადერთი query** — მფლობელის ჩანაწერები ერთ დომენში, ფარგლით.
     *
     * @param  array<string, mixed>  $spec  `normalize()`-ის ფორმა
     */
    public static function query(User $owner, string $domain, array $spec): Builder
    {
        $model = ShareDomain::model($domain);
        $base = $model::withoutGlobalScope('owner');
        $table = $base->getModel()->getTable();
        $base->where($table.'.user_id', $owner->id);

        $scope = (string) ($spec['scope'] ?? 'all');

        $query = GalleryScope::query($domain, [
            'scope' => $scope,
            'statuses' => $spec['statuses'] ?? [],
            'favorite' => $scope === 'favorite',
            'genres' => $spec['genres'] ?? [],
            'genre_mode' => $spec['genre_mode'] ?? 'any',
            // ⚠️ ცარიელი სია „არცერთია" (`GalleryScope::ids()` → `1 = 0`)
            'ids' => $scope === 'ids' ? array_values(array_map('intval', (array) ($spec['ids'] ?? []))) : null,
        ], $base);

        if (! empty($spec['public_only'])) {
            $query->where($table.'.visibility', 'public');
        }

        return $query;
    }

    /**
     * ბმულის **ცოცხალი** დომენები — მხოლოდ ის, რაც მფლობელს ჯერ კიდევ
     * შეუძლია გააზიაროს (გათიშული მოდული ჩუმად ქრება, §40.6).
     *
     * @return array<string, array<string, mixed>>
     */
    public static function liveDomains(ShareLink $link, User $owner): array
    {
        $available = ShareDomain::availableFor($owner);

        return array_filter(
            (array) $link->domains,
            fn ($spec, $domain) => in_array((string) $domain, $available, true) && is_array($spec),
            ARRAY_FILTER_USE_BOTH,
        );
    }

    /**
     * რამდენი ჩანაწერია და მათგან რამდენი პირადი — შექმნის ფანჯრის
     * გაფრთხილებისთვის („ვისაც ეს ბმული ექნება, შენს პირად ჩანაწერებსაც
     * დაინახავს").
     *
     * @param  array<string, array<string, mixed>>  $domains
     * @return array{domains: array<string, array{total: int, private: int}>, total: int, private: int}
     */
    public static function counts(User $owner, array $domains): array
    {
        $rows = [];
        $total = 0;
        $private = 0;

        foreach ($domains as $domain => $spec) {
            $count = self::query($owner, (string) $domain, $spec)->count();
            $hidden = empty($spec['public_only'])
                ? self::query($owner, (string) $domain, $spec)
                    ->where(function (Builder $q) {
                        $table = $q->getModel()->getTable();
                        $q->where($table.'.visibility', '!=', 'public')->orWhereNull($table.'.visibility');
                    })
                    ->count()
                : 0;

            $rows[(string) $domain] = ['total' => $count, 'private' => $hidden];
            $total += $count;
            $private += $hidden;
        }

        return ['domains' => $rows, 'total' => $total, 'private' => $private];
    }

    /** @return list<int> */
    private static function ownIds(User $owner, string $domain, array $ids): array
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));

        if ($ids === []) {
            return [];
        }

        $model = ShareDomain::model($domain);
        $base = $model::withoutGlobalScope('owner');
        $table = $base->getModel()->getTable();

        $own = $base->where($table.'.user_id', $owner->id)
            ->whereIn($table.'.id', $ids)
            ->pluck($table.'.id')
            ->map(fn ($id) => (int) $id)
            ->all();

        sort($own);

        return $own;
    }

    /** @return never */
    private static function fail(string $code, string $domain): void
    {
        throw new HttpResponseException(response()->json(['message' => $code, 'domain' => $domain], 422));
    }
}
