<?php

use App\Models\Module;
use App\Support\CustomFields;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * **მორიგეობა — მოდული `duty`.**
 *
 * ოთხი ცხრილი: **სამსახური** (`duty_workplaces` — სახელი, მოკლე ასო კალენდრის
 * ჩიპისთვის, ფერი, საათობრივი განაკვეთი), **ტიპი** (`duty_shift_types` — „8 სთ“
 * „12 სთ“ „24 სთ“ და შენი, კლასიფიკატორის ფორმით), **ტარიფი** (`duty_rates` —
 * თითო სამსახურზე × ტიპზე თანხა) და **მორიგეობა** (`duty_shifts`).
 *
 * ⚠️ **ტარიფი ჩანაწერზე კოპირდება** (`duty_shifts.pay`): ტარიფის შეცვლა ძველ
 * მორიგეობებს არ ეხება — წარსული თვის ჯამი არ უნდა „გადაითვალოს“ თავისით.
 * ქასთომ საათებზე (`type_id = NULL`) თანხა სამსახურის საათობრივი განაკვეთიდან
 * ითვლება; ორივე შემთხვევაში ჩანაწერზე ხელით გადაწერადია.
 *
 * ⚠️ **ერთ დღეს რამდენიმე მორიგეობა შეიძლება** (ორ სამსახურში, ან ორი ერთში) —
 * უნიკალური ინდექსი თარიღზე განზრახ არ არის. ღამის მორიგეობის თარიღი
 * **დაწყების დღეა**.
 *
 * ⚠️ **სამსახური და ტიპი ურნაში მიდის** (კლასიფიკატორის წესი, `DictionaryTrash`):
 * წაშლისას მორიგეობები სხვაგან გადადის, უსამსახუროდ/უტიპოდ რჩება ან ურნაში
 * მიდის — ამიტომ ორივე FK `nullOnDelete`-ია (SQL მხოლოდ მეორე ფენაა).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('duty_workplaces', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            // კალენდრის ჩიპი — „A · 24“
            $table->string('short', 3)->nullable();
            $table->string('color', 20)->nullable();
            // ქასთომ საათებისთვის (ტიპის გარეშე მორიგეობა)
            $table->decimal('hourly_rate', 10, 2)->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            // ურნიდან აღდგენისას — რომელი მორიგეობები გადაიტანა წაშლამ (`DictionaryTrash`)
            $table->json('trash_meta')->nullable();
            $table->timestamp('trashed_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'sort_order']);
        });

        Schema::create('duty_shift_types', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('key', 60);
            $table->string('name_ka', 80);
            $table->string('name_en', 80);
            $table->decimal('hours', 4, 1);
            $table->string('icon', 60)->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->json('trash_meta')->nullable();
            $table->timestamp('trashed_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'key']);
        });

        /* ⚠️ `user_id` არ აქვს — ტარიფი სამსახურის ნაწილია და მხოლოდ მისით
           იკითხება/იწერება; სამსახურის ან ტიპის საბოლოო წაშლა მას თან მიაქვს. */
        Schema::create('duty_rates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workplace_id')->constrained('duty_workplaces')->cascadeOnDelete();
            $table->foreignId('type_id')->constrained('duty_shift_types')->cascadeOnDelete();
            $table->decimal('pay', 10, 2);
            $table->timestamps();

            $table->unique(['workplace_id', 'type_id']);
        });

        Schema::create('duty_shifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('workplace_id')->nullable()->constrained('duty_workplaces')->nullOnDelete();
            $table->foreignId('type_id')->nullable()->constrained('duty_shift_types')->nullOnDelete();
            $table->date('date');
            $table->time('start_time')->nullable();
            // ტიპიდან კოპირდება, მაგრამ რედაქტირებადია (24-იანი შეიძლება 20 გამოვიდეს)
            $table->decimal('hours', 4, 1);
            $table->decimal('pay', 10, 2)->nullable();
            $table->text('note')->nullable();
            $table->boolean('is_favorite')->default(false);
            $table->timestamp('trashed_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'date']);
            $table->index(['user_id', 'workplace_id', 'date']);
        });

        // დამატებითი ველები მორიგეობაზე — ცხრილის სახელი `CustomFields`-იდან
        $values = CustomFields::TABLE_BY_MODULE['duty'];

        if (! Schema::hasTable($values)) {
            Schema::create($values, function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('record_id')->constrained('duty_shifts')->cascadeOnDelete();
                $table->string('field_key', 60);

                $table->text('value_text')->nullable();
                $table->decimal('value_number', 20, 4)->nullable();
                $table->date('value_date')->nullable();
                $table->boolean('value_bool')->nullable();

                $table->string('value_path')->nullable();
                $table->string('value_name')->nullable();
                $table->string('value_mime', 120)->nullable();
                $table->unsignedBigInteger('value_size')->nullable();
                $table->unsignedSmallInteger('sort_order')->default(0);

                $table->timestamps();

                $table->unique(['record_id', 'field_key', 'sort_order']);
                $table->index(['user_id', 'field_key']);
            });
        }

        Module::withoutGlobalScope('trash')->updateOrCreate(['key' => 'duty'], [
            'name_ka' => 'მორიგეობა',
            'name_en' => 'Duty shifts',
            'description_ka' => 'მორიგეობები სამსახურებით — კალენდარი, საათები, ტარიფები და ჯამები შენი პერიოდით.',
            'description_en' => 'Duty shifts by workplace — a calendar, hours, rates and totals over your own period.',
            'icon' => 'CalendarClock',
            'route_base' => '/duty',
            'api_base' => '/duty',
            'morph_alias' => 'duty',
            'enabled_by_default' => false,
            'color' => '#2563eb',
            // პირადი გალერეა 45-ზეა
            'sort_order' => 46,
        ]);
    }

    public function down(): void
    {
        Module::withoutGlobalScope('trash')->where('key', 'duty')->delete();

        Schema::dropIfExists(CustomFields::TABLE_BY_MODULE['duty']);
        Schema::dropIfExists('duty_shifts');
        Schema::dropIfExists('duty_rates');
        Schema::dropIfExists('duty_shift_types');
        Schema::dropIfExists('duty_workplaces');
    }
};
