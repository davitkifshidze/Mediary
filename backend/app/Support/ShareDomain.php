<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * **რა შეიძლება გაზიარდეს ბმულით (Tasks §40.10, Q50).**
 *
 * ⚠️ **ჯერ სამი დომენია და ეს გადაწყვეტილებაა** (Q50 — „ა"): ფილმი, სერიალი,
 * ანიმე. მექანიზმი თავიდანვე საერთოა — ფარგლები (`ShareScope`), ბარათი
 * (`PublicDomain::card()`) და იდენტობა (`PublicDomain::MATCH`) ამ რეესტრით
 * ნაწილდება, ე.ი. ახალი დომენი **ერთი რიგია** აქ (+ თავისი კლასიფიკატორის
 * წესი, Q51) და არა ახალი კონტროლერი.
 *
 * ⚠️ **`personal_rating`** — აქვს თუ არა დომენს მფლობელის **საკუთარი**
 * შეფასება. მედიის `rating` TMDB-ის ქულაა (საჯარო ფაქტი ფილმზე და არა ჩემი
 * აზრი), ე.ი. „ჩემი შეფასების" გადამრთველი მათზე არაფერს შეცვლიდა — და
 * გადამრთველი, რომელიც არაფერს ცვლის, მის არქონაზე უარესია. ფანჯარა მას
 * მხოლოდ მაშინ აჩვენებს, როცა არჩეულ დომენებს შორის ასეთი არის.
 *
 * ⚠️ `RegistryConsistencyTest`: ყოველი საბაზისო მოდული ან აქაა, ან
 * `NOT_SHARED`-ში — **მიზეზით**.
 */
final class ShareDomain
{
    /**
     * @var array<string, array{module: string, personal_rating: bool}>
     */
    public const DOMAINS = [
        'movie' => ['module' => 'movie', 'personal_rating' => false],
        'series' => ['module' => 'series', 'personal_rating' => false],
        'anime' => ['module' => 'anime', 'personal_rating' => false],
    ];

    /**
     * მოდულები, რომლებიც ბმულით **ჯერ არ** (ან არასდროს) ზიარდება — მიზეზით.
     *
     * @var array<string, string>
     */
    public const NOT_SHARED = [
        'game' => 'ეტაპი 2 (Q50) — ჟანრები პირადი კლასიფიკატორია (Q51); RAWG-ით ივსება',
        'book' => 'ეტაპი 2 (Q50) — `genre_id` პირადი კლასიფიკატორია (Q51); Open Library-ით ივსება',
        'board_game' => 'ეტაპი 2 (Q50) — BGG ამ მანქანიდან მიუწვდომელია, ივსება ტექსტით',
        'place' => 'ეტაპი 2 (Q50) — Nominatim-ს წამში ერთი მოთხოვნა აქვს',
        'video' => 'ეტაპი 2 (Q50) — `type_id` სავალდებულოა და პირადი კლასიფიკატორია (Q51)',
        'song' => 'ეტაპი 2 (Q50) — ჟანრები პირადი კლასიფიკატორია (Q51)',
        'bookmark' => 'ეტაპი 2 (Q50) — `category_id` პირადი კლასიფიკატორია (Q51)',
        'course' => 'ეტაპი 2 (Q50) — `category_id` პირადი კლასიფიკატორია (Q51)',
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
}
