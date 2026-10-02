<?php

namespace App\Support;

use App\Models\BoardGameGenre;
use App\Models\BookGenre;
use App\Models\BookmarkCategory;
use App\Models\CourseCategory;
use App\Models\GameGenre;
use App\Models\Genre;
use App\Models\PlaceCategory;
use App\Models\SongGenre;
use App\Models\Status;
use App\Models\User;
use App\Models\VideoType;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Collection;

/**
 * **რა შეიძლება გაზიარდეს ბმულით (Tasks §40.10, Q50).**
 *
 * ⚠️ **ეტაპი 1 სამი მედია-დომენი იყო** (Q50 — „ა"), **ეტაპი 2 — დანარჩენი
 * რვა** (შენი პასუხი 40.10-ზე: „ყველა"). მექანიზმი თავიდანვე საერთოა —
 * ფარგლები (`ShareScope`), ბარათი (`PublicDomain::card()`), „უკვე გაქვს"
 * (`ShareMatcher`) და დამატება (`ShareImporter`) ამ რეესტრით ნაწილდება,
 * ე.ი. ახალი დომენი **ერთი რიგია** აქ (+ თავისი დამატების რეცეპტი) და არა
 * ახალი კონტროლერი.
 *
 * ## თითო რიგის ველები
 *
 * - **`status`** — სტატუსის მექანიზმი: `dictionary` (per-user ლექსიკონი,
 *   §6.4 — როლით იკითხება), `enum` (გასაღები კოდშია და ყველასთვის ერთია) ან
 *   `null` (სიმღერასა და სამაგიდო თამაშს სტატუსი საერთოდ არ აქვს — ფარგალში
 *   „სტატუსით" მათ არ ეთავაზება და დამატებისას რეჟიმიც არ ჩანს).
 * - **`status_default`** — enum-ის ნაგულისხმევი, **სვეტის DB-ნაგულისხმევის
 *   ტოლი** (`RowImporter`-ის წესი: იმპორტი მას ცხადად წერს, რომ მოდელი
 *   მეხსიერებაშიც შეთანხმებული იყოს).
 * - **`classifier`** — ჟანრი/კატეგორია/ტიპი: რელაცია, მოდელი, კატალოგის ველი
 *   (`FieldSettings`-ის „საჯაროდ არ გამოჩნდეს" სწორედ მას კითხულობს) და
 *   `multi` (pivot — „ნებისმიერი/ყველა" მხოლოდ მას აქვს აზრი). ⚠️ `global` —
 *   მედიის ჟანრი გლობალურია და **slug-ით** იძებნება; დანარჩენი რვის ლექსიკონი
 *   per-user-ია და ფარგალში **მფლობელის id-ებით** ინახება.
 * - **`photo`** — მთავარი ფოტოს გასაღები კატალოგში (`poster`/`cover`/…):
 *   ბარათზე ის `image`-ია და დამალვა ამიტომ ითარგმნება (§33-ის შენიშვნა).
 * - **`personal_rating`** — აქვს თუ არა დომენს მფლობელის **საკუთარი**
 *   შეფასება. მედიის `rating` TMDB-ის ქულაა (საჯარო ფაქტი ფილმზე და არა ჩემი
 *   აზრი), ე.ი. „ჩემი შეფასების" გადამრთველი მათზე არაფერს შეცვლიდა —
 *   ფანჯარა მას მხოლოდ მაშინ აჩვენებს, როცა არჩეულ დომენებს შორის ასეთი არის.
 * - **`favorite`** — აქვს თუ არა „რჩეული" (`is_favorite`); არ წერია — აქვს.
 * - **`list`** — ჩანაწერი კი არა, **სიაა** (§40.13 — პლეილისტი): კლასიფიკატორი,
 *   მთავარი ფოტო და დამატების რეცეპტი არ აქვს; დამატება ასლს ქმნის
 *   (`ShareImporter::addPlaylist()`), „უკვე გაქვს" კი ასლის წყაროთი იცნობა.
 *
 * ⚠️ `RegistryConsistencyTest`: ყოველი საბაზისო მოდული ან აქაა, ან
 * `NOT_SHARED`-ში — **მიზეზით**; SPA-ს `SHARE_DOMAINS` ამ სიის სარკეა.
 */
