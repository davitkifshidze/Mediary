<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ინტერფეისიდან შექმნილი მოდული (Tasks §37).**
 *
 * დღემდე მოდული კოდი იყო და არა ჩანაწერი: ცხრილი, მოდელი, კონტროლერი,
 * გვერდი. ეს მიგრაცია **ერთ „ზოგად" მოდულს** აგებს, რომელიც აღწერით მუშაობს —
 * ყველა ინტერფეისიდან შექმნილი მოდულის ჩანაწერი ერთ ცხრილშია
 * (`custom_records`), და მოდული მხოლოდ თავის **გასაღებით** ჭრის.
 *
 * ⚠️ **`modules.owner_id` — `null` = საბაზისო (ყველასი), რიცხვი = პირადი.**
 * პირადი მოდული სხვას არ უჩანს (Q28): არც `/modules`-ის სიაში, არც მარშრუტზე
 * (404 — ფაქტი, რომ არსებობს, თავად ინფორმაციაა). კასკადი ანგარიშის წაშლაზე
 * მხოლოდ **სარეზერვოა**: `AccountEraser` ჩანაწერებს მოდელით შლის, რომ ფაილები
 * და კვოტა გათავისუფლდეს (BUG-21-ის გაკვეთილი).
 *
 * ⚠️ **`definition` — მოდულის სტრუქტურა და არა მომხმარებლის გადახრა**:
 * კლასიფიკაციის სახე (ჟანრი · ტიპი · კატეგორია · არცერთი) და სტატუსების
 * საწყისი ნაკრები. ლეიბლის გადარქმევა (Q30) კი ველების კონსტრუქტორის
 * გადახრაა (`module_user.settings.fields`) — ერთი ადგილი ყველა მოდულზე.
 *
 * ⚠️ **`modules.trashed_at` — მოდული ურნაში (37.7, Q21-ის „დ")**: მოდული
 * ჩანაწერებთან ერთად ერთ ელემენტად მიდის და ვადის განმავლობაში აღდგება.
 *
 * ⚠️ **ჩანაწერი მოდულის გასაღებს ატარებს და არა `id`-ს** (`module`), და ის
 * `modules.key`-ზე უცხო გასაღებითაა მიბმული. გასაღები არასდროს იცვლება
 * (`Status::$key`-ის წესი), ხოლო ყველა მეზობელი რეესტრი სწორედ გასაღებს
 * კითხულობს: სტატუსის ლექსიკონი (`statuses.module`), აუდიტის მოდული,
 * ურნის `module_column`, საცავის `custom/{key}` ფესვი. `id` ყოველ მათგანს
 * ცალკე შეერთებას მოსთხოვდა.
 *
 * ⚠️ **გასაღები ≤ 32 სიმბოლოა** (`App\Support\CustomModules::MAX_KEY`) —
 * ყველაზე ვიწრო მომხმარებელი `statuses.module` (`varchar(32)`) არის.
 *
 * ⚠️ **ყველა `timestamp` `nullable()`-ია** — MariaDB 10.4-ზე ცხრილის პირველი
 * `NOT NULL` TIMESTAMP ჩუმად `ON UPDATE CURRENT_TIMESTAMP`-ს იღებს
 * (`trashed_files.trashed_at`-ის ცოცხალი გაკვეთილი).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('modules', function (Blueprint $table) {
            $table->foreignId('owner_id')->nullable()->after('id')->constrained('users')->cascadeOnDelete();
            $table->json('definition')->nullable();
            $table->timestamp('trashed_at')->nullable()->index();
        });

        /* კლასიფიკატორი — ზოგადი, მოდულის გასაღებით (`statuses`-ის ფორმა). ⚠️
           კავშირი ჩანაწერზე **ერთია** (`category_id`): კლასიფიკაცია საქაღალდეა,
           დანარჩენ ჭრილს ტეგები ფარავს — ბუკმარკისა და ჩანაწერის წესი. */
        Schema::create('custom_categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('module', 32);
            $table->foreign('module')->references('key')->on('modules')->cascadeOnDelete();
            $table->string('key', 60);
            $table->string('name_ka');
            $table->string('name_en');
            $table->string('icon', 60)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            // Tasks §29, ეტაპი 3 — კლასიფიკატორის რიგი ურნაშიც აღდგება
            $table->json('trash_meta')->nullable();
            $table->timestamp('trashed_at')->nullable()->index();
            $table->timestamps();

            $table->unique(['user_id', 'module', 'key']);
        });

        Schema::create('custom_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('module', 32);
            $table->foreign('module')->references('key')->on('modules')->cascadeOnDelete();

            $table->string('title');
            $table->text('description')->nullable();

            /* ბმული — არჩევითი. ⚠️ `platform`/`external_id`/`embed_url` მხოლოდ
               `CustomRecord::applyUrl()` წერს (`VideoUrl`-ის ნებადართული სიით —
               ნედლი HTML არასდროს ინახება); დაკვრა (37.5) და დამთხვევის
               იდენტობა (37.4) სწორედ მათზე დგას. `image_url` — გვერდის
               `og:image`, **დაშორებული** (ბუკმარკის წესი: კვოტას არ ხარჯავს). */
            $table->string('url', 1000)->nullable();
            $table->string('platform', 32)->nullable();
            $table->string('external_id', 191)->nullable();
            $table->string('embed_url', 1000)->nullable();
            $table->string('image_url', 1000)->nullable();

            $table->foreignId('status_id')->nullable()->constrained('statuses')->nullOnDelete();
            $table->foreignId('category_id')->nullable()->constrained('custom_categories')->nullOnDelete();
            $table->json('tags')->nullable();
            $table->boolean('is_favorite')->default(false);

            // ერთადერთი მეტრირებული ატვირთვა თვითონ ჩანაწერზე
            $table->string('photo_path')->nullable();

            /* „როდის დასრულდა" — FEAT-21-ის წესი: წლის მიზანი და თვეების
               ჭრილი მხოლოდ ნამდვილ თარიღს ითვლის. ⚠️ ერთადერთი მწერალი
               `HasStatus::applyStatus()`-ია (`done` როლზე ივსება, სხვაზე იწმინდება). */
            $table->timestamp('finished_at')->nullable();

            $table->string('visibility', 20)->default('private');
            $table->timestamp('trashed_at')->nullable()->index();
            $table->timestamps();

            $table->index(['module', 'user_id']);
            $table->index(['user_id', 'visibility']);
            $table->index(['module', 'is_favorite']);
        });

        /* დამატებითი ველების მნიშვნელობები — **ერთი ცხრილი ყველა ასეთ
           მოდულზე** (`CustomFields::table()`). ⚠️ `module` სვეტი აქაც დგას:
           ველის წაშლა/ტიპის შეცვლა მნიშვნელობებს `field_key`-ით შლის, და
           მოდულის გარეშე ერთი ანგარიშის **სხვა** მოდულის იმავე სახელის ველს
           წაიღებდა. ჩანაწერის `id` ისედაც გლობალურად უნიკალურია, ე.ი.
           unique ინდექსი ცალკე ცხრილების ფორმისაა. */
        Schema::create('custom_record_field_values', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('module', 32);
            $table->foreignId('record_id')->constrained('custom_records')->cascadeOnDelete();
            $table->string('field_key', 60);

            $table->text('value_text')->nullable();
            $table->decimal('value_number', 20, 4)->nullable();
            $table->date('value_date')->nullable();
            $table->boolean('value_bool')->nullable();

            $table->string('value_path')->nullable();
            $table->string('value_name')->nullable();
            $table->string('value_mime', 120)->nullable();
            $table->unsignedBigInteger('value_size')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);

            $table->timestamps();

            $table->unique(['record_id', 'field_key', 'sort_order']);
            $table->index(['user_id', 'module', 'field_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('custom_record_field_values');
        Schema::dropIfExists('custom_records');
        Schema::dropIfExists('custom_categories');

        Schema::table('modules', function (Blueprint $table) {
            $table->dropConstrainedForeignId('owner_id');
            $table->dropIndex(['trashed_at']);
            $table->dropColumn(['definition', 'trashed_at']);
        });
    }
};
