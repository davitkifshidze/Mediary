<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **რეაქციები და ნიკნეიმები (Tasks §10.10/§10.11).**
 *
 * შენი სიტყვები: „ემოჯი [რეაქციები], ნიკნეიმები".
 *
 * ⚠️ **`unique(message_id, user_id)` — თითო ადამიანზე ერთი რეაქცია.** ეს
 * Messenger/Instagram-ის სემანტიკაა, ე.ი. ზუსტად ის, რაც დაასახელე.
 * გაფართოება (რამდენიმე რეაქცია ერთი კაცისგან) მოგვიანებით უსაფრთხოა —
 * შევიწროება არა, ამიტომ მკაცრი ვარიანტით ვიწყებთ.
 *
 * ⚠️ **`emoji` `varchar(32)` და არა `char(4)`**: ერთი ZWJ-თანმიმდევრობა
 * (მაგ. ოჯახის ემოჯი) 25 ბაიტამდე ადის.
 *
 * ⚠️ **ნიკნეიმი ცალკე ცხრილია და არა პივოტის სვეტი.** პივოტის სვეტი
 * მხოლოდ იმიტომ იმუშავებდა, რომ მონაწილე ზუსტად ორია — ხოლო სქემა
 * სწორედ ამ დაშვებას გაურბის (`message_hides`-ის მიგრაციის დოკბლოკში ეს
 * პირდაპირ წერია). აქ სამი მხარეა: **ვისი ხედია** (`user_id`), **ვის**
 * არქმევს (`target_user_id`) და სად (`conversation_id`).
 *
 * ⚠️ **ნიკნეიმი ნამდვილ სახელს არ ანაცვლებს ბაზაში** — პასუხში ორივე
 * მიდის, ე.ი. ვინაობა არ იკარგება.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('message_reactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('emoji', 32);
            $table->timestamps();

            // ⚠️ თითო კაცზე ერთი — იხ. კლასის შენიშვნა
            $table->unique(['message_id', 'user_id']);
        });

        Schema::create('conversation_nicknames', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            // ვისი ხედია
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // ვის არქმევს
            $table->foreignId('target_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('nickname', 60);
            $table->timestamps();

            $table->unique(['conversation_id', 'user_id', 'target_user_id'], 'conversation_nickname_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('conversation_nicknames');
        Schema::dropIfExists('message_reactions');
    }
};