final class ShareDomain
{
    /**
     * @var array<string, array{
     *     module: string,
     *     personal_rating: bool,
     *     status: 'dictionary'|'enum'|null,
     *     status_default?: string,
     *     favorite?: bool,
     *     list?: bool,
     *     classifier: array{relation: string, model: class-string<Model>, field: string, multi: bool, global?: bool}|null,
     *     photo: string|null,
     * }>
     */
    public const DOMAINS = [
        'movie' => [
            'module' => 'movie', 'personal_rating' => true, 'status' => 'dictionary',
            'classifier' => ['relation' => 'genres', 'model' => Genre::class, 'field' => 'genres', 'multi' => true, 'global' => true],
            'photo' => 'poster',
        ],
        'series' => [
            'module' => 'series', 'personal_rating' => true, 'status' => 'dictionary',
            'classifier' => ['relation' => 'genres', 'model' => Genre::class, 'field' => 'genres', 'multi' => true, 'global' => true],
            'photo' => 'poster',
        ],
        'anime' => [
            'module' => 'anime', 'personal_rating' => true, 'status' => 'dictionary',
            'classifier' => ['relation' => 'genres', 'model' => Genre::class, 'field' => 'genres', 'multi' => true, 'global' => true],
            'photo' => 'poster',
        ],
        'game' => [
            'module' => 'game', 'personal_rating' => true, 'status' => 'enum', 'status_default' => 'to_play',
            'classifier' => ['relation' => 'genres', 'model' => GameGenre::class, 'field' => 'genres', 'multi' => true],
            'photo' => 'cover',
        ],
        'book' => [
            'module' => 'book', 'personal_rating' => true, 'status' => 'enum', 'status_default' => 'to_read',
            'classifier' => ['relation' => 'genre', 'model' => BookGenre::class, 'field' => 'genre', 'multi' => false],
            'photo' => 'cover',
        ],
        'board_game' => [
            'module' => 'board_game', 'personal_rating' => true, 'status' => null,
            'classifier' => ['relation' => 'genre', 'model' => BoardGameGenre::class, 'field' => 'genre', 'multi' => false],
            'photo' => 'image',
        ],
        'place' => [
            'module' => 'place', 'personal_rating' => true, 'status' => 'enum', 'status_default' => 'to_visit',
            'classifier' => ['relation' => 'category', 'model' => PlaceCategory::class, 'field' => 'category', 'multi' => false],
            'photo' => 'photo',
        ],
        'video' => [
            'module' => 'video', 'personal_rating' => false, 'status' => 'dictionary',
            'classifier' => ['relation' => 'type', 'model' => VideoType::class, 'field' => 'type_id', 'multi' => false],
            'photo' => 'thumbnail',
        ],
        'song' => [
            'module' => 'song', 'personal_rating' => true, 'status' => null,
            'classifier' => ['relation' => 'genres', 'model' => SongGenre::class, 'field' => 'genres', 'multi' => true],
            'photo' => 'thumbnail',
        ],
        /* §40.13 (Q53 — „გ") — **სია და არა ჩანაწერი**: `song` მოდულში ცხოვრობს,
           ფარგლები მხოლოდ „ყველა" და „კონკრეტული" (რჩეული, სტატუსი და
           კლასიფიკატორი არ აქვს), შიგნით კი მისი ყველა სიმღერა ჩანს — პირადიც. */
        'playlist' => [
            'module' => 'song', 'personal_rating' => false, 'status' => null, 'favorite' => false, 'list' => true,
            'classifier' => null,
            'photo' => null,
        ],
        'bookmark' => [
            'module' => 'bookmark', 'personal_rating' => false, 'status' => 'dictionary',
            'classifier' => ['relation' => 'category', 'model' => BookmarkCategory::class, 'field' => 'category', 'multi' => false],
            'photo' => 'thumbnail',
        ],
        'course' => [
            'module' => 'course', 'personal_rating' => false, 'status' => 'enum', 'status_default' => 'to_take',
            'classifier' => ['relation' => 'category', 'model' => CourseCategory::class, 'field' => 'category', 'multi' => false],
            'photo' => 'thumbnail',
        ],
    ];

