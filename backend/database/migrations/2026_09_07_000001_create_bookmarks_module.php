<?php

use App\Models\Module;
use App\Support\CustomFields;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **ბუკმარკების მოდული** (Tasks §18 backlog; user-ის არჩევანი 2026-09-06,
 * `DECISIONS.md` §10 — „ანიმეები ჯერ არა, ბუკმარკები კი").
 *
 * საიტების/რესურსების ბმულების პირადი კატალოგი. სტრუქტურა **ჩანაწერების
 * მოდულის რეცეპტია** (§13): ორი ცხრილი, გარე გამამდიდრებელი წყარო არ არსებობს.
 *
 *  · `bookmark_categories` — **per-user ლექსიკონი** (`video_types`-ის ანალოგი);
 *  · `bookmarks` — თვითონ ჩანაწერი; `visibility` თავიდანვე (16.5).
 *
 * ⚠️ **კატეგორია ერთია (`category_id`) და არა pivot** — განსხვავებით სიმღერისა
 * (`DECISIONS.md` §5) და თამაშისგან. კატეგორია აქ **საქაღალდეა**: ბმული ერთ
 * ადგილას დევს, დანარჩენ ჭრილს კი `tags` ფარავს (ზუსტად როგორც §13-ის
 * ჩანაწერზეა). თუ ოდესმე მრავალი დაგჭირდეს — pivot ერთი მიგრაციაა.
 *
 * ⚠️ **`url`-ზე unique განზრახ არ არის.** სვეტი 1000 სიმბოლოა, utf8mb4-ზე ეს
 * 4000 ბაიტია და MySQL-ის ინდექსის 3072-ბაიტიან ჭერს სცდება; hash-სვეტი კი
 * დუბლის აკრძალვისთვის ზედმეტი ცერემონიაა — ერთი და იმავე ბმულის ორჯერ შენახვა
 * არაფერს ტეხავს. დუბლს ფორმა გაფრთხილებით იჭერს.
 *
 * ⚠️ **`domain` ცალკე სვეტია** და არა ყოველ ჯერზე `parse_url()` — მისით
 * ხდება დაჯგუფება/ფილტრი და SQL-ში სვეტის გარეშე ეს ვერ მოხერხდებოდა.
 * ერთადერთი ადგილი, სადაც ივსება, `Bookmark::applyUrl()`-ია.
 *
 * ⚠️ **ატვირთვა ერთია — `thumbnail_path`** (სიმღერის წესი): og:image-ს **არ
 * ვტვირთავთ**, მისი URL რჩება `image_url`-ში. ჩამოტვირთვა კვოტას ხარჯავდა
 * იმისთვის, რაც ისედაც საჯარო მისამართზეა.
 */
return new class extends Migration
{
    /** დეფაულტი კატეგორიები — იგივე სია `BookmarkCategory::DEFAULTS`-შია */
    private const CATEGORIES = [
        ['key' => 'reading', 'name_ka' => 'წასაკითხი', 'name_en' => 'Reading'],
        ['key' => 'work', 'name_ka' => 'სამსახური', 'name_en' => 'Work'],
        ['key' => 'learning', 'name_ka' => 'სასწავლო', 'name_en' => 'Learning'],
        ['key' => 'tools', 'name_ka' => 'ხელსაწყოები', 'name_en' => 'Tools'],
        ['key' => 'shopping', 'name_ka' => 'შოპინგი', 'name_en' => 'Shopping'],
        ['key' => 'entertainment', 'name_ka' => 'გასართობი', 'name_en' => 'Entertainment'],
    ];

    public function up(): void
    {
        Schema::create('bookmark_categories', function (Blueprint $table) {
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

        Schema::create('bookmarks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->string('title');
            $table->string('url', 1000);
            // ჰოსტი — დაჯგუფებისა და ფილტრისთვის; `Bookmark::applyUrl()` ავსებს
            $table->string('domain', 190)->nullable();
            $table->text('description')->nullable();

            $table->foreignId('category_id')->nullable()
                ->constrained('bookmark_categories')->nullOnDelete();
            $table->json('tags')->nullable();

            // og:image — **დაშორებული URL**, დისკზე არ ჩამოგვაქვს (კვოტა)
            $table->string('image_url', 1000)->nullable();
            $table->string('favicon_url', 500)->nullable();
            // ერთადერთი მეტრირებული ატვირთვა (`StorageMeter`)
            $table->string('thumbnail_path')->nullable();

            $table->string('status', 20)->default('to_read');
            $table->boolean('is_favorite')->default(false);

            // „გავხსენი" — სიმღერის `play_count`-ის ანალოგი
            $table->unsignedInteger('visit_count')->default(0);
            $table->timestamp('visited_at')->nullable();

            $table->string('visibility', 20)->default('private');
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->index(['user_id', 'status']);
            $table->index(['user_id', 'is_favorite']);
            $table->index(['user_id', 'category_id']);
            $table->index(['user_id', 'domain']);
            $table->index('visibility');
        });

        /*
         * §6 ფაზა 3/4b — მორგებული ველების მნიშვნელობები.
         *
         * ⚠️ **`hasTable`-ის დაცვა სავალდებულოა**: `create_custom_field_values`
         * და `add_file_values_to_custom_fields` `CustomFields::TABLES`-ს
         * გადაუყვებიან, ე.ი. **სუფთა** ბაზაზე ეს ცხრილი უკვე იქ შეიქმნება
         * (ისინი თარიღით წინ არიან). არსებულ ბაზაზე კი ისინი გაშვებულია და
         * ცხრილი აღარავის შეუქმნია — ამიტომ აქ ვქმნით, ფაილის სვეტებითურთ.
         */
        $values = CustomFields::TABLE_BY_MODULE['bookmark'];

        if (! Schema::hasTable($values)) {
            Schema::create($values, function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('record_id')->constrained('bookmarks')->cascadeOnDelete();
                $table->string('field_key', 60);

                $table->text('value_text')->nullable();
                $table->decimal('value_number', 20, 4)->nullable();
                $table->date('value_date')->nullable();
                $table->boolean('value_bool')->nullable();

                $table->string('value_path')->nullable();
                $table->string('value_name')->nullable();
                $table->string('value_mime', 120)->nullable();
                $table->unsignedBigInteger('value_size')->nullable();

                $table->timestamps();

                $table->unique(['record_id', 'field_key']);
                $table->index(['user_id', 'field_key']);
            });
        }

        $this->seedCategories();

        Module::updateOrCreate(['key' => 'bookmark'], [
            'name_ka' => 'ბუკმარკები',
            'name_en' => 'Bookmarks',
            'description_ka' => 'საიტებისა და რესურსების ბმულები — კატეგორიები, ტეგები და „წასაკითხი" სია.',
            'description_en' => 'Links to sites and resources — categories, tags and a read-later list.',
            'icon' => 'Bookmark',
            'route_base' => '/bookmarks',
            'api_base' => '/bookmarks',
            'morph_alias' => 'bookmark',
            'enabled_by_default' => false,
            // ჩანაწერები 41-ზეა
            'sort_order' => 42,
        ]);
    }

    /** არსებულ ანგარიშებს საწყისი ლექსიკონი (ლენივი შევსებაც არსებობს) */
    private function seedCategories(): void
    {
        $now = now();

        foreach (DB::table('users')->pluck('id') as $userId) {
            foreach (self::CATEGORIES as $i => $category) {
                DB::table('bookmark_categories')->insert($category + [
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
        Module::where('key', 'bookmark')->delete();

        Schema::dropIfExists(CustomFields::TABLE_BY_MODULE['bookmark']);
        Schema::dropIfExists('bookmarks');
        Schema::dropIfExists('bookmark_categories');
    }
};
