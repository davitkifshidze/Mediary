<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **სიმღერა ხდება მრავალჟანრიანი** (`DECISIONS.md` §5, პასუხი 2026-09-06).
 *
 * აქამდე სიმღერას **ერთი** ჟანრი ჰქონდა (`songs.genre_id`) და დანარჩენს
 * ტეგები ფარავდა. user-მა რჩევის საწინააღმდეგოდ pivot აირჩია, ე.ი. ახლა
 * სიმღერა ერთდროულად „როკიც" და „საუნდტრეკიც" შეიძლება იყოს.
 *
 * ⚠️ **ლექსიკონი მაინც per-user რჩება** (`song_genres`) — გლობალურ `genres`-ს
 * აქ არაფერი შეეხო: ის TMDB-ის ფილმის ჟანრებია და „როკი" იქ ფილმის ჟანრების
 * არჩევანში გამოჩნდებოდა (2026-09-03-ის წესი).
 *
 * ⚠️ **pivot-ის სახელი `song_genre_song`-ია** და არა `song_song_genre`:
 * Eloquent-ის კონვენცია მოდელების სახელებს ანბანურად ალაგებს
 * (`SongGenre` + `Song`), ზუსტად როგორც `game_genre_game`-ზეა.
 *
 * ⚠️ **`songs.genre_id` იშლება და მხოლოდ MySQL-ზე** — ორი წყარო ერთსა და
 * იმავე ფაქტზე დროთა განმავლობაში ცდება (იგივე ხაფანგი, რასაც `Game::year`
 * და `Book::syncProgress()` ებრძვის). sqlite (ტესტები) სვეტს **ვერ ჩააგდებს**:
 * `ALTER TABLE … DROP COLUMN` მას უარს ეუბნება, სანამ სვეტი foreign key-შია,
 * FK-ის მოხსნა კი sqlite-ს არ შეუძლია. ე.ი. ტესტებზე სვეტი მკვდარი რჩება —
 * კოდი მას **არსად აღარ კითხულობს**, ჩაწერაც აღარ ხდება. იგივე წესი, რითიც
 * პროექტში MySQL-ისთვის დაწერილი DDL იფარება (`getDriverName()`-ის შემოწმება).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('song_genre_song', function (Blueprint $table) {
            $table->id();
            $table->foreignId('song_id')->constrained()->cascadeOnDelete();
            $table->foreignId('song_genre_id')->constrained('song_genres')->cascadeOnDelete();

            $table->unique(['song_id', 'song_genre_id']);
        });

        // არსებული ერთი ჟანრი pivot-ში გადმოდის — არაფერი იკარგება
        DB::table('songs')
            ->whereNotNull('genre_id')
            ->orderBy('id')
            ->select('id', 'genre_id')
            ->chunk(200, function ($songs) {
                DB::table('song_genre_song')->insert($songs->map(fn ($song) => [
                    'song_id' => $song->id,
                    'song_genre_id' => $song->genre_id,
                ])->all());
            });

        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        // ინდექსი სვეტამდე უნდა მოიხსნას, თორემ MySQL სვეტს არ გაუშვებს
        Schema::table('songs', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'genre_id']);
            $table->dropForeign(['genre_id']);
            $table->dropColumn('genre_id');
        });
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            Schema::table('songs', function (Blueprint $table) {
                $table->foreignId('genre_id')->nullable()->constrained('song_genres')->nullOnDelete();
                $table->index(['user_id', 'genre_id']);
            });
        }

        // უკან — **პირველი** ჟანრი (მეტს სვეტი ვერ დაიტევს; დანარჩენი იკარგება)
        foreach (DB::table('song_genre_song')->orderByDesc('id')->get() as $row) {
            DB::table('songs')->where('id', $row->song_id)->update(['genre_id' => $row->song_genre_id]);
        }

        Schema::dropIfExists('song_genre_song');
    }
};
