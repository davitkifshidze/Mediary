<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **Tasks §8.1 — მსახიობის შიდა გვერდს მონაცემი სჭირდება.**
 *
 * მოთხოვნა იყო „მსახიობზე სტანდარტული ჩამოწერა ოფიციალური საიტებიდან —
 * IMDb და TMDB". დღემდე `cast_members`-ს მხოლოდ სახელი, სქესი და ერთი
 * პორტრეტი ჰქონდა, ე.ი. „შიდა გვერდი" სათაურის მეტს ვერაფერს აჩვენებდა და
 * **IMDb-ზე გასვლის გზაც არ არსებობდა** (`imdb_id` მხოლოდ `movies`-ს აქვს).
 *
 * ყველაფერი ერთი TMDB-ის გამოძახებით ივსება:
 * `/person/{id}?append_to_response=external_ids`.
 *
 * ⚠️ **ეს სვეტები გლობალურ ლექსიკონში განზრახ ჯდება.** `cast_members`
 * ერთი რიგია ყველა ანგარიშისთვის (`genres`-ის წესი) და აქ ჩაწერილი
 * **პიროვნების ფაქტებია** — დაბადების თარიღი და IMDb-ის id ყველასთვის ერთია,
 * ზუსტად ისე, როგორც `name` და `gender`. per-user რჩება მხოლოდ ის, რაც
 * ჩემია: საძიებო ტეგები (`cast_member_tags`) და ფოტოები
 * (`gallery_images.user_id`).
 *
 * ⚠️ **`biography` მხოლოდ ინგლისურია და თარგმანის ცხრილი არ ემატება.**
 * ორენოვანი ცხრილები იმიტომ არსებობს, რომ TMDB ორ ენაზე პასუხობს და §7-ის
 * მთარგმნელი მათზეა აშენებული; პიროვნების ბიოგრაფიას ქართულად TMDB
 * პრაქტიკულად არ იძლევა (`Lang::georgian()` მას ისედაც უარყოფდა), ე.ი.
 * ცარიელი ცხრილი დარჩებოდა — წიგნების ზუსტი პრეცედენტი.
 *
 * ⚠️ **`profile_links` JSON-ია და არა ხუთი სვეტი.** TMDB-ის `external_ids`
 * დროთა განმავლობაში ახალ ქსელებს ამატებს (ბოლოს `tiktok_id`); თითოზე
 * მიგრაცია იმას ნიშნავს, რომ ახალი ქსელი **ჩუმად დაიკარგება**. JSON-ში
 * ყველაფერი ინახება და ინტერფეისი მხოლოდ ნაცნობებს ხატავს.
 *
 * ⚠️ **`details_synced_at` საჭიროა, რომ არ ვიკითხოთ ყოველ გახსნაზე** — TMDB-ის
 * ლიმიტი საერთოა და მსახიობის გვერდი ხშირად იხსნება; შევსება ცხადი ღილაკია
 * (`POST /api/cast/{id}/sync`) და ავტომატურად მხოლოდ მაშინ ხდება, როცა
 * მონაცემი საერთოდ არ არის.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cast_members', function (Blueprint $table) {
            // IMDb-ის პირის id (`nm0000123`) — „ოფიციალურ საიტზე" გასვლის ბმული
            $table->string('imdb_id', 20)->nullable()->after('tmdb_person_id');
            $table->date('birthday')->nullable()->after('gender');
            $table->date('deathday')->nullable()->after('birthday');
            $table->string('place_of_birth', 255)->nullable()->after('deathday');
            $table->text('biography')->nullable()->after('place_of_birth');
            // TMDB-ის `known_for_department` — „მსახიობი" · „რეჟისორი" · …
            $table->string('known_for', 60)->nullable()->after('biography');
            $table->decimal('popularity', 10, 3)->nullable()->after('known_for');
            $table->string('homepage', 500)->nullable()->after('popularity');
            // instagram_id · twitter_id · facebook_id · tiktok_id · youtube_id · wikidata_id
            $table->json('profile_links')->nullable()->after('homepage');
            $table->timestamp('details_synced_at')->nullable()->after('profile_links');
        });
    }

    public function down(): void
    {
        Schema::table('cast_members', function (Blueprint $table) {
            $table->dropColumn([
                'imdb_id',
                'birthday',
                'deathday',
                'place_of_birth',
                'biography',
                'known_for',
                'popularity',
                'homepage',
                'profile_links',
                'details_synced_at',
            ]);
        });
    }
};
