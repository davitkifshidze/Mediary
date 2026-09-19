<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **პირადი ტეგები მედია-დომენებზე (FEAT-18).**
 *
 * ვიდეოს, სიმღერას, წიგნს, ჩანაწერსა და ბუკმარკს `tags` ჰქონდა; ფილმს,
 * სერიალსა და ანიმეს — არა. კლასიფიკაცია მხოლოდ TMDB-ის **გლობალური**
 * ჟანრი იყო, ე.ი. „ოჯახთან სანახავი", „საახალწლო" ან „კომფორტ-ფილმი"
 * არსად ეწერებოდა — და `GlobalSearch`-ის `json` წყაროც ამ სამ დომენზე
 * ცარიელი რჩებოდა.
 *
 * ⚠️ **ჟანრს ეს არ ცვლის და არც ერევა.** ჟანრი გაზიარებული ლექსიკონია
 * (TMDB-დან მოდის, სინქრონი მას ხელახლა წერს); ტეგი მხოლოდ ჩემია და
 * სინქრონს ხელი არ ახლავს. ორი ღერძი, ორი სვეტი.
 *
 * ⚠️ **JSON და არა ცხრილი** — ზუსტად ის ფორმა, რაც დანარჩენ ექვს მოდულს
 * აქვს; მეორე მექანიზმი იმავე ცნებისთვის ის დაშორებაა, რომელსაც ეს
 * პროექტი ყოველთვის უარყოფს.
 *
 * ⚠️ **`nullable` და არა `default('[]')`**: MySQL-ს JSON-ზე default არ
 * შეუძლია, ხოლო მოდელის `array` cast-ი `null`-ს ისედაც ცარიელ მასივად
 * კითხულობს (`Video`-ს იგივე მიგრაცია).
 */
return new class extends Migration
{
    private const TABLES = ['movies', 'series', 'animes'];

    public function up(): void
    {
        foreach (self::TABLES as $table) {
            if (Schema::hasColumn($table, 'tags')) {
                continue;
            }

            Schema::table($table, function (Blueprint $t) {
                $t->json('tags')->nullable();
            });
        }
    }

    public function down(): void
    {
        foreach (self::TABLES as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropColumn('tags');
            });
        }
    }
};
