<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **სერვერის დრო → საქართველოს დრო (Tasks §8).**
 *
 * შენი სიტყვები: „ყველგან ისე გადაიკეტოს, რომ დრო იყოს იმ ქვეყნის მიხედვით,
 * სადაც არის ლოკაცია; ამ ეტაპზე თბილისი, საქართველოს დრო იყოს".
 *
 * ⚠️ **ეს მონაცემის ცვლილებაა და არა ჩვენებისა.** Laravel დროს **აპლიკაციის
 * ზონით** წერს და კითხულობს: `config/app.php`-ის `UTC` → `Asia/Tbilisi`
 * გადართვის შემდეგ **იგივე სტრიქონი** ბაზაში სხვა მომენტს ნიშნავს. ე.ი.
 * მიგრაციის გარეშე ყოველი ისტორიული ჩანაწერი **4 საათით უკან გადაიწევდა** —
 * ნანახის თარიღი, შეხსენების დრო, აუდიტის ლოგი, ყველაფერი.
 *
 * ⚠️ **+4 მუდმივია, რადგან საქართველოს DST არ აქვს** (UTC+4 მთელი წელი).
 * DST-იან ზონაზე ეს მიგრაცია არასწორი იქნებოდა და თითო რიგზე ზონის
 * კონვერტაცია დასჭირდებოდა.
 *
 * ⚠️ **`date` სვეტებს ხელი არ ეხება** — ისინი კალენდარული თარიღებია
 * (გამოსვლის თარიღი, დაბადების დღე), და არა მომენტები. ოთხსაათიანი
 * წანაცვლება მათ ნაწილს ერთი დღით გადაწევდა უმიზეზოდ.
 *
 * ⚠️ **`note_reminders.times_of_day` კედლის საათია და JSON-შია** (მას თავისი
 * `timezone` სვეტი აქვს), ე.ი. ის ავტომატურად გადარჩება: ეს მიგრაცია
 * მხოლოდ `timestamp`/`datetime` **სვეტებს** ეხება. `remind_at`, `next_at`,
 * `starts_at`, `ends_at` კი აბსოლუტური მომენტებია და +4-ს ექვემდებარება.
 * ორმაგი წანაცვლების რეალური რისკი სწორედ აქ იყო.
 *
 * ⚠️ **იდემპოტენტური არ არის** — ორჯერ გაშვება 8 საათს დაამატებდა.
 * `migrations` ცხრილი ამას იცავს; ხელით გაშვება — არა.
 */
return new class extends Migration
{
    /** რამდენი საათით წაიწევს არსებული მონაცემი */
    private const HOURS = 4;

    public function up(): void
    {
        $this->shift(self::HOURS);
    }

    public function down(): void
    {
        $this->shift(-self::HOURS);
    }

    private function shift(int $hours): void
    {
        $driver = DB::connection()->getDriverName();

        foreach (Schema::getTables() as $table) {
            $name = $table['name'];

            /* ⚠️ `migrations` თვითონ ამ გაშვების ჟურნალია — მისი გადაწევა
               „როდის გავიდა" კითხვას დააზიანებდა. */
            if ($name === 'migrations') {
                continue;
            }

            foreach (Schema::getColumns($name) as $column) {
                if (! in_array($column['type_name'], ['timestamp', 'datetime'], true)) {
                    continue;
                }

                $col = $column['name'];

                /* ⚠️ `NULL`-ს ხელი არ ეხება: „არასდროს მომხდარა" და
                   „მოხდა 4 საათით ადრე" ორი სხვადასხვა ფაქტია. */
                DB::table($name)
                    ->whereNotNull($col)
                    ->update([
                        $col => $driver === 'mysql'
                            ? DB::raw(sprintf('`%s` + INTERVAL %d HOUR', $col, $hours))
                            // sqlite-ს `INTERVAL` არ აქვს (ტესტები იქ გადიან)
                            : DB::raw(sprintf("datetime(%s, '%+d hours')", $col, $hours)),
                    ]);
            }
        }
    }
};
