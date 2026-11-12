<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * **კურსის სტატუსი „მივატოვე" (`dropped`) აღარ არსებობს.**
 *
 * სტატუსი სამია — გასავლელი · გავდივარ · გავლილი. ამ სტატუსით დარჩენილი კურსი
 * „გასავლელში" ბრუნდება: სვეტი `string`-ია, ე.ი. უცნობი მნიშვნელობა ბაზაში
 * დარჩებოდა, ფილტრში კი ვერც ერთ სტატუსს ვერ მოხვდებოდა — კურსი „ყველას"
 * გარდა ყველა ჭრილიდან გაქრებოდა.
 *
 * ⚠️ `finished_at` ამ სტატუსზე ისედაც ცარიელია (`Course::syncStatusDates()`),
 * `started_at` კი რჩება — კურსი ერთხელ მართლა დაიწყო.
 * ⚠️ უკან დაბრუნება არ არსებობს: რომელი „გასავლელი" იყო ადრე „მიტოვებული",
 * აღარსად წერია.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('courses')->where('status', 'dropped')->update(['status' => 'to_take', 'finished_at' => null]);
    }

    public function down(): void
    {
        //
    }
};
