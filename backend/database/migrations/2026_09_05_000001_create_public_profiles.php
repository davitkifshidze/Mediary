<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **Tasks §16.1 — საჯარო პროფილი.**
 *
 * `visibility` სვეტები ჩანაწერებზე უკვე არსებობს (16.5); აქ ემატება ის სამი
 * ნაწილი, რომელიც პროფილს თვითონ ეხება:
 *
 *  · `users.profile_visibility` — **`private` default**: არავინ ხდება საჯარო
 *    ჩუმად. სამივე ფენა ერთდროულად უნდა იყოს ღია, რომ ჩანაწერი გამოჩნდეს —
 *    პროფილი → მოდული → ჩანაწერი.
 *  · `users.bio` — მოკლე ტექსტი პროფილის თავში.
 *  · `module_user.is_public` — **პერ-მოდულური ხილვადობა** (16.1): user ირჩევს,
 *    რომელი მოდული გამოჩნდეს პროფილზე (ფილმები — კი, ჩანაწერები — არასდროს).
 *
 * ⚠️ **სვეტი `is_public`-ია და არა `public`.** `hidden`-ის იგივე ხაფანგი:
 * მოკლე სახელი Model-ის protected თვისებას ეჯახება და pivot-იდან წაკითხვისას
 * ჩუმად არასწორ მნიშვნელობას აბრუნებს — `module_user.is_hidden` სწორედ
 * ამიტომ ჰქვია ასე.
 *
 * ⚠️ **`note` მოდული საჯარო პროფილზე არასდროს ჩნდება** (16.5-ის მკაცრი წესი):
 * სვეტი მასაც აქვს, მაგრამ `App\Support\PublicDomain`-ის რუკაში ის საერთოდ
 * არ არის, ე.ი. `is_public = true`-საც კი ვერაფერს გამოაჩენს.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $t) {
            $t->string('profile_visibility', 20)->default('private')->after('avatar_path');
            $t->text('bio')->nullable()->after('profile_visibility');
            // საჯარო პროფილების სია/ძებნა ერთადერთი ინდექსით იფარება
            $t->index('profile_visibility');
        });

        Schema::table('module_user', function (Blueprint $t) {
            $t->boolean('is_public')->default(false)->after('is_hidden');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $t) {
            $t->dropIndex(['profile_visibility']);
            $t->dropColumn(['profile_visibility', 'bio']);
        });

        Schema::table('module_user', function (Blueprint $t) {
            $t->dropColumn('is_public');
        });
    }
};
