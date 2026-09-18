<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **Tasks FEAT-03 — პარტიის თითო ერთეულის შედეგი.**
 *
 * ⚠️ სერვერული პარტია მხოლოდ `processed/total`-ს აბრუნებდა, ე.ი. BUG-08-ის
 * შემდეგაც „**რომელი** ჩანაწერი და **რატომ** ჩავარდა" მხოლოდ `sources.log`-ში
 * იყო — მაშინ, როცა კლიენტური რიგი თითოზე შედეგს აჩვენებს. ერთი და იგივე
 * ოპერაცია ორ რეჟიმში ორ სხვადასხვა პასუხს იძლეოდა, და „300/300"-ის შემდეგ
 * მომხმარებელი ვერ იგებდა, რა გადაეშვა თავიდან.
 *
 * ⚠️ **`batch_id` სტრიქონია და უცხო გასაღები არ არის**: `job_batches.id`
 * UUID-ია და Laravel-ის შიდა ცხრილია — მასზე FK ჩვენს სქემას ფრეიმვორკის
 * შიდა დეტალზე მიაბამდა. გაწმენდა `job_batches`-ის მოხსნისას ხელით ხდება
 * (`pruneBatches`), აქ კი რიგები დროით იწმინდება.
 *
 * ⚠️ **`skipped` ცალკე მდგომარეობაა და არა `failed`**: წაშლილი ჩანაწერი ან
 * წაშლილი ანგარიში კანონიერი გამოტოვებაა — მისი „ჩავარდნად" ჩათვლა
 * მომხმარებელს ხელახლა გაშვებას ურჩევდა იქ, სადაც გასაშვები აღარაფერია.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('batch_items', function (Blueprint $table) {
            $table->id();
            $table->string('batch_id', 64)->index();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 20);
            $table->string('type', 32);
            $table->unsignedBigInteger('record_id');
            // ⚠️ enum-ის ნაცვლად string: sqlite-ზე enum `check`-ია და ახალ
            // მნიშვნელობას მიგრაციის გარეშე არ უშვებს (`approval_requests`-ის წესი)
            $table->string('status', 12)->default('running');
            $table->string('title')->nullable();
            $table->text('error')->nullable();
            $table->timestamps();

            $table->index(['batch_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('batch_items');
    }
};
