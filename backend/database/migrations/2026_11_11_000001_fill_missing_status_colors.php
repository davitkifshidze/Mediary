<?php

use App\Support\StatusPalette;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * **უფერო სტატუსებს ფერი ეწერება.**
 *
 * ნაგულისხმევ სტატუსებს ფერი ნაკრებიდან უკვე აქვთ; ხელით დამატებული კი ფერის
 * გარეშე შეიძლებოდა შექმნილიყო და მენიუში ნაცრისფერი აიქონით ჩანდა. ახალ სტატუსს
 * ფერს მოდელი აწერს (`Status::booted()`); ეს მიგრაცია იმავე წესს **ერთჯერადად**
 * ატარებს უკვე არსებულებზე: თითო კლასიფიკატორში (ანგარიში + მოდული) უფერო რიგები
 * მენიუს რიგით იღებენ პირველ თავისუფალ ფერს — ხელით არჩეული ხელუხლებელია.
 *
 * ⚠️ query builder-ით — მანქანის ჩანაწერია და აუდიტში არ უნდა მოხვდეს.
 * ⚠️ ურნაში მყოფ სტატუსსაც ეწერება: აღდგენილი ნაცრისფერი არ უნდა დაბრუნდეს.
 * `down()` არაფერს აკეთებს: ფერის წაშლა არჩევანს წაშლიდა.
 */
return new class extends Migration
{
    public function up(): void
    {
        $missing = DB::table('statuses')
            ->whereNull('color')
            ->orderBy('user_id')
            ->orderBy('module')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get(['id', 'user_id', 'module']);

        foreach ($missing->groupBy(fn ($row) => $row->user_id.'|'.$row->module) as $rows) {
            $first = $rows->first();

            $used = DB::table('statuses')
                ->where('user_id', $first->user_id)
                ->where('module', $first->module)
                ->pluck('color')
                ->all();

            foreach ($rows as $row) {
                $color = StatusPalette::firstFree($used);
                $used[] = $color;

                DB::table('statuses')->where('id', $row->id)->update(['color' => $color]);
            }
        }
    }

    public function down(): void
    {
        // ფერის წაშლა არჩევანის წაშლაა — უკან გზა არ არის
    }
};
