<?php

use App\Support\Lang;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **ინგლისური სახელი `ka` ლოკალიდან (Tasks BUG-23).**
 *
 * სინქრონიზაციისას ახალ TMDB-ჟანრს ინგლისური სახელი **ორივე** ლოკალზე
 * ეწერებოდა. შედეგი ჩუმი იყო: `TranslationScanner::genreMissing()` `name_ka`-ს
 * შევსებულად ხედავდა, ე.ი. `/translations` ასეთ ჟანრს **არასდროს** თარგმნიდა
 * და ქართულ ინტერფეისში ინგლისური იდგა „ქართულად". კოდი გასწორდა; ეს
 * მიგრაცია უკვე ჩაწერილ რიგებს იღებს, რომ სკანერმა ისინი დაინახოს.
 *
 * ⚠️ **შემოწმება PHP-შია და არა SQL-ში.** მხედრულის `REGEXP` MySQL-სა და
 * sqlite-ზე სხვადასხვანაირად პასუხობს (და `LOWER()`/`COLLATE` ქართულს
 * საერთოდ არ ეხება) — `Lang::georgian()` კი აპში ამ კითხვის **ერთადერთი**
 * განსაზღვრებაა, იგივე, რასაც გამამდიდრებელი ეკითხება.
 *
 * ⚠️ **ჯერ id-ები გროვდება, წაშლა მერეა.** `chunk()`-ის შიგნით წაშლა
 * ოფსეტს წასწევს და ყოველ მეორე პორციას გამოტოვებდა — ჩუმად, შეცდომის
 * გარეშე.
 *
 * ⚠️ `down()` განზრახ არაფერს აბრუნებს: „აღდგენა" აქ ინგლისურის `ka`-ში
 * ჩაწერას ნიშნავს, ე.ი. ზუსტად იმ ხარვეზს, რომლის გამოც ეს ფაილი არსებობს.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('genre_translations')) {
            return;
        }

        $ids = [];

        DB::table('genre_translations')
            ->where('locale', 'ka')
            ->select('id', 'name')
            ->orderBy('id')
            ->chunk(500, function ($rows) use (&$ids) {
                foreach ($rows as $row) {
                    if (Lang::georgian($row->name) === null) {
                        $ids[] = $row->id;
                    }
                }
            });

        foreach (array_chunk($ids, 500) as $chunk) {
            DB::table('genre_translations')->whereIn('id', $chunk)->delete();
        }
    }

    public function down(): void
    {
        // იხ. ზემოთ — შეუქცევადია განზრახ
    }
};
