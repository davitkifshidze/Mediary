<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ჩატი (Tasks §16.3)** — პირადი მიმოწერა ორ მომხმარებელს შორის.
 *
 * სამი ცხრილი:
 *  · `conversations` — თვითონ საუბარი;
 *  · `conversation_user` — მონაწილეები + **თითოეულის** წაკითხვის ნიშანი;
 *  · `messages` — შეტყობინებები.
 * პლუს `user_blocks` — ვინ ვინ დაბლოკა.
 *
 * ⚠️ **მონაწილეები pivot-შია და არა `user_one_id`/`user_two_id` სვეტებში.**
 * ორსვეტიანი ვარიანტი ყოველ query-ს `where(a) orWhere(b)`-ად აქცევდა და
 * „წაკითხულია" ვერსად ჩაჯდებოდა — ის **თითო მხარისაა** და არა საუბრის.
 *
 * ⚠️ **`BelongsToUser`-ის `owner` scope აქ არ გამოიყენება.** ის „ჩანაწერი
 * ერთ მფლობელს ეკუთვნის" დაშვებაზეა აგებული; საუბარი კი განსაზღვრებით
 * ორისაა. წვდომას **მონაწილეობა** წყვეტს (`ChatService::participates()`),
 * და ეს ცხადად, კონტროლერში მოწმდება.
 *
 * ⚠️ **დაბლოკვა ცალკე ცხრილია და არა pivot-ის დროშა.** ის ორ **ადამიანს**
 * შორისაა და არა ერთი საუბრის შიგნით: დაბლოკილმა არც ახალი საუბარი უნდა
 * შეძლოს დაწყება.
 *
 * ⚠️ **მედიის ველები თავიდანვე დგას** (`attachment_*`), თუმცა ატვირთვა ჯერ
 * არ იწერება: §19.5-ის პასუხი წაშლის **ქცევას** ცვლის და არა სქემას, ე.ი.
 * ცხრილს მოგვიანებით მიგრაცია არ დასჭირდება.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            // ბოლო შეტყობინების დრო — სიის დალაგება ამით ხდება და არა
            // `messages`-ის ყოველ ჯერზე დათვლით
            $table->dateTime('last_message_at')->nullable();
            $table->timestamps();

            $table->index('last_message_at');
        });

        Schema::create('conversation_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // ⚠️ წაკითხვის ნიშანი **თითო მხარისაა** — სწორედ ამიტომაა pivot
            $table->dateTime('last_read_at')->nullable();
            $table->timestamps();

            $table->unique(['conversation_id', 'user_id']);
            $table->index(['user_id', 'conversation_id']);
        });

        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // text | emoji | gif | image | video | file (§16.3)
            $table->string('type', 20)->default('text');
            $table->text('body')->nullable();

            /* მედია — ველები დგას, ჩაწერა ჯერ არ ხდება (იხ. კლასის შენიშვნა).
               `attachment_path` პრივატულ დისკზე იქნება (§17.5). */
            $table->string('attachment_path')->nullable();
            $table->string('attachment_name')->nullable();
            $table->string('attachment_mime', 120)->nullable();
            $table->unsignedBigInteger('attachment_size')->nullable();

            $table->timestamps();

            $table->index(['conversation_id', 'id']);
        });

        Schema::create('user_blocks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();      // ვინ დაბლოკა
            $table->foreignId('blocked_user_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['user_id', 'blocked_user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_blocks');
        Schema::dropIfExists('messages');
        Schema::dropIfExists('conversation_user');
        Schema::dropIfExists('conversations');
    }
};
