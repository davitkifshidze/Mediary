<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **სამსახურის ნაგულისხმევები — ტიპი და დაწყების დრო.**
 *
 * „112" ყოველთვის 24-საათიანია და დილის 9-ზე იწყება, კლინიკა — არა: სამსახურის
 * არჩევისას ფორმა ამ ორს თვითონ ავსებს (ცარიელი — არაფერს ცვლის). მოდულის
 * ნაგულისხმევი ტიპი (`DutySettings`) რჩება — ის მაშინ მოქმედებს, როცა
 * სამსახურს თავისი არ აქვს.
 *
 * ⚠️ `nullOnDelete` მხოლოდ **საბოლოო** წაშლაზე მუშაობს: ურნაში მყოფი ტიპი
 * სიაში აღარ ჩანს და ფორმა მას უბრალოდ ვერ იპოვის — ნაგულისხმევი არ ივსება.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('duty_workplaces', function (Blueprint $table) {
            $table->foreignId('default_type_id')->nullable()->after('hourly_rate')
                ->constrained('duty_shift_types')->nullOnDelete();
            $table->time('default_start_time')->nullable()->after('default_type_id');
        });
    }

    public function down(): void
    {
        Schema::table('duty_workplaces', function (Blueprint $table) {
            $table->dropColumn('default_start_time');
            $table->dropConstrainedForeignId('default_type_id');
        });
    }
};
