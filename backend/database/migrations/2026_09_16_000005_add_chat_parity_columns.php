<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ჩატი Messenger-ის დონემდე: დადუმება, თემა, დაპინვა (Tasks §10.5–§10.7).**
 *
 * შენი სიტყვები: „ჩატის დადუმება/ჩართვა … წერილების დაპინვა, პინების
 * ლისტი, ჩატის სხვადასხვა თემები".
 *
 * ⚠️ **დადუმება ორი სვეტია და არა JSON.** მიზეზი `unreadCounts()`-ია: ის
 * ნედლი `DB::table()` შეკითხვაა და დადუმება სწორედ იქ უნდა მოქმედებდეს —
 * JSON-ში ჩაწერილს ეს query დრაივერზე დამოკიდებული SQL-ის გარეშე ვერ
 * გამოიყენებდა (ეს ხაფანგი პროექტს `jsonLike()`-ში უკვე დაუჯდა).
 *
 * ⚠️ **ორი სვეტი და არა ერთი**: „სამუდამოდ დადუმებული" სენტინელ-თარიღით
 * („3000 წელი") არ უნდა გამოიხატოს — `muted_at` ამბობს *რომ* დადუმდა,
 * `muted_until` კი *სანამ*; `null` = სამუდამოდ.
 *
 * ⚠️ **თემა საუბრისაა და არა მონაწილის** — Messenger-ის სემანტიკა: ორივე
 * ერთსა და იმავე ფერს ხედავს. მნიშვნელობა **გასაღებია და არა hex**:
 * ფერები SPA-შია (ღია და მუქი ვარიანტით), ე.ი. პალიტრის შეცვლა ბაზას
 * არ ეხება — `modules.color`-ის საპირისპირო შემთხვევა, სადაც ფერი
 * მართლა მონაცემია.
 *
 * ⚠️ **პინი ზუსტად `removed_at`/`removed_by`-ის ფორმისაა.** განსხვავებით
 * „ორივესთვის წაშლისგან", **ორივე მონაწილეს შეუძლია**: პინი დესტრუქციული
 * არაა და საუბრის დონეზე დგას.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversation_user', function (Blueprint $table) {
            $table->timestamp('muted_at')->nullable()->after('last_read_at');
            // `null` + `muted_at` = სამუდამოდ; თარიღი = „ამ დრომდე"
            $table->timestamp('muted_until')->nullable()->after('muted_at');
        });

        Schema::table('conversations', function (Blueprint $table) {
            // ⚠️ გასაღები და არა hex — იხ. კლასის შენიშვნა
            $table->string('theme', 32)->nullable()->after('last_message_at');
        });

        Schema::table('messages', function (Blueprint $table) {
            $table->timestamp('pinned_at')->nullable()->after('removed_by');
            $table->foreignId('pinned_by')->nullable()->after('pinned_at')->constrained('users')->nullOnDelete();
            // პინების სია ერთი საუბრის ჭრილში იკითხება
            $table->index(['conversation_id', 'pinned_at']);
        });
    }

    public function down(): void
    {
        Schema::table('conversation_user', function (Blueprint $table) {
            $table->dropColumn(['muted_at', 'muted_until']);
        });

        Schema::table('conversations', function (Blueprint $table) {
            $table->dropColumn('theme');
        });

        Schema::table('messages', function (Blueprint $table) {
            $table->dropIndex(['conversation_id', 'pinned_at']);
            $table->dropConstrainedForeignId('pinned_by');
            $table->dropColumn('pinned_at');
        });
    }
};
