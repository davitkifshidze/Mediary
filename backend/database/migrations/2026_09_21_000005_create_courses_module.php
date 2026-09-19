<?php

use App\Models\Module;
use App\Support\CustomFields;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **კურსების მოდული (FEAT-25).**
 *
 * ონლაინ-კურსი (Udemy · Coursera · YouTube-პლეილისტი) დღემდე ან „ვიდეო"
 * იყო, ან „ბუკმარკი" — არც გაკვეთილების პროგრესი ჰქონდა, არც სერტიფიკატის
 * ადგილი.
 *
 * ⚠️ **გარე წყარო არ არსებობს და არც დაემატება**: Udemy-ისა და Coursera-ს
 * კატალოგი დახურულია, ე.ი. „კანდიდატები → სქემა" ნაკადი (TMDB/RAWG/BGG)
 * აქ უაზროა. ერთადერთი დახმარება ბუკმარკის `LinkMetadata`-ს probe-ია:
 * ერთი მოთხოვნა, სათაური და სურათი.
 *
 * ⚠️ **სტატუსი enum-ია და არა per-user ლექსიკონი** (ტასქის ცხადი სია:
 * `to_take` · `taking` · `done` · `dropped`). წიგნის, თამაშისა და
 * სამაგიდოს იგივე რიგი — და აქ ამას დამატებითი მიზეზიც აქვს:
 * `StatusDomain`-ის როლები **სამია** (`todo`/`doing`/`done`), ხოლო
 * „მივატოვე" მეოთხე ფაქტია და არცერთს არ უდრის.
 *
 * ⚠️ **პროგრესი ორ სვეტშია** (`lessons_done` / `lessons_total`) და **პროცენტი
 * არ ინახება**: ორი ერთეული ერთი ფაქტისთვის ზუსტად ის ხაფანგია, რომელსაც
 * `Book::syncProgress()` ებრძვის. პროცენტი გამოთვლადია, უკუსვლა — არა.
 *
 * ⚠️ **ხანგრძლივობა წუთებშია** (`minutes`), მიუხედავად იმისა, რომ ტასქში
 * „hours" ეწერა: §2.5-ის გაკვეთილი — `hltb_*` საათებში ინახებოდა
 * (`decimal(5,1)`) და „2სთ 20წთ" 2.3-ად ჩაიწერა, უკან კი 2სთ 18წთ ამოვიდა.
 * ერთეული მთელ პროექტში ერთია: წუთი.
 *
 * ⚠️ **`finished_at` ცალკე სვეტია და არა `updated_at`.** FEAT-08/FEAT-21-ის
 * აგრეგატი „წელს რამდენი დავასრულე"-ს სწორედ ამით ითვლის; `updated_at`-ით
 * ჩანაცვლება ერთ სვეტში ორ ფაქტს ჩადებდა.
 *
 * ⚠️ **`url` unique არ არის** (ბუკმარკის წესი): 1000 utf8mb4 სიმბოლო 4000
 * ბაიტია და MySQL-ის 3072-ბაიტიან ინდექსს სცდება.
 */
