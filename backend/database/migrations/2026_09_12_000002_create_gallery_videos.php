<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **Tasks §8.1 — ვიდეოები გალერეაში.**
 *
 * მოთხოვნა იყო „მსახიობებზე ვიდეო სერჩი, ვიდეოს ლინკები ან სადაც ვიდეო დევს
 * იმის ლინკები და თამბნეილები". `GET /api/web/videos` უკვე არსებობდა, მაგრამ
 * **ერთი გამომძახებელიც არ ჰყავდა** — ნაპოვნის შენახვის ადგილი აკლდა.
 *
 * ⚠️ **ეს `gallery_images`-ის ტყუპია და არა მისი ნაწილი.** ფოტო ფაილია
 * (`path`, `size`, კვოტა, დისკი), ვიდეო კი **ბმულია**: არაფერი ჩამოგვაქვს.
 * ერთ ცხრილში ჩაწნვა ნიშნავდა, რომ `path` nullable გამხდარიყო და
 * `StoredFile`-ს ყოველ რიგზე „ფაილი არ არის" შეემოწმებინა — ე.ი. კვოტის
 * აღრიცხვა ორ ტიპზე დაიტოტებოდა. ცალკე ცხრილი ამას თავიდან იცილებს.
 *
 * ⚠️ **`path` სვეტი განზრახ არ არსებობს** — თამბნეილი **დაშორებული URL-ია**
 * (`thumbnail_url`) და არა ჩამოწერილი ფაილი. ეს ბუკმარკის `og:image`-ის
 * ზუსტი წესია: საჯაროდ ხელმისაწვდომ სურათზე კვოტის ხარჯვა ზედმეტია.
 * შედეგად `StorageMeter::referencedPaths()`, `UPLOAD_FOLDERS` და ობოლი
 * ფაილების სკანერი **უცვლელი რჩება**.
 *
 * ⚠️ **`visibility` სვეტიც განზრახ არ არის.** ფოტოს არსებული წესი: ხილვადობას
 * **მშობლისგან** იღებს (`gallery_images`-საც არ აქვს). სვეტის დამატება
 * `PublicDomain::DOMAINS`-ში რიგსაც მოითხოვდა (`RegistryConsistencyTest`),
 * ე.ი. ვიდეოს ბმული საჯარო პროფილის ცალკე დომენი გახდებოდა — რასაც §16 არ
 * ითხოვს.
 *
 * ⚠️ **HTML/embed კოდი არასდროს ინახება** (პროექტის მყარი წესი): ვწერთ URL-ს,
 * `platform`/`embed_url` კი `App\Support\VideoUrl`-ის allowlist-იდან
 * გამოითვლება (`GameVideo::applyUrl()`-ის პრეცედენტი).
 *
 * ⚠️ **`url`-ზე უნიკალური ინდექსი არ არის**: 1000 სიმბოლო utf8mb4-ზე 4000
 * ბაიტია, MySQL-ის 3072-ბაიტიან ჭერს ზემოთ (`bookmarks.url`-ის პრეცედენტი).
 * დუბლი PHP-ში იჭრება, ისე როგორც `gallery_images.remote_path`-ზე.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gallery_videos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // მშობელი: movie | series | anime | cast_member | song | book | game
            $table->morphs('videoable');

            /* საიდან მოვიდა — `serpapi:youtube` · `serpapi:yandex_videos` ·
               `manual` (ხელით ჩასმული ბმული). ⚠️ სიგრძე `gallery_images.source`-ს
               ემთხვევა (40): `serpapi:yandex_videos` 21 სიმბოლოა. */
            $table->string('source', 40)->default('manual');

            $table->string('url', 1000);
            // `VideoUrl::parse()`-ის შედეგი — ხელით არასდროს იწერება
            $table->string('platform', 20)->nullable();
            $table->string('external_id', 100)->nullable();
            $table->string('embed_url', 1000)->nullable();

            $table->string('title', 500)->nullable();
            $table->string('channel', 255)->nullable();
            // წამებში — იგივე ერთეული, რაც `videos.duration`-ს აქვს
            $table->unsignedInteger('duration')->nullable();
            $table->date('published_at')->nullable();

            // ⚠️ დაშორებული მისამართი — ფაილი არ გვაქვს, ე.ი. კვოტაც არ იხარჯება
            $table->string('thumbnail_url', 1000)->nullable();
            // გვერდი, სადაც ვიდეო იპოვა ძებნამ
            $table->string('source_url', 1000)->nullable();

            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index('user_id');
            $table->index(['videoable_type', 'videoable_id', 'sort_order'], 'gallery_videos_parent_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gallery_videos');
    }
};
