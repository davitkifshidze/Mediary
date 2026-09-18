<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ვიუერის ბოლო გახსნის დრო (Tasks GAP-16).**
 *
 * §11.3-ის ვიუერი დამპს დროებით ბაზაში ტვირთავს (`<db>_inspect_<id>`).
 * დახურვის ღილაკის გარეშე დატოვებული ტაბი ამ ბაზას MySQL-ში **სამუდამოდ**
 * ტოვებდა: მონაცემის სრული მეორე ასლი დისკზე, კვოტის გარეთ და პაროლის
 * ჰეშებით. აღრიცხვა არსად იყო — `mediary:doctor`-საც კი ვერ ენახა.
 *
 * ⚠️ **სვეტი და არა `updated_at`**: ჩანაწერი სხვა მიზეზითაც იცვლება
 * (სახელი, შენიშვნა, სტატუსი), ე.ი. „როდის გაიხსნა ვიუერი" მასზე ვერ
 * იკითხება — იგივე გაკვეთილი, რაც `download_started_at`-ს აქვს.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('database_backups', function (Blueprint $table) {
            $table->timestamp('inspected_at')->nullable()->after('finished_at');
        });
    }

    public function down(): void
    {
        Schema::table('database_backups', function (Blueprint $table) {
            $table->dropColumn('inspected_at');
        });
    }
};
