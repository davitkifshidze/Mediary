<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **ერთი ლოკის მექანიზმი — გალერეის ალბომიც `record_locks`-ზე (Tasks §35.4).**
 *
 * §33-მა ზოგადი `record_locks` შექმნა (პირადი გალერეა), ალბომი კი თავის
 * სვეტებზე დარჩა (`gallery_albums.password_hash`, `failed_unlocks`,
 * `unlock_blocked_until`). ორი მექანიზმი ორჯერ ითხოვდა ერთსა და იმავე წესს —
 * 10 ცდა → 15 წუთი, ანგარიშის პაროლი შეცვლაზე, გახსნა სესიაში. აქ ალბომის
 * პაროლი გადმოდის `record_locks`-ში (`gallery_album`) და სვეტები იშლება.
 *
 * ⚠️ **უნიკალურობა ახლა მფლობელზეცაა** (`user_id, lockable_type, lockable_id`):
 * §35.5-ში მსახიობიც იკეტება, მსახიობი კი გლობალურია — ორ ანგარიშს მასზე
 * თავისი პაროლი შეიძლება ჰქონდეს. საკუთარ ჩანაწერზე (ფილმი, ალბომი) ეს
 * ძველივეა — მას ერთი მფლობელი ჰყავს.
 *
 * ⚠️ ჰეში **ასლდება და არა ხელახლა იქმნება** — პაროლი იგივე რჩება; ცდების
 * მრიცხველი და ბლოკის ვადაც გადმოდის (ბლოკილი ალბომი მიგრაციით არ იხსნება).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('record_locks', function (Blueprint $table) {
            $table->dropUnique(['lockable_type', 'lockable_id']);
            $table->unique(['user_id', 'lockable_type', 'lockable_id']);
        });

        $now = now();

        foreach (DB::table('gallery_albums')->whereNotNull('password_hash')->orderBy('id')->get() as $album) {
            DB::table('record_locks')->insert([
                'user_id' => $album->user_id,
                'lockable_type' => 'gallery_album',
                'lockable_id' => $album->id,
                'password_hash' => $album->password_hash,
                'hint' => null,
                'failed_unlocks' => (int) ($album->failed_unlocks ?? 0),
                'unlock_blocked_until' => $album->unlock_blocked_until,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        Schema::table('gallery_albums', function (Blueprint $table) {
            $table->dropColumn(['password_hash', 'failed_unlocks', 'unlock_blocked_until']);
        });
    }

    public function down(): void
    {
        Schema::table('gallery_albums', function (Blueprint $table) {
            $table->string('password_hash')->nullable()->after('description');
            $table->unsignedSmallInteger('failed_unlocks')->default(0)->after('password_hash');
            $table->timestamp('unlock_blocked_until')->nullable()->after('failed_unlocks');
        });

        foreach (DB::table('record_locks')->where('lockable_type', 'gallery_album')->get() as $lock) {
            DB::table('gallery_albums')->where('id', $lock->lockable_id)->update([
                'password_hash' => $lock->password_hash,
                'failed_unlocks' => $lock->failed_unlocks,
                'unlock_blocked_until' => $lock->unlock_blocked_until,
            ]);
        }

        DB::table('record_locks')->where('lockable_type', 'gallery_album')->delete();

        Schema::table('record_locks', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'lockable_type', 'lockable_id']);
            $table->unique(['lockable_type', 'lockable_id']);
        });
    }
};
