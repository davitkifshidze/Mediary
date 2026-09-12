<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tasks §7.6.5 — ვებიდან ჩამოტვირთული ფოტოს წარმომავლობა.
 *
 * აქამდე გალერეის ფოტოს ორი წყარო ჰქონდა (`tmdb` · `upload`) და ორივე
 * მოკლედ იწერებოდა. ვებძებნის შემდეგ წყარო **engine-იანია**
 * (`serpapi:google_images_light`), ე.ი. სამი რამ იცვლება:
 *
 *  · **`source` 20 → 40 სიმბოლო.** `serpapi:google_images_light` 27-ია, ე.ი.
 *    ძველ სვეტში ჩუმად მოიჭრებოდა და „საიდან მოვიდა" პასუხი დაიკარგებოდა.
 *    ⚠️ **MySQL-ზე მხოლოდ**: sqlite სიგრძეს საერთოდ არ ამოწმებს, ე.ი. იქ
 *    ეს ცვლილება უბრალოდ არაფერს ნიშნავს (არსებული წესი — იხ. CLAUDE.md).
 *  · **`remote_path` 255 → 1000.** აქამდე იქ TMDB-ის მოკლე `file_path` იდო
 *    (`/abc.jpg`), ახლა კი სრული URL ხვდება — და URL-ები 255-ს ადვილად
 *    სცდება. ⚠️ **უნიკალური ინდექსი მასზე არ არის და არც დაემატება**:
 *    utf8mb4-ზე 1000 სიმბოლო 4000 ბაიტია, MySQL-ის 3072-ბაიტიან ჭერს ზემოთ
 *    (`bookmarks.url`-ის ზუსტი პრეცედენტი). დუბლი PHP-ში იჭრება.
 *  · **ორი ახალი სვეტი** — `source_url` (გვერდი, სადაც ფოტო იდო; წყაროს
 *    მითითებისთვის) და `is_thumbnail`.
 *
 * ⚠️ **`is_thumbnail` დროშაა და არა გამოსათვლელი.** §7.6.5-ის წესით,
 * როცა `original` ლინკი კვდება ან 403-ს აბრუნებს (hotlink-ის დაცვა),
 * **ესკიზს ვწერთ სათადარიგოდ** — და ეს ცხადად უნდა ეწეროს. ფაილის ბაიტებიდან
 * ამის დადგენა შეუძლებელია: `remote_path` ორივე შემთხვევაში ორიგინალის
 * მისამართია (ისაა ერთეულის ვინაობა და დუბლის გასაღები).
 *
 * ⚠️ სვეტს **`hidden`/`visible`-ის მსგავსი სახელი არ ჰქვია** — ისინი
 * `Model`-ის დაცული თვისებებია (იხ. CLAUDE.md).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('gallery_images', function (Blueprint $table) {
            $table->string('source_url', 1000)->nullable()->after('remote_path');
            $table->boolean('is_thumbnail')->default(false)->after('height');
        });

        // ⚠️ sqlite-ს `ALTER … MODIFY` არ აქვს და სიგრძესაც არ ამოწმებს,
        // ე.ი. ეს ნაბიჯი მხოლოდ MySQL-ს ეხება (არსებული წესი).
        if (DB::connection()->getDriverName() !== 'mysql') {
            return;
        }

        DB::statement('ALTER TABLE gallery_images MODIFY `source` VARCHAR(40) NOT NULL DEFAULT \'tmdb\'');
        DB::statement('ALTER TABLE gallery_images MODIFY `remote_path` VARCHAR(1000) NULL');
    }

    public function down(): void
    {
        Schema::table('gallery_images', function (Blueprint $table) {
            $table->dropColumn(['source_url', 'is_thumbnail']);
        });

        if (DB::connection()->getDriverName() !== 'mysql') {
            return;
        }

        // ⚠️ უკან დაბრუნება **მონაცემს ჭრის** — 40-სიმბოლოიანი წყარო 20-ში
        // ვერ ჩაჯდება. ამიტომ ჯერ ვამოკლებთ ცხადად და მერე ვიწროვდება სვეტი.
        DB::statement('UPDATE gallery_images SET `source` = LEFT(`source`, 20)');
        DB::statement('UPDATE gallery_images SET `remote_path` = LEFT(`remote_path`, 255)');
        DB::statement('ALTER TABLE gallery_images MODIFY `remote_path` VARCHAR(255) NULL');
        DB::statement('ALTER TABLE gallery_images MODIFY `source` VARCHAR(20) NOT NULL DEFAULT \'tmdb\'');
    }
};
