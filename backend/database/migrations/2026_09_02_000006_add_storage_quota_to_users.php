<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tasks 17.1 — საცავის კვოტის ბაზისი.
 *
 * `storage_used_bytes` **დაქეშილი მრიცხველია** და არა ყოველ გახსნაზე
 * გამოთვლილი: ატვირთვა/წაშლა მას დელტით ცვლის, სრული გადათვლა კი
 * `StorageMeter::recalculate()`-ია (ბრძანება `mediary:storage-recalc`).
 *
 * ⚠️ **რა ითვლება (გადაწყდა 19.4-ში, ვარიანტი B):** მხოლოდ **user-ის
 * ატვირთვები** — ავატარი, ვიდეოს თამბნეილი, ხელით ატვირთული პოსტერი და
 * `HasAttachments`-ის ფაილები. TMDB-იდან ჩამოტვირთული პოსტერები და
 * მსახიობების ფოტოები **არ ითვლება**, რადგან მათ user არ ირჩევს.
 */
return new class extends Migration
{
    /** ნაგულისხმევი კვოტა — 1 GB */
    private const DEFAULT_QUOTA = 1073741824;

    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedBigInteger('storage_quota_bytes')->default(self::DEFAULT_QUOTA)->after('settings');
            $table->unsignedBigInteger('storage_used_bytes')->default(0)->after('storage_quota_bytes');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['storage_quota_bytes', 'storage_used_bytes']);
        });
    }
};
