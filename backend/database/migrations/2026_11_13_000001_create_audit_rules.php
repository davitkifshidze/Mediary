<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **ჟურნალის წესები — ოთხი დონე ერთ ცხრილში.**
 *
 * აქამდე „რა იწერება" ერთი გლობალური სია იყო (`app_settings.audit.kinds` →
 * გამორთული სახეობები). ახლა წესი რიგია: სახეობა · მოდული (ან ყველა) ·
 * მომხმარებელი (ან ყველა) · ჩართული / გამორთული · ვადა. ცარიელი `module` და
 * ცარიელი `user_id` ერთად გლობალური დონეა; რიგის არარსებობა ნიშნავს „როგორც
 * ზემოთ", ხოლო არც ერთ დონეზე რიგის გარეშე სახეობა იწერება.
 *
 * ⚠️ `module` FK არ არის: ლოგის „მოდული" ფსევდო-ჭრილიც შეიძლება იყოს (`admin`,
 * `account`, `chat`…), რომელსაც `modules`-ში რიგი არ აქვს. წაშლილი მოდულის
 * წესებს `Module`-ის მოდელი შლის.
 * ⚠️ `(kind, module, user_id)` უნიკალურია, მაგრამ ინდექსით არ მოწმდება —
 * MySQL-ზე `NULL`-ები ერთმანეთს არ ემთხვევა; ერთადერთი მწერალი `AuditRules`-ია.
 *
 * არსებული გლობალური გადამრთველები აქვე გადმოდის და პარამეტრებიდან იშლება.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_rules', function (Blueprint $table) {
            $table->id();
            $table->string('kind', 30);
            $table->string('module', 60)->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->boolean('enabled');
            // მხოლოდ გამორთულზე: ამ დროის შემდეგ წესი აღარ მოქმედებს
            $table->dateTime('expires_at')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['kind', 'module', 'user_id']);
        });

        if (! Schema::hasTable('app_settings')) {
            return;
        }

        $stored = DB::table('app_settings')->where('key', 'audit.kinds')->value('value');
        $off = is_string($stored) ? (json_decode($stored, true)['off'] ?? []) : [];

        foreach (is_array($off) ? $off : [] as $kind) {
            // დაცული სახეობა ძველ სიაშიც ვერ მოხვდებოდა; ხელით შეცვლილ ბაზაზე მაინც ვტოვებთ
            if (! is_string($kind) || $kind === '' || $kind === 'chat_delete') {
                continue;
            }

            DB::table('audit_rules')->insert([
                'kind' => mb_substr($kind, 0, 30),
                'enabled' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        DB::table('app_settings')->where('key', 'audit.kinds')->delete();
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_rules');
    }
};
