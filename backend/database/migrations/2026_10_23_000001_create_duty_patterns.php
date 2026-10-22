<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **მორიგეობის რიტმი — „ყოველ მე-4 დღეს".**
 *
 * „112-ში 1-ში, 5-ში, 9-ში… ესენი ნამდვილად ჩემი მორიგეობებია": რიტმი ერთხელ
 * იწერება (სამსახური · ტიპი/საათები · ყოველ N დღეში · პირველი დღე · დაწყება)
 * და „გაგრძელება" მისგან **ნამდვილ** მორიგეობებს ქმნის `generated_until`-დან
 * პერიოდის ბოლომდე. რიგები რჩება ერთადერთ სიმართლედ — ჯამი, შეხსენება,
 * ექსპორტი და გაცვლა ჩვეულებრივ მორიგეობებზე მუშაობს; ვირტუალური დღეები არ არსებობს.
 *
 * ⚠️ `duty_shifts.pattern_id` — რომელმა რიტმმა დაბადა (ჩიპის ნიშანი); რიტმის
 * საბოლოო წაშლა მორიგეობებს არ შლის (`nullOnDelete`), ურნაში წასვლაც — მათ
 * უბრალოდ რჩებათ `pattern_id`. სამსახურის საბოლოო წაშლა რიტმსაც შლის.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('duty_patterns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('workplace_id')->constrained('duty_workplaces')->cascadeOnDelete();
            // ტიპის გარეშე — ქასთომ საათები (`hours`)
            $table->foreignId('type_id')->nullable()->constrained('duty_shift_types')->nullOnDelete();
            $table->decimal('hours', 4, 1);
            $table->unsignedSmallInteger('interval_days');
            // რიტმის პირველი დღე — მისგან ითვლება „ყოველ N დღეში"
            $table->date('anchor_date');
            $table->time('start_time')->nullable();
            $table->boolean('is_active')->default(true);
            // რომელ დღემდეა უკვე გაგრძელებული (ჩათვლით)
            $table->date('generated_until')->nullable();
            $table->timestamp('trashed_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'workplace_id']);
        });

        Schema::table('duty_shifts', function (Blueprint $table) {
            $table->foreignId('pattern_id')->nullable()->after('type_id')
                ->constrained('duty_patterns')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('duty_shifts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('pattern_id');
        });

        Schema::dropIfExists('duty_patterns');
    }
};
