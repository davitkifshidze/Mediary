<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ჩანაწერის ჩაკეტვა პაროლით — ზოგადი მექანიზმი (Tasks §33.7 ← §35.4).**
 *
 * გალერეის ალბომის ლოკი (`gallery_albums.password_hash`, `AlbumLock`) ერთ
 * ცხრილზე იყო მიბმული; პირად გალერეას ადამიანიც უნდა ჩაეკეტა და ალბომიც,
 * §35-ს კი ფილმი, მსახიობი და ფოტოც. ამიტომ ლოკი **საკუთარ ცხრილშია**,
 * polymorphic ჩანაწერით (`lockable_type` = morph-ალიასი).
 *
 * ⚠️ **ერთი ჩანაწერი — ერთი ლოკი** (`unique`): ორი პაროლი ერთ ადამიანზე იმას
 * ნიშნავდა, რომ ერთის გახსნა მეორეს ტოვებდა ჩაკეტილად.
 *
 * ⚠️ **ცდების მრიცხველი აქვეა** (`failed_unlocks`, `unlock_blocked_until`) —
 * ალბომის წესი: 10 არასწორი ცდა → 15 წუთი ბლოკი, საიდანაც არ უნდა მოვიდეს.
 *
 * ⚠️ გალერეის ალბომი აქ **ჯერ არ** გადმოდის — ეს §35.4-ის ცალკე ნაბიჯია
 * (მიგრაცია `password_hash`-იდან), ორი მექანიზმი იქამდე ერთმანეთს არ ეხება.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('record_locks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('lockable_type', 40);
            $table->unsignedBigInteger('lockable_id');
            $table->string('password_hash');
            // მინიშნება მფლობელისთვის — პაროლის ნაცვლად (არასავალდებულო)
            $table->string('hint', 120)->nullable();
            $table->unsignedSmallInteger('failed_unlocks')->default(0);
            $table->timestamp('unlock_blocked_until')->nullable();
            $table->timestamps();

            $table->unique(['lockable_type', 'lockable_id']);
            $table->index(['user_id', 'lockable_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('record_locks');
    }
};
