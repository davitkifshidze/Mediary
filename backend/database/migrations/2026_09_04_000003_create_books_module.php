<?php

use App\Models\Module;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **წიგნების მოდული** (Tasks §12).
 *
 * ოთხი ცხრილი, ყველა 2026-09-03/04-ის წესებით:
 *  · `book_genres` — **per-user ლექსიკონი** (`song_genres`/`video_types`-ის ანალოგი).
 *    გლობალურ `genres`-ს აქაც არ ვიყენებთ: ის TMDB-ის ფილმის ჟანრებია.
 *  · `books` — ჩანაწერი. `visibility` თავიდანვე (16.5).
 *  · `book_files` — ატვირთული pdf/epub და თანმხლები ფაილები (**სექციის ცხრილი**,
 *    უნივერსალური `attachments` აღარ არსებობს).
 *  · `book_notes` — ჩანაწერები **და ციტატები** (`is_quote` + `page`).
 *
 * ⚠️ **ორენოვნება ბრტყელი სვეტებია და არა translation-ცხრილი.** ფილმებზე
 * `movie_translations` იმიტომ არსებობს, რომ TMDB ორ ენაზე გვაძლევს ტექსტს
 * და §7-ის მთარგმნელი მასზე დგას. წიგნის წყარო (Open Library) ერთენოვანია,
 * ე.ი. ცხრილი ცარიელ სტრუქტურას შემატებდა; API-ს ფორმა კი იგივე რჩება
 * (`title_ka`/`title_en`), რადგან ფილმზეც ბრტყლად გადის.
 *
 * ⚠️ **ერთი ჟანრი წიგნზე** — იგივე გადაწყვეტილება, რაც სიმღერაზე: დანარჩენს
 * ტეგები ფარავს, pivot-ს დავამატებთ, თუ ეს არ იკმარებს.
 */
