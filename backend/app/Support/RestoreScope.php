<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * **რომელი ცხრილის აღდგენა რამდენად საშიშია (Tasks §11.4).**
 *
 * ⚠️ **აქ არის ამ სექციის ყველაზე დიდი საფრთხე და ის გაზომილია.** ბაზაში
 * **119 უცხო გასაღებია — 99 `CASCADE`, 20 `SET NULL`**, ხოლო `users`-ზე
 * **61 შემომავალი გასაღები** მიდის. ე.ი. „მხოლოდ users ცხრილის აღდგენა"
 * (წაშლა + ჩაწერა) **ყველა ანგარიშის მთელ ბიბლიოთეკას წაშლიდა** და
 * მხოლოდ users-ს დააბრუნებდა. `statuses`-ზე ექვსი `SET NULL` მიდის, ე.ი.
 * მისი აღდგენა ჩუმად **ყველა ჩანაწერს სტატუსს მოხსნიდა**.
 *
 * ⚠️ **`blocked` სია ხელით წერია და არა გამოთვლილი** (შენი გადაწყვეტილება:
 * „სრულად აკრძალული"). გამოთვლილი ზღვარი („N-ზე მეტი შვილი") ერთ დღეს
 * სხვა პასუხს გასცემდა, სია კი ცხადია და კოდის მიმოხილვაზე ჩანს.
 *
 * ⚠️ **`warns` პირიქით — გამოთვლადია**, რადგან სქემა იცვლება: ყოველი
 * ცხრილი, რომელზეც შემომავალი უცხო გასაღები მიდის, კასკადს ან
 * `SET NULL`-ს გამოიწვევს და მომხმარებელმა ეს უნდა დაინახოს **სანამ**
 * დააჭერს.
 *
 * ⚠️ **`TRUNCATE` უვარგისია** — InnoDB უარს ამბობს ცხრილზე, რომელზეც
 * უცხო გასაღები მიუთითებს. ამიტომ `DELETE`-ია და სწორედ ის ისვრის
 * კასკადებს, რაზეც გაფრთხილება დგას.
 *
 * ⚠️ **პოლიმორფულ სვეტებს FK საერთოდ არ აქვთ** (`gallery_images.imageable_*`,
 * `castables`, `genreables`, `audit_logs.subject_*`) — ე.ი. გატეხილ
 * მიმართებას SQL **ხმას არ გამოსცემს**. ეს `warns`-ში ვერ გამოჩნდება და
 * ცალკე უნდა ითქვას.
 */
final class RestoreScope
{
    /**
     * **ვერასდროს აღდგება ცალკე.**
     *
     * `users` — 61 შემომავალი გასაღები (იხ. კლასის შენიშვნა);
     * `database_backups` — თვითონ ამ სიის წყარო, აღდგენა საკუთარ რიგს
     * გადააწერდა; დანარჩენი — ინფრასტრუქტურა, რომელსაც დამპიდან დაბრუნება
     * აზრს კარგავს (სესია, ქეში, რიგი, მიგრაციების ჟურნალი).
     */
    public const BLOCKED = [
        'users',
        'database_backups',
        'migrations',
        'sessions',
        'cache',
        'cache_locks',
        'jobs',
        'job_batches',
        'failed_jobs',
        'personal_access_tokens',
    ];

    public const SAFE = 'safe';

    public const WARNS = 'warns';

    public const BLOCKED_SCOPE = 'blocked';

    public static function isBlocked(string $table): bool
    {
        return in_array($table, self::BLOCKED, true);
    }

    /** `safe` · `warns` · `blocked` */
    public static function scopeFor(string $table): string
    {
        if (self::isBlocked($table)) {
            return self::BLOCKED_SCOPE;
        }

        return self::children($table) === [] ? self::SAFE : self::WARNS;
    }

    /**
     * რომელი ცხრილები დაზარალდება ამ ცხრილის გასუფთავებაზე.
     *
     * ⚠️ **`information_schema`-დან და არა ხელით დაწერილი სიიდან**: სქემა
     * იცვლება და ხელით ჩამონათვალი პირველივე მიგრაციაზე დაძველდებოდა.
     *
     * ⚠️ **sqlite-ზე (ტესტები) ცარიელია** — იქ `information_schema` არ
     * არსებობს და მთელი ეს ფუნქცია მხოლოდ MySQL-ზე მუშაობს, ისევე როგორც
     * დანარჩენი §22/§11.
     *
     * @return list<array{table: string, column: string, on_delete: string}>
     */
    public static function children(string $table): array
    {
        if (DB::connection()->getDriverName() !== 'mysql') {
            return [];
        }

        $rows = DB::select(
            'select k.table_name as child, k.column_name as col, r.delete_rule as rule
             from information_schema.key_column_usage k
             join information_schema.referential_constraints r
               on r.constraint_name = k.constraint_name and r.constraint_schema = k.table_schema
             where k.referenced_table_schema = database()
               and k.referenced_table_name = ?
             order by k.table_name',
            [$table],
        );

        return array_map(fn ($row) => [
            'table' => (string) $row->child,
            'column' => (string) $row->col,
            'on_delete' => (string) $row->rule,
        ], $rows);
    }
}
