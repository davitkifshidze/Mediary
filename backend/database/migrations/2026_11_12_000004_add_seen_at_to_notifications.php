<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **„ნახული" და „წაკითხული" ორი სხვადასხვა ფაქტია.**
 *
 * აქამდე მხოლოდ `read_at` იყო: ზარის რიცხვი მანამ ენთო, სანამ ყოველ შეტყობინებას
 * არ დააჭერდი — ე.ი. ან ხმაური რჩებოდა, ან „ყველას წაკითხვა" ერთიანად შლიდა იმის
 * კვალსაც, რაც ჯერ არ გაგიკეთებია. `seen_at` ზარის გახსნაა („დავინახე, რომ მოვიდა"),
 * `read_at` — შეტყობინებაზე დაჭერა („მივხედე"). ზარის რიცხვი უნახავს ითვლის,
 * წერტილი — წაუკითხავს.
 *
 * ⚠️ უკვე წაკითხული შეტყობინება ნახულიცაა — `seen_at` მას `read_at`-იდან ეწერება;
 * წაუკითხავი ძველი შეტყობინება უნახავად რჩება და ზარზე ისევ ჩანს.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('notifications') || Schema::hasColumn('notifications', 'seen_at')) {
            return;
        }

        Schema::table('notifications', function (Blueprint $table) {
            $table->timestamp('seen_at')->nullable()->after('read_at');
        });

        DB::table('notifications')->whereNotNull('read_at')->update(['seen_at' => DB::raw('read_at')]);
    }

    public function down(): void
    {
        if (Schema::hasTable('notifications') && Schema::hasColumn('notifications', 'seen_at')) {
            Schema::table('notifications', fn (Blueprint $table) => $table->dropColumn('seen_at'));
        }
    }
};
