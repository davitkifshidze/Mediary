<?php

namespace App\Support;

use App\Models\Anime;
use App\Models\Movie;
use App\Models\Series;
use App\Models\User;
use App\Services\Enrichment\AnimeEnricher;
use App\Services\Enrichment\MovieEnricher;
use App\Services\Enrichment\SeriesEnricher;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * **TMDB-ზე დაფუძნებული მედია-დომენები (Tasks §7.1).**
 *
 * ⚠️ **რატომ არსებობს ეს ფაილი.** სანამ დომენი ორი იყო, `['movie', 'series']`
 * თოთხმეტ ადგილას ლიტერალად ეწერა — ვალიდაციაში, სინქრონში, გალერეაში,
 * კონსოლის ბრძანებაში, route-ის `whereIn`-ში. მესამე დომენის დამატება
 * თოთხმეტივეს პოვნას ნიშნავდა და **გამორჩენა ჩუმია**: endpoint უბრალოდ
 * 422-ს დააბრუნებდა ან დომენს გეგმიდან გამოტოვებდა.
 *
 * ე.ი. იგივე გადაწყვეტა, რაც `PublicDomain`-სა და `PurgeService`-ის რუკებს
 * აქვთ: **ერთი სია, ერთი ადგილას**. მეოთხე დომენი = ერთი სტრიქონი.
 *
 * ⚠️ **აქ მხოლოდ TMDB-ის დომენებია.** სიმღერა/წიგნი/თამაში სხვა წყაროებზე
 * ზის და მათი აქ ჩამატება „მედია-სინქრონს" ისეთ დომენებზე გაუშვებდა,
 * რომლებზეც TMDB-ს არაფერი აქვს.
 */
final class MediaDomain
{
    /** ⚠️ თანმიმდევრობა ინტერფეისშიც ჩანს (გეგმის სია, ჩიპები) */
    public const TYPES = ['movie', 'series', 'anime'];

    /** დომენები, რომლებიც TMDB-ის `/tv/*`-ზე ზის (და არა `/movie/*`-ზე) */
    public const TV_TYPES = ['series', 'anime'];

    /** @var array<string, class-string<Model>> */
    private const MODELS = [
        'movie' => Movie::class,
        'series' => Series::class,
        'anime' => Anime::class,
    ];

    /** @var array<string, class-string> */
    private const ENRICHERS = [
        'movie' => MovieEnricher::class,
        'series' => SeriesEnricher::class,
        'anime' => AnimeEnricher::class,
    ];

    public static function has(string $type): bool
    {
        return isset(self::MODELS[$type]);
    }

    /** ვალიდაციის წესი — `in:movie,series,anime` */
    public static function rule(): string
    {
        return 'in:'.implode(',', self::TYPES);
    }

    /** @return class-string<Model> */
    public static function model(string $type): string
    {
        return self::MODELS[$type] ?? Movie::class;
    }

    public static function query(string $type): Builder
    {
        return self::model($type)::query();
    }

    /** დომენის გამამდიდრებელი კონტეინერიდან */
    public static function enricher(string $type): object
    {
        return app(self::ENRICHERS[$type] ?? MovieEnricher::class);
    }

    /**
     * `CastMember`-ის რელაციის სახელი დომენზე.
     *
     * ⚠️ **მრავლობითობა დომენებს შორის არ ემთხვევა** (`movies`, `series`,
     * `animes`), ე.ი. `$type.'s'` არ მუშაობს. ეს რუკა ორ ადგილას ეწერა და
     * ერთ-ერთში ანიმე ჩუმად `movies`-ზე გადიოდა — ე.ი. მსახიობების სია
     * ანიმეზე ყოველთვის ცარიელი იყო.
     */
    public static function castRelation(string $type): string
    {
        return match ($type) {
            'series' => 'series',
            'anime' => 'animes',
            default => 'movies',
        };
    }

    /** TMDB-ის `/tv/*`-ზე ზის თუ `/movie/*`-ზე */
    public static function isTv(string $type): bool
    {
        return in_array($type, self::TV_TYPES, true);
    }

    /** მოდელი → დომენის key (`Movie` → `movie`) */
    public static function typeOf(Model $record): string
    {
        return array_search($record::class, self::MODELS, true) ?: 'movie';
    }

    /**
     * მხოლოდ ის დომენები, რომლებიც user-ს ჩართული აქვს.
     *
     * @param  list<string>|null  $requested  `null` = ყველა
     * @return list<string>
     */
    public static function enabledFor(User $user, ?array $requested = null): array
    {
        return array_values(array_filter(
            $requested ?? self::TYPES,
            fn (string $type) => self::has($type) && $user->hasModule($type),
        ));
    }
}
