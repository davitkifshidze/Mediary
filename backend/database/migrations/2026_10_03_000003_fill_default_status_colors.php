<?php

use App\Support\StatusDomain;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * **ნაგულისხმევ სტატუსებს ფერი ეწერება** (Tasks §16.2).
 *
 * `statuses.color` სვეტი 2026-09-12-დან არსებობდა, მაგრამ არავინ წერდა და
 * არავინ ხატავდა — ბაზაში ყველა `NULL` იყო, ფერი კი როლით ირჩეოდა, ე.ი.
 * „წაკითხული“ და „არქივი“ (ორივე `done`) ერთ მწვანეში ჩანდა. ახლა ნაკრები
 * (`StatusDomain`) ფერსაც ატარებს და ეს მიგრაცია მას **ერთჯერადად** აწერს
 * იმ ნაგულისხმევ სტატუსებს, რომლებსაც ფერი ჯერ არ აქვთ — მომხმარებლის
 * ხელით არჩეული ფერი (არსებობის შემთხვევაში) ხელუხლებელია.
 *
 * ⚠️ query builder-ით — მანქანის ჩანაწერია და აუდიტში არ უნდა მოხვდეს.
 * `down()` არაფერს აკეთებს: ფერის წაშლა არჩევანს წაშლიდა.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (array_keys(StatusDomain::DOMAINS) as $domain) {
            foreach (StatusDomain::defaults($domain) as $default) {
                if (empty($default['color'])) {
                    continue;
                }

                DB::table('statuses')
                    ->where('module', $domain)
                    ->where('key', $default['key'])
                    ->whereNull('color')
                    ->update(['color' => $default['color']]);
            }
        }
    }

    public function down(): void
    {
        // ფერის წაშლა არჩევანის წაშლაა — უკან გზა არ არის
    }
};
