<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasGallery;
use App\Models\Concerns\HasTrash;
use App\Models\Concerns\TracksCompletion;
use App\Services\Storage\StorageMeter;
use App\Support\VideoUrl;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * თამაში — მოდული `game` (Tasks §11; ველების სია დამტკიცდა 19.1-ში).
 *
 * ⚠️ **მრავალჟანრიანია** (pivot `game_genre_game`), განსხვავებით წიგნისა და
 * ბორდგეიმისგან, სადაც ერთი `genre_id`-ა — 11.1 „ჟანრებს" მრავლობითში წერს.
 * ლექსიკონი მაინც **per-user** არის (`game_genres`) და არა გლობალური
 * `genres`: RAWG-ის „Shooter"/„RPG" იქ ფილმის ჟანრების არჩევანში გამოჩნდებოდა.
 *
 * ⚠️ **`year` სვეტი არ არსებობს** — `release_date`-ის აქსესორია. ერთსა და
 * იმავე ფაქტს ორ სვეტში არ ვინახავთ.
 */
class Game extends Model
{
    use BelongsToUser, HasGallery;

    /** §6 ფაზა 4b — მორგებულ ველზე ატვირთული ფაილები (წაშლა → დისკი + კვოტა) */
    use HasCustomFields;

    /**
     * ⚠️ **კალათა (FEAT-11)** — `destroy()` `moveToTrash()`-ს იძახის და არა
     * `delete()`-ს; `trash` scope წაშლილს ყველა ჩვეულებრივ query-ს მალავს.
     */
    use HasTrash;

    /** FEAT-21 — „როდის გავიარე" თარიღი; `finished` სტატუსზე ივსება */
    use TracksCompletion;

    /** „ჩემი ქულის" შკალა — ერთი წყარო ვალიდაციისთვისაც და UI-სთვისაც */
    public const MAX_RATING = 10;

    /** Tasks §13 — მხოლოდ სამი: გასავლელი · ვთამაშობ · დახურული (`finished` —
        გასაღები რჩება: ის `PublicDomain::MATCH`-ის „done"-ია და `finished_at`-ს ადგენს) */
    public const STATUSES = ['to_play', 'playing', 'finished'];

    /** 11.1-ის ჩამონათვალი; „ჩემი პლატფორმა" ერთია ამათგან */
    public const PLATFORMS = ['pc', 'ps5', 'ps4', 'xbox_series', 'xbox_one', 'switch', 'mobile'];

    /** 11.1 — სინგლი · მრავალმოთამაშიანი · კოოპი (ლოკალური/ონლაინ) · PvP */
    public const MODES = ['single', 'multiplayer', 'coop_local', 'coop_online', 'pvp'];

    /**
     * **ბმულის „რა არის"** — `links[].kind` (Tasks §22.3).
     *
     * შენი სიტყვები: „ბმულის დამატებისას იყოს, რა სახის ბმულია — ვიდეო
     * (YouTube), პატჩი, DLC…: Trailer, DLC, Patch, Download, Info".
     *
     * ⚠️ **ორი ღერძი და არა ერთი სია.** აქამდე `kind` მაღაზიების სია იყო
     * (`official · steam · epic · gog · psn · xbox · other`), ე.ი. „DLC Steam-ზე"
     * გამოუთქმელი იყო — ან DLC, ან Steam. ახლა „რა" აქ წერია, „სად" კი
     * `links[].store`-ში, და მხოლოდ მაღაზიისთვის (`LINK_STORES`).
     */
    public const LINK_KINDS = ['trailer', 'dlc', 'patch', 'download', 'info', 'official', 'store', 'guide', 'mod', 'soundtrack', 'other'];

    /** **ბმულის „სად"** — მხოლოდ `kind = store`-ისთვის; ჰოსტიდან ამოიცნობა (`storeFromUrl`) */
    public const LINK_STORES = ['steam', 'epic', 'gog', 'psn', 'xbox'];

    /**
     * ⚠️ **ძველი ერთღერძიანი მნიშვნელობები ისევ მიიღება** — ძველი SPA-სა
     * და სკრიპტისთვის. `normalizeLink()` მათ `store` + მაღაზიად თარგმნის,
     * ზუსტად ისე, როგორც მიგრაციამ არსებული რიგები გადათარგმნა.
     */
    public const LEGACY_LINK_KINDS = ['steam', 'epic', 'gog', 'psn', 'xbox'];

