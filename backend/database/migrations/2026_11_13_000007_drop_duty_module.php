<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

/**
 * **მორიგეობის მოდულის სრული მოხსნა.**
 *
 * მოდული (`duty`) მომხმარებლის გადაწყვეტილებით მთლიანად იშლება — კოდიც და მონაცემიც.
 * კოდში მისი კვალი აღარ არის; ეს მიგრაცია ერთადერთია, რომელიც მას სახელით იცნობს,
 * რადგან ბაზას, სადაც მოდული ოდესმე იყო (სხვა მანქანაზე, ძველ ასლზე), თვითონ ვერ
 * გაასუფთავებს სხვა რამე:
 *
 *  · ექვსი ცხრილი (მორიგეობები, სამსახურები, ტიპები, ტარიფები, რიტმები, დამატებითი ველები);
 *  · მოდულის რიგი `modules`-ში და მისი ჩართვები (`module_user`);
 *  · აუდიტის ჟურნალის ჩანაწერები ამ მოდულზე (მის შექმნაზეც);
 *  · `users.settings`-ში მენიუს რიგის და მთავარი გვერდის ერთეულები;
 *  · პრივატული დისკის საქაღალდე და ამ მოდულის ძველი მიგრაციების რიგები.
 *
 * ⚠️ **ეს მონაცემის წაშლაა და არა რეფაქტორინგი** — უკან დაბრუნება შიგთავსს ვერ აღადგენს.
 */
return new class extends Migration
{
    private const KEY = 'duty';

    /** FK-ის რიგით: ჯერ ის, ვინც სხვაზე მიუთითებს */
    private const TABLES = ['duty_field_values', 'duty_shifts', 'duty_rates', 'duty_patterns', 'duty_shift_types', 'duty_workplaces'];

    private const MIGRATIONS = [
        '2026_10_04_000003_create_duty_module',
        '2026_10_04_000004_add_reminded_at_to_duty_shifts',
        '2026_10_22_000006_add_defaults_to_duty_workplaces',
        '2026_10_22_000007_add_status_to_duty_shifts',
        '2026_10_23_000001_create_duty_patterns',
        '2026_10_23_000002_add_period_to_duty_workplaces',
    ];

    public function up(): void
    {
        Schema::disableForeignKeyConstraints();
        foreach (self::TABLES as $table) {
            Schema::dropIfExists($table);
        }
        Schema::enableForeignKeyConstraints();

        $module = DB::table('modules')->where('key', self::KEY)->first();

        DB::table('audit_logs')
            ->where(function ($q) use ($module) {
                $q->where('module', self::KEY)
                    ->orWhere('subject_type', 'like', self::KEY.'%')
                    // API, გვერდი და მისი კლასიფიკატორის გვერდი (`dictionaries/duty-types`)
                    ->orWhere('route', 'like', 'api/'.self::KEY.'/%')
                    ->orWhere('route', self::KEY)
                    ->orWhere('route', 'like', self::KEY.'/%')
                    ->orWhere('route', 'like', 'dictionaries/'.self::KEY.'-%');
                // მოდულის შექმნა ადმინის ჟურნალში
                if ($module) {
                    $q->orWhere(fn ($m) => $m->where('subject_type', 'module')->where('subject_id', $module->id));
                }
            })
            ->delete();

        if ($module) {
            DB::table('module_user')->where('module_id', $module->id)->delete();
            DB::table('modules')->where('id', $module->id)->delete();
        }

        // მენიუს პირადი რიგი და მთავარი გვერდის ერთეულები (ბლოკი და მოდულის ბარათი)
        foreach (DB::table('users')->where('settings', 'like', '%'.self::KEY.'%')->get(['id', 'settings']) as $user) {
            $settings = json_decode((string) $user->settings, true);
            if (! is_array($settings)) {
                continue;
            }

            if (is_array($settings['module_order'] ?? null)) {
                $settings['module_order'] = array_values(array_filter($settings['module_order'], fn ($key) => $key !== self::KEY));
            }
            if (is_array($settings['dashboard'] ?? null)) {
                $settings['dashboard'] = array_values(array_filter(
                    $settings['dashboard'],
                    fn ($item) => ! in_array($item['id'] ?? null, [self::KEY, 'module:'.self::KEY], true),
                ));
            }

            DB::table('users')->where('id', $user->id)->update(['settings' => json_encode($settings, JSON_UNESCAPED_UNICODE)]);
        }

        Storage::disk('private')->deleteDirectory(self::KEY);

        DB::table('migrations')->whereIn('migration', self::MIGRATIONS)->delete();
    }

    /** ⚠️ წაშლილი ცხრილები და მათი შიგთავსი აღარსად არის — დასაბრუნებელი არაფერია. */
    public function down(): void {}
};
