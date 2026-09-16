<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **„რა ცხრილებს შეიცავს ეს ასლი" (Tasks §11.1).**
 *
 * შენი სიტყვები: „ბაზის ასლში, თუ არის შესაძლებელი, იყოს ასევე ნახო რა
 * თეიბლებს შეიცავს".
 *
 * ⚠️ **`database_backups.tables` ამას ვერ ჩაანაცვლებს**: ის **რიცხვია და
 * არა სია**, ხოლო იმპორტირებულ ფაილზე საერთოდ `null`-ია. ე.ი. „რა არის
 * შიგნით" კითხვას დღემდე პასუხი არ ჰქონდა და მისი გაცემა **აღდგენას არ
 * მოითხოვს** — დამპის ერთი გავლა ჰყოფნის.
 *
 * ⚠️ **ერთი გავლა და არა ორი.** `countTables()` ისედაც მთელ ფაილს
 * კითხულობდა; ახლა იმავე გავლაზე ცხრილის სახელი, მისი ბაიტები და
 * `INSERT`-ების რაოდენობაც გროვდება. მეორე გავლა 400 მბ-იან დამპზე
 * ორმაგი ფასი იქნებოდა.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('database_backups', function (Blueprint $table) {
            $table->json('table_map')->nullable()->after('tables');
        });
    }

    public function down(): void
    {
        Schema::table('database_backups', function (Blueprint $table) {
            $table->dropColumn('table_map');
        });
    }
};
