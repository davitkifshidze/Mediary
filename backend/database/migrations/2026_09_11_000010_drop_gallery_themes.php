<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tasks §4.5 — **თემების სრული მოხსნა**.
 *
 * თემა (`gallery_themes` + `gallery_images.theme_id`) 2026-09-06-ს დაემატა
 * როგორც ხელით მინიჭებული „რა არის სურათზე". user-ის გადაწყვეტილებით ის
 * მთლიანად იხსნება: გალერეის ჭრილები ახლა ჩანაწერით, მსახიობით და
 * წყაროთი კეთდება (§4.1), ე.ი. ხელით ლეიბლს ადგილი აღარ აქვს.
 *
 * ⚠️ **ეს მონაცემის წაშლაა და არა რეფაქტორინგი** — ხელით მინიჭებული
 * თემები ქრება. სწორედ ამიტომაა ცალკე მიგრაცია, ცალკე თასქის პუნქტით.
 *
 * ⚠️ **sqlite-ზე არც სვეტი იშლება და არც ცხრილი** (`songs.genre_id`-ის წესი,
 * ოღონდ ერთი ნაბიჯით შორს). ორივე ნაწილი აუცილებელია და ეს ცდით დადგინდა:
 *  · `DROP COLUMN theme_id` sqlite-ს უარყოფს — სვეტზე უცხო გასაღები ზის
 *    („unknown column theme_id in foreign key definition"), ცხრილის
 *    გადაწერა კი მთელი სქემის მეორედ ჩაწერას მოითხოვდა;
 *  · ცხრილის მარტო წაშლა კიდევ უარესია — მკვდარი გასაღები ცარიელ
 *    ადგილს მიუთითებდა და **ყოველი `insert` ჩავარდებოდა** („no such table").
 * ე.ი. ტესტების ბაზაზე ორივე მკვდრად რჩება და მათ აღარაფერი კითხულობს;
 * ნამდვილი წაშლა MySQL-ზე ხდება.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'mysql') {
            return;
        }

        if (Schema::hasColumn('gallery_images', 'theme_id')) {
            Schema::table('gallery_images', function (Blueprint $table) {
                $table->dropIndex(['user_id', 'theme_id']);
                $table->dropConstrainedForeignId('theme_id');
            });
        }

        Schema::dropIfExists('gallery_themes');
    }

    /**
     * ⚠️ უკან დაბრუნება **ცხრილს აღადგენს, შიგთავსს კი ვერა** — წაშლილი
     * თემები და მიბმები აღარსად არის. ეს განზრახ ითქვა ხმამაღლა.
     */
    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'mysql' || Schema::hasTable('gallery_themes')) {
            return;
        }

        Schema::create('gallery_themes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('key', 60);
            $table->string('name_ka');
            $table->string('name_en');
            $table->string('icon', 60)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['user_id', 'key']);
        });

        if (! Schema::hasColumn('gallery_images', 'theme_id')) {
            Schema::table('gallery_images', function (Blueprint $table) {
                $table->foreignId('theme_id')->nullable()->after('category')
                    ->constrained('gallery_themes')->nullOnDelete();
                $table->index(['user_id', 'theme_id']);
            });
        }
    }
};
