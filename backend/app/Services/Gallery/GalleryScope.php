<?php

namespace App\Services\Gallery;

use App\Models\User;
use App\Support\MediaDomain;
use Illuminate\Database\Eloquent\Builder;

/**
 * **„რომელ ჩანაწერებზე" — ერთი წყარო ორივე სამიზნისთვის (Tasks §8.2).**
 *
 * ჩამოტვირთვის დიალოგს ორი ტაბი აქვს (ჩანაწერის ფოტოები · მსახიობების
 * ფოტოები) და **სკოუპი ორივეს ერთი აქვს**: მსახიობების ავზი სწორედ ამ
 * ჩანაწერების შემადგენლობაა. ორი ასლი ერთ დღეს „ამ ფილმის მსახიობებს" და
 * „ამ ფილმს" ერთმანეთს გააშორებდა.
 *
 * ## რა დაემატა §8.2-ში
 *
 * ⚠️ **`types[]` — სამივე დომენი ერთ გეგმაში.** აქამდე `type` ერთი იყო და
 * „ფილმებზე, სერიალებზე და ანიმეებზე ჯამში" სამ ცალკე გაშვებას ნიშნავდა.
 *
 * ⚠️ **`statuses[]` მულტია.** ერთი `status` „გადაუწყვეტელი **და**
 * საყურებელი"-ს ვერ გამოხატავდა.
 *
 * ⚠️ **`genre_mode`** — `any` (ნებისმიერი არჩეული ჟანრი) თუ `all` (ყველა
 * ერთდროულად). აქამდე მხოლოდ `all` იყო და „აქშენი ან დრამა" შეუძლებელი იყო;
 * სამი ჟანრის მონიშვნა კი ხშირად **ცარიელ** სკოუპს იძლეოდა, რაც
 * „არაფერი მაქვს"-ად იკითხებოდა.
 *
 * ⚠️ **`scope = 'off'`** — მხოლოდ მსახიობების სამიზნეზე: ჩანაწერების
 * სკოუპი გამორთულია და ავზი **მთელი ბიბლიოთეკის** მსახიობებია
 * („ან ჩათიშო და ზოგადად მსახიობზე ჩამოწერ").
 *
 * ⚠️ **`scope`-ის გარეშე ძველი ქცევა რჩება** (რაც ფილტრი მოვიდა, ის მუშაობს) —
 * ძველი კლიენტი და ტესტები არ უნდა გატყდეს. როცა `scope` ცხადად მოდის,
 * **მხოლოდ ის** ფილტრი მუშაობს: „ჟანრი" არჩეულზე სტატუსის ნარჩენი
 * მნიშვნელობა სკოუპს ჩუმად აღარ ავიწროებს.
 */
final class GalleryScope
{
    public const MODES = ['all', 'status', 'favorite', 'genre', 'ids', 'off'];

    public const GENRE_MODES = ['any', 'all'];

    /** ვალიდაციის წესები — `plan()`-ისთვის ერთი ადგილი */
    public static function rules(): array
    {
        return [
            'scope' => ['nullable', 'in:'.implode(',', self::MODES)],
            // ერთი დომენი (ძველი) და სია (ახალი) — ორივე მიიღება
            'type' => ['nullable', MediaDomain::rule()],
            'types' => ['nullable', 'array'],
            'types.*' => [MediaDomain::rule()],
            'status' => ['nullable', 'string', 'max:40'],
            'statuses' => ['nullable', 'array'],
            'statuses.*' => ['string', 'max:40'],
            'favorite' => ['nullable', 'boolean'],
            'genres' => ['nullable', 'array'],
            'genres.*' => ['string'],
            'genre_mode' => ['nullable', 'in:'.implode(',', self::GENRE_MODES)],
            // `ids` ორ ფორმაში: ბრტყელი სია (ერთი დომენი) ან დომენების რუკა
            'ids' => ['nullable', 'array'],
        ];
    }

    /**
     * რომელი დომენები მონაწილეობს — **მხოლოდ ჩართული მოდულები** (I3).
     *
     * @return list<string>
     */
    public static function types(User $user, array $data): array
    {
        $requested = $data['types'] ?? (isset($data['type']) ? [$data['type']] : null);

        return MediaDomain::enabledFor($user, $requested);
    }

