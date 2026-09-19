<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **FEAT-09 — სეზონები და ეპიზოდები.**
 *
 * `series.seasons`/`episodes` მხოლოდ **რაოდენობაა**, ე.ი. სტატუსი „ვუყურებ"
 * ვერ ამბობს, სად გავჩერდი. ეს ორი ცხრილი ამას ასწორებს.
 *
 * ⚠️ **ორად გაყოფა შინაარსობრივია და არა ნორმალიზაციის ჩვევა.**
 *  · `tv_episodes` — **TMDB-ის ფაქტია**: „ამ სერიალის მე-2 სეზონის მე-5
 *    ეპიზოდს ეს სახელი და ეს ეთერის თარიღი აქვს". ეს ყველა ანგარიშისთვის
 *    ერთია, ზუსტად ისე, როგორც `genres` და `cast_members` — ამიტომ
 *    **გლობალურია და `user_id` არ აქვს**.
 *  · `episode_watches` — **ჩემი ფაქტია**: ვნახე თუ არა და როდის.
 *
 * ⚠️ **გასაღები `tmdb_series_id`-ია და არა `series.id`.** ორი მიზეზი:
 * ერთი შოუ ას ანგარიშზე ას ასლს ნიშნავდა (ხუთასი ეპიზოდი × ასი), და —
 * რაც უფრო მნიშვნელოვანია — **იგივე ცხრილი ანიმესაც ემსახურება**:
 * `animes.tmdb_id` ასევე TMDB-ის *tv* id-ია (`TvEnricher` ორივეს `/tv/*`-ით
 * ავსებს). `series_id`-ზე მიბმა ორ თითქმის იდენტურ ცხრილს დაბადებდა.
 * სწორედ ამიტომ ჰქვია `tv_episodes` და არა `series_episodes`.
 *
 * ⚠️ **`still_path` განზრახ არ არის.** ეპიზოდის კადრი TMDB-ის გზაა და
 * `RegistryConsistencyTest` ყოველ `*path*` სვეტს `StorageMeter`-ის
 * რუკაში ეძებს; აკორდეონს კი სურათი არ სჭირდება. ერთი სვეტი ნაკლები —
 * ერთი გამონაკლისით ნაკლები.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tv_episodes', function (Blueprint $table) {
            $table->id();
            // TMDB-ის *სერიალის* id (სერიალიც და ანიმეც ამას ინახავს)
            $table->unsignedInteger('tmdb_series_id')->index();
            $table->unsignedSmallInteger('season_number');
            $table->unsignedSmallInteger('episode_number');
            $table->string('name')->nullable();
            $table->date('air_date')->nullable();
            $table->unsignedSmallInteger('runtime')->nullable();
            $table->timestamps();

            /* ⚠️ სამეული უნიკალურია — სინქრონი `updateOrInsert`-ით მუშაობს
               და ორმაგი გაშვება დუბლს არ უნდა ბადებდეს. */
            $table->unique(['tmdb_series_id', 'season_number', 'episode_number'], 'tv_episodes_unique');
        });

        Schema::create('episode_watches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('tv_episode_id')->constrained()->cascadeOnDelete();
            $table->timestamp('watched_at')->nullable();
            $table->timestamps();

            /* ერთი ეპიზოდი ერთხელ — „ნანახია თუ არა" ლოგიკური ფაქტია.
               ⚠️ ხელახლა ნახვის ჟურნალი ცალკე ამოცანაა (FEAT-14) და
               სწორედ ამ ინდექსის მოხსნას მოითხოვს — ე.ი. შეგნებული
               არჩევანია და არა გამორჩენა. */
            $table->unique(['user_id', 'tv_episode_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('episode_watches');
        Schema::dropIfExists('tv_episodes');
    }
};