    /**
     * მოდულები, რომლებიც ბმულით **არასდროს** ზიარდება — მიზეზით.
     *
     * @var array<string, string>
     */
    public const NOT_SHARED = [
        'note' => 'არასდროს — პირადი დოკუმენტებია (§16.5)',
        'gallery' => 'არასდროს — ფაილებია და კვოტა, ბმულით არა',
    ];

    /** @return list<string> */
    public static function keys(): array
    {
        return array_keys(self::DOMAINS);
    }

    public static function has(string $domain): bool
    {
        return isset(self::DOMAINS[$domain]);
    }

    public static function module(string $domain): string
    {
        return self::DOMAINS[$domain]['module'];
    }

    /** @return class-string<Model> */
    public static function model(string $domain): string
    {
        return PublicDomain::model($domain);
    }

    public static function hasPersonalRating(string $domain): bool
    {
        return self::DOMAINS[$domain]['personal_rating'] ?? false;
    }

    /**
     * რომელ ბარათის ველშია მფლობელის **საკუთარი** ქულა (Tasks §9, Q1):
     * მედიაზე `my_rating` (ბარათის `rating` TMDB-ის საშუალოა და საჯარო
     * ფაქტია), დანარჩენზე `rating`.
     */
    public static function personalRatingKey(string $domain): string
    {
        return Rating::column($domain);
    }

    /** „რჩეული" (`is_favorite`) — პლეილისტს არ აქვს */
    public static function supportsFavorite(string $domain): bool
    {
        return self::DOMAINS[$domain]['favorite'] ?? true;
    }

    /** სია (პლეილისტი) და არა ჩანაწერი — დამატება ასლს ქმნის (§40.13) */
    public static function isList(string $domain): bool
    {
        return self::DOMAINS[$domain]['list'] ?? false;
    }

    /**
     * **რომელი ფარგალი არსებობს ამ დომენზე** — `ShareScope::MODES`-ის ქვესიმრავლე.
     *
     * ⚠️ არარსებული რეჟიმი 422-ია (`share_scope_unsupported`) და არა ჩუმი
     * „ყველა": სტატუსის უქონელზე „სტატუსით", პლეილისტზე „რჩეული" ან „ჟანრით"
     * ან ცარიელ სიას მისცემდა, ან SQL-ს წააქცევდა (`is_favorite` არ არსებობს).
     *
     * @return list<string>
     */
    public static function modes(string $domain): array
    {
        return array_values(array_filter([
            'all',
            self::statusKind($domain) !== null ? 'status' : null,
            self::supportsFavorite($domain) ? 'favorite' : null,
            self::hasClassifier($domain) ? 'genre' : null,
            'ids',
        ]));
    }

    /* ---------- სტატუსი ---------- */

    /** `dictionary` · `enum` · `null` (სტატუსი არ აქვს) */
    public static function statusKind(string $domain): ?string
    {
        return self::DOMAINS[$domain]['status'] ?? null;
    }

    /** enum-ის ნაგულისხმევი (`null` — ლექსიკონიანზე `HasStatus`-ის ჰუკი წყვეტს) */
    public static function defaultStatus(string $domain): ?string
    {
        return self::DOMAINS[$domain]['status_default'] ?? null;
    }

