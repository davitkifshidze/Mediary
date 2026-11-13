<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **„შემოთავაზებები" — მსგავსი სათაურები ჩემი არჩევანის მიხედვით.**
 *
 * `suggestion_sources` — გარე წყაროს პასუხი ერთ სათაურზე, **გლობალური** ქეში
 * (`franchise_parts`-ის რიგში): „რა ჰგავს ამ ფილმს" ყველა ანგარიშზე ერთი და იგივეა,
 * ამიტომ ერთი სათაური წყაროს ერთხელ ეკითხება. `source` — `tmdb` (რეკომენდაციები,
 * მსგავსი სათაურები, საკვანძო სიტყვები), `trakt`, `anilist` ან `title` (ერთი სათაურის
 * მოკლე აღწერა, როცა ის მხოლოდ დამატებითმა წყარომ მოიტანა); `kind` — TMDB-ის მხარე
 * (`movie` · `tv`: სერიალი და ანიმე ერთ მხარეს ზის).
 *
 * `suggestion_vectors` — აღწერის ვექტორი (Gemini-ის embedding), ისიც გლობალური და
 * TMDB-ის id-ით: ერთხელ ითვლება და ლიმიტს მეორედ აღარ ხარჯავს.
 *
 * `hidden_suggestions` — **ჩემია**: სათაურები, რომლებზეც ვთქვი „არ მაინტერესებს".
 * სათაური, წელი და პოსტერი აქვე ინახება — „დამალულების" სია წყაროს აღარ ეკითხება.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('suggestion_sources')) {
            Schema::create('suggestion_sources', function (Blueprint $table) {
                $table->id();
                $table->string('source', 20);
                $table->string('kind', 5);
                $table->unsignedBigInteger('tmdb_id');
                $table->longText('payload');
                $table->timestamp('fetched_at')->nullable();
                $table->timestamps();

                $table->unique(['source', 'kind', 'tmdb_id'], 'suggestion_sources_unique');
            });
        }

        if (! Schema::hasTable('suggestion_vectors')) {
            Schema::create('suggestion_vectors', function (Blueprint $table) {
                $table->id();
                $table->string('kind', 5);
                $table->unsignedBigInteger('tmdb_id');
                // რომელმა მოდელმა დათვალა — სხვა მოდელის ვექტორი ამასთან ვერ შედარდება
                $table->string('model', 60);
                // float32-ების მწკრივი base64-ით (768 რიცხვი ≈ 4 KB)
                $table->text('vector');
                $table->timestamps();

                $table->unique(['kind', 'tmdb_id'], 'suggestion_vectors_unique');
            });
        }

        if (! Schema::hasTable('hidden_suggestions')) {
            Schema::create('hidden_suggestions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                // მოდული: `movie` · `series` · `anime`
                $table->string('type', 10);
                $table->unsignedBigInteger('tmdb_id');
                $table->string('title');
                $table->unsignedSmallInteger('year')->nullable();
                // TMDB-ის CDN-ის ფარდობითი გზა (`/abc.jpg`) — ჩვენს დისკზე ფაილი არ დევს
                $table->string('tmdb_poster')->nullable();
                $table->timestamps();

                $table->unique(['user_id', 'type', 'tmdb_id'], 'hidden_suggestions_unique');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('hidden_suggestions');
        Schema::dropIfExists('suggestion_vectors');
        Schema::dropIfExists('suggestion_sources');
    }
};
