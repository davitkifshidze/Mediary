<?php

use App\Models\Module;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **ბორდგეიმების მოდული** (Tasks §14).
 *
 * ოთხი ცხრილი, იმავე რეცეპტით, რითიც წიგნები (`docs/I7…` §7.3):
 *  · `board_game_genres` — **per-user ლექსიკონი** (გლობალური `genres` TMDB-ის
 *    ფილმის ჟანრებია, ე.ი. „ევრო" იქ ფილმის არჩევანშიც გამოჩნდებოდა).
 *  · `board_games` — ჩანაწერი; `visibility` თავიდანვე (16.5).
 *  · `board_game_files` — **წესების PDF**, ფოტოები (გალერეა) და დოკუმენტები.
 *  · `board_game_notes` — ჩანიშვნები.
 *
 * ⚠️ **სათაური ერთენოვანია** (`title`), განსხვავებით წიგნისგან. §14 ორ ენას
 * არ ითხოვს, წყარო (BGG) კი მხოლოდ ინგლისურია — ცარიელი `title_ka` სვეტი
 * მხოლოდ ფორმას დაამძიმებდა. იგივე გადაწყვეტილებაა, რაც ვიდეოსა და სიმღერაზე.
 *
 * ⚠️ **მექანიკები JSON მასივია და არა მეორე ლექსიკონი.** ჟანრი ერთია
 * (`genre_id`), მექანიკა კი ჩანაწერზე ათამდეა და პირდაპირ BGG-დან მოდის —
 * per-user ცხრილი მას მხოლოდ ხელით შესანახ სამუშაოს დაუმატებდა.
 *
 * ⚠️ **მაღაზიის ბმულს ფასი თან ახლავს** (`links[].price`/`currency`): §14
 * ითხოვს „ლინკები + ფასი", ფასი კი მაღაზიაზეა და არა ჩანაწერზე — ერთი
 * `price` სვეტი ორ მაღაზიას ვერ აღწერდა.
 */
return new class extends Migration
{
    /** დეფაულტი ჟანრები — იგივე სია `BoardGameGenre::DEFAULTS`-შია */
    private const GENRES = [
        ['key' => 'strategy', 'name_ka' => 'სტრატეგიული', 'name_en' => 'Strategy'],
        ['key' => 'family', 'name_ka' => 'საოჯახო', 'name_en' => 'Family'],
        ['key' => 'party', 'name_ka' => 'წვეულების', 'name_en' => 'Party'],
        ['key' => 'cooperative', 'name_ka' => 'კოოპერაციული', 'name_en' => 'Cooperative'],
        ['key' => 'card', 'name_ka' => 'საბანქო', 'name_en' => 'Card game'],
        ['key' => 'abstract', 'name_ka' => 'აბსტრაქტული', 'name_en' => 'Abstract'],
        ['key' => 'thematic', 'name_ka' => 'თემატური', 'name_en' => 'Thematic'],
        ['key' => 'wargame', 'name_ka' => 'სამხედრო', 'name_en' => 'Wargame'],
        ['key' => 'childrens', 'name_ka' => 'საბავშვო', 'name_en' => "Children's"],
    ];

    public function up(): void
    {
        Schema::create('board_game_genres', function (Blueprint $table) {
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

        Schema::create('board_games', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->string('title');
            $table->text('description')->nullable();
            $table->unsignedSmallInteger('year')->nullable();

            $table->string('designer')->nullable();
            $table->string('publisher')->nullable();
            $table->foreignId('genre_id')->nullable()->constrained('board_game_genres')->nullOnDelete();
            $table->json('mechanics')->nullable();

            // მოთამაშეები / ასაკი / ხანგრძლივობა — BGG-ის ველების ზუსტი შესატყვისი
            $table->unsignedSmallInteger('players_min')->nullable();
            $table->unsignedSmallInteger('players_max')->nullable();
            $table->unsignedSmallInteger('age_min')->nullable();
            $table->unsignedSmallInteger('playtime_min')->nullable();   // წუთი
            $table->unsignedSmallInteger('playtime_max')->nullable();

            // სირთულე — BGG-ის „average weight" 1.00–5.00
            $table->decimal('complexity', 3, 2)->nullable();

            $table->unsignedInteger('bgg_id')->nullable();
            $table->decimal('bgg_rating', 3, 1)->nullable();

            // ფოტო: ატვირთული (კვოტაზე გადის) ან BGG-დან ჩამოტვირთული
            $table->string('image_path')->nullable();
            $table->string('image_url', 1000)->nullable();
            $table->string('image_source', 20)->nullable();             // upload | bgg

            // მაქვს | მინდა | ვთამაშობ | გავყიდე
            $table->string('status', 20)->default('owned');
            $table->unsignedTinyInteger('rating')->nullable();          // „ჩემი ქულა" 1..10
            $table->boolean('is_favorite')->default(false);

            $table->json('links')->nullable();                          // მაღაზიები: label/url/price/currency

            $table->string('visibility', 20)->default('private');
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['user_id', 'bgg_id']);
            $table->index(['user_id', 'status']);
            $table->index(['user_id', 'is_favorite']);
            $table->index(['user_id', 'genre_id']);
            $table->index('visibility');
        });

        Schema::create('board_game_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('board_game_id')->constrained()->cascadeOnDelete();
            // `rules` = წესების PDF, `image` = გალერეის ფოტო, `doc` = სხვა
            $table->enum('kind', ['rules', 'image', 'doc'])->default('rules');
            $table->string('path');
            $table->string('original_name')->nullable();
            $table->string('mime', 120)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['user_id', 'kind']);
            $table->index(['board_game_id', 'sort_order']);
        });

        Schema::create('board_game_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('board_game_id')->constrained()->cascadeOnDelete();
            $table->text('body');
            $table->timestamps();

            $table->index(['user_id']);
            $table->index(['board_game_id', 'id']);
        });

        $this->seedGenres();

        Module::updateOrCreate(['key' => 'board_game'], [
            'name_ka' => 'ბორდგეიმები',
            'name_en' => 'Board games',
            'description_ka' => 'სამაგიდო თამაშების კოლექცია — მოთამაშეები, სირთულე, BGG-ის რეიტინგი და წესები.',
            'description_en' => 'Board game collection — players, complexity, BGG rating and rules.',
            'icon' => 'Dices',
            'route_base' => '/board-games',
            'api_base' => '/board-games',
            'morph_alias' => 'board_game',
            'enabled_by_default' => false,
            // წიგნები 38-ზეა, გალერეა 40-ზე
            'sort_order' => 39,
        ]);
    }

    /** არსებულ ანგარიშებს საწყისი ლექსიკონი (ლენივი შევსებაც არსებობს) */
    private function seedGenres(): void
    {
        $now = now();

        foreach (DB::table('users')->pluck('id') as $userId) {
            foreach (self::GENRES as $i => $genre) {
                DB::table('board_game_genres')->insert($genre + [
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
        Module::where('key', 'board_game')->delete();

        Schema::dropIfExists('board_game_notes');
        Schema::dropIfExists('board_game_files');
        Schema::dropIfExists('board_games');
        Schema::dropIfExists('board_game_genres');
    }
};
