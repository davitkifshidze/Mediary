<?php

use App\Models\Module;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **სიმღერები — ცალკე მოდული** (user-ის გადაწყვეტილება 2026-09-03).
 *
 * ⚠️ ეს **აუქმებს** Tasks §15-ის ადრინდელ გადაწყვეტილებას („სიმღერა =
 * `videos`-ის რიგი"). მიზეზი, რომელიც user-მა დაასახელა: სიმღერას საიდბარში
 * დამოუკიდებელი სექცია, ადმინის გადამრთველი, როლების მატრიცაში საკუთარი
 * CRUD-უფლებები და `/songs` მარშრუტები სჭირდება — ეს ყველაფერი `modules`-ის
 * ერთ სტრიქონზეა მიბმული, ე.ი. „ვიდეოს ქვე-სექციად" ვერ მიიღწევა.
 *
 * სამი ცხრილი:
 *  · `song_genres` — **per-user ლექსიკონი** (`video_types`-ის ანალოგი).
 *    ⚠️ გლობალურ `genres`-ს განზრახ არ ვიყენებთ: ის TMDB-ის ფილმის ჟანრებია
 *    და „როკი" იქ ფილმის ჟანრების სიაშიც გამოჩნდებოდა.
 *  · `songs` — სრული მუსიკის ჩანაწერი (19.x-ის მესამე კითხვა, „სრული ბაზა").
 *  · `playlist_song` — `playlist_video`-ის შემცვლელი.
 *
 * პლეილისტები **სიმღერების მოდულში გადადის**: ისინი მუსიკის ერთეულია და
 * არა ვიდეოსი. არსებული `playlist_video` რიგები სიმღერებად გადმოდის.
 */
return new class extends Migration
{
    /** დეფაულტი ჟანრები — იგივე სია `SongGenre::DEFAULTS`-შია */
    private const GENRES = [
        ['key' => 'pop', 'name_ka' => 'პოპი', 'name_en' => 'Pop'],
        ['key' => 'rock', 'name_ka' => 'როკი', 'name_en' => 'Rock'],
        ['key' => 'hip-hop', 'name_ka' => 'ჰიპ-ჰოპი', 'name_en' => 'Hip-Hop'],
        ['key' => 'electronic', 'name_ka' => 'ელექტრონული', 'name_en' => 'Electronic'],
        ['key' => 'jazz', 'name_ka' => 'ჯაზი', 'name_en' => 'Jazz'],
        ['key' => 'classical', 'name_ka' => 'კლასიკური', 'name_en' => 'Classical'],
        ['key' => 'folk', 'name_ka' => 'ხალხური', 'name_en' => 'Folk'],
        ['key' => 'soundtrack', 'name_ka' => 'საუნდტრეკი', 'name_en' => 'Soundtrack'],
    ];

    public function up(): void
    {
        Schema::create('song_genres', function (Blueprint $table) {
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

        Schema::create('songs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->string('title');
            // ⚠️ შემსრულებელი user-ის სიაში არ იყო, მაგრამ „სრული მუსიკის
            // ბაზა" მის გარეშე არ არსებობს — ძებნაც და დაჯგუფებაც მასზე დგას
            $table->string('artist')->nullable();
            $table->string('album')->nullable();
            $table->unsignedSmallInteger('year')->nullable();
            $table->foreignId('genre_id')->nullable()->constrained('song_genres')->nullOnDelete();
            $table->unsignedInteger('duration')->nullable();   // წამები

            // წყარო — იგივე allowlist, რაც ვიდეოზე (`App\Support\VideoUrl`)
            $table->string('url', 1000);
            $table->string('platform', 40)->default('other');
            $table->string('external_id', 100)->nullable();
            $table->string('embed_url', 1000)->nullable();

            // ფოტო: ან დისკზე ატვირთული (კვოტაზე გადის), ან პლატფორმის URL
            $table->string('thumbnail_path')->nullable();
            $table->string('thumbnail_url', 1000)->nullable();

            $table->json('tags')->nullable();
            // „ჩემი ქულა" — 1..10, null = შეუფასებელი
            $table->unsignedTinyInteger('rating')->nullable();

            $table->boolean('is_favorite')->default(false);
            $table->unsignedInteger('play_count')->default(0);
            $table->timestamp('played_at')->nullable();
            $table->integer('sort_order')->default(0);

            // Tasks 16.5 — ხილვადობა თავიდანვე
            $table->string('visibility', 20)->default('private');
            $table->timestamps();

            $table->index(['user_id', 'is_favorite']);
            $table->index(['user_id', 'genre_id']);
            $table->index(['user_id', 'artist']);
            $table->index('platform');
            $table->index('visibility');
        });

        Schema::create('playlist_song', function (Blueprint $table) {
            $table->id();
            $table->foreignId('playlist_id')->constrained()->cascadeOnDelete();
            $table->foreignId('song_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['playlist_id', 'song_id']);
            $table->index(['playlist_id', 'sort_order']);
        });

        $this->seedGenres();
        $this->movePlaylistVideos();

        Schema::dropIfExists('playlist_video');

        Module::updateOrCreate(['key' => 'song'], [
            'name_ka' => 'სიმღერები',
            'name_en' => 'Songs',
            'description_ka' => 'მუსიკის პირადი ბაზა — შემსრულებელი, ალბომი, ჟანრი და პლეილისტები.',
            'description_en' => 'Personal music library — artist, album, genre and playlists.',
            'icon' => 'Music',
            'route_base' => '/songs',
            'api_base' => '/songs',
            // გალერეა სიმღერასაც ეკიდება (`gallery_images.imageable_type = 'song'`)
            'morph_alias' => 'song',
            'enabled_by_default' => false,
            'sort_order' => 35,
        ]);
    }

    /** ყველა არსებულ მომხმარებელს საწყისი ლექსიკონი (ლენივი შევსება მაინც არსებობს) */
    private function seedGenres(): void
    {
        $now = now();

        foreach (DB::table('users')->pluck('id') as $userId) {
            foreach (self::GENRES as $i => $genre) {
                DB::table('song_genres')->insert($genre + [
                    'user_id' => $userId,
                    'sort_order' => $i + 1,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    /**
     * `playlist_video` → `songs` + `playlist_song`.
     *
     * ⚠️ ვიდეოს რიგი **არ იშლება** — მისი წაშლა ამ მიგრაციის საქმე არ არის.
     * სამაგიეროდ `thumbnail_path` სიმღერაზე **გადადის** (ვიდეოზე იცარიელებს):
     * ერთი ფაილი ორ ჩანაწერს რომ ეკიდოს, კვოტა ორჯერ დაითვლიდა და ერთის
     * წაშლა მეორეს გაუტეხდა სურათს.
     */
    private function movePlaylistVideos(): void
    {
        if (! Schema::hasTable('playlist_video')) {
            return;
        }

        $videoIds = DB::table('playlist_video')->distinct()->pluck('video_id');

        if ($videoIds->isEmpty()) {
            return;
        }

        $now = now();
        $songIdByVideoId = [];

        foreach (DB::table('videos')->whereIn('id', $videoIds)->get() as $video) {
            $songIdByVideoId[$video->id] = DB::table('songs')->insertGetId([
                'user_id' => $video->user_id,
                'title' => $video->title,
                'artist' => null,
                'url' => $video->url,
                'platform' => $video->platform,
                'external_id' => $video->external_id,
                'embed_url' => $video->embed_url,
                'thumbnail_path' => $video->thumbnail_path,
                'thumbnail_url' => $video->thumbnail_url,
                'duration' => $video->duration,
                'tags' => $video->tags,
                'is_favorite' => $video->is_favorite,
                'visibility' => $video->visibility ?? 'private',
                'sort_order' => $video->sort_order,
                'created_at' => $video->created_at ?? $now,
                'updated_at' => $now,
            ]);

            // ფაილს ერთი მფლობელი უნდა ჰყავდეს — იხ. docblock
            if ($video->thumbnail_path) {
                DB::table('videos')->where('id', $video->id)->update(['thumbnail_path' => null]);
            }
        }

        foreach (DB::table('playlist_video')->orderBy('id')->get() as $row) {
            if (! isset($songIdByVideoId[$row->video_id])) {
                continue;
            }

            DB::table('playlist_song')->insert([
                'playlist_id' => $row->playlist_id,
                'song_id' => $songIdByVideoId[$row->video_id],
                'sort_order' => $row->sort_order,
                'created_at' => $row->created_at ?? $now,
                'updated_at' => $row->updated_at ?? $now,
            ]);
        }
    }

    public function down(): void
    {
        Module::where('key', 'song')->delete();

        Schema::create('playlist_video', function (Blueprint $table) {
            $table->id();
            $table->foreignId('playlist_id')->constrained()->cascadeOnDelete();
            $table->foreignId('video_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['playlist_id', 'video_id']);
            $table->index(['playlist_id', 'sort_order']);
        });

        Schema::dropIfExists('playlist_song');
        Schema::dropIfExists('songs');
        Schema::dropIfExists('song_genres');
    }
};
