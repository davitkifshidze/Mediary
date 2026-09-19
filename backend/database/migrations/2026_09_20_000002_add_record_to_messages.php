<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ჩანაწერის გაზიარება ჩატში (FEAT-13).**
 *
 * ⚠️ **სვეტს `record` ჰქვია და არა `payload`** (ტასქის სიტყვა). „payload"
 * არაფერს ამბობს შიგთავსზე — ამ პროექტის წესი კი სწორედ საპირისპიროა
 * (`notes` → `note_entries`, „სახელი უნდა ამბობდეს, რა დევს შიგნით").
 *
 * ⚠️ **ცალკე სვეტია და არა `attachment_*`-ის ხელახლა გამოყენება.**
 * დანართი **ფაილია** — მას გზა, ზომა, MIME და კვოტა აქვს; გაზიარებული
 * ჩანაწერი კი **მითითებაა**: არაფერი იწერება დისკზე და კვოტა არ იხარჯება.
 * ერთ სვეტში ორივეს ჩატევა `Message::attachmentDeleted()`-ის ლოგიკას
 * გააფუჭებდა (ცარიელი `attachment_path` + მედია-ტიპი = „ფაილი წაიშალა").
 *
 * ⚠️ **ბარათი აქ **არ** ინახება** — მხოლოდ დომენი, id, გლობალური იდენტობა
 * და სათაური. ბარათი კითხვის მომენტში იგება, თორემ მოგვიანებით
 * დაპრივატებული ჩანაწერი ძველ წერილში სამუდამოდ ღია დარჩებოდა.
 * სათაური მაინც ინახება, რადგან ჩანაწერი შეიძლება წაიშალოს — მაშინ
 * მიმღები მაინც ხედავს, რაზე იყო საუბარი.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->json('record')->nullable()->after('attachment_size');
        });
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->dropColumn('record');
        });
    }
};
