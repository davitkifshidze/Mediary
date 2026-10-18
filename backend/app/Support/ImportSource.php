<?php

namespace App\Support;

/**
 * **იმპორტი მხოლოდ შენი მონაცემის ფაილებიდან.**
 *
 * ერთადერთი წყარო — **Mediary-ის საკუთარი ექსპორტი**: მოდულის JSON/CSV
 * (`GET /export/{module}`) და „ჩემი სრული ექსპორტის" ZIP (`POST /export/archive`).
 * მონაცემი ფაილიდან იღება, როგორც არის — TMDB-ს და სხვა წყაროს არავინ ეკითხება.
 *
 * ⚠️ **Letterboxd/IMDb/Goodreads/Steam-ის იმპორტი წაშლილია**:
 * ის რიგს TMDB-ზე, Open Library-სა და RAWG-ზე ეძებდა, ანუ „იმპორტი" სინამდვილეში
 * გარე საიტიდან დამატება იყო — შენი სიტყვით, ეს არ გინდა.
 *
 * ⚠️ **ეს რუკა იდენტობისაა და არა სვეტების.** სვეტები ექსპორტის ფაილშივე წერია
 * (`ExportDomain::fields()`, ფაილის `fields`), ე.ი. რუკა აღარ სჭირდება; რაც
 * ფაილი ვერ იტყვის — „ეს ჩანაწერი უკვე მაქვს თუ არა" — აქ წყდება (`IDENTITY`).
 */
final class ImportSource
{
    /**
     * რამდენ ჩანაწერამდე იკითხება ერთი ფაილი (ZIP-ში — ყველა მოდული ერთად).
     *
     * ⚠️ **ჭერი აუცილებელია და არა თავაზიანობა**: გეგმა ყველა რიგს ერთ პასუხში
     * აბრუნებს და თითოეულს დუბლიკატზე ამოწმებს.
     */
    public const MAX_ROWS = 20000;

    /**
     * რამდენი ჩანაწერი დევს დროებითი ასლის ერთ ნაწილში.
     *
     * ⚠️ ერთეულის ბიჯი (`POST /import/item`) მხოლოდ თავის ნაწილს კითხულობს —
     * 5000-ჩანაწერიანი ფაილის ყოველ რიგზე თავიდან გაშიფვრა 5000-ჯერ მთელ ფაილს
     * წაიკითხავდა.
     */
    public const CHUNK = 100;

    /**
     * ატვირთული ფაილი რამდენ საათს ცოცხლობს (გეგმიდან ბოლო ერთეულამდე).
     * ⚠️ ზღვარი ცალკე `UploadLimits`-შია (`import` — JSON/CSV, `import_archive` — ZIP).
     */
    public const TTL_HOURS = 24;

    /**
     * წყარო → აღწერა. ⚠️ **მხოლოდ ერთი** — SPA-ის სარკე `IMPORT_SOURCES`
     * (`RegistryConsistencyTest`).
     *
     * @var array<string, array{label: string, formats: list<string>}>
     */
    public const SOURCES = [
        'mediary' => ['label' => 'Mediary', 'formats' => ['json', 'csv', 'zip']],
    ];

    /**
     * **„ეს ჩანაწერი უკვე მაქვს?"** — მოდული → იდენტობა.
     *
     * `ids` — ზუსტი იდენტობა (TMDB-ის ნომერი, ბმული, ISBN…): ერთი დამთხვევაც
     * საკმარისია; `title` — სათაურის სვეტები და `with` — დამაზუსტებელი
     * (წელი, ავტორი…), რომლებიც **მხოლოდ მაშინ** მოწმდება, როცა ფაილის რიგს
     * ზუსტი იდენტობა საერთოდ არ აქვს; `required` — ამის გარეშე რიგი ვერ
     * ჩაიწერება (სვეტი `NOT NULL`-ია).
     *
     * ⚠️ **ჯერ იდენტობა, მერე სათაური**: სათაური
     * ვარაუდია — ორი სხვადასხვა ფილმი ერთი სახელით ერთმანეთს „დუბლად"
     * ჩათვლიდა, თუ id-იანი რიგიც სათაურით შედარდებოდა.
     *
     * ⚠️ `unique(user_id, …)`-ის სვეტები (`imdb_id`, `isbn`, `bgg_id`, `rawg_id`,
     * `igdb_id`) **აუცილებლად** `ids`-შია — თორემ „ახალი" რიგი ჩაწერისას
     * ბაზის შეზღუდვაზე ჩავარდებოდა.
     *
     * @var array<string, array{ids: list<string>, title: list<string>, with: list<string>, required: list<string>}>
     */
    public const IDENTITY = [
        'movie' => ['ids' => ['tmdb_id', 'imdb_id'], 'title' => ['title_ka', 'title_en'], 'with' => ['year'], 'required' => []],
        'series' => ['ids' => ['tmdb_id', 'imdb_id'], 'title' => ['title_ka', 'title_en'], 'with' => ['year'], 'required' => []],
        'anime' => ['ids' => ['tmdb_id', 'imdb_id'], 'title' => ['title_ka', 'title_en'], 'with' => ['year'], 'required' => []],
        'video' => ['ids' => ['url'], 'title' => ['title'], 'with' => [], 'required' => ['url']],
        'song' => ['ids' => ['url'], 'title' => ['title'], 'with' => ['artist'], 'required' => ['url']],
        'book' => ['ids' => ['isbn', 'openlibrary_id'], 'title' => ['title_ka', 'title_en'], 'with' => ['author'], 'required' => []],
        'board_game' => ['ids' => ['bgg_id'], 'title' => ['title'], 'with' => [], 'required' => []],
        'game' => ['ids' => ['rawg_id', 'igdb_id'], 'title' => ['title_ka', 'title_en'], 'with' => [], 'required' => []],
        // ჩანიშვნას ბუნებრივი იდენტობა არ აქვს — სათაური + შექმნის მომენტი (ექსპორტში წერია)
        'note' => ['ids' => [], 'title' => ['title'], 'with' => ['created_at'], 'required' => []],
        'bookmark' => ['ids' => ['url'], 'title' => ['title'], 'with' => [], 'required' => ['url']],
        'course' => ['ids' => ['url'], 'title' => ['title'], 'with' => [], 'required' => []],
        'place' => ['ids' => ['osm_id'], 'title' => ['name'], 'with' => ['address'], 'required' => []],
        // მორიგეობა — დღე + დაწყება + სამსახური (სათაური არ აქვს)
        'duty' => ['ids' => [], 'title' => ['date'], 'with' => ['start_time', 'workplace_name'], 'required' => ['date']],
    ];

    /** პირადი მოდულის ჩანაწერი (`custom_records`) — ბმული, სხვაგვარად სათაური */
    public const CUSTOM_IDENTITY = ['ids' => ['url'], 'title' => ['title'], 'with' => [], 'required' => []];

    /** @return list<string> */
    public static function keys(): array
    {
        return array_keys(self::SOURCES);
    }

    public static function has(string $source): bool
    {
        return isset(self::SOURCES[$source]);
    }

    /** @return array{ids: list<string>, title: list<string>, with: list<string>, required: list<string>}|null */
    public static function identity(string $module): ?array
    {
        return self::IDENTITY[$module] ?? (CustomModules::isKey($module) ? self::CUSTOM_IDENTITY : null);
    }
}
