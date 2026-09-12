<?php

use App\Models\Module;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **თამაშების მოდული** (Tasks §11; ველების სია დამტკიცდა 19.1-ში, 2026-09-04).
 *
 * ექვსი ცხრილი, იმავე რეცეპტით, რითიც წიგნები და ბორდგეიმები (`docs/I7…` §7.3):
 *  · `game_genres` — **per-user ლექსიკონი**;
 *  · `games` — ჩანაწერი; `visibility` თავიდანვე (16.5);
 *  · `game_genre_game` — ჟანრების pivot (**მრავალჟანრიანი**);
 *  · `game_videos` — §11.2, თითო თამაშზე რამდენიმე ვიდეო ტიპით;
 *  · `game_files` — ატვირთული ფოტოები/დოკუმენტები;
 *  · `game_notes` — ჩანიშვნები.
 *
 * ⚠️ **ჟანრი per-user ლექსიკონია და არა გლობალური polymorphic `genres`,
 * თუმცა 11.1 ასე წერდა.** 11.1 2026-09-02-ითაა დათარიღებული, per-user
 * ლექსიკონის წესი კი 2026-09-03-ზე დაწესდა (სიმღერები) და მას შემდეგ წიგნმაც
 * და ბორდგეიმმაც გაიარა. მიზეზი აქ განსაკუთრებით მძაფრია: RAWG-ის ჟანრებია
 * `Shooter`, `RPG`, `Platformer`, `Massively Multiplayer` — გლობალურ `genres`-ში
 * ჩაწერისას ისინი **ფილმის ჟანრების არჩევანში** გამოჩნდებოდა.
 *
 * ⚠️ **მაგრამ მრავალჟანრიანობა შენარჩუნდა** (pivot `game_genre_game`), და არა
 * ერთი `genre_id`, როგორც წიგნზე/ბორდგეიმზე: 11.1 „ჟანრებს" მრავლობითში წერს
 * და თამაში მართლაც ერთდროულად Action + RPG + Adventure-ია. ტეგები აქ არ არის —
 * მათ ჟანრები და პლატფორმები ფარავს.
 *
 * ⚠️ **წელი სვეტი არ არის** — `release_date`-ის აქსესორია (`Game::year`).
 * ორი ერთეული ერთსა და იმავე ფაქტზე დროთა განმავლობაში ცდება (იგივე ხაფანგი,
 * რასაც `Book::syncProgress()` ებრძვის), ე.ი. წყარო ერთი უნდა იყოს.
 *
 * ⚠️ **სქრინშოტები ორ ადგილას ცხოვრობს და ეს არსებული წესია:** RAWG-იდან
 * **ჩამოტვირთული** კადრი `gallery_images`-შია (morph alias `game`, §11.3 →
 * §10-ის მექანიზმი), user-ის **ატვირთული** კი `game_files.kind = 'image'`-ში —
 * ზუსტად ისე, როგორც ვიდეოსა და ბორდგეიმზე.
 *
 * ⚠️ **HowLongToBeat საათები ხელით ივსება** (11.4): ოფიციალური API არ არსებობს,
 * unofficial endpoint კი მყიფეა — ცალკე გადაწყვეტილებას ითხოვს.
 */
