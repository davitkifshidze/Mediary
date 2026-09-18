<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **Tasks SEC-10 — `roles.permissions = NULL` აღარ ნიშნავს „ყველაფერს".**
 *
 * `Role::allows()`/`allowsAdmin()` ცარიელ მნიშვნელობას სრულ წვდომად
 * კითხულობდა **ყველა მოდულსა და ადმინის სექციაზე** — ყველაზე არასაიმედო
 * default, რაც შეიძლება არსებობდეს. API ასეთ რიგს ვეღარ ქმნიდა
 * (`AdminRoleController::cleanPermissions()` ყოველთვის მასივს აბრუნებს),
 * მაგრამ სვეტი `nullable` იყო, ე.ი. `PartialRestore::table()` მას
 * **ნებისმიერი ატვირთული dump-იდან** შემოიტანდა — და ეს იმ სექციაშია,
 * რომელსაც სწორედ სრული წვდომა აქვს.
 *
 * ⚠️ **`super_admin`-იც `{}`-ზე გადადის და ეს არაა დაუდევრობა.** მისი
 * შეუზღუდაობა გასაღებზე დგას (`isSuperAdmin()`) და არა მონაცემის
 * არყოფნაზე; ამის შემდეგ სვეტს ორი მნიშვნელობა აღარ აქვს. API-ს ფორმა
 * უცვლელია: `RoleResource` სუპერ-ადმინზე კვლავ `null`-ს აგზავნის, რადგან
 * ფრონტის `roleScope()` სწორედ მას კითხულობს როგორც „მატრიცა ჩაკეტილია".
 *
 * ⚠️ **`NOT NULL` მხოლოდ MySQL-ზე.** sqlite-ს (ტესტები) `ALTER … MODIFY`
 * არ აქვს — პროექტის არსებული წესი. backfill ორივე ძრავზე გადის, ე.ი.
 * სემანტიკა ყველგან ერთია და შეზღუდვა იქ ემატება, სადაც შეიძლება.
 *
 * ⚠️ **DB-დონის `DEFAULT` განზრახ არ ეწერება**: MySQL 8-ში `json`-ს
 * ლიტერალური default არ აქვს, MariaDB-ში კი `json` `longtext`-ის
 * მეტსახელია — ე.ი. ერთი და იგივე მიგრაცია ორ ძრავზე სხვადასხვანაირად
 * იქცეოდა. ყველა ჩამწერი გზა (კონტროლერი, სიდერი, ეს მიგრაცია) ისედაც
 * ცხადად წერს მნიშვნელობას.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('roles')->whereNull('permissions')->update(['permissions' => '{}']);

        if (DB::connection()->getDriverName() !== 'mysql') {
            return;
        }

        Schema::table('roles', function (Blueprint $table) {
            $table->json('permissions')->nullable(false)->change();
        });
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'mysql') {
            return;
        }

        Schema::table('roles', function (Blueprint $table) {
            $table->json('permissions')->nullable()->change();
        });

        /* ⚠️ ⚠️ `{}` უკან `null`-ად **არ** ბრუნდება: მიგრაციამდე `{}` და `null`
           ორი სხვადასხვა ფაქტი იყო („უფლება არ აქვს" და „ყველაფერი აქვს"),
           და მათი გარჩევა აქ აღარ შეიძლება — ბრმა დაბრუნება ყველა ცარიელ
           როლს სრულ წვდომას მისცემდა. */
    }
};
