<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **ცხრილები სექციის მიხედვით** (user-ის გადაწყვეტილება 2026-09-03).
 *
 * აქამდე ორი უნივერსალური polymorphic ცხრილი გვქონდა — `attachments` და
 * `notes` — და „რა არის ეს რიგი" მხოლოდ `collection`/`attachable_type`-ის
 * წაკითხვით ირკვეოდა. ახლა თითოეულ სექციას თავისი ცხრილი აქვს:
 *
 *  · `gallery_images` — გალერეის ფოტოები (`collection = 'gallery'` იყო).
 *    **polymorphic რჩება** (`imageable`): ერთი და იგივე ფოტო-ლოგიკა ჰკიდია
 *    ფილმს, სერიალს, მსახიობს და (ახლიდან) სიმღერას — ე.ი. აქ საერთო
 *    ცხრილი განზრახაა და არა დაუდევრობით. `collection` სვეტი აღარაა:
 *    **ცხრილი თვითონ არის კოლექცია**.
 *  · `video_files` — ვიდეოზე მიმაგრებული ფოტო/დოკუმენტი. აღარაა polymorphic:
 *    `video_id` პირდაპირი FK-ია, ე.ი. cascade ბაზაზეა და არა მოდელის ივენთში.
 *  · `video_notes` — ვიდეოს ჩანიშვნები, იმავე პრინციპით.
 *
 * ფასი (ცხადად): ახალ მოდულს, რომელსაც ფაილები/ჩანიშვნები დასჭირდება,
 * **საკუთარი** `<module>_files` / `<module>_notes` მოაქვს — ერთი მიგრაცია
 * მოდულზე. სამაგიეროდ ცხრილის სახელი ერთმნიშვნელოვნად ამბობს, რა დევს შიგნით.
 *
 * ⚠️ დისკზე საქაღალდეები **არ იცვლება** (`gallery/`, `documents/`, `videos/`):
 * ფაილების გადატანა მიგრაციაში ზედმეტი რისკია და `StorageMeter::UPLOAD_FOLDERS`
 * ისედაც გზაზე მუშაობს და არა ცხრილზე.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gallery_images', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // მშობელი: movie | series | cast_member | song (morph alias)
            $table->morphs('imageable');
            $table->string('source', 20)->default('tmdb');   // tmdb | upload
            $table->string('category', 20)->nullable();       // backdrop|poster|logo|actor
            $table->string('path');
            $table->string('remote_path')->nullable();        // TMDB file_path — დუბლის ცნობა
            $table->string('original_name')->nullable();
            $table->string('mime', 120)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['user_id']);
            $table->index(['imageable_type', 'imageable_id', 'sort_order'], 'gallery_images_parent_index');
        });

        Schema::create('video_files', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('video_id')->constrained()->cascadeOnDelete();
            $table->enum('kind', ['image', 'doc'])->default('image');
            $table->string('path');
            $table->string('original_name')->nullable();
            $table->string('mime', 120)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['user_id', 'kind']);
            $table->index(['video_id', 'sort_order']);
        });

        Schema::create('video_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('video_id')->constrained()->cascadeOnDelete();
            $table->text('body');
            $table->timestamps();

            $table->index(['user_id']);
            $table->index('video_id');
        });

        $this->moveRows();

        Schema::dropIfExists('notes');
        Schema::dropIfExists('attachments');
    }

    /**
     * მონაცემების გადატანა. ⚠️ ვიდეოს ფაილებში მხოლოდ `attachable_type = 'video'`
     * ხვდება — სხვა მშობელზე ჩვეულებრივი (არა-გალერეის) მიმაგრება არასდროს
     * გაკეთებულა, მაგრამ თუ ასეთი რიგი აღმოჩნდა, ის **არ იკარგება ჩუმად**:
     * მისი ფაილი დისკზე რჩება და 17.5-ის „ობოლი ფაილების" სკანერი აჩვენებს.
     */
    private function moveRows(): void
    {
        if (! Schema::hasTable('attachments')) {
            return;
        }

        DB::table('attachments')->where('collection', 'gallery')->orderBy('id')->chunk(500, function ($rows) {
            DB::table('gallery_images')->insert($rows->map(fn ($a) => [
                'user_id' => $a->user_id,
                'imageable_type' => $a->attachable_type,
                'imageable_id' => $a->attachable_id,
                'source' => $a->source ?: 'tmdb',
                'category' => $a->category,
                'path' => $a->path,
                'remote_path' => $a->remote_path,
                'original_name' => $a->original_name,
                'mime' => $a->mime,
                'size' => $a->size,
                'width' => $a->width,
                'height' => $a->height,
                'sort_order' => $a->sort_order,
                'created_at' => $a->created_at,
                'updated_at' => $a->updated_at,
            ])->all());
        });

        DB::table('attachments')
            ->whereNull('collection')
            ->where('attachable_type', 'video')
            ->orderBy('id')
            ->chunk(500, function ($rows) {
                DB::table('video_files')->insert($rows->map(fn ($a) => [
                    'user_id' => $a->user_id,
                    'video_id' => $a->attachable_id,
                    'kind' => $a->kind,
                    'path' => $a->path,
                    'original_name' => $a->original_name,
                    'mime' => $a->mime,
                    'size' => $a->size,
                    'sort_order' => $a->sort_order,
                    'created_at' => $a->created_at,
                    'updated_at' => $a->updated_at,
                ])->all());
            });

        if (Schema::hasTable('notes')) {
            DB::table('notes')->where('notable_type', 'video')->orderBy('id')->chunk(500, function ($rows) {
                DB::table('video_notes')->insert($rows->map(fn ($n) => [
                    'user_id' => $n->user_id,
                    'video_id' => $n->notable_id,
                    'body' => $n->body,
                    'created_at' => $n->created_at,
                    'updated_at' => $n->updated_at,
                ])->all());
            });
        }
    }

    /**
     * უკან — ორივე ძველი ცხრილი **გალერეის სვეტებთან ერთად** აღდგება, რომ
     * უფრო ძველი მიგრაციის `down()`-მაც (`2026_09_02_000007`) იმუშაოს.
     */
    public function down(): void
    {
        Schema::create('attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->morphs('attachable');
            $table->enum('kind', ['image', 'doc'])->default('image');
            $table->string('source', 20)->default('upload');
            $table->string('collection', 40)->nullable();
            $table->string('category', 20)->nullable();
            $table->string('path');
            $table->string('remote_path')->nullable();
            $table->string('original_name')->nullable();
            $table->string('mime', 120)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['user_id', 'kind']);
            $table->index(['attachable_type', 'attachable_id', 'collection'], 'attachments_gallery_index');
        });

        Schema::create('notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->morphs('notable');
            $table->text('body');
            $table->timestamps();

            $table->index(['user_id']);
        });

        foreach (DB::table('gallery_images')->orderBy('id')->cursor() as $g) {
            DB::table('attachments')->insert([
                'user_id' => $g->user_id,
                'attachable_type' => $g->imageable_type,
                'attachable_id' => $g->imageable_id,
                'kind' => 'image',
                'source' => $g->source,
                'collection' => 'gallery',
                'category' => $g->category,
                'path' => $g->path,
                'remote_path' => $g->remote_path,
                'original_name' => $g->original_name,
                'mime' => $g->mime,
                'size' => $g->size,
                'width' => $g->width,
                'height' => $g->height,
                'sort_order' => $g->sort_order,
                'created_at' => $g->created_at,
                'updated_at' => $g->updated_at,
            ]);
        }

        foreach (DB::table('video_files')->orderBy('id')->cursor() as $f) {
            DB::table('attachments')->insert([
                'user_id' => $f->user_id,
                'attachable_type' => 'video',
                'attachable_id' => $f->video_id,
                'kind' => $f->kind,
                'source' => 'upload',
                'collection' => null,
                'path' => $f->path,
                'original_name' => $f->original_name,
                'mime' => $f->mime,
                'size' => $f->size,
                'sort_order' => $f->sort_order,
                'created_at' => $f->created_at,
                'updated_at' => $f->updated_at,
            ]);
        }

        foreach (DB::table('video_notes')->orderBy('id')->cursor() as $n) {
            DB::table('notes')->insert([
                'user_id' => $n->user_id,
                'notable_type' => 'video',
                'notable_id' => $n->video_id,
                'body' => $n->body,
                'created_at' => $n->created_at,
                'updated_at' => $n->updated_at,
            ]);
        }

        Schema::dropIfExists('video_notes');
        Schema::dropIfExists('video_files');
        Schema::dropIfExists('gallery_images');
    }
};