return new class extends Migration
{
    /** დეფაულტი კატეგორიები — იგივე სია `CourseCategory::DEFAULTS`-შია */
    private const CATEGORIES = [
        ['key' => 'programming', 'name_ka' => 'პროგრამირება', 'name_en' => 'Programming'],
        ['key' => 'design', 'name_ka' => 'დიზაინი', 'name_en' => 'Design'],
        ['key' => 'business', 'name_ka' => 'ბიზნესი', 'name_en' => 'Business'],
        ['key' => 'language', 'name_ka' => 'ენები', 'name_en' => 'Languages'],
        ['key' => 'science', 'name_ka' => 'მეცნიერება', 'name_en' => 'Science'],
        ['key' => 'hobby', 'name_ka' => 'ჰობი', 'name_en' => 'Hobby'],
    ];

    public function up(): void
    {
        Schema::create('course_categories', function (Blueprint $table) {
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

        Schema::create('courses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->string('title');
            $table->string('url', 1000)->nullable();
            // პლატფორმა ჰოსტიდან — `Course::applyUrl()` ერთადერთი მწერალია
            $table->string('platform', 190)->nullable();
            $table->string('instructor')->nullable();
            $table->text('description')->nullable();

            $table->foreignId('category_id')->nullable()
                ->constrained('course_categories')->nullOnDelete();
            $table->json('tags')->nullable();

            $table->unsignedSmallInteger('lessons_total')->nullable();
            $table->unsignedSmallInteger('lessons_done')->default(0);
            // ხანგრძლივობა **წუთებში** (§2.5-ის ერთეული)
            $table->unsignedInteger('minutes')->nullable();

            $table->string('status', 20)->default('to_take');
            $table->decimal('rating', 3, 1)->nullable();
            $table->boolean('is_favorite')->default(false);

            // og:image — **დაშორებული URL**, დისკზე არ ჩამოგვაქვს (ბუკმარკის წესი)
            $table->string('image_url', 1000)->nullable();
            // ერთადერთი მეტრირებული ატვირთვა თვითონ ჩანაწერზე
            $table->string('thumbnail_path')->nullable();

            $table->date('started_at')->nullable();
            // FEAT-08/FEAT-21 — „წელს რამდენი დავასრულე" სწორედ ამით ითვლება
            $table->date('finished_at')->nullable();

            $table->string('visibility', 20)->default('private');
            $table->integer('sort_order')->default(0);
            // FEAT-11 — კალათა
            $table->timestamp('trashed_at')->nullable()->index();
            $table->timestamps();

            $table->index(['user_id', 'status']);
            $table->index(['user_id', 'is_favorite']);
            $table->index(['user_id', 'category_id']);
            $table->index(['user_id', 'platform']);
            $table->index('visibility');
        });

        /* სექციის ფაილები — 2026-09-03-ის წესი: უნივერსალური `attachments`
           აღარ არსებობს, თითო მოდულს თავისი `<module>_files` აქვს.
           ⚠️ `certificate` მესამე `kind`-ია და სწორედ ის, რასაც ტასქი ითხოვს. */
        Schema::create('course_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('course_id')->constrained()->cascadeOnDelete();

            $table->string('kind', 20)->default('doc');
            $table->string('path');
            $table->string('original_name');
            $table->string('mime', 120)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->timestamps();

            $table->index(['course_id', 'kind']);
        });

        /* §6 ფაზა 3/4b — მორგებული ველების მნიშვნელობები.
           ⚠️ `hasTable`-ის დაცვა სავალდებულოა: სუფთა ბაზაზე ცხრილს
           `create_custom_field_values` უკვე შექმნის (ის თარიღით წინაა და
           `CustomFields::TABLES`-ს გადაუყვება), არსებულზე კი — არა. */
        $values = CustomFields::TABLE_BY_MODULE['course'];

        if (! Schema::hasTable($values)) {
            Schema::create($values, function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('record_id')->constrained('courses')->cascadeOnDelete();
                $table->string('field_key', 60);

                $table->text('value_text')->nullable();
                $table->decimal('value_number', 20, 4)->nullable();
                $table->date('value_date')->nullable();
                $table->boolean('value_bool')->nullable();

                $table->string('value_path')->nullable();
                $table->string('value_name')->nullable();
                $table->string('value_mime', 120)->nullable();
                $table->unsignedBigInteger('value_size')->nullable();
                /* §7.3 — `file` ველზე რამდენიმე ფაილი. ⚠️ ინდექსი **სამსვეტიანია**:
                   მისი უბრალოდ მოხსნა ყველა სხვა ტიპსაც ორ პასუხს მისცემდა. */
                $table->unsignedSmallInteger('sort_order')->default(0);

                $table->timestamps();

                $table->unique(['record_id', 'field_key', 'sort_order']);
                $table->index(['user_id', 'field_key']);
            });
        }

        $this->seedCategories();

        Module::updateOrCreate(['key' => 'course'], [
            'name_ka' => 'კურსები',
            'name_en' => 'Courses',
            'description_ka' => 'ონლაინ-კურსები — გაკვეთილების პროგრესი, სერტიფიკატი და კატეგორიები.',
            'description_en' => 'Online courses — lesson progress, the certificate and categories.',
            'icon' => 'GraduationCap',
            'route_base' => '/courses',
            'api_base' => '/courses',
            'morph_alias' => 'course',
            'enabled_by_default' => false,
            'color' => '#0ea5a4',
            // ბუკმარკები 42-ზეა
            'sort_order' => 43,
        ]);
    }

    /** არსებულ ანგარიშებს საწყისი ლექსიკონი (ლენივი შევსებაც არსებობს) */
    private function seedCategories(): void
    {
        $now = now();

        foreach (DB::table('users')->pluck('id') as $userId) {
            foreach (self::CATEGORIES as $i => $category) {
                DB::table('course_categories')->insert($category + [
                    'user_id' => $userId,
                    'sort_order' => $i + 1,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        Module::where('key', 'course')->delete();

        Schema::dropIfExists(CustomFields::TABLE_BY_MODULE['course']);
        Schema::dropIfExists('course_files');
        Schema::dropIfExists('courses');
        Schema::dropIfExists('course_categories');
    }
};
