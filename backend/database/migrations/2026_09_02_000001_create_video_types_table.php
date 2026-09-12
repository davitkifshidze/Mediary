<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tasks 5.1 — ვიდეოს ტიპები **მართვადი სია** გახდა.
 *
 * ადრე `videos.kind` enum-ი იყო ორი მყარი მნიშვნელობით (`media` = გასართობი,
 * `info` = ინფორმაციული). ახლა ტიპი per-user ჩანაწერია: user თვითონ ამატებს,
 * არქმევს სახელს ორ ენაზე და ალაგებს. არსებული `kind` ჩანაწერებად მიგრირდება
 * (`media` → „გასართობი", `info` → „ინფორმაციული") და თვითონ სვეტი იშლება.
 *
 * აქვე ემატება `videos.visibility` (Tasks 5.6/16.5) — საჯარო პროფილისა და
 * „დამთხვევების" წინაპირობა. ნაგულისხმევი ყოველთვის `private`-ია: არავის
 * ჩანაწერი ჩუმად საჯარო არ ხდება.
 */
return new class extends Migration
{
    /** დეფაულტი ტიპები — იგივე სია `VideoType::DEFAULTS`-შია */
    private const DEFAULTS = [
        ['key' => 'info', 'name_ka' => 'ინფორმაციული', 'name_en' => 'Informational', 'icon' => 'BookOpen'],
        ['key' => 'fun', 'name_ka' => 'გასართობი', 'name_en' => 'Entertainment', 'icon' => 'Clapperboard'],
    ];

    public function up(): void
    {
        Schema::create('video_types', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('key', 60);
            $table->string('name_ka');
            $table->string('name_en');
            $table->string('icon', 60)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            // ტიპი per-user-ია, ე.ი. უნიკალურობაც მფლობელთან ერთადაა
            $table->unique(['user_id', 'key']);
        });

        Schema::table('videos', function (Blueprint $table) {
            $table->foreignId('type_id')->nullable()->after('description')
                ->constrained('video_types')->nullOnDelete();
            // 5.6/16.5 — ხილვადობა თავიდანვე, რომ 16-ის ტალღა-მიგრაცია აღარ დაგვჭირდეს
            $table->string('visibility', 20)->default('private')->after('is_favorite');
            $table->index(['user_id', 'type_id']);
        });

        $this->migrateKinds();

        Schema::table('videos', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'kind']);
            $table->dropColumn('kind');
        });
    }

    public function down(): void
    {
        Schema::table('videos', function (Blueprint $table) {
            $table->enum('kind', ['media', 'info'])->default('media')->after('description');
            $table->index(['user_id', 'kind']);
        });

        Schema::table('videos', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'type_id']);
            $table->dropConstrainedForeignId('type_id');
            $table->dropColumn('visibility');
        });

        Schema::dropIfExists('video_types');
    }

    /**
     * ყველა არსებულ მომხმარებელს ორივე დეფაულტი ტიპი ეძლევა
     * (ვიდეო ჯერ არ აქვს — ჰქონდეს მაშინაც, როცა მოდულს პირველად გახსნის),
     * შემდეგ ვიდეოები ძველი `kind`-იდან ახალ ტიპზე გადადის.
     */
    private function migrateKinds(): void
    {
        $now = now();
        $ids = [];

        foreach (DB::table('users')->pluck('id') as $userId) {
            foreach (self::DEFAULTS as $i => $type) {
                $ids[$userId][$type['key']] = DB::table('video_types')->insertGetId($type + [
                    'user_id' => $userId,
                    'sort_order' => $i + 1,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }

        foreach ($ids as $userId => $byKey) {
            DB::table('videos')->where('user_id', $userId)->where('kind', 'info')
                ->update(['type_id' => $byKey['info']]);
            DB::table('videos')->where('user_id', $userId)->where('kind', 'media')
                ->update(['type_id' => $byKey['fun']]);
        }
    }
};
