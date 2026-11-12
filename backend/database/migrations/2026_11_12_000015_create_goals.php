<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **მიზნები — საკუთარი ცხრილი.**
 *
 * აქამდე მიზანი `users.settings.goals = { მოდული: { "2026": 50 } }` იყო: წელიწადში
 * ერთი რიცხვი თითო მოდულზე, საერთო პარამეტრებთან ერთად შენახული. ახლა მიზანი
 * რიგია: მოდული · პერიოდი (წელი / თვე / კვირა / საკუთარი თარიღები) · რიცხვი ·
 * სურვილისამებრ პირობა (მოდულის კლასიფიკატორის ერთი რიგი — ჟანრი, კატეგორია,
 * ტიპი) · სახელი. ერთ მოდულზე რამდენიმე მიზანი შეიძლება.
 *
 * ⚠️ პერიოდი **ორი თარიღია** (`starts_on`…`ends_on`) და არა „წელი + თვე": პროგრესი
 * ერთი `between`-ით ითვლება, `period` კი მხოლოდ იმას ამბობს, როგორ დაერქვას.
 * ⚠️ `classifier_id` FK არ არის — ლექსიკონი მოდულზეა დამოკიდებული (გლობალური
 * `genres`, per-user კატეგორიები…); წაშლილ რიგზე მიზანი უბრალოდ ნულს ითვლის.
 *
 * არსებული წლიური მიზნები აქვე გადმოდის და პარამეტრებიდან იშლება.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('goals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('module', 60);
            $table->string('name', 120)->nullable();
            // year · month · week · custom
            $table->string('period', 10);
            $table->date('starts_on');
            $table->date('ends_on');
            $table->unsignedInteger('target');
            $table->unsignedBigInteger('classifier_id')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'ends_on']);
        });

        foreach (DB::table('users')->whereNotNull('settings')->get(['id', 'settings']) as $user) {
            $settings = json_decode((string) $user->settings, true);

            if (! is_array($settings) || ! is_array($settings['goals'] ?? null)) {
                continue;
            }

            foreach ($settings['goals'] as $module => $years) {
                foreach (is_array($years) ? $years : [] as $year => $target) {
                    if (! is_string($module) || ! preg_match('/^\d{4}$/', (string) $year) || (int) $target < 1) {
                        continue;
                    }

                    DB::table('goals')->insert([
                        'user_id' => $user->id,
                        'module' => mb_substr($module, 0, 60),
                        'period' => 'year',
                        'starts_on' => "{$year}-01-01",
                        'ends_on' => "{$year}-12-31",
                        'target' => (int) $target,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }

            unset($settings['goals']);
            DB::table('users')->where('id', $user->id)->update(['settings' => json_encode($settings, JSON_UNESCAPED_UNICODE)]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('goals');
    }
};
