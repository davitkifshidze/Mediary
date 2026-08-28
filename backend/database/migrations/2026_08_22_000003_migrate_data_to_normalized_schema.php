<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        // --- movies → movie_translations ---
        foreach (DB::table('movies')->get() as $m) {
            foreach (['ka', 'en'] as $loc) {
                $title = $m->{"title_$loc"} ?? null;
                $desc = $m->{"description_$loc"} ?? null;
                $src = $m->{"description_{$loc}_source"} ?? null;
                if ($title !== null || $desc !== null || $src !== null) {
                    DB::table('movie_translations')->insert([
                        'movie_id' => $m->id,
                        'locale' => $loc,
                        'title' => $title,
                        'description' => $desc,
                        'source' => $src,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            }
        }

        // --- genres → genre_translations ---
        foreach (DB::table('genres')->get() as $g) {
            if ($g->name_en !== null && $g->name_en !== '') {
                DB::table('genre_translations')->insert([
                    'genre_id' => $g->id, 'locale' => 'en', 'name' => $g->name_en,
                    'created_at' => $now, 'updated_at' => $now,
                ]);
            }
            if ($g->name_ka !== null && $g->name_ka !== '') {
                DB::table('genre_translations')->insert([
                    'genre_id' => $g->id, 'locale' => 'ka', 'name' => $g->name_ka,
                    'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        }

        // --- cast_members.name_ka → cast_member_translations (name = canonical, რჩება) ---
        foreach (DB::table('cast_members')->get() as $c) {
            if ($c->name_ka !== null && $c->name_ka !== '') {
                DB::table('cast_member_translations')->insert([
                    'cast_member_id' => $c->id, 'locale' => 'ka', 'name' => $c->name_ka,
                    'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        }

        // --- genre_movie → genreables (morph alias: movie) ---
        foreach (DB::table('genre_movie')->get() as $gm) {
            DB::table('genreables')->insert([
                'genre_id' => $gm->genre_id,
                'genreable_id' => $gm->movie_id,
                'genreable_type' => 'movie',
            ]);
        }

        // --- movie_cast → castables (morph alias: movie) ---
        foreach (DB::table('movie_cast')->get() as $mc) {
            DB::table('castables')->insert([
                'cast_member_id' => $mc->cast_member_id,
                'castable_id' => $mc->movie_id,
                'castable_type' => 'movie',
                'character' => $mc->character,
                'billing_order' => $mc->billing_order,
            ]);
        }

        // --- ძველი სვეტების/ცხრილების წაშლა ---
        Schema::table('movies', function (Blueprint $table) {
            // fullText მხოლოდ MySQL-ზე დაიდო (იხ. create_movies_table)
            if (Schema::getConnection()->getDriverName() === 'mysql') {
                $table->dropFullText(['title_ka', 'title_en']);
            }
            $table->dropColumn([
                'title_ka', 'title_en',
                'description_ka', 'description_en',
                'description_ka_source', 'description_en_source',
            ]);
        });
        Schema::table('genres', function (Blueprint $table) {
            $table->dropColumn(['name_en', 'name_ka']);
        });
        Schema::table('cast_members', function (Blueprint $table) {
            $table->dropColumn(['name_ka']);
        });

        Schema::dropIfExists('movie_cast');
        Schema::dropIfExists('genre_movie');
    }

    public function down(): void
    {
        // სვეტების აღდგენა
        Schema::table('movies', function (Blueprint $table) {
            $table->string('title_ka')->nullable();
            $table->string('title_en')->nullable();
            $table->text('description_ka')->nullable();
            $table->text('description_en')->nullable();
            $table->enum('description_ka_source', ['ge_movie', 'translated', 'manual'])->nullable();
            $table->enum('description_en_source', ['tmdb', 'translated', 'manual'])->nullable();
        });
        Schema::table('genres', function (Blueprint $table) {
            $table->string('name_en', 100)->nullable();
            $table->string('name_ka', 100)->nullable();
        });
        Schema::table('cast_members', function (Blueprint $table) {
            $table->string('name_ka')->nullable();
        });

        // pivot ცხრილების აღდგენა
        Schema::create('genre_movie', function (Blueprint $table) {
            $table->foreignId('movie_id')->constrained()->cascadeOnDelete();
            $table->foreignId('genre_id')->constrained()->cascadeOnDelete();
            $table->primary(['movie_id', 'genre_id']);
        });
        Schema::create('movie_cast', function (Blueprint $table) {
            $table->foreignId('movie_id')->constrained()->cascadeOnDelete();
            $table->foreignId('cast_member_id')->constrained()->cascadeOnDelete();
            $table->string('character')->nullable();
            $table->unsignedSmallInteger('billing_order')->default(0);
            $table->primary(['movie_id', 'cast_member_id']);
        });

        // მონაცემების დაბრუნება translation ცხრილებიდან
        foreach (DB::table('movie_translations')->get() as $t) {
            DB::table('movies')->where('id', $t->movie_id)->update([
                "title_{$t->locale}" => $t->title,
                "description_{$t->locale}" => $t->description,
                "description_{$t->locale}_source" => $t->source,
            ]);
        }
        foreach (DB::table('genre_translations')->get() as $t) {
            DB::table('genres')->where('id', $t->genre_id)->update([
                "name_{$t->locale}" => $t->name,
            ]);
        }
        foreach (DB::table('cast_member_translations')->where('locale', 'ka')->get() as $t) {
            DB::table('cast_members')->where('id', $t->cast_member_id)->update([
                'name_ka' => $t->name,
            ]);
        }
        foreach (DB::table('genreables')->where('genreable_type', 'movie')->get() as $r) {
            DB::table('genre_movie')->insert([
                'movie_id' => $r->genreable_id, 'genre_id' => $r->genre_id,
            ]);
        }
        foreach (DB::table('castables')->where('castable_type', 'movie')->get() as $r) {
            DB::table('movie_cast')->insert([
                'movie_id' => $r->castable_id, 'cast_member_id' => $r->cast_member_id,
                'character' => $r->character, 'billing_order' => $r->billing_order,
            ]);
        }
    }
};
