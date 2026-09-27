<?php

use App\Support\TrashDomain;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **ჩატის წერილი ურნაში (Tasks §29, ეტაპი 5).**
 *
 * წერილი ისედაც არასდროს იშლება (§4.6 — „ბაზაში რჩება აღდგენისთვის"):
 * „ორივესთან" `messages.removed_at`-ია, „მხოლოდ ჩემთან" — `message_hides`-ის
 * რიგი. ურნა მას მხოლოდ **აჩვენებს და აღდგენას აძლევს**, ამიტომ აქ ახალი
 * ფაქტი ერთია — „ეს წაშლა ჯერ კიდევ აღდგება" — და ის `trashed_messages`-შია.
 *
 * ⚠️ **ცალკე ცხრილი და არა `trashed_at` წერილზე.** `messages.trashed_at`
 * ამ კოდში ყველას „დამალულს" წააკითხებდა (ოცდაათზე მეტ ცხრილზე ეს სახელი
 * სწორედ ამას ნიშნავს), წერილის ხილვადობას კი `removed_at` წყვეტს — ურნიდან
 * საბოლოო წაშლის შემდეგ `trashed_at` ცარიელდებოდა და წერილი მაინც დამალული
 * რჩებოდა. ⚠️ **და არც `trash_entries`**: მის `record_id`-ს FK არ აქვს, ე.ი.
 * მეორე მონაწილის ანგარიშის წაშლა (მისი წერილები კასკადით ქრება) ჩემს ურნაში
 * ობოლ ელემენტებს დატოვებდა. აქ `message_id` ნამდვილი FK-ია — ელემენტი
 * თავის წერილთან ერთად ქრება.
 *
 * ⚠️ **საბოლოო წაშლა და ვადის გასვლა მხოლოდ ამ რიგს შლის** — დამალვა და
 * `removed_at` რჩება, ე.ი. წერილი ისევ არ ჩანს, უბრალოდ აღარ აღდგება.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('trashed_messages')) {
            Schema::create('trashed_messages', function (Blueprint $table) {
                $table->id();
                // ვისი ურნაა — დამმალავი (`self`) ან ავტორი (`both`)
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('message_id')->constrained()->cascadeOnDelete();
                // `Message::REMOVAL_SCOPES` — `self` · `both`
                $table->string('scope', 10);
                /* ⚠️ `nullable()` — `trashed_files`-ის იგივე მიზეზით: MariaDB 10.4-ზე
                   პირველ `NOT NULL` TIMESTAMP-ს `ON UPDATE CURRENT_TIMESTAMP` ედება. */
                $table->timestamp('trashed_at')->nullable()->index();
                $table->timestamps();

                // ერთი ადამიანი ერთ წერილს ერთი სკოუპით ერთხელ შლის
                $table->unique(['user_id', 'message_id', 'scope']);
            });
        }

        /* ---------- უკვე წაშლილი წერილები — ვადის ფარგლებში ----------
           ⚠️ მხოლოდ ბოლო `KEEP_DAYS` დღისა: უფრო ძველი ურნაში „დღეს იშლება"-თი
           გამოჩნდებოდა და ღამის გასუფთავება მაშინვე წაშლიდა — ცარიელი ხმაური. */
        $since = now()->subDays(TrashDomain::KEEP_DAYS);
        $stamp = now();

        DB::table('message_hides')
            ->where('hidden_at', '>=', $since)
            ->orderBy('id')
            ->get(['message_id', 'user_id', 'hidden_at'])
            ->chunk(500)
            ->each(fn ($rows) => DB::table('trashed_messages')->insertOrIgnore($rows->map(fn ($row) => [
                'user_id' => $row->user_id,
                'message_id' => $row->message_id,
                'scope' => 'self',
                'trashed_at' => $row->hidden_at,
                'created_at' => $stamp,
                'updated_at' => $stamp,
            ])->all()));

        DB::table('messages')
            ->whereNotNull('removed_at')
            ->whereNotNull('removed_by')
            ->where('removed_at', '>=', $since)
            ->orderBy('id')
            ->get(['id', 'removed_by', 'removed_at'])
            ->chunk(500)
            ->each(fn ($rows) => DB::table('trashed_messages')->insertOrIgnore($rows->map(fn ($row) => [
                'user_id' => $row->removed_by,
                'message_id' => $row->id,
                'scope' => 'both',
                'trashed_at' => $row->removed_at,
                'created_at' => $stamp,
                'updated_at' => $stamp,
            ])->all()));
    }

    public function down(): void
    {
        Schema::dropIfExists('trashed_messages');
    }
};
