<?php

use App\Support\AppTime;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * **წლიური მიზნების სიებად ქცეული ჩანაწერების შეკეთება** (Tasks §1.2).
 *
 * `users.settings.goals`-ის ფორმა `{ movie: { "2026": 12 } }`-ია, მაგრამ `UserResource`
 * (Laravel-ის `JsonResource`) ყველა-რიცხვითგასაღებიან ობიექტს `array_values()`-ით
 * სიად აბრუნებდა (`{"2026": 50}` → `[50]`), SPA კი ყოველ შენახვაზე სიას ობიექტში
 * შლიდა — ასე ბაზაში `movie: [50, 10, 10, 12]` და `{"0": 50, "2026": 10}` დაგროვდა.
 * მიზეზი `UserResource::$preserveKeys`-ით მოიხსნა; აქ მონაცემი სწორდება.
 *
 * ⚠️ **ბოლო ელემენტი უახლესი მიზანია**: JS რიცხვით გასაღებებს ზრდადობით ალაგებს, ე.ი.
 * `"2026"` ყოველთვის ბოლო იყო და მისი მნიშვნელობა სიის ბოლოში მოხვდა. წელი — მიმდინარე
 * (`AppTime`): სხვა წლის მიზანი ამ ხარვეზამდე არ არსებობდა (ფუნქცია 2026-09-28-ისაა).
 *
 * ⚠️ **ცარიელი `goals` ობიექტია (`{}`) და არა სია (`[]`)**: `[]` SPA-ში `goals[key]`-ს
 * `undefined`-ად კითხულობს — მუშაობს, მაგრამ ფორმა ტყუის; PHP ცარიელ მასივს `[]`-ად
 * წერს, ამიტომ `(object)`.
 *
 * ⚠️ **`down()` არაფერს აკეთებს**: დაზიანებული ფორმის დაბრუნება აზრს მოკლებულია, სწორი
 * ფორმა კი ძველ კოდსაც ესმის.
 */
return new class extends Migration
{
    public function up(): void
    {
        $year = (string) AppTime::now()->year;

        $rows = DB::table('users')->whereNotNull('settings')->select(['id', 'settings'])->lazyById();

        foreach ($rows as $row) {
            $settings = json_decode((string) $row->settings, true);

            if (! is_array($settings) || ! array_key_exists('goals', $settings) || ! is_array($settings['goals'])) {
                continue;
            }

            $goals = [];
            $changed = false;

            foreach ($settings['goals'] as $module => $perYear) {
                if (! is_array($perYear)) {
                    $changed = true;

                    continue;
                }

                $repaired = $this->repair($perYear, $year);

                if ($repaired !== $perYear) {
                    $changed = true;
                }

                if ($repaired === []) {
                    $changed = true;

                    continue;
                }

                $goals[$module] = $repaired;
            }

            if (! $changed) {
                continue;
            }

            $settings['goals'] = (object) $goals;

            DB::table('users')->where('id', $row->id)->update(['settings' => json_encode($settings)]);
        }
    }

    /**
     * ერთი მოდულის მიზნები: წლის გასაღებები (2000–2999) რჩება, სიის ნარჩენი
     * ინდექსები (0, 1, 2…) იშლება; თუ წელი არ დარჩა — ბოლო ნარჩენი მიმდინარე წელზე.
     *
     * @param  array<int|string, mixed>  $perYear
     * @return array<string, int>
     */
    private function repair(array $perYear, string $year): array
    {
        $kept = [];
        $stray = [];

        foreach ($perYear as $key => $value) {
            if (! is_numeric($value) || (int) $value <= 0) {
                continue;
            }

            if ((int) $key >= 2000 && (int) $key <= 2999) {
                $kept[(string) $key] = (int) $value;
            } else {
                $stray[] = (int) $value;
            }
        }

        if ($kept === [] && $stray !== []) {
            $kept[$year] = end($stray);
        }

        return $kept;
    }

    public function down(): void {}
};
