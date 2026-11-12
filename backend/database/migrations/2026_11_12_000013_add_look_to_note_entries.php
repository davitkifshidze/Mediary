<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ჩანაწერის იერი** — საკუთარი აიქონი, ფონის ფერი და მთავარი ფოტო, ნებისმიერი
 * კომბინაციით. აქამდე აიქონი მხოლოდ კატეგორიას ჰქონდა, ე.ი. ერთი კატეგორიის
 * ყველა ჩანაწერი სიაში ერთნაირად გამოიყურებოდა.
 *
 * - `icon` — აიქონის სახელი (იგივე ნაკრები, რაც კატეგორიას და სტატუსს);
 * - `color` — პალიტრის გასაღები (`c1…c12`) ან `#rrggbb` (სტატუსის წესი);
 * - `photo_path` — ატვირთული ფოტო **პრივატულ** დისკზე (`notes/photos`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('note_entries', function (Blueprint $table) {
            $table->string('icon', 60)->nullable()->after('title');
            $table->string('color', 20)->nullable()->after('icon');
            $table->string('photo_path')->nullable()->after('color');
        });
    }

    public function down(): void
    {
        Schema::table('note_entries', function (Blueprint $table) {
            $table->dropColumn(['icon', 'color', 'photo_path']);
        });
    }
};