    /**
     * ჰოსტი → მაღაზია. ⚠️ ქვედომენიც ითვლება (`store.steampowered.com`),
     * მაგრამ **სუფიქსით და წერტილით** — `notsteampowered.com` Steam არ არის.
     */
    private const STORE_HOSTS = [
        'steampowered.com' => 'steam',
        'steamcommunity.com' => 'steam',
        'epicgames.com' => 'epic',
        'gog.com' => 'gog',
        'playstation.com' => 'psn',
        'xbox.com' => 'xbox',
    ];

    /**
     * **თამაშის ვიდეოდ ქცეული ბმულის ტიპები** (Tasks §22.4, Q15).
     *
     * ⚠️ YouTube/Vimeo/Dailymotion-ის ტრეილერი ან გზამკვლევი **ბმულად არ
     * ინახება** — ის `game_videos`-ში ჯდება და ფლეერით უკრავს. სხვა ჰოსტის
     * ტრეილერი (მაგ. მაღაზიის გვერდი) ბმულად რჩება.
     */
    public const VIDEO_LINK_KINDS = ['trailer' => 'trailer', 'guide' => 'walkthrough'];

    protected $guarded = ['id'];

    protected $casts = [
        'release_date' => 'date',
        'platforms' => 'array',
        'modes' => 'array',
        'links' => 'array',
        'opencritic' => 'integer',
        'users_score' => 'float',
        'rating' => 'integer',
        'size_gb' => 'float',
        'rawg_id' => 'integer',
        'igdb_id' => 'integer',
        'is_favorite' => 'boolean',
        'sort_order' => 'integer',
        'finished_at' => 'date',
    ];

    /** FEAT-21 — თამაშის „გაკეთებული" `finished`-ია */
    public function completionColumn(): string
    {
        return 'finished_at';
    }

    public function completionDomain(): string
    {
        return 'game';
    }

    /**
     * ⚠️ `game_*` ცხრილები SQL-ის cascade-ით იშლება, მაგრამ cascade **მოდელის
     * ივენთს არ აგდებს** — ე.ი. ფაილი დისკზე და კვოტის მრიცხველი უცვლელი
     * დარჩებოდა. ამიტომ ფაილებს სათითაოდ ვშლით (იგივე წესი, რაც `Video`-ზე).
     */
    protected static function booted(): void
    {
        static::deleting(function (Game $game) {
            $game->deleteCover();
            /* ⚠️ **`withoutGlobalScope('owner')` სავალდებულოა** (Tasks BUG-21):
               `<module>_files` `BelongsToUser`-ს იყენებს, ე.ი. `files()`
               მიმდინარე **ავტორიზებულ** მომხმარებელზე იჭრება. `/admin/purge`
               და ანგარიშის წაშლა სხვის ბიბლიოთეკას შლის ადმინის სესიიდან —
               სია ცარიელი ბრუნდებოდა, ფაილები დისკზე რჩებოდა და კვოტაც არ
               თავისუფლდებოდა. `Video::booted()` ამას თავიდანვე სწორად აკეთებდა. */
            $game->files()->withoutGlobalScopes(['owner', 'trash'])->get()->each->delete();
            $game->deleteGalleryMedia();
        });
    }

    /* ---------- relations ---------- */

    /** per-user ჟანრის ლექსიკონი — **მრავალი** ჟანრი თითო თამაშზე */
    public function genres(): BelongsToMany
    {
        return $this->belongsToMany(GameGenre::class, 'game_genre_game', 'game_id', 'game_genre_id')
            ->orderBy('game_genres.sort_order')
            ->orderBy('game_genres.id');
    }

    /** 11.2 — walkthrough/თრეილერი/მიმოხილვა/გაიდი */
    public function videos(): HasMany
    {
        return $this->hasMany(GameVideo::class)->orderBy('sort_order')->orderBy('id');
    }

    public function files(): HasMany
    {
        return $this->hasMany(GameFile::class)->orderBy('sort_order')->orderBy('id');
    }

    /** ატვირთული სქრინშოტები — იგივე ცხრილი, `kind = 'image'` */
    public function images(): HasMany
    {
        return $this->files()->where('kind', 'image');
    }

    public function notes(): HasMany
    {
        return $this->hasMany(GameNote::class)->orderByDesc('id');
    }

    /* ---------- helpers ---------- */

    /**
     * წელი — **მხოლოდ** `release_date`-იდან. სვეტად რომ გვქონოდა, ორი რიცხვი
     * დროთა განმავლობაში დაშორდებოდა (იგივე ხაფანგი, რასაც წიგნის პროგრესი
     * ებრძვის). `PurgeService`-ის რიგიც ამ აქსესორს კითხულობს.
     */
    public function getYearAttribute(): ?int
    {
        return $this->release_date?->year;
    }

