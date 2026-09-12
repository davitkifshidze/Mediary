<?php

use App\Models\Module;
use App\Support\CustomFields;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ანიმეების მოდული** (Tasks §7.1).
 *
 * მესამე მედია-დომენი ფილმისა და სერიალის გვერდით. წყარო **TMDB**-ია
 * (გადაწყვეტილება 2026-09-07), ე.ი. ქართული ტექსტი, პოსტერი, ტრეილერი და
 * გალერეა უცვლელად მუშაობს — TMDB-ზე ანიმე ჩვეულებრივი `tv` ჩანაწერია.
 *
 * ⚠️ **სერიალის ცხრილებს არ იზიარებს** (შენი მითითება: „ყველაფერი თავისი
 * ჰქონდეს"). საკუთარი `animes` + `anime_translations`, საკუთარი კონტროლერი,
 * პოლისი, რესურსი და გამამდიდრებელი. ერთ ცხრილში ჯდომა `type` სვეტს
 * მოითხოვდა და ყოველი query-ს, ყოველი ინდექსისა და ყოველი რეგისტრის
 * ჩუმ განშტოებას — ზუსტად ის, რასაც `PublicDomain`/`PurgeService`-ის
 * რუკები თავიდან იცილებენ.
 *
 * ⚠️ **ჟანრები და მსახიობები გლობალური რჩება** (`genres` / `cast_members`,
 * morph alias `anime`): ისინი ლექსიკონებია და მათი დუბლირება ჟანრების
 * პიქერს ორად გაყოფდა („Action" ორჯერ).
 *
 * ⚠️ **სქემა სერიალის ზუსტი ასლია** (`seasons`/`episodes` ჩათვლით და
 * კოლექციის ველების გარეშე — TMDB-ის TV-ს `belongs_to_collection` არ აქვს),
 * პლუს ის, რაც სერიალს მოგვიანებით მიგრაციებით დაემატა: `user_id`,
 * `trailer_url`, `visibility` და დამთხვევის ინდექსი `(user_id, visibility)`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('animes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->unsignedSmallInteger('year')->nullable();

            // გარე იდენტიფიკატორები
            $table->string('imdb_id', 15)->nullable();
            $table->string('imdb_url')->nullable();
            $table->string('trailer_url', 500)->nullable();
            $table->unsignedInteger('tmdb_id')->nullable();
            $table->string('ge_url', 500)->nullable();
            $table->unsignedInteger('ge_id')->nullable();

            $table->decimal('rating', 3, 1)->nullable();
            $table->unsignedSmallInteger('runtime')->nullable();
            $table->unsignedSmallInteger('seasons')->nullable();
            $table->unsignedSmallInteger('episodes')->nullable();

            $table->string('poster_path')->nullable();
            $table->enum('poster_source', ['tmdb', 'ge_movie', 'upload'])->nullable();

            $table->enum('status', ['undecided', 'to_watch', 'watching', 'watched'])->default('undecided');
            $table->boolean('is_favorite')->default(false);
            $table->timestamp('watched_at')->nullable();
            $table->integer('sort_order')->default(0);
            $table->enum('sync_status', ['pending', 'synced', 'partial', 'failed'])->default('pending');

            // §16 — ყოველ დომენურ ცხრილს სჭირდება; ნაგულისხმევად პირადი
            $table->string('visibility', 20)->default('private');

            $table->timestamps();

            // ⚠️ `imdb_id` **user-ის ფარგლებში** უნიკალურია და არა გლობალურად:
            // ორმა ანგარიშმა ერთი და იგივე ანიმე უნდა შეძლოს დაამატოს
            $table->unique(['user_id', 'imdb_id']);
            $table->index(['user_id', 'status']);
            $table->index(['user_id', 'year']);
            // §16.2 — დამთხვევის query სწორედ ამ წყვილს ჭრის
            $table->index(['user_id', 'visibility']);
            $table->index('tmdb_id');
            $table->index('is_favorite');
        });

        Schema::create('anime_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('anime_id')->constrained('animes')->cascadeOnDelete();
            $table->string('locale', 5);
            $table->string('title')->nullable();
            $table->text('description')->nullable();
            $table->string('source')->nullable(); // tmdb|translation|manual
            $table->timestamps();

            $table->unique(['anime_id', 'locale']);
            // fullText მხოლოდ MySQL-ზე — ტესტები sqlite :memory:-ზე გადის
            if (Schema::getConnection()->getDriverName() === 'mysql') {
                $table->fullText('title');
            }
        });

        /*
         * §6 ფაზა 3/4b — მორგებული ველების მნიშვნელობები.
         *
         * ⚠️ **`hasTable`-ის დაცვა სავალდებულოა** (ბუკმარკის პრეცედენტი):
         * `create_custom_field_values` და `add_file_values_to_custom_fields`
         * `CustomFields::TABLES`-ს გადაუყვებიან და **სუფთა** ბაზაზე ეს ცხრილი
         * უკვე იქ შეიქმნება (ისინი თარიღით წინ არიან). არსებულ ბაზაზე კი
         * ისინი გაშვებულია — ამიტომ აქ ვქმნით, ფაილის სვეტებითურთ.
         */
        $values = CustomFields::TABLE_BY_MODULE['anime'];

        if (! Schema::hasTable($values)) {
            Schema::create($values, function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('record_id')->constrained('animes')->cascadeOnDelete();
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

        // ⚠️ `sort_order` სერიალის (20) მომდევნოა — მენიუში „სერიალების ქვემოთ"
        Module::updateOrCreate(['key' => 'anime'], [
            'name_ka' => 'ანიმეები',
            'name_en' => 'Anime',
            'description_ka' => 'ანიმეების ბიბლიოთეკა — TMDB-ის მონაცემები, ჟანრები, ხმის მსახიობები და გალერეა.',
            'description_en' => 'Anime library — TMDB data, genres, voice cast and gallery.',
            'icon' => 'Sparkles',
            'route_base' => '/anime',
            'api_base' => '/anime',
            'morph_alias' => 'anime',
            'enabled_by_default' => false,
            'sort_order' => 25,
        ]);
    }

    public function down(): void
    {
        Module::where('key', 'anime')->delete();

        Schema::dropIfExists(CustomFields::TABLE_BY_MODULE['anime']);
        Schema::dropIfExists('anime_translations');
        Schema::dropIfExists('animes');
    }
};
