<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **პირადი გალერეა: სქრინშოტები და რჩეული პიროვნება / ალბომი.**
 *
 * სქრინშოტი ცალკე სივრცეა საკუთარი ალბომებით („საინფორმაციო", „პაროლები"):
 * „ყველა"-ში, პიროვნებებსა და ალბომებში არ ერევა. ⚠️ ცალკე ცხრილი განზრახ არ
 * არსებობს — სქრინშოტი იგივე `personal_media`-ა ნიშნით (`is_screenshot`), მისი
 * ალბომი კი იგივე `personal_albums`: ფაილი, ესკიზი, კვოტა, ურნა, ლოკი და წაშლა
 * ერთ გზაზე რჩება და მეორე ასლი არაფერს სჭირდება.
 *
 * ინვარიანტი (იცავს `PersonalGallery`): სქრინშოტს პიროვნება არ აქვს და მხოლოდ
 * სქრინშოტების ალბომში დევს; სქრინშოტების ალბომს პიროვნება არ ჰყავს და საჯარო
 * არასდროსაა.
 *
 * `is_favorite` — რჩეული პიროვნება და ალბომი (ფოტოს/ვიდეოს ეს სვეტი უკვე აქვს).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('personal_media', function (Blueprint $table) {
            $table->boolean('is_screenshot')->default(false)->after('is_favorite');
            $table->index(['user_id', 'is_screenshot']);
        });

        Schema::table('personal_albums', function (Blueprint $table) {
            $table->boolean('is_screenshot')->default(false)->after('visibility');
            $table->boolean('is_favorite')->default(false)->after('is_screenshot');
        });

        Schema::table('persons', function (Blueprint $table) {
            $table->boolean('is_favorite')->default(false)->after('note');
        });
    }

    public function down(): void
    {
        Schema::table('persons', fn (Blueprint $table) => $table->dropColumn('is_favorite'));
        Schema::table('personal_albums', fn (Blueprint $table) => $table->dropColumn(['is_screenshot', 'is_favorite']));
        Schema::table('personal_media', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'is_screenshot']);
            $table->dropColumn('is_screenshot');
        });
    }
};
