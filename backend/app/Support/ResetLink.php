<?php

namespace App\Support;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * **ადმინის ერთჯერადი აღდგენის ბმული (FEAT-16).**
 *
 * ამ აპში ელფოსტის არხი არ არსებობს (§8.2-ის გადაწყვეტილება — SMTP არ
 * არის და ჩუმად წარუმატებელი არხი ყველაზე ცუდი შედეგია), ე.ი. დავიწყებული
 * პაროლი აქამდე **ადმინის ხელით დაწერილ SQL-ს** ნიშნავდა. აქ ადმინი ბმულს
 * აგენერირებს და თვითონ გადასცემს (ჩატით, ხმით, ქაღალდზე) — არხი ადამიანია.
 *
 * ⚠️ **ბაზაში მხოლოდ `sha256` ინახება.** ნედლი ტოკენი პასუხში ერთხელ
 * გამოდის და აღარსად იწერება: `password_reset_tokens`-ის წაკითხვა ვერავის
 * აძლევს სხვის ანგარიშში შესვლის საშუალებას.
 * ⚠️ **`bcrypt` აქ არასწორი იქნებოდა** — არა იმიტომ, რომ სუსტია, არამედ
 * იმიტომ, რომ ძებნა გასაღებით ხდება: bcrypt-ის მარილი თითო რიგზე სხვაა,
 * ე.ი. `Hash::check`-ს მთელი ცხრილის სკანი დასჭირდებოდა. 256-ბიტიან
 * შემთხვევით ტოკენზე `sha256` საკმარისია (პაროლისგან განსხვავებით, აქ
 * გამოსაცნობი არაფერია).
 *
 * ⚠️ **ცხრილი `email`-ზეა დაპირველადებული, ე.ი. ერთ ანგარიშზე ერთი
 * მოქმედი ბმულია** — ახალი ძველს ავტომატურად აუქმებს. ეს სასურველი
 * ქცევაა: „გამოგიგზავნე ახალი" ძველს უნდა კლავდეს.
 */
final class ResetLink
{
    /** რამდენ საათს ცოცხლობს ბმული */
    public const HOURS = 24;

    /** ახალი ტოკენი — აბრუნებს **ნედლ** მნიშვნელობას (მხოლოდ ერთხელ) */
    public static function issue(User $user): string
    {
        $token = Str::random(48);

        DB::table('password_reset_tokens')->updateOrInsert(
            ['email' => $user->email],
            ['token' => self::hash($token), 'created_at' => AppTime::now()],
        );

        return $token;
    }

    /**
     * ვის ეკუთვნის ეს ტოკენი — ვადაგასულზე/უცნობზე `null`.
     *
     * ⚠️ **ვადაგასული რიგი აქვე იშლება.** ტოკენი ერთ ანგარიშზე ერთია, ე.ი.
     * მკვდარი რიგი ახალი ბმულის გაცემას მაინც არ უშლიდა ხელს — მაგრამ
     * მისი შენახვა იმას ნიშნავს, რომ ცხრილში სამუდამოდ დევს ჰეში, რომელსაც
     * აღარაფერი სჭირდება.
     */
    public static function resolve(string $token): ?User
    {
        $row = DB::table('password_reset_tokens')->where('token', self::hash($token))->first();

        if (! $row) {
            return null;
        }

        if (self::expired($row->created_at)) {
            DB::table('password_reset_tokens')->where('email', $row->email)->delete();

            return null;
        }

        return User::where('email', $row->email)->first();
    }

    /** ბმულის გაუქმება — გამოყენების და პაროლის ხელით შეცვლის შემდეგ */
    public static function forget(User $user): void
    {
        DB::table('password_reset_tokens')->where('email', $user->email)->delete();
    }

    /** როდის იწურება მიმდინარე ბმული (ადმინის ეკრანისთვის) */
    public static function expiresAt(?string $createdAt): ?CarbonImmutable
    {
        return $createdAt ? CarbonImmutable::parse($createdAt)->addHours(self::HOURS) : null;
    }

    private static function expired(?string $createdAt): bool
    {
        // ⚠️ თარიღის არქონა „ვადაგასულად" ითვლება: ასეთი რიგი ან ხელითაა
        // ჩაწერილი, ან გაფუჭებული — და მუდმივად მოქმედი ბმული ცუდი პასუხია
        return ! $createdAt || CarbonImmutable::parse($createdAt)->addHours(self::HOURS)->isPast();
    }

    private static function hash(string $token): string
    {
        return hash('sha256', $token);
    }
}
