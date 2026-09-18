<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **Tasks FEAT-04 — ალბომის პაროლის მცდელობათა მრიცხველი.**
 *
 * ⚠️ **`throttle:album-unlock` ამას ვერ ცვლის.** ის ანონიმზე **IP + ალბომზე**
 * ითვლის, ე.ი. IP-ის როტაცია მას გვერდს უვლის — ხოლო ალბომის პაროლი
 * ოთხსიმბოლოიანიც შეიძლება იყოს. მრიცხველი **ალბომზეა** და სწორედ ამიტომ
 * მუშაობს: საიდანაც არ უნდა მოვიდეს ცდა, ის ერთსა და იმავე რიგს ემატება.
 *
 * ⚠️ სვეტის სახელი `unlock_blocked_until`-ია და არა `locked_until`:
 * „locked" ამ ცხრილში უკვე **პაროლის არსებობას** ნიშნავს (`isLocked()`),
 * ე.ი. მეორე მნიშვნელობა ერთ სიტყვაზე ორ ფაქტს დაადებდა.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('gallery_albums', function (Blueprint $table) {
            $table->unsignedSmallInteger('failed_unlocks')->default(0)->after('password_hash');
            $table->timestamp('unlock_blocked_until')->nullable()->after('failed_unlocks');
        });
    }

    public function down(): void
    {
        Schema::table('gallery_albums', function (Blueprint $table) {
            $table->dropColumn(['failed_unlocks', 'unlock_blocked_until']);
        });
    }
};