    /**
     * სტატუსის დასაშვები გასაღებები **მფლობელისთვის** — ფარგლის ვალიდაცია.
     *
     * ⚠️ ლექსიკონიანზე მფლობელის ლექსიკონი (გადარქმეული „ნანახი" სხვა
     * გასაღებით შეიძლება იყოს), enum-ზე — მოდელის სია.
     *
     * @return list<string>
     */
    public static function statusKeys(User $owner, string $domain): array
    {
        $model = self::model($domain);

        return match (self::statusKind($domain)) {
            'dictionary' => Status::keysFor((int) $owner->id, $domain),
            'enum' => array_values($model::STATUSES),
            default => [],
        };
    }

    /* ---------- კლასიფიკატორი (ჟანრი · კატეგორია · ტიპი) ---------- */

    /**
     * ⚠️ `null` — კლასიფიკატორი არ აქვს (პლეილისტი); გამომძახებელი ჯერ
     * `hasClassifier()`-ს ეკითხება.
     *
     * @return array{relation: string, model: class-string<Model>, field: string, multi: bool, global?: bool}|null
     */
    public static function classifier(string $domain): ?array
    {
        return self::DOMAINS[$domain]['classifier'] ?? null;
    }

    public static function hasClassifier(string $domain): bool
    {
        return self::classifier($domain) !== null;
    }

    /** კლასიფიკატორის ველი კატალოგში (`genre`/`category`/`type_id`…); არ აქვს — `null` */
    public static function classifierField(string $domain): ?string
    {
        return self::classifier($domain)['field'] ?? null;
    }

    /** მედიის გლობალური ჟანრი (slug) თუ per-user ლექსიკონი (id) */
    public static function classifierIsGlobal(string $domain): bool
    {
        return self::classifier($domain)['global'] ?? false;
    }

    public static function classifierIsMulti(string $domain): bool
    {
        return self::classifier($domain)['multi'] ?? false;
    }

    /** მთავარი ფოტოს გასაღები ველების კატალოგში (ბარათზე `image`); სიას — `null` */
    public static function photoField(string $domain): ?string
    {
        return self::DOMAINS[$domain]['photo'] ?? null;
    }

    /**
     * **მფლობელის ცოცხალი** კლასიფიკატორის id-ები — ფარგლის ვალიდაცია.
     *
     * ⚠️ `owner` scope-ის გარეშე და ცხადი მფლობელით: ბმულს მფლობელი ინახავს,
     * მაგრამ ეს ფუნქცია მომავალში სხვა კონტექსტიდანაც შეიძლება გამოიძახონ.
     * `trash` scope რჩება — ურნაში მყოფი ჟანრით ფარგალი არ იწყება.
     *
     * @param  list<int>  $ids
     * @return list<int>
     */
    public static function ownClassifierIds(User $owner, string $domain, array $ids): array
    {
        $classifier = self::classifier($domain);

        if ($ids === [] || $classifier === null) {
            return [];
        }

        $model = $classifier['model'];

        $own = $model::withoutGlobalScope('owner')
            ->where('user_id', $owner->id)
            ->whereIn('id', $ids)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        sort($own);

        return $own;
    }

    /**
     * კლასიფიკატორის eager load — **`owner` scope-ის გარეშე**.
     *
     * ⚠️ §1.2-ის გაკვეთილი: ლექსიკონის მოდელს `BelongsToUser` აქვს, ე.ი. შესულ
     * უცხოს `with('genre')` **მის საკუთარ** ჟანრებზე მოჭრიდა და ბარათი ჟანრის
     * გარეშე დარჩებოდა (ანონიმურ ტესტზე კი ეს არ ჩანს). მედიის ჟანრი
     * გლობალურია და scope არ აქვს. `trash` რჩება — ურნაში მყოფი ჟანრი არ ჩანს.
     */
    public static function withClassifier(Builder $query, string $domain): Builder
    {
        $classifier = self::classifier($domain);

        if ($classifier === null) {
            return $query;
        }

        return $query->with([$classifier['relation'] => fn ($q) => $q->withoutGlobalScope('owner')]);
    }

