<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ბაზის დამპი ადმინიდან** (Tasks §22).
 *
 * ⚠️ **ფაილი კონკრეტულ მომხმარებელზეა და არა „სისტემისა"** (შენი პირობა:
 * „ჩემს მომხმარებელზე ინახებოდეს"). აქედან გამომდინარეობს ორი რამ: ის
 * `StorageMeter`-ის კვოტაში ითვლება (§22.3) და საცავის ბიბლიოთეკაში ჩემს
 * ფაილებს შორის ჩანს.
 *
 * ⚠️ **`status` ოთხ ფაქტს არჩევს და `boolean` ვერ გაარჩევდა** —
 * `videos.download_status`-ის ზუსტი წესი (§7.1): `running` (მიმდინარეობს) ·
 * `ready` · `failed` + `error`. UI სამივეზე სხვა ღილაკს ხატავს, ერთ
 * დროშად შეკუმშვა კი „რატომ არაფერი ხდება"-ს უპასუხოდ ტოვებდა.
 *
 * ⚠️ **`started_at` აუცილებელია `updated_at`-ის ნაცვლად** — §7.1-ის ნასწავლი:
 * `updated_at` ნებისმიერ ცვლილებაზე ახლდება, ე.ი. „როდის დაიწყო ეს გაშვება"
 * კითხვას აღარ პასუხობს, და მკვდარი `running` სამუდამოდ ჩარჩენილი რჩება.
 *
 * ⚠️ **`source` ორ წარმოშობას არჩევს**: აქ აღებული დამპი (`dump`) და სხვა
 * კომპიუტერიდან **ატვირთული** ფაილი (`upload`, §22.6). ეს არაა კოსმეტიკა —
 * ატვირთულ ფაილს ჩვენი ხელით დაწერილი სათაური არ აქვს და მისი შიგთავსი
 * ჯერ არაფრით შემოწმებულა.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('database_backups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            /** `backups/…sql` — **პრივატულ** დისკზე (`StorageFolder::PRIVATE_ROOTS`) */
            $table->string('path', 500)->nullable();
            /** ჩამოტვირთვისას ნაჩვენები სახელი: `mediary-2026-09-15-1204.sql` */
            $table->string('name', 255)->nullable();
            /** ⚠️ **ჩაწერილი** ზომა და არა დისკიდან წაკითხული — `StoredFile`-ის წესი */
            $table->unsignedBigInteger('size')->default(0);
            $table->string('status', 20)->default('running');
            $table->string('error', 500)->nullable();
            /** `mysql` — sqlite-ზე ეს ფუნქცია საერთოდ არ ირთვება */
            $table->string('driver', 20)->nullable();
            /** რამდენი ცხრილი ჩაიწერა — „ცარიელი დამპი" ასე ჩანს */
            $table->unsignedInteger('tables')->nullable();
            $table->string('note', 255)->nullable();
            $table->string('source', 20)->default('dump');
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('database_backups');
    }
};
