<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\Auth;

/**
 * ანგარიშის დონის პარამეტრები (`users.settings`) backend-იდან წაკითხვისთვის.
 *
 * ⚠️ **მოდულის პარამეტრები აქ არაა** — ის `module_user.settings`-ია
 * (გალერეის ოფციები, ჩანაწერების არხები). აქ მხოლოდ ის ჯდება, რასაც
 * SPA `PUT /auth/settings`-ით წერს და backend-საც სჭირდება.
 *
 * ⚠️ **CLI-ს `Auth::id()` არ აქვს** (იგივე ხაფანგი, რაც `BelongsToUser`-ის
 * `owner` scope-ს აქვს), ამიტომ ყოველი მკითხველი ნაგულისხმევს იღებს, თუ
 * მომხმარებელი ცხადად არ გადმოეცა.
 */
class UserSettings
{
    /** TMDB-ის დაშვებული ზომები — უცნობი მნიშვნელობა ნაგულისხმევზე ბრუნდება */
    public const POSTER_QUALITIES = ['w342', 'w500', 'w780'];

    public const DEFAULT_POSTER_QUALITY = 'w500';

    /** ერთი პარამეტრი; `$user === null` = მიმდინარე ავტორიზებული */
    public static function get(string $key, mixed $default = null, ?User $user = null): mixed
    {
        $user ??= Auth::user();

        if (! $user instanceof User) {
            return $default;
        }

        return data_get($user->settings, $key, $default);
    }

    /**
     * პოსტერის ხარისხი (Tasks 18).
     *
     * ⚠️ **ჩამოტვირთვის მომენტში მოქმედებს და უკვე ჩამოტვირთულს არ ცვლის** —
     * გადასაწერად `/sync` სჭირდება. სვეტი ერთია (`poster_path`), ე.ი. ორი
     * ხარისხის ერთდროულად შენახვა არსად იგულისხმება.
     */
    /**
     * **ურნის ვადა დღეებში** (Tasks §29.6).
     *
     * ⚠️ `PUT /auth/settings` ბლობს მთლიანად იღებს და ტიპს არ ამოწმებს,
     * ამიტომ მნიშვნელობა აქ იკვეცება — ციფრის გარეშე ნაგულისხმევია,
     * დიაპაზონის გარეთ კი ზღვარი (`TrashDomain::clampDays()`).
     */
    public static function trashDays(?User $user = null): int
    {
        $value = self::get('trashDays', null, $user);

        return is_numeric($value) ? TrashDomain::clampDays((int) $value) : TrashDomain::defaultDays();
    }

    public static function posterQuality(?User $user = null): string
    {
        $value = self::get('posterQuality', self::DEFAULT_POSTER_QUALITY, $user);

        return in_array($value, self::POSTER_QUALITIES, true)
            ? $value
            : self::DEFAULT_POSTER_QUALITY;
    }
}
