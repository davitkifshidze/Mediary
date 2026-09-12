<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **Tasks §5.7 — წიგნის „წყაროს / წასაკითხი ლინკი"**.
 *
 * ⚠️ **`links` JSON მასივი უკვე არსებობდა** (ყიდვის/წაკითხვის ბმულები,
 * რამდენიმე ერთად), მაგრამ §5.7 ერთ, მარტივ ველს ითხოვს. ორივეს ერთდროულად
 * ჩვენება ფორმას ისევ გრძელს ტოვებდა, ე.ი. ერთი სვეტი ჯობია.
 *
 * ⚠️ **მონაცემი არ იკარგება:** არსებული პირველი ბმული `source_url`-ში
 * გადმოდის, თვითონ `links` კი **რჩება ცხრილში** (ფორმა მას აღარ ხატავს).
 * წაშლა ცალკე გადაწყვეტილება იქნება — მიგრაცია მონაცემს არ შლის.
 *
 * ⚠️ სიგრძე 1000 სიმბოლოა და **უნიკალური ინდექსი არ აქვს** — ზუსტად იმ
 * მიზეზით, რაც `bookmarks.url`-ს აქვს: utf8mb4-ზე ეს 4000 ბაიტია, MySQL-ის
 * 3072-ბაიტიან ჭერს ზემოთ.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('books', function (Blueprint $table) {
            $table->string('source_url', 1000)->nullable()->after('language');
        });

        // არსებული პირველი ბმული → ახალ სვეტში (JSON-ს PHP-ში ვშლით:
        // sqlite-სა და MySQL-ს ერთი და იგივე JSON-ფუნქციები არ აქვთ)
        foreach (DB::table('books')->select('id', 'links')->get() as $book) {
            $links = json_decode((string) $book->links, true);
            $url = is_array($links) ? ($links[0]['url'] ?? null) : null;

            if (is_string($url) && $url !== '') {
                DB::table('books')->where('id', $book->id)
                    ->update(['source_url' => mb_substr($url, 0, 1000)]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('books', function (Blueprint $table) {
            $table->dropColumn('source_url');
        });
    }
};
