<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Model;

/**
 * **„ეს ბმული უკვე გაქვს" (FEAT-17).**
 *
 * ფილმს `imdb_id` per-user unique-ით იცავს და მეორედ დამატებას 422-ით
 * აჩერებს; ვიდეოსა და სიმღერას ასეთი არაფერი ჰქონდა — ერთი და იგივე
 * YouTube-ის ბმული ჩუმად ორჯერ ემატებოდა, ხოლო მატჩინგი (§16.2) და
 * ძებნა დუბლს ორად ითვლიდა.
 *
 * ⚠️ **ეს გაფრთხილებაა და არა აკრძალვა** (ტასქის ცხადი გადაწყვეტილება):
 * ერთი ბმულის ორჯერ შენახვა **ლეგიტიმურია** — სხვა ტიპით, სხვა ტეგებით,
 * ერთხელ „ინფორმაციული" და ერთხელ „გასართობი". მკაცრი `unique` სწორედ ამ
 * ნამდვილ შემთხვევას ჩაკეტავდა; ამიტომ არც ინდექსი დაემატა და არც 422 —
 * `POST /{module}/metadata` მხოლოდ ეუბნება ფორმას, რომ ასეთი ჩანაწერი
 * უკვე არსებობს, და ფორმა ბმულს აჩვენებს.
 *
 * ⚠️ **იდენტობა `platform` + `external_id`-ია და არა `url`** — იგივე წყვილი,
 * რომელსაც `PublicDomain::MATCH` იყენებს. ერთი და იმავე ვიდეოს ათი სხვადასხვა
 * მისამართი აქვს (`youtu.be/…`, `?t=42`, `&list=…`), ე.ი. სტრიქონული
 * შედარება დუბლს **ვერ** იპოვიდა — სწორედ იმ შემთხვევაში, რომლისთვისაც
 * ეს დაიწერა.
 *
 * ⚠️ **`url` მაინც საჭიროა და მეორე გზაა**: პირდაპირ ფაილზე
 * (`.mp4`/`.webm`) `platform = 'other'` და `external_id = null`, ე.ი.
 * იდენტობა არ არსებობს; მაშინ ერთადერთი შესადარებელი მისამართია.
 * ⚠️ **`external_id = null`-ზე შედარება აკრძალულია** — თორემ ყველა
 * პირდაპირი ბმული ერთმანეთის დუბლი გახდებოდა.
 *
 * ⚠️ **რედაქტირებისას ჩანაწერი საკუთარ თავს ვერ დაემთხვევა** (`$exclude`):
 * არსებული ვიდეოს ფორმის გახსნა თავის მისამართს ხელახლა ამოწმებს და
 * უამისოდ ყოველთვის იტყოდა „ეს უკვე გაქვს".
 *
 * ⚠️ **`owner` და `trash` scope-ები ძალაშია და ესეც სწორია**: სხვისი
 * ბიბლიოთეკა არაფერ შუაშია, ხოლო კალათაში მყოფი ჩანაწერი სიაში აღარ არის —
 * მასზე მიმავალი ბმული „გახსენი" ცარიელ ადგილას გადაიყვანდა.
 */
final class DuplicateLink
{
    /**
     * @param  class-string<Model>  $model
     * @return array{id: int, title: string|null}|null
     */
    public static function find(string $model, string $url, ?int $exclude = null): ?array
    {
        $parsed = VideoUrl::parse($url);

        $query = $model::query()
            ->when($exclude, fn ($q) => $q->whereKeyNot($exclude));

        if ($parsed['external_id']) {
            $query->where('platform', $parsed['platform'])
                ->where('external_id', $parsed['external_id']);
        } else {
            $query->where('url', $url);
        }

        $row = $query->orderBy('id')->first(['id', 'title']);

        return $row ? ['id' => (int) $row->id, 'title' => $row->title] : null;
    }

    /**
     * **ბევრი ბმული ერთად** — ვებძებნის შედეგების სია (Tasks §19.6).
     *
     * ⚠️ **რამდენი ბმულიც არ უნდა იყოს, მაქსიმუმ ორი მოთხოვნაა**: ერთი
     * წყვილებზე (`platform` + `external_id`), ერთი უიდენტობო მისამართებზე.
     * `find()`-ის ციკლი ასი შედეგისთვის ას მოთხოვნას გაგზავნიდა, თანაც
     * ძებნის პასუხის შიგნით — ე.ი. ყოველ ძებნაზე.
     *
     * ⚠️ **წესი იგივეა, რაც `find()`-ისა** (წყვილი უპირატესია, `null`
     * იდენტობაზე შედარება აკრძალულია, ორივე scope ძალაშია) — ეს იმავე
     * კითხვის ბევრი ბმულის ფორმაა და არა ახალი წესი.
     *
     * ⚠️ **ბმულის შედარება რეგისტრს არ ცნობს** — MySQL-ის collation ისედაც
     * ასე ადარებს, ე.ი. ბაზიდან დაბრუნებული `url` შეიძლება სხვა ასოებით
     * იყოს დაწერილი, ვიდრე გადმოცემული. რუკა ამიტომ დაბალ რეგისტრზეა აწყობილი.
     *
     * @param  class-string<Model>  $model
     * @param  list<string>  $urls
     * @return array<string, array{id: int, title: string|null}|null> გასაღები — გადმოცემული ბმული
     */
    public static function findMany(string $model, array $urls): array
    {
        $out = [];
        /** @var array<string, list<string>> $pairs „platform|external_id" → ბმულები */
        $pairs = [];
        /** @var array<string, list<string>> $plain დაბალი რეგისტრი → ბმულები */
        $plain = [];

        foreach (array_unique(array_filter($urls, 'is_string')) as $url) {
            $out[$url] = null;
            $parsed = VideoUrl::parse($url);

            if ($parsed['external_id']) {
                $pairs[$parsed['platform'].'|'.$parsed['external_id']][] = $url;
            } else {
                $plain[mb_strtolower($url)][] = $url;
            }
        }

        if ($pairs) {
            $ids = array_values(array_unique(array_map(
                fn (string $key) => substr($key, strpos($key, '|') + 1),
                array_keys($pairs),
            )));

            $rows = $model::query()
                ->whereIn('external_id', $ids)
                ->orderBy('id')
                ->get(['id', 'title', 'platform', 'external_id']);

            foreach ($rows as $row) {
                // ⚠️ id ერთია, პლატფორმა კი შეიძლება სხვა იყოს — წყვილი აქ მოწმდება
                foreach ($pairs[$row->platform.'|'.$row->external_id] ?? [] as $url) {
                    $out[$url] ??= ['id' => (int) $row->id, 'title' => $row->title];
                }
            }
        }

        if ($plain) {
            $rows = $model::query()
                ->whereIn('url', array_merge(...array_values($plain)))
                ->orderBy('id')
                ->get(['id', 'title', 'url']);

            foreach ($rows as $row) {
                foreach ($plain[mb_strtolower((string) $row->url)] ?? [] as $url) {
                    $out[$url] ??= ['id' => (int) $row->id, 'title' => $row->title];
                }
            }
        }

        return $out;
    }
}