    /**
     * ⚠️ **მხოლოდ ხელით ატვირთული ყდა იშლება.** RAWG-დან ჩამოტვირთულის სახელი
     * მისი `rawg_id`-ია, ე.ი. ერთი ფაილი რამდენიმე ანგარიშს ემსახურება — წაშლა
     * სხვისთვის სურათს გატეხავდა (TMDB პოსტერის, წიგნის ყდისა და BGG ფოტოს წესი).
     * ჩამოტვირთული კვოტაშიც არ ითვლება (19.4/B).
     */
    public function deleteCover(): void
    {
        if ($this->cover_path && $this->cover_source === 'upload') {
            app(StorageMeter::class)->deleteUpload($this->user_id, $this->cover_path);
        }
    }

    /** სათაური ფაილის სახელისთვის — ინგლისური ჯობია (ლათინური slug) */
    public function title(): string
    {
        return (string) ($this->title_en ?: $this->title_ka ?: '');
    }

    /**
     * პლატფორმები/რეჟიმები იმავე წესებით ნორმალიზდება, რაც ტეგები ვიდეოზე —
     * დუბლი და რეგისტრი ერთ ადგილას წყდება.
     *
     * @param  array<int, mixed>  $values
     * @return list<string>
     */
    public static function normalizeKeys(array $values, array $allowed): array
    {
        return array_values(array_intersect($allowed, array_unique(array_map(
            fn ($v) => strtolower(trim((string) $v)),
            $values,
        ))));
    }

    /** მაღაზია ბმულის ჰოსტიდან (§22.3); უცნობ ჰოსტზე — `null` */
    public static function storeFromUrl(string $url): ?string
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        $host = (string) preg_replace('/^www\./', '', $host);

        foreach (self::STORE_HOSTS as $domain => $store) {
            if ($host === $domain || str_ends_with($host, '.'.$domain)) {
                return $store;
            }
        }

        return null;
    }

    /**
     * **ერთი ბმულის ნორმალიზაცია — ერთადერთი ადგილი** (§22.3).
     *
     * ⚠️ ფორმაც, RAWG/IGDB-ის დრაფტიც და მიგრაციაც ამ ფორმას წერს: ძველი
     * მნიშვნელობა (`steam`) → `store` + `steam`; უცნობი → `other`;
     * `store` მხოლოდ მაღაზიას აქვს და ცარიელზე ჰოსტიდან ამოიცნობა.
     *
     * @param  array{label?: ?string, url: string, kind?: ?string, store?: ?string}  $link
     * @return array{label: ?string, url: string, kind: string, store: ?string}
     */
    public static function normalizeLink(array $link): array
    {
        $url = (string) $link['url'];
        $kind = $link['kind'] ?? null;
        $store = $link['store'] ?? null;

        if (in_array($kind, self::LEGACY_LINK_KINDS, true)) {
            $store = $kind;
            $kind = 'store';
        }

        if (! in_array($kind, self::LINK_KINDS, true)) {
            $kind = 'other';
        }

        $store = $kind === 'store'
            ? (in_array($store, self::LINK_STORES, true) ? $store : self::storeFromUrl($url))
            : null;

        $label = isset($link['label']) ? trim((string) $link['label']) : '';

        return ['label' => $label !== '' ? $label : null, 'url' => $url, 'kind' => $kind, 'store' => $store];
    }

    /**
     * **ბმულები ↔ თამაშის ვიდეოები** (Tasks §22.4, Q15).
     *
     * ⚠️ ვიდეოდ იქცევა მხოლოდ `VIDEO_LINK_KINDS`-ის ტიპი **და** ჩაშენებადი
     * ჰოსტი (`VideoUrl::parse()`-ის `embed_url` — YouTube, Vimeo, Dailymotion):
     * მაღაზიის გვერდზე მდებარე „ტრეილერი" ფლეერში ვერ დაუკრავს და ბმულად რჩება.
     *
     * @param  list<array{label: ?string, url: string, kind: string, store: ?string}>  $links
     * @return array{0: list<array{label: ?string, url: string, kind: string, store: ?string}>, 1: list<array{label: ?string, url: string, kind: string, store: ?string}>}
     *                                                                                                                                                                     [დარჩენილი ბმულები, ვიდეოდ ქცეულები]
     */
    public static function splitVideoLinks(array $links): array
    {
        $keep = [];
        $videos = [];

        foreach ($links as $link) {
            $embeddable = isset(self::VIDEO_LINK_KINDS[$link['kind']])
                && VideoUrl::parse($link['url'])['embed_url'] !== null;

            if ($embeddable) {
                $videos[] = $link;
            } else {
                $keep[] = $link;
            }
        }

        return [$keep, $videos];
    }
}
