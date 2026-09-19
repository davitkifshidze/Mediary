<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **ხელახლა ნახვის ჟურნალი (FEAT-14).**
 *
 * ⚠️ **`watched_at` ერთი მომენტია და მეორედ ნახვა მას გადააწერდა** —
 * პირველი თარიღი უბრალოდ იკარგებოდა, ჩუმად, ჩვეულებრივ მოქმედებაზე.
 * „წელს რამდენი ვნახე" (FEAT-08) გამეორებებს ვერ ითვლიდა.
 *
 * ⚠️ **`watched_at` **რჩება** და არ იშლება.** ის ახლა „ბოლო ნახვაა" და
 * ერთადერთი წყაროდან იწერება — `max(media_watches.watched_at)`. მისი
 * მოხსნა ყველა ფილტრს, სორტირებას, `MatchService`-სა და სტატისტიკას
 * გადაწერას მოითხოვდა, სამაგიეროდ **ორი წყარო ერთი ფაქტისა** სწორედ
 * ის ხაფანგია, რომელსაც `Book::syncProgress()` ებრძვის — ამიტომ
 * მისი მწერელი ერთია.
 *
 * ⚠️ **პოლიმორფული და არა თითო დომენზე ცხრილი** — `gallery_images`-ის
 * ზუსტი წესი: სამი (და მომავალში მეტი) მედია-დომენი ერთსა და იმავე
 * ფაქტს ინახავს და სამი ცხრილი სამ ერთნაირ მიგრაციას ნიშნავდა.
 *
 * ⚠️ **არსებული `watched_at` პირველ რიგად გადმოდის** — უამისოდ ჟურნალი
 * ყველასთვის ცარიელი დაიბადებოდა და „ერთხელ ვნახე" ნულად წაიკითხებოდა.
 */
return new class extends Migration
{
    /** morph-ის ალიასები — `AppServiceProvider::enforceMorphMap` */
    private const DOMAINS = ['movie' => 'movies', 'series' => 'series', 'anime' => 'animes'];

    public function up(): void
    {
        Schema::create('media_watches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->morphs('watchable');
            $table->timestamp('watched_at');
            $table->string('note', 500)->nullable();
            $table->timestamps();

            // „რა ვნახე ამ პერიოდში" — სტატისტიკის და ჟურნალის მთავარი კითხვა
            $table->index(['user_id', 'watched_at']);
        });

        foreach (self::DOMAINS as $alias => $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'watched_at')) {
                continue;
            }

            /* ⚠️ **`insertUsing` და არა PHP-ის ციკლი**: ბიბლიოთეკა ათასობით
               ჩანაწერია და მიგრაცია მათ მეხსიერებაში არ უნდა ტვირთავდეს. */
            DB::table('media_watches')->insertUsing(
                ['user_id', 'watchable_type', 'watchable_id', 'watched_at', 'created_at', 'updated_at'],
                DB::table($table)
                    ->whereNotNull('watched_at')
                    ->selectRaw('user_id, ? as watchable_type, id, watched_at, watched_at, watched_at', [$alias]),
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('media_watches');
    }
};
