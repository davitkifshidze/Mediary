<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **თამაშს ჩანიშვნები აღარ აქვს** — შენი სიტყვები: „არ მჭირდება ჩანიშვნები".
 * ცხრილი ცარიელი იყო; ძველი ექსპორტის `notes` იმპორტისას თავისით გამოტოვდება
 * (`ExportDomain`-ის თამაშის „დამატებებში" ის აღარ არის).
 *
 * ⚠️ დოკუმენტები ცხრილს არ სჭირდება: `game_files` სქრინშოტებისთვის რჩება,
 * `kind = 'doc'` კი უბრალოდ აღარ იღებს ახალ ფაილს (enum-ს sqlite-ის გამო არ ვეხებით).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('game_notes');
    }

    public function down(): void
    {
        Schema::create('game_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('game_id')->constrained()->cascadeOnDelete();
            $table->text('body');
            $table->timestamp('trashed_at')->nullable()->index();
            $table->timestamps();

            $table->index(['user_id']);
            $table->index(['game_id', 'id']);
        });
    }
};
