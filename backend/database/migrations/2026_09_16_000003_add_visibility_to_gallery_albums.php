<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ალბომი საჯარო შეიძლება გახდეს (Tasks §7.5).**
 *
 * შენი სიტყვები: „სხვა იუზერმა ნახოს ჩემს გალერეაში გასაჯაროებული
 * ფოტოები … გალერეის გასაჯაროება შეგიძლია გააკეთო ფილმების/მსახიობების
 * გასაჯაროებით, როგორც ლოგიკურია".
 *
 * ⚠️ **ფოტოს `visibility` სვეტი არ ემატება და არც დაემატება.** ფოტო
 * მშობლის ხილვადობას იღებს მემკვიდრეობით — ეს §10-ის წესია და ორი წყარო
 * ერთ ფაქტზე სწორედ ის ხაფანგია, რომელსაც პროექტი თავს არიდებს.
 *
 * ⚠️ **გამონაკლისი ზუსტად ერთია: ფოტო, რომელსაც მშობელი არ ჰყავს** (§26-ის
 * „უკატეგორიო"). მას მემკვიდრეობით არაფერი მოსდის, ე.ი. ერთადერთი, რასაც
 * აქ ჩამრთველი სჭირდება, **ალბომია**.
 *
 * ⚠️ `RegistryConsistencyTest` `visibility` სვეტის დამატებისთანავე
 * ჩავარდება, სანამ `PublicDomain::DOMAINS`-ში `gallery_album` არ
 * დარეგისტრირდება — სვეტი მარტო ვერაფერს გამოაჩენს.
 *
 * ⚠️ **`MATCH`-ში არ ემატება**: ალბომს გლობალური იდენტობა არ აქვს (ორი
 * ადამიანის ერთნაირად დასათაურებული ალბომი ერთი და იგივე არ არის) —
 * `playlist`-ის ზუსტი პრეცედენტი.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('gallery_albums', function (Blueprint $table) {
            $table->string('visibility', 16)->default('private')->after('password_hash');
            // საჯარო პროფილის query ზუსტად ამ ორ სვეტს კითხულობს
            $table->index(['user_id', 'visibility']);
        });
    }

    public function down(): void
    {
        Schema::table('gallery_albums', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'visibility']);
            $table->dropColumn('visibility');
        });
    }
};
