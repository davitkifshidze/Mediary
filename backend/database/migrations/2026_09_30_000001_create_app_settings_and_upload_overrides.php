<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **ინსტალაციის პარამეტრები და ატვირთვის პირადი გამონაკლისი (Tasks §34.1, §34.6).**
 *
 * ⚠️ **`app_settings` — ერთი ადგილი ინსტალაციის პარამეტრებისთვის** (გასაღები →
 * JSON). აქამდე მხოლოდ `config/`+`.env` და თითო მომხმარებლის `users.settings`
 * არსებობდა, ე.ი. „ყველასთვის მოქმედი, სუპერადმინის მიერ ცვლადი" მნიშვნელობა
 * არსად ეტეოდა — ატვირთვის ლიმიტი კოდის მუდმივად იდგა, ურნის ზედა ზღვარი კი
 * `.env`-ში. წაკითხვა ერთ კლასშია (`App\Support\AppSettings`), ნაგულისხმევი კი
 * გამომძახებლისაა (`config` ან კოდის მუდმივა).
 *
 * ⚠️ **`id` რჩება, გასაღები კი უნიკალურია**: `audit_logs.subject_id`
 * რიცხვითია, ე.ი. სტრიქონიანი პირველადი გასაღები ჟურნალის ჩანაწერს ვერ
 * ჩაწერდა — ცვლილება კი (`AuditRegistry::MODELS` → `admin`) სწორედ ის
 * ფაქტია, რომლის კითხვაც მოსალოდნელია: „ვინ შეცვალა ლიმიტი".
 *
 * ⚠️ **`users.upload_overrides` ცალკე სვეტია და არა `users.settings`-ის გასაღები.**
 * Tasks-ში „მიგრაციის გარეშე" ეწერა, მაგრამ `PUT /auth/settings` ბლობს
 * **მთლიანად და ტიპის შემოწმების გარეშე** იღებს — ე.ი. იქ ჩაწერილი ნებართვა
 * ერთი მოთხოვნით თავისთავს მიეცემოდა. მინიჭება პარამეტრი არაა: მას
 * მხოლოდ ადმინი წერს (დამტკიცებით ან `/users/{id}`-იდან).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('app_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key', 100)->unique();
            $table->json('value')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->json('upload_overrides')->nullable()->after('settings');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('upload_overrides');
        });

        Schema::dropIfExists('app_settings');
    }
};
