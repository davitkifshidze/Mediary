<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **უკატეგორიო სექცია და ალბომები (Tasks §26).**
 *
 * შენი სიტყვები: „გალერიაში მქონდეს ასევე უკატეგორიო სექციაც, სადაც
 * შეგეძლება ფოტოების გადატანა, დახარისხება, დაჯგუფება; ფოტოებზე
 * შეიძლებოდეს გადაიტანო სხვადასხვა რამეზე — იმ უკატეგორიოზე, ასევე
 * უკატეგორიოში რაიმე კონკრეტულ ჯგუფში, ან მსახიობზე, ან სერიალზე".
 *
 * ორი ცვლილება და ორივე აუცილებელია:
 *
 * ⚠️ **1. მშობელი ხდება არასავალდებულო.** `morphs('imageable')` NOT NULL-ია,
 * ე.ი. „უმშობლო ფოტო" ბაზაში **ვერ იარსებებდა** — „უკატეგორიო" სწორედ ეს
 * მდგომარეობაა და არა ახალი სვეტი „is_uncategorized". ცალკე დროშა ერთსა
 * და იმავე ფაქტს ორჯერ იტყოდა და ერთ დღეს მშობელს დაშორდებოდა.
 *
 * ⚠️ **2. „ჯგუფი უკატეგორიოში" = ალბომი**, per-user ცხრილი. ის განზრახ
 * **არ არის მშობელი**: მშობელი ჩანაწერია (ფილმი · მსახიობი · სიმღერა),
 * ალბომი კი user-ის თავისი დახარისხებაა — ე.ი. ფოტოს ორივე შეიძლება
 * ჰქონდეს ან არცერთი. ალბომი მშობლად რომ გვექცია, `GalleryParent`-ის
 * რუკაში, `withOwners()`-ში, წყაროს ჭრილში და `PurgeService`-ში ერთბაშად
 * გაჩნდებოდა ფსევდო-დომენი, რომელსაც არც ჩანაწერი აქვს და არც მოდული.
 *
 * ⚠️ `album_id`-ს `nullOnDelete()` აქვს და არა კასკადი: ალბომის წაშლა
 * **დახარისხების** გაუქმებაა და არა ფოტოების წაშლა — თორემ „საქაღალდის"
 * მოშორება ჩუმად ბიბლიოთეკას შლიდა.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gallery_albums', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('description')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['user_id', 'sort_order']);
        });

        Schema::table('gallery_images', function (Blueprint $table) {
            $table->foreignId('album_id')->nullable()->after('user_id')
                ->constrained('gallery_albums')->nullOnDelete();
        });

        /* ⚠️ **მშობლის სვეტები ცალკე ბლოკშია.** sqlite-ზე `change()` ცხრილის
           ხელახალ აგებას ნიშნავს, ე.ი. იმავე `Schema::table()`-ში ახალ
           უცხო გასაღებთან ერთად მისი გაშვება ორ არათავსებად ოპერაციას
           ერთ rebuild-ში მოაქცევდა. */
        Schema::table('gallery_images', function (Blueprint $table) {
            $table->string('imageable_type')->nullable()->change();
            $table->unsignedBigInteger('imageable_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('gallery_images', function (Blueprint $table) {
            $table->dropConstrainedForeignId('album_id');
        });

        Schema::dropIfExists('gallery_albums');
    }
};