    /** სკოუპი გამორთულია? (მხოლოდ მსახიობების სამიზნეზე აქვს აზრი) */
    public static function isOff(array $data): bool
    {
        return ($data['scope'] ?? null) === 'off';
    }

    /**
     * ერთი დომენის query სკოუპით.
     *
     * ⚠️ `MediaDomain::query()` `owner` global scope-ს იმემკვიდრეობს, ე.ი.
     * სხვისი ჩანაწერი აქ ვერ მოხვდება.
     */
    public static function query(string $type, array $data): Builder
    {
        $query = MediaDomain::query($type);
        $scope = $data['scope'] ?? null;

        if ($scope === 'off' || $scope === 'all') {
            return $query;
        }

        $statuses = self::statuses($data);

        if ($statuses && self::applies($scope, 'status')) {
            // §6.4 — სტატუსი per-user ლექსიკონის რიგია; ფილტრი გასაღებით რჩება
            $query->statusKey($statuses);
        }

        if (! empty($data['favorite']) && self::applies($scope, 'favorite')) {
            $query->where('is_favorite', true);
        }

        if (! empty($data['genres']) && self::applies($scope, 'genre')) {
            $slugs = array_values(array_filter((array) $data['genres'], 'is_string'));

            if (($data['genre_mode'] ?? 'all') === 'any') {
                // „ნებისმიერი არჩეული" — ერთი `whereHas` სიაზე
                $query->whereHas('genres', fn ($q) => $q->whereIn('slug', $slugs));
            } else {
                // „ყველა ერთდროულად" — თითო ჟანრზე თავისი `whereHas` (არსებული ქცევა)
                foreach ($slugs as $slug) {
                    $query->whereHas('genres', fn ($q) => $q->where('slug', $slug));
                }
            }
        }

        $ids = self::ids($data, $type);

        if ($scope === 'ids') {
            /* ⚠️ **„კონკრეტული ჩანაწერები" ცარიელ დომენზე არაფერს ნიშნავს და
               არა „ყველაფერს".** პიქერი დომენებად არის გაყოფილი: ორი ფილმის
               მონიშვნისას სერიალები უბრალოდ არ მონაწილეობს. `/sync`-ის ძველი
               ქცევა (ცარიელი = მთელი დომენი) აქ მთელ ბიბლიოთეკას ჩამოწერდა. */
            return $ids === null ? $query->whereRaw('1 = 0') : $query->whereIn('id', $ids);
        }

        if ($ids !== null && $scope === null) {
            $query->whereIn('id', $ids);
        }

        return $query;
    }

    /** ცხადი სკოუპისას მხოლოდ თავისი ფილტრი მუშაობს; მის გარეშე — ყველა მოსული */
    private static function applies(?string $scope, string $filter): bool
    {
        return $scope === null || $scope === $filter;
    }

    /** @return list<string> */
    private static function statuses(array $data): array
    {
        $list = $data['statuses'] ?? null;

        if (! is_array($list)) {
            $list = isset($data['status']) && $data['status'] !== '' ? [$data['status']] : [];
        }

        return array_values(array_filter(array_map(
            fn ($value) => is_string($value) ? trim($value) : null,
            $list,
        )));
    }

    /**
     * არჩეული ჩანაწერების id-ები ამ დომენზე.
     *
     * ⚠️ ორი ფორმა და ორივე საჭიროა: `ids: [1,2]` (ერთი დომენი — ძველი
     * კლიენტი და ჩანაწერის გვერდიდან გახსნილი დიალოგი) და
     * `ids: {movie: [1], series: [2]}` (მრავალდომენიანი პიქერი — `/sync`-ის
     * არსებული ფორმა). `null` = „არჩევანი არ არის", ცარიელი მასივი კი
     * **ცხადი** „არცერთი"-ა და სკოუპს ცარიელს ტოვებს.
     *
     * @return list<int>|null
     */
    private static function ids(array $data, string $type): ?array
    {
        $ids = $data['ids'] ?? null;

        if (! is_array($ids) || $ids === []) {
            return null;
        }

        // დომენების რუკა
        if (array_is_list($ids) === false) {
            return isset($ids[$type]) && is_array($ids[$type])
                ? array_map('intval', $ids[$type])
                : null;
        }

        return array_map('intval', $ids);
    }
}