    /**
     * ჩანაწერის კლასიფიკატორის ჩანაწერები — ერთიც (სვეტი) და ბევრიც (pivot)
     * ერთ ფორმაში.
     *
     * @return Collection<int, Model>
     */
    public static function classifierEntries(Model $record, string $domain): Collection
    {
        $classifier = self::classifier($domain);

        if ($classifier === null) {
            return collect();
        }

        $relation = $classifier['relation'];

        if (! $record->relationLoaded($relation)) {
            $record->load([$relation => fn ($q) => $q->withoutGlobalScope('owner')]);
        }

        $value = $record->getRelation($relation);

        return $value instanceof \Illuminate\Database\Eloquent\Collection
            ? collect($value->all())
            : collect($value ? [$value] : []);
    }

    /** ფილტრის მნიშვნელობა: მედიაზე slug, დანარჩენზე id სტრიქონად */
    public static function classifierValue(string $domain, Model $entry): string
    {
        return self::classifierIsGlobal($domain) ? (string) $entry->getAttribute('slug') : (string) $entry->getKey();
    }

    /**
     * per-user კლასიფიკატორის **სტრუქტურა** — სვეტი (`genre_id`…) ან pivot.
     *
     * ⚠️ ფილტრი და რიცხვები ამ სტრუქტურით იწერება და არა `whereHas()`-ით:
     * რელაციის query ლექსიკონის `owner` scope-ს ხელახლა დაადებდა და შესულ
     * უცხოს ცარიელ სექციას აჩვენებდა.
     *
     * @return array{type: 'column', column: string}|array{type: 'pivot', table: string, foreign: string, related: string}
     */
    public static function classifierShape(string $domain): array
    {
        $model = self::model($domain);
        $relation = (new $model)->{(string) self::classifier($domain)['relation']}();

        if ($relation instanceof BelongsToMany) {
            return [
                'type' => 'pivot',
                'table' => $relation->getTable(),
                'foreign' => $relation->getForeignPivotKeyName(),
                'related' => $relation->getRelatedPivotKeyName(),
            ];
        }

        /** @var BelongsTo $relation */
        return ['type' => 'column', 'column' => $relation->getForeignKeyName()];
    }

    /**
     * რომელი დომენის გაზიარება შეუძლია ამ ანგარიშს — ჩართული მოდული და
     * `view` უფლება (საკუთარ ჩანაწერებს თუ ვერ ხედავს, ვერც გაუზიარებს).
     *
     * ⚠️ **ბმულის გახსნისასაც ეს იკითხება მფლობელზე** — მოდული, რომელიც მას
     * შემდეგ გაეთიშა, ბმულიდან ჩუმად ქრება (§40.6).
     *
     * @return list<string>
     */
    public static function availableFor(User $user): array
    {
        return array_values(array_filter(
            self::keys(),
            fn (string $domain) => $user->hasModule(self::module($domain))
                && $user->hasPermission(self::module($domain), 'view'),
        ));
    }

    /**
     * ჩანაწერის სათაური ბარათის ველებიდან — გეგმის სიისა და ჟურნალის
     * ჭდისთვის (რვა დომენს სათაური სხვადასხვა სვეტშია: `title`, `name`,
     * `title_ka`/`title_en`).
     *
     * @return array{title_ka: ?string, title_en: ?string, year: ?int}
     */
    public static function titleOf(string $domain, Model $record): array
    {
        $card = PublicDomain::card($domain, $record);

        return [
            'title_ka' => $card['title_ka'] ?? null,
            'title_en' => $card['title_en'] ?? null,
            'year' => isset($card['year']) ? (int) $card['year'] : null,
        ];
    }

    /** ჭდე ჟურნალისთვის — ქართული, თუ არის */
    public static function label(string $domain, Model $record): ?string
    {
        $title = self::titleOf($domain, $record);

        return $title['title_ka'] ?: $title['title_en'];
    }
}
