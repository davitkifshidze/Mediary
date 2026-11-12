<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **მსახიობზე ჩემი ნიშნები — რჩეული და გახსნების მთვლელი.**
 *
 * ⚠️ **ცალკე ცხრილი და არა სვეტები `cast_members`-ზე**: ის გლობალური ლექსიკონია
 * (ერთი მსახიობი ყველა ანგარიშზე ერთი რიგია — `cast_member_tags`-ის იგივე მიზეზი),
 * ე.ი. იქ ჩაწერილი „რჩეული" ყველას რჩეული გახდებოდა.
 *
 * ⚠️ **მთვლელი ჟურნალზე არ არის დაკიდებული**: ჟურნალი ისტორიაა და იწმინდება
 * (ვადით ან გამორთვით), დალაგება კი მუდმივი უნდა იყოს. `opens` მხოლოდ დალაგებას
 * ემსახურება და წუთში ერთხელ იზრდება (`last_opened_at`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('actor_marks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('cast_member_id')->constrained()->cascadeOnDelete();
            $table->boolean('is_favorite')->default(false);
            $table->unsignedInteger('opens')->default(0);
            $table->timestamp('last_opened_at')->nullable();
            $table->timestamps();

            // ერთ მსახიობზე ერთ მომხმარებელს ერთი რიგი აქვს
            $table->unique(['user_id', 'cast_member_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('actor_marks');
    }
};