return new class extends Migration
{
    /** დეფაულტი ჟანრები — იგივე სია `GameGenre::DEFAULTS`-შია (RAWG-ის მიხედვით) */
    private const GENRES = [
        ['key' => 'action', 'name_ka' => 'მოქმედება', 'name_en' => 'Action'],
        ['key' => 'adventure', 'name_ka' => 'სათავგადასავლო', 'name_en' => 'Adventure'],
        ['key' => 'rpg', 'name_ka' => 'როლური (RPG)', 'name_en' => 'RPG'],
        ['key' => 'shooter', 'name_ka' => 'სროლა', 'name_en' => 'Shooter'],
        ['key' => 'strategy', 'name_ka' => 'სტრატეგია', 'name_en' => 'Strategy'],
        ['key' => 'simulation', 'name_ka' => 'სიმულატორი', 'name_en' => 'Simulation'],
        ['key' => 'puzzle', 'name_ka' => 'თავსატეხი', 'name_en' => 'Puzzle'],
        ['key' => 'platformer', 'name_ka' => 'პლატფორმერი', 'name_en' => 'Platformer'],
        ['key' => 'racing', 'name_ka' => 'რბოლა', 'name_en' => 'Racing'],
        ['key' => 'sports', 'name_ka' => 'სპორტი', 'name_en' => 'Sports'],
        ['key' => 'fighting', 'name_ka' => 'ბრძოლა', 'name_en' => 'Fighting'],
        ['key' => 'horror', 'name_ka' => 'საშინელება', 'name_en' => 'Horror'],
        ['key' => 'indie', 'name_ka' => 'ინდი', 'name_en' => 'Indie'],
    ];

    public function up(): void
    {
        Schema::create('game_genres', function (Blueprint $table) {
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

        Schema::create('games', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // ორენოვნება ბრტყელი სვეტებია (წიგნის წესი): RAWG ინგლისურენოვანია,
            // ე.ი. translation-ცხრილი მხოლოდ ცარიელ სტრუქტურას შემატებდა
            $table->string('title_ka')->nullable();
            $table->string('title_en')->nullable();
            $table->text('description_ka')->nullable();
            $table->text('description_en')->nullable();

            // ⚠️ `year` სვეტი განზრახ არ არის — `Game::year` აქსესორია
            $table->date('release_date')->nullable();

            $table->string('developer')->nullable();
            $table->string('publisher')->nullable();
            $table->string('franchise')->nullable();

            // პლატფორმები: `Game::PLATFORMS`-ის key-ები; „ჩემი" ერთია მათგან
            $table->json('platforms')->nullable();
            $table->string('my_platform', 30)->nullable();

            // რეჟიმები: single | multiplayer | coop_local | coop_online | pvp
            $table->json('modes')->nullable();

            // HowLongToBeat — საათები, ხელით (11.4)
            $table->decimal('hltb_main', 5, 1)->nullable();
            $table->decimal('hltb_main_extra', 5, 1)->nullable();
            $table->decimal('hltb_complete', 5, 1)->nullable();

            // ქულები: კრიტიკოსები (0–100), მომხმარებლები (RAWG-ის 0–5) და ჩემი (1–10)
            $table->unsignedTinyInteger('metacritic')->nullable();
            $table->unsignedTinyInteger('opencritic')->nullable();
            $table->decimal('users_score', 3, 2)->nullable();
            $table->unsignedTinyInteger('rating')->nullable();

            // ყდა: ატვირთული (კვოტაზე გადის) ან RAWG-დან ჩამოტვირთული
            $table->string('cover_path')->nullable();
            $table->string('cover_url', 1000)->nullable();
            $table->string('cover_source', 20)->nullable();   // upload | rawg

            // მაღაზიები/საიტი: [{label, url, kind}] — kind = official|steam|epic|gog|psn|xbox|other
            $table->json('links')->nullable();

            // გადასაწყვეტი | სათამაშო | ვთამაშობ | გავიარე | მივატოვე
            $table->string('status', 20)->default('undecided');
            $table->boolean('is_favorite')->default(false);

            // დამატებითი (11.1): ასაკობრივი რეიტინგი, ენები, ზომა დისკზე, DLC-ები
            $table->string('age_rating', 20)->nullable();     // PEGI 18 / ESRB M …
            $table->json('languages')->nullable();            // {interface:[], audio:[], subtitles:[]}
            $table->decimal('size_gb', 7, 2)->nullable();
            $table->json('dlcs')->nullable();                 // [{name, note}]

            $table->unsignedInteger('rawg_id')->nullable();
            $table->string('rawg_slug')->nullable();

            $table->string('visibility', 20)->default('private');
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['user_id', 'rawg_id']);
            $table->index(['user_id', 'status']);
            $table->index(['user_id', 'is_favorite']);
            $table->index('visibility');
        });

        // ⚠️ pivot — თამაში მრავალჟანრიანია (11.1 „ჟანრები", მრავლობითში)
        Schema::create('game_genre_game', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_id')->constrained()->cascadeOnDelete();
            $table->foreignId('game_genre_id')->constrained('game_genres')->cascadeOnDelete();

            $table->unique(['game_id', 'game_genre_id']);
        });

        Schema::create('game_videos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('game_id')->constrained()->cascadeOnDelete();

            // 11.2 — „სრული დახურვა/გეიმფლეი" მთავარია, ამიტომ default
            $table->string('kind', 20)->default('walkthrough');
            $table->string('title')->nullable();

            // ⚠️ HTML/embed მარკაპი არასდროს ინახება — `VideoUrl`-ის ალოგვილი
            $table->string('url', 1000);
            $table->string('platform', 40)->default('other');
            $table->string('external_id', 100)->nullable();
            $table->string('embed_url', 1000)->nullable();
            $table->string('thumbnail_url', 1000)->nullable();
            $table->unsignedInteger('duration')->nullable();

            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['game_id', 'kind']);
            $table->index(['user_id']);
        });

        Schema::create('game_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('game_id')->constrained()->cascadeOnDelete();
            // `image` = ატვირთული სქრინშოტი/artwork, `doc` = სხვა დოკუმენტი
            $table->enum('kind', ['image', 'doc'])->default('image');
            $table->string('path');
            $table->string('original_name')->nullable();
            $table->string('mime', 120)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['user_id', 'kind']);
            $table->index(['game_id', 'sort_order']);
        });

        Schema::create('game_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('game_id')->constrained()->cascadeOnDelete();
            $table->text('body');
            $table->timestamps();

            $table->index(['user_id']);
            $table->index(['game_id', 'id']);
        });

        $this->seedGenres();

        Module::updateOrCreate(['key' => 'game'], [
            'name_ka' => 'თამაშები',
            'name_en' => 'Games',
            'description_ka' => 'ვიდეოთამაშების კოლექცია — პლატფორმები, გავლის დრო, ქულები, walkthrough-ები და სქრინშოტები.',
            'description_en' => 'Video game collection — platforms, playtime, scores, walkthroughs and screenshots.',
            'icon' => 'Gamepad2',
            'route_base' => '/games',
            'api_base' => '/games',
            'morph_alias' => 'game',
            'enabled_by_default' => false,
            // ბორდგეიმები 39-ზეა, გალერეა 40-ზე
            'sort_order' => 39,
        ]);
    }

    /** არსებულ ანგარიშებს საწყისი ლექსიკონი (ლენივი შევსებაც არსებობს) */
    private function seedGenres(): void
    {
        $now = now();

        foreach (DB::table('users')->pluck('id') as $userId) {
            foreach (self::GENRES as $i => $genre) {
                DB::table('game_genres')->insert($genre + [
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
        Module::where('key', 'game')->delete();

        Schema::dropIfExists('game_notes');
        Schema::dropIfExists('game_files');
        Schema::dropIfExists('game_videos');
        Schema::dropIfExists('game_genre_game');
        Schema::dropIfExists('games');
        Schema::dropIfExists('game_genres');
    }
};