return new class extends Migration
{
    /** დეფაულტი ჟანრები — იგივე სია `BookGenre::DEFAULTS`-შია */
    private const GENRES = [
        ['key' => 'fiction', 'name_ka' => 'მხატვრული', 'name_en' => 'Fiction'],
        ['key' => 'non-fiction', 'name_ka' => 'არამხატვრული', 'name_en' => 'Non-fiction'],
        ['key' => 'fantasy', 'name_ka' => 'ფენტეზი', 'name_en' => 'Fantasy'],
        ['key' => 'sci-fi', 'name_ka' => 'სამეცნიერო ფანტასტიკა', 'name_en' => 'Science fiction'],
        ['key' => 'detective', 'name_ka' => 'დეტექტივი', 'name_en' => 'Detective'],
        ['key' => 'history', 'name_ka' => 'ისტორია', 'name_en' => 'History'],
        ['key' => 'biography', 'name_ka' => 'ბიოგრაფია', 'name_en' => 'Biography'],
        ['key' => 'psychology', 'name_ka' => 'ფსიქოლოგია', 'name_en' => 'Psychology'],
        ['key' => 'business', 'name_ka' => 'ბიზნესი', 'name_en' => 'Business'],
        ['key' => 'tech', 'name_ka' => 'ტექნოლოგიები', 'name_en' => 'Technology'],
    ];

    public function up(): void
    {
        Schema::create('book_genres', function (Blueprint $table) {
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

        Schema::create('books', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->string('title_ka')->nullable();
            $table->string('title_en')->nullable();
            $table->text('description_ka')->nullable();
            $table->text('description_en')->nullable();

            $table->string('author')->nullable();
            $table->string('publisher')->nullable();
            // ⚠️ ISBN უნიკალურია **user-ზე** და არა გლობალურად (იგივე წესი, რაც
            // `movies.imdb_id`-ზე): ორმა ანგარიშმა ერთი წიგნი უნდა შეძლოს
            $table->string('isbn', 20)->nullable();
            $table->unsignedSmallInteger('year')->nullable();
            $table->unsignedInteger('pages')->nullable();
            $table->string('language', 10)->nullable();

            $table->foreignId('genre_id')->nullable()->constrained('book_genres')->nullOnDelete();
            $table->string('series_name')->nullable();
            $table->unsignedSmallInteger('series_number')->nullable();

            // ბეჭდური | ელექტრონული | აუდიო
            $table->string('format', 20)->default('print');
            // წასაკითხი | ვკითხულობ | წაკითხული | მივატოვე
            $table->string('status', 20)->default('to_read');
            $table->unsignedTinyInteger('rating')->nullable();   // „ჩემი ქულა" 1..10
            $table->boolean('is_favorite')->default(false);

            // პროგრესი ორ ერთეულში; `Book::syncProgress()` ერთმანეთს უსწორებს,
            // ე.ი. ორი სვეტი ვერასდროს ეწინააღმდეგება ერთმანეთს
            $table->unsignedInteger('progress_page')->nullable();
            $table->unsignedTinyInteger('progress_percent')->nullable();

            // ყდა: ატვირთული (კვოტაზე გადის) ან Open Library-დან ჩამოტვირთული
            $table->string('cover_path')->nullable();
            $table->string('cover_url', 1000)->nullable();
            $table->string('cover_source', 20)->nullable();      // upload | openlibrary

            $table->json('links')->nullable();                   // ყიდვის/წაკითხვის ბმულები
            $table->json('tags')->nullable();
            $table->string('openlibrary_id', 60)->nullable();    // /works/OL…W

            $table->string('visibility', 20)->default('private');
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['user_id', 'isbn']);
            $table->index(['user_id', 'status']);
            $table->index(['user_id', 'is_favorite']);
            $table->index(['user_id', 'genre_id']);
            $table->index(['user_id', 'author']);
            $table->index('visibility');
        });

        Schema::create('book_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            // `book` = თვითონ წიგნი (pdf/epub), დანარჩენი თანმხლებია
            $table->enum('kind', ['book', 'image', 'doc'])->default('book');
            $table->string('path');
            $table->string('original_name')->nullable();
            $table->string('mime', 120)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['user_id', 'kind']);
            $table->index(['book_id', 'sort_order']);
        });

        Schema::create('book_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->text('body');
            // ციტატა ჩვეულებრივი ჩანიშვნისგან მხოლოდ ამ ორით განსხვავდება
            $table->boolean('is_quote')->default(false);
            $table->unsignedInteger('page')->nullable();
            $table->timestamps();

            $table->index(['user_id']);
            $table->index(['book_id', 'id']);
        });

        $this->seedGenres();

        Module::updateOrCreate(['key' => 'book'], [
            'name_ka' => 'წიგნები',
            'name_en' => 'Books',
            'description_ka' => 'წიგნების პირადი ბიბლიოთეკა — ავტორი, სერია, პროგრესი, ციტატები და ფაილები.',
            'description_en' => 'Personal book library — author, series, reading progress, quotes and files.',
            'icon' => 'BookOpen',
            'route_base' => '/books',
            'api_base' => '/books',
            // გალერეა წიგნსაც ეკიდება (`gallery_images.imageable_type = 'book'`)
            'morph_alias' => 'book',
            'enabled_by_default' => false,
            // გალერეა 40-ზეა, ე.ი. წიგნები მის წინ ჯდება
            'sort_order' => 38,
        ]);
    }

    /** არსებულ ანგარიშებს საწყისი ლექსიკონი (ლენივი შევსებაც არსებობს) */
    private function seedGenres(): void
    {
        $now = now();

        foreach (DB::table('users')->pluck('id') as $userId) {
            foreach (self::GENRES as $i => $genre) {
                DB::table('book_genres')->insert($genre + [
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
        Module::where('key', 'book')->delete();

        Schema::dropIfExists('book_notes');
        Schema::dropIfExists('book_files');
        Schema::dropIfExists('books');
        Schema::dropIfExists('book_genres');
    }
};
