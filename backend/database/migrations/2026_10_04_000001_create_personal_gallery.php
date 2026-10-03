<?php

use App\Models\Module;
use App\Support\CustomFields;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **პირადი გალერეა — მოდული `personal` (Tasks §33, Q7).**
 *
 * შენი სიტყვები: „ცალკე შევქმნა ახალი მოდული პირადი გალერეის, სადაც
 * შეგეძლება პიროვნების გალერეის დამატება, ალბომის შექმნა გარეთ და
 * პიროვნებაშიც … შეგეძლოს ატვირთო ფოტო-ვიდეო მასალა მხოლოდ ამ გალერეაში".
 *
 * ⚠️ **ახალი ჩაშენებული მოდულია და არა პირადი (`custom_records`)**: იერარქია
 * (ადამიანი → ალბომი → ფოტო), ვიდეოს ფაილი და პირადი დისკი პირად მოდულს არ
 * აქვს. ⚠️ **`cast_members` აქ არ გამოდგება** — ის გლობალურია, ე.ი. ახლობლების
 * სახელები ყველა ანგარიშს გაუჟონავდა; ადამიანი ამიტომ საკუთარ ცხრილშია.
 *
 * ⚠️ **ჩანაწერი ადამიანია** (`TrashDomain::MODELS['personal']`) — ალბომი და
 * ფოტო/ვიდეო მისი ნაწილებია, ზუსტად ისე, როგორც ადგილის ფაილები ადგილისა.
 * ფოტო შეიძლება იყოს ადამიანის გარეშე, ალბომის გარეშე, ან ორივეში — „უჯგუფო"
 * სწორედ ასეთია. ⚠️ ალბომი და ადამიანი FK-ით `nullOnDelete`-ია: საბოლოო
 * წაშლა შიგთავსს ჯერ მოდელით ამუშავებს, ეს კი მხოლოდ მეორე ფენაა.
 *
 * ⚠️ **ყდა (`cover_media_id`) FK-ის გარეშეა** — ცხრილები ერთმანეთს წრიულად
 * მიუთითებდნენ (ადამიანი → ფოტო → ადამიანი), sqlite კი არსებულ ცხრილზე FK-ს
 * ვერ ამატებს. ფოტოს საბოლოო წაშლა ყდას თვითონ ასუფთავებს
 * (`PersonalMedia::booted()`), ურნაში მყოფი ყდა კი უბრალოდ არ იხატება.
 *
 * ⚠️ **`visibility` მხოლოდ ალბომს აქვს** (Q7 — საჯარო პროფილზე ალბომის
 * დონის ჩამრთველი): ადამიანი და ფოტო საჯარო ცალკე ვერ გახდება.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('persons', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->date('birthday')->nullable();
            $table->text('note')->nullable();
            // ⚠️ FK-ის გარეშე — იხ. ზემოთ
            $table->unsignedBigInteger('cover_media_id')->nullable();
            $table->integer('sort_order')->default(0);
            /* ურნაში გადატანისას გამოშვებული შიგთავსი (`{media: [], albums: []}`) —
               აღდგენა მას უკან აბრუნებს (გალერეის ალბომის `trashed_photo_ids`-ის წესი) */
            $table->json('trashed_children')->nullable();
            $table->timestamp('trashed_at')->nullable()->index();
            $table->timestamps();

            $table->index(['user_id', 'sort_order']);
        });

        Schema::create('personal_albums', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // `null` — „გარეთ" მდგომი ალბომი; სხვაგვარად ადამიანის ალბომია
            $table->foreignId('person_id')->nullable()->constrained('persons')->nullOnDelete();
            $table->string('name', 120);
            $table->string('description', 500)->nullable();
            $table->unsignedBigInteger('cover_media_id')->nullable();
            $table->string('visibility', 20)->default('private');
            $table->integer('sort_order')->default(0);
            $table->json('trashed_children')->nullable();
            $table->timestamp('trashed_at')->nullable()->index();
            $table->timestamps();

            $table->index(['user_id', 'person_id']);
            $table->index('visibility');
        });

        Schema::create('personal_media', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('person_id')->nullable()->constrained('persons')->nullOnDelete();
            $table->foreignId('album_id')->nullable()->constrained('personal_albums')->nullOnDelete();

            $table->string('kind', 10);
            $table->string('path');
            $table->string('original_name');
            $table->string('mime', 120)->nullable();
            // ⚠️ ჩაწერილი ზომა (`StoredFile`-ის წესი) — დისკს ყოველ დათვლაზე არ ვეკითხებით
            $table->unsignedBigInteger('size')->default(0);
            /* ესკიზი — ფოტოს შემცირებული ასლი ან ვიდეოს კადრი. ⚠️ ისიც კვოტაშია
               (შენი ატვირთვის ნაწილია), ამიტომ ზომაც ცალკე იწერება. */
            $table->string('thumb_path')->nullable();
            $table->unsignedBigInteger('thumb_size')->default(0);

            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();
            // ვიდეოს ხანგრძლივობა წამებში
            $table->unsignedInteger('duration')->nullable();
            // EXIF/ვიდეოს `creation_time`, ან ფაილის თარიღი — „როდის გადაიღე"
            $table->dateTime('taken_at')->nullable();
            $table->string('caption', 500)->nullable();
            $table->boolean('is_favorite')->default(false);
            $table->integer('sort_order')->default(0);
            $table->timestamp('trashed_at')->nullable()->index();
            $table->timestamps();

            $table->index(['user_id', 'kind']);
            $table->index(['user_id', 'person_id']);
            $table->index(['user_id', 'album_id']);
            $table->index(['user_id', 'taken_at']);
            $table->index(['user_id', 'is_favorite']);
        });

        /* დამატებითი ველები ადამიანზე (Tasks §33.4 — „ნათესაობა", „ქალაქი"…) —
           ⚠️ ცხრილის სახელი `CustomFields`-იდან, ზუსტად ისე, როგორც ადგილის */
        $values = CustomFields::TABLE_BY_MODULE['personal'];

        if (! Schema::hasTable($values)) {
            Schema::create($values, function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('record_id')->constrained('persons')->cascadeOnDelete();
                $table->string('field_key', 60);

                $table->text('value_text')->nullable();
                $table->decimal('value_number', 20, 4)->nullable();
                $table->date('value_date')->nullable();
                $table->boolean('value_bool')->nullable();

                $table->string('value_path')->nullable();
                $table->string('value_name')->nullable();
                $table->string('value_mime', 120)->nullable();
                $table->unsignedBigInteger('value_size')->nullable();
                $table->unsignedSmallInteger('sort_order')->default(0);

                $table->timestamps();

                $table->unique(['record_id', 'field_key', 'sort_order']);
                $table->index(['user_id', 'field_key']);
            });
        }

        Module::withoutGlobalScope('trash')->updateOrCreate(['key' => 'personal'], [
            'name_ka' => 'პირადი გალერეა',
            'name_en' => 'Personal gallery',
            'description_ka' => 'ახლობლების ფოტოები და ვიდეოები — ადამიანები, ალბომები, ატვირთვა მოწყობილობიდან, პირად დისკზე.',
            'description_en' => 'Photos and videos of your people — persons, albums, uploads from your device, on a private disk.',
            'icon' => 'Camera',
            'route_base' => '/personal',
            'api_base' => '/personal',
            'morph_alias' => 'personal',
            'enabled_by_default' => false,
            'color' => '#84cc16',
            // ადგილები 44-ზეა
            'sort_order' => 45,
        ]);
    }

    public function down(): void
    {
        Module::withoutGlobalScope('trash')->where('key', 'personal')->delete();

        Schema::dropIfExists(CustomFields::TABLE_BY_MODULE['personal']);
        Schema::dropIfExists('personal_media');
        Schema::dropIfExists('personal_albums');
        Schema::dropIfExists('persons');
    }
};
