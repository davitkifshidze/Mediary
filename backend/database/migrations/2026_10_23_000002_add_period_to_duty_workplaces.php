<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **ანაზღაურების პერიოდი თითო სამსახურზე.**
 *
 * „ყველა სამსახურს თავისებური აქვს" — 112 1-დან, კლინიკა 5-დან: პერიოდის წესების
 * ისტორია (`[{since, day}]`, `DutyPeriod`) მოდულის პარამეტრებიდან სამსახურზე
 * გადადის, იმავე ფორმით და წესით (მორიგეობებიან პერიოდზე ცვლილება მომდევნოდან).
 * „ყველა სამსახურის" ხედი კალენდარული თვეა.
 *
 * ⚠️ **არსებული წესი არ იკარგება**: ვისაც მოდულზე პერიოდი ჰქონდა
 * (`module_user.settings.duty.period`), ის მის ყველა სამსახურზე გადაიწერება —
 * ძველი პერიოდები იმავე საზღვრებით რჩება.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('duty_workplaces', function (Blueprint $table) {
            $table->json('period')->nullable()->after('hourly_rate');
        });

        $moduleId = DB::table('modules')->where('key', 'duty')->value('id');

        if ($moduleId === null) {
            return;
        }

        $rows = DB::table('module_user')->where('module_id', $moduleId)->whereNotNull('settings')->get(['user_id', 'settings']);

        foreach ($rows as $row) {
            $settings = json_decode((string) $row->settings, true);
            $rules = is_array($settings) ? ($settings['duty']['period'] ?? null) : null;

            // ნაგულისხმევი (კალენდარული თვე) გადასაწერი არაფერია
            if (! is_array($rules) || $rules === [] || $rules === [['since' => null, 'day' => 1]]) {
                continue;
            }

            DB::table('duty_workplaces')->where('user_id', $row->user_id)->update(['period' => json_encode(array_values($rules))]);
        }
    }

    public function down(): void
    {
        Schema::table('duty_workplaces', function (Blueprint $table) {
            $table->dropColumn('period');
        });
    }
};
