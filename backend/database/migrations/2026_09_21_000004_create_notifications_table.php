<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **შეტყობინებების ცენტრი (FEAT-19).**
 *
 * აქამდე შეტყობინება მხოლოდ ერთი რამ იყო — ჩანაწერის შეხსენება
 * (`note_notifications`, §13.3). მოთხოვნის დამტკიცება, კვოტის შევსება,
 * ჩავარდნილი ასლი და დასრულებული პარტია არსად ეცნობებოდა: ისინი
 * `audit_logs`-ში იწერებოდა, მაგრამ **ადამიანამდე არ მიდიოდა**.
 *
 * ⚠️ **Laravel-ის საკუთარი ცხრილია** (`Notifiable` ფრეიმვორკშია, `User`
 * მას უკვე იყენებს) — ცალკე მექანიზმის დაბადება ერთი ცხრილისთვის
 * ზუსტად ის გამრავლებაა, რომელსაც ეს პროექტი უარყოფს.
 *
 * ⚠️ **`type` აქ **მოვლენის სახეა** და არა კლასის სახელი**
 * (`App\Notifications\AppNotification::databaseType()`). Laravel ნაგულისხმევად
 * კლასს წერს, მაგრამ ერთი გენერიკული კლასის პირობებში ეს სვეტი ყველა
 * რიგზე ერთნაირი იქნებოდა და ფილტრიც შეუძლებელი — ახლა კი მასზე ისევე
 * იფილტრება, როგორც `audit_logs.action`-ზე.
 *
 * ⚠️ **ტექსტი არ ინახება — მხოლოდ `type` და მონაცემები.** ენა ბრაუზერში
 * ირჩევა, ე.ი. ჩაწერილი ქართული წინადადება ინგლისურ ინტერფეისზე
 * ქართულად დარჩებოდა (`status.*`-ის ზუსტი გაკვეთილი §6.4-იდან).
 *
 * ⚠️ **ინდექსი `(notifiable, read_at)`** — ბეჯი ყოველ 30 წამში ითვლის
 * წაუკითხავებს, ე.ი. სწორედ ეს არის ერთადერთი ხშირი query.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('notifications')) {
            return;
        }

        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type');
            $table->morphs('notifiable');
            $table->text('data');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index(['notifiable_type', 'notifiable_id', 'read_at'], 'notifications_unread_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
