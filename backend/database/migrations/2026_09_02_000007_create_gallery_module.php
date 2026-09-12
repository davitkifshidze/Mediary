<?php

use App\Models\Module;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tasks 10 — გალერეის მოდული.
 *
 * ⚠️ **ცალკე ცხრილი განზრახ არ იქმნება.** ფოტოები `attachments`-ში ჯდება
 * (`HasAttachments`) — ე.ი. კვოტის აღრიცხვა (17) და წაშლის კასკადი
 * უფასოდ მოგვდის, სხვა გზა კი მრიცხველს ჩუმად აცდენდა. ამის გამო
 * `visibility` სვეტიც არ სჭირდება: სურათი **მშობელი ჩანაწერის**
 * ხილვადობას იზიარებს (16-ის სქემის წესი ცხრილებზეა და არა ფაილებზე).
 *
 * ახალი სვეტები `attachments`-ზე:
 *  · `source`      — 'upload' (user-მა ატვირთა) | 'tmdb' (გალერეამ ჩამოტვირთა)
 *  · `collection`  — 'gallery'; `null` = ჩვეულებრივი მიმაგრებული ფაილი
 *  · `category`    — 'backdrop' | 'poster' | 'logo' | 'actor'
 *  · `remote_path` — TMDB-ის `file_path`; ხელახლა გაშვებაზე დუბლს ამით ვცნობთ
 *  · `width`/`height` — TMDB-ის მეტამონაცემი (ბადეში აspect-ისთვის)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attachments', function (Blueprint $table) {
            // enum-ს განზრახ ვერიდებით: sqlite-ზე `ALTER … MODIFY` არ მუშაობს
            $table->string('source', 20)->default('upload')->after('kind');
            $table->string('collection', 40)->nullable()->after('source');
            $table->string('category', 20)->nullable()->after('collection');
            $table->string('remote_path')->nullable()->after('path');
            $table->unsignedInteger('width')->nullable()->after('size');
            $table->unsignedInteger('height')->nullable()->after('width');

            $table->index(['attachable_type', 'attachable_id', 'collection'], 'attachments_gallery_index');
        });

        Module::updateOrCreate(['key' => 'gallery'], [
            'name_ka' => 'გალერეა',
            'name_en' => 'Gallery',
            'description_ka' => 'ოფიციალური კადრები და მსახიობების ფოტოები ფილმებსა და სერიალებზე.',
            'description_en' => 'Official stills and cast photos for movies and series.',
            'icon' => 'Image',
            'route_base' => '/gallery',
            'api_base' => '/gallery',
            // საკუთარი ჩანაწერი არ აქვს — polymorphic pivot-ებში არ მონაწილეობს
            'morph_alias' => null,
            'enabled_by_default' => false,
            'sort_order' => 40,
        ]);
    }

    public function down(): void
    {
        Module::where('key', 'gallery')->delete();

        Schema::table('attachments', function (Blueprint $table) {
            $table->dropIndex('attachments_gallery_index');
            $table->dropColumn(['source', 'collection', 'category', 'remote_path', 'width', 'height']);
        });
    }
};
