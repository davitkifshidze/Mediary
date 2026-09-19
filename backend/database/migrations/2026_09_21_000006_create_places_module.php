<?php

use App\Models\Module;
use App\Support\CustomFields;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **ადგილების მოდული (FEAT-26).**
 *
 * „სანახავი/ნანახი ადგილები" (რესტორანი, მუზეუმი, ქალაქი) კატალოგის იგივე
 * ლოგიკაა, რაც ყველა სხვა მოდულის — სტატუსი, შეფასება, ფოტოები, ტეგები —
 * მაგრამ არსებულ მოდულებში არ ჯდებოდა.
 *
 * ⚠️ **წყარო უფასოა და გასაღების გარეშე: OSM Nominatim.** სამაგიეროდ მას
 * **`User-Agent` სავალდებულოდ** სჭირდება (Wikimedia-ს იგივე წესი) და
 * წამში ერთ მოთხოვნას უშვებს — ამიტომ პასუხი იქეშება
 * (`Services\Places\NominatimClient`).
 *
 * ⚠️ **`osm_id` იდენტობაა (`PublicDomain::MATCH`), მაგრამ unique არ არის.**
 * ხელით შეყვანილ ადგილს ის საერთოდ არ აქვს (`null`), ე.ი. unique-ს ის
 * პირველივე მეორე ხელნაკეთი ჩანაწერი დაარღვევდა; მატჩინგში ასეთი
 * ადგილი უბრალოდ არ მონაწილეობს — ცარიელი იდენტობის დოკუმენტირებული წესი.
 *
 * ⚠️ **კოორდინატი `decimal(10,7)`-ია და არა `float`.** მცურავი წერტილი
 * იმავე წერტილს ორ სხვადასხვა მნიშვნელობად ინახავს დრაივერის მიხედვით,
 * და „ეს ორი ერთი ადგილია?" პასუხგაუცემელი ხდებოდა. შვიდი ათწილადი
 * ~1 სმ სიზუსტეა — ბევრად მეტი, ვიდრე კატალოგს სჭირდება.
 *
 * ⚠️ **რუკა ამ ეტაპზე არ ემატება** (ტასქის საკუთარი სიტყვა: „მოგვიანებით").
 * Leaflet ~40 kB-ია და ცალკე გადაწყვეტილებას იმსახურებს; კოორდინატი
 * ინახება, ბარათი კი გარე რუკის ბმულს აჩვენებს.
 */
return new class extends Migration
{
    /** დეფაულტი კატეგორიები — იგივე სია `PlaceCategory::DEFAULTS`-შია */
    private const CATEGORIES = [
        ['key' => 'restaurant', 'name_ka' => 'რესტორანი', 'name_en' => 'Restaurant'],
        ['key' => 'cafe', 'name_ka' => 'კაფე', 'name_en' => 'Cafe'],
        ['key' => 'museum', 'name_ka' => 'მუზეუმი', 'name_en' => 'Museum'],
        ['key' => 'nature', 'name_ka' => 'ბუნება', 'name_en' => 'Nature'],
        ['key' => 'city', 'name_ka' => 'ქალაქი', 'name_en' => 'City'],
        ['key' => 'hotel', 'name_ka' => 'სასტუმრო', 'name_en' => 'Hotel'],
    ];

    public function up(): void
    {
        Schema::create('place_categories', function (Blueprint $table) {
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

        Schema::create('places', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->string('name');
            $table->string('address', 500)->nullable();
            $table->string('city', 190)->nullable();
            $table->string('country', 190)->nullable();

            // ⚠️ `decimal` და არა `float` — იხ. ზემოთ
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();

            /* OSM-ის იდენტობა. ⚠️ **unique არ არის** — ხელით შეყვანილს ის
               არ აქვს; მატჩინგი (`PublicDomain::MATCH`) ცარიელ იდენტობას
               ისედაც გამოტოვებს. */
            $table->string('osm_id', 60)->nullable();
            $table->string('osm_type', 20)->nullable();

            $table->text('description')->nullable();

            $table->foreignId('category_id')->nullable()
                ->constrained('place_categories')->nullOnDelete();
            $table->json('tags')->nullable();

            $table->string('status', 20)->default('to_visit');
            $table->decimal('rating', 3, 1)->nullable();
            $table->boolean('is_favorite')->default(false);

            // ერთადერთი მეტრირებული ატვირთვა თვითონ ჩანაწერზე
            $table->string('photo_path')->nullable();

            /* „როდის ვიყავი" — FEAT-08/FEAT-21 სწორედ ამით ითვლის
               „წელს რამდენი ვნახე"-ს; `Place::applyStatus()` ერთადერთი მწერალია. */
            $table->date('visited_at')->nullable();

            $table->string('visibility', 20)->default('private');
            $table->integer('sort_order')->default(0);
            // FEAT-11 — კალათა
            $table->timestamp('trashed_at')->nullable()->index();
            $table->timestamps();

            $table->index(['user_id', 'status']);
            $table->index(['user_id', 'is_favorite']);
            $table->index(['user_id', 'category_id']);
            $table->index(['user_id', 'country']);
            $table->index('visibility');
        });

        /* სექციის ფაილები — 2026-09-03-ის წესი (უნივერსალური `attachments` აღარაა).
           ⚠️ ჩემი გადაღებული ფოტო **აქ** ჯდება, ხოლო ვებიდან/გალერეიდან
           მოტანილი — `gallery_images`-ში (ზუსტად ის განაწილება, რაც
           ვიდეოსა და სამაგიდო თამაშს აქვს). */
        Schema::create('place_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('place_id')->constrained()->cascadeOnDelete();

            $table->string('kind', 20)->default('image');
            $table->string('path');
            $table->string('original_name');
            $table->string('mime', 120)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->timestamps();

            $table->index(['place_id', 'kind']);
        });

        $values = CustomFields::TABLE_BY_MODULE['place'];

        if (! Schema::hasTable($values)) {
            Schema::create($values, function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('record_id')->constrained('places')->cascadeOnDelete();
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
                $table->index(['user_id', 'field_key']);
            });
        }

        $this->seedCategories();

        Module::updateOrCreate(['key' => 'place'], [
            'name_ka' => 'ადგილები',
            'name_en' => 'Places',
            'description_ka' => 'სანახავი და ნანახი ადგილები — რუკის კოორდინატი, ფოტოები და შეფასება.',
            'description_en' => 'Places to visit and places visited — map coordinates, photos and a rating.',
            'icon' => 'MapPin',
            'route_base' => '/places',
            'api_base' => '/places',
            'morph_alias' => 'place',
            'enabled_by_default' => false,
            'color' => '#f97316',
            // კურსები 43-ზეა
            'sort_order' => 44,
        ]);
    }

    private function seedCategories(): void
    {
        $now = now();

        foreach (DB::table('users')->pluck('id') as $userId) {
            foreach (self::CATEGORIES as $i => $category) {
                DB::table('place_categories')->insert($category + [
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
        Module::where('key', 'place')->delete();

        Schema::dropIfExists(CustomFields::TABLE_BY_MODULE['place']);
        Schema::dropIfExists('place_files');
        Schema::dropIfExists('places');
        Schema::dropIfExists('place_categories');
    }
};
