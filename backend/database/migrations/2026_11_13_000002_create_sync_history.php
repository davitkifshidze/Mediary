<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **სინქრონიზაციის ისტორია — გაშვებები და მათი ერთეულები.**
 *
 * აქამდე გაშვების შედეგი მხოლოდ მანამ ჩანდა, სანამ ფანჯარა ან გვერდი ღია იყო:
 * ბრაუზერის რიგი მას მეხსიერებაში ინახავს, ფონური პარტიის ჟურნალი (`batch_items`)
 * კი მიმდინარეობის ჟურნალია — 30 დღეში იშლება, „რა შეიცვალა" არ უწერია და
 * ბრაუზერის რიგით გაშვებულს საერთოდ არ ხედავს. ჩანაწერს მხოლოდ **ბოლო** შედეგი
 * ახსოვს (`last_sync_result`).
 *
 * `sync_runs` — ერთი გაშვება: რა სახის (მონაცემები · სეზონები · მსახიობები ·
 * თარგმანი), საიდან (ფონური პარტია ან ბრაუზერის რიგი) და რამდენი ერთეული იყო
 * დაგეგმილი. `key` გაშვების გასაღებია: პარტიაზე — მისი id, რიგზე — რიგის მიერ
 * გენერირებული; ორივე გზა ერთეულს ამ გასაღებით აწერს.
 *
 * `sync_run_items` — თითო ერთეული: რა დაბრუნდა (განახლდა · უცვლელი · გამოტოვდა ·
 * ჩავარდა), რატომ და **რა შეიცვალა** — ველების სია, ძველი და ახალი მნიშვნელობის
 * გარეშე (კონკრეტული მნიშვნელობა ჩანაწერის გვერდზე ისედაც ჩანს, ცხრილი კი პატარა
 * რჩება). სათაური ასლად ინახება — ჩანაწერი მოგვიანებით შეიძლება წაიშალოს.
 *
 * ⚠️ ისტორია 90 დღე ინახება (`SyncRun::prunable()`), ერთეულები გაშვებასთან ერთად
 * იშლება.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sync_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->uuid('key');
            // sync · episodes · cast · translate
            $table->string('kind', 20);
            // batch · queue
            $table->string('source', 10);
            $table->unsignedInteger('total')->default(0);
            $table->timestamps();

            $table->unique(['user_id', 'key']);
            $table->index(['user_id', 'created_at']);
        });

        Schema::create('sync_run_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sync_run_id')->constrained()->cascadeOnDelete();
            // movie · series · anime · actor
            $table->string('type', 20);
            $table->unsignedBigInteger('record_id');
            $table->string('title', 200)->nullable();
            // updated · unchanged · skipped · failed
            $table->string('result', 12);
            $table->string('reason', 500)->nullable();
            $table->json('changes')->nullable();
            $table->timestamps();

            $table->unique(['sync_run_id', 'type', 'record_id']);
            $table->index(['sync_run_id', 'result']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sync_run_items');
        Schema::dropIfExists('sync_runs');
    }
};
