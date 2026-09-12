<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tasks 10 — გალერეის **თემატური** კატეგორიები (`DECISIONS.md` §3, პასუხი „ბ").
 *
 * ⚠️ **`gallery_images.category`-ს არ ცვლის და არ ეხება.** ის TMDB-ის
 * ტექნიკური ტიპია (`backdrop|poster|logo|actor`) და წყაროდან მოდის; თემა კი
 * ის არის, რასაც **შენ** ეუბნები სურათს („სცენა", „ჩხუბი"). ერთ სვეტში
 * ორივეს ჩატევა ნიშნავდა, რომ ხელით მინიჭება TMDB-ის მონაცემს გადააწერდა
 * და ხელახალი ჩამოტვირთვა შენს შრომას წაშლიდა.
 *
 * თემა **per-user ლექსიკონია** (`video_types`-ის რეცეპტი) და არა გლობალური:
 * ჟანრებისგან განსხვავებით ის პირადი კლასიფიკაციაა.
 */
return new class extends Migration
{
    public function up(): void
    {
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

        Schema::table('gallery_images', function (Blueprint $table) {
            // `nullOnDelete` — თემის წაშლა ფოტოს არ ჰკარგავს, მხოლოდ ნიშანს ხსნის
            $table->foreignId('theme_id')->nullable()->after('category')
                ->constrained('gallery_themes')->nullOnDelete();
            $table->index(['user_id', 'theme_id']);
        });
    }

    public function down(): void
    {
        Schema::table('gallery_images', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'theme_id']);
            $table->dropConstrainedForeignId('theme_id');
        });

        Schema::dropIfExists('gallery_themes');
    }
};
