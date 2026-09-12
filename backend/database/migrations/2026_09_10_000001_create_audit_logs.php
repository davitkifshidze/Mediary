<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **აუდიტ-ლოგი (Tasks §4)** — „ყველგან, აბსოლუტურად ყველა მოდულში, სრული
 * ლოგირება".
 *
 * ⚠️ **ცალკე ცხრილია და არა JSON სვეტი ჩანაწერზე** (§4.2): ლოგმა ჩანაწერს
 * უნდა გადაარჩინოს — წაშლილის ლოგი სწორედ მაშინაა საჭირო, როცა თვითონ
 * ჩანაწერი აღარ არსებობს.
 *
 * ⚠️ **`user_id`-ს გვერდით `user_label`-იც ინახება.** მომხმარებლის წაშლაზე
 * FK `null`-დება (`nullOnDelete`) — თუ სახელს არ დავიმახსოვრებთ, ლოგში
 * „ვინ" სამუდამოდ იკარგება. იგივე წესია `subject_label`-ზე: ჩანაწერი
 * წაიშლება, სახელი კი უნდა დარჩეს.
 *
 * ⚠️ **`updated_at` განზრახ არ არსებობს** — ლოგის რიგი არასდროს იცვლება.
 *
 * ⚠️ **მოცულობა: შენახვა სამუდამოდ, ავტომატური წაშლის გარეშე** (§4.1-ის
 * პასუხი), ე.ი. ცხრილი თვეში ათასობით რიგით გაიზრდება. ამიტომ ინდექსები
 * **თავიდანვე** იმ ჭრილებზეა, რომლითაც გვერდი ფილტრავს (§4.4/§4.7):
 * მომხმარებელი × თარიღი, მოდული × თარიღი, მოქმედება × თარიღი და სუბიექტი.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();

            // ვინ — FK `null`-დება წაშლაზე, სახელი კი რჩება (იხ. კლასის შენიშვნა)
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('user_label')->nullable();

            // რა მოქმედება — ნაკრები `AuditLog::ACTION_*`-შია და არა enum-სვეტში
            // (`ApprovalRequest::TYPE_*`-ის იგივე წესი: sqlite-ზე `check`
            // შეზღუდვა ახალ ტიპს აგდებს, MySQL-ზე კი მიგრაციას მოითხოვდა)
            $table->string('action', 40);

            // რომელ მოდულში — მოდულის key, ან ფსევდო-მოდული (`account`, `admin`, `chat`)
            $table->string('module', 40)->nullable();

            // რაზე — morph alias + id. ⚠️ **FK არ არის და არც უნდა იყოს**:
            // ჩანაწერი წაიშლება, ლოგი კი რჩება.
            $table->string('subject_type', 40)->nullable();
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->string('subject_label')->nullable();

            // „რითი" (§4.1) — რომელი გზით მოხდა ცვლილება
            $table->string('method', 10)->nullable();
            $table->string('route', 400)->nullable();
            $table->string('ip', 45)->nullable();
            $table->string('user_agent', 400)->nullable();

            // ძველი და ახალი მონაცემი **სრულად** (§4.1) — გვერდზე გვერდიგვერდ
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            // დამატებითი კონტექსტი (ჩატის სკოუპი, სექციის სახელი და მისთანანი)
            $table->json('context')->nullable();

            $table->timestamp('created_at')->nullable();

            $table->index('created_at');
            $table->index(['user_id', 'created_at']);
            $table->index(['module', 'created_at']);
            $table->index(['action', 'created_at']);
            $table->index(['subject_type', 'subject_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
