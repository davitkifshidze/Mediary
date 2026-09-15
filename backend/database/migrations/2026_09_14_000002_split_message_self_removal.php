<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **„მხოლოდ ჩემთან წაშლა" თითო მხარისაა (აუდიტი 2026-09-14, §B2).**
 *
 * §4.6-მა სამი სვეტი დაამატა — `removed_at`/`removed_by`/`removed_scope` — და
 * ორივე სახის წაშლა მათში ეწერა. `both`-ისთვის ეს სწორია (ფაქტი მართლა
 * შეტყობინებისაა), `self`-ისთვის კი — არა: ეს **მაყურებლის** ფაქტია და ორ
 * მონაწილეს ერთი ბუდე ჰქონდა.
 *
 * ⚠️ **შედეგი ჩუმი და უცნაური იყო:** A წერს; B შლის მხოლოდ თავისთან (რიგი
 * `removed_by = B`); მერე A შლის მხოლოდ თავისთან → `removed_by` გადაეწერა →
 * `scopeVisibleTo(B)` ისევ `true` ხდება და **წერილი B-სთან ისევ ჩნდება**.
 * ერთი მხარის წაშლა მეორისას აუქმებდა.
 *
 * ⚠️ **ცხრილი და არა ორი სვეტი.** ორი სვეტი (`hidden_by_a`/`hidden_by_b`)
 * „მონაწილე ზუსტად ორია"-ს ჩააკერებდა სქემაში — ზუსტად ის დაშვება,
 * რომლის გამოც `ChatService`-მა მონაწილეები pivot-ად გააკეთა და არა
 * `user_one_id`/`user_two_id`-ად.
 *
 * ⚠️ **`removed_scope` იშლება.** გადატანის შემდეგ ის მხოლოდ `both`-ს
 * შეიცავს, ე.ი. `removed_at`-ის არსებობა თვითონვე ნიშნავს „ორივესთან".
 * დარჩენილი სვეტი ცოცხალ მახეს გააჩენდა: `where('removed_scope', 'self')`
 * ჩუმად ცარიელს დააბრუნებდა (`weekday`/`time_of_day`-ის იგივე წესი).
 * ⚠️ ჩამოგდება **MySQL-ზეა**: sqlite-ზე მკვდარი სვეტი რჩება და მას არაფერი
 * კითხულობს (`songs.genre_id`-ის პრეცედენტი).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('message_hides')) {
            Schema::create('message_hides', function (Blueprint $table) {
                $table->id();
                $table->foreignId('message_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->timestamp('hidden_at');

                // ერთი ადამიანი ერთ წერილს ერთხელ მალავს
                $table->unique(['message_id', 'user_id']);
                // „რა არ ვაჩვენო ამ ადამიანს" — ძაფის კითხვის მთავარი კითხვა
                $table->index(['user_id', 'message_id']);
            });
        }

        // ---------- არსებული `self`-წაშლები ახალ ცხრილში ----------
        if (Schema::hasColumn('messages', 'removed_scope')) {
            $rows = DB::table('messages')
                ->where('removed_scope', 'self')
                ->whereNotNull('removed_by')
                ->get(['id', 'removed_by', 'removed_at']);

            foreach ($rows as $row) {
                DB::table('message_hides')->insertOrIgnore([
                    'message_id' => $row->id,
                    'user_id' => $row->removed_by,
                    'hidden_at' => $row->removed_at ?? now(),
                ]);
            }

            /* ⚠️ სვეტები **იწმინდება და არა რჩება**: `removed_at`-ს ახლა ერთი
               მნიშვნელობა აქვს — „ორივესთან წაშლილი". დატოვებული `self`-ის
               კვალი იმას ნიშნავდა, რომ ეს წერილები ყველასგან დაიმალებოდა. */
            DB::table('messages')->where('removed_scope', 'self')->update([
                'removed_at' => null,
                'removed_by' => null,
            ]);
        }

        if (DB::getDriverName() === 'mysql' && Schema::hasColumn('messages', 'removed_scope')) {
            Schema::table('messages', function (Blueprint $table) {
                $table->dropColumn('removed_scope');
            });
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql' && ! Schema::hasColumn('messages', 'removed_scope')) {
            Schema::table('messages', function (Blueprint $table) {
                $table->string('removed_scope', 8)->nullable()->after('removed_by');
            });
        }

        if (Schema::hasColumn('messages', 'removed_scope')) {
            DB::table('messages')->whereNotNull('removed_at')->update(['removed_scope' => 'both']);

            foreach (DB::table('message_hides')->get() as $hide) {
                DB::table('messages')->where('id', $hide->message_id)->whereNull('removed_at')->update([
                    'removed_at' => $hide->hidden_at,
                    'removed_by' => $hide->user_id,
                    'removed_scope' => 'self',
                ]);
            }
        }

        Schema::dropIfExists('message_hides');
    }
};
