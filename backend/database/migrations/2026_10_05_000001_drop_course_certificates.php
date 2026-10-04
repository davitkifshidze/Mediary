<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * **Tasks §55.5 — კურსის სერტიფიკატი ქრება.**
 *
 * შენი სიტყვები: „არ მჭირდება სერტიფიკატები". `kind: certificate` ახალ ფაილზე
 * 422-ია (`Course::FILE_KINDS`), ინტერფეისში ცალკე ბლოკი აღარ არის.
 *
 * ⚠️ **მონაცემი არ იკარგება**: ძველი სერტიფიკატი (ცოცხალ ბაზაში 0 იყო, მაგრამ სხვა
 * ანგარიშს შეიძლება ჰქონდეს) **დოკუმენტად** (`doc`) გადადის — ფაილი ადგილზე რჩება
 * (`courses/files/certificates/…` — საქაღალდე `courses/files/*`-ის ნაწილია) და
 * „დოკუმენტებში" ჩანს. `kind` სტრიქონის სვეტია, ე.ი. DDL არ სჭირდება.
 *
 * ⚠️ მოდულის აღწერა „გაკვეთილების პროგრესს და სერტიფიკატს" ჰპირდებოდა — გაკვეთილები
 * §14-მა მოხსნა, სერტიფიკატი — ამან; ცოცხალი `modules`-ის რიგი სიდერთან ერთად იცვლება.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('course_files')->where('kind', 'certificate')->update(['kind' => 'doc']);

        DB::table('modules')->where('key', 'course')->update([
            'description_ka' => 'ონლაინ-კურსები — ბმული, YouTube-ის ფლეილისტის ვიდეოები, ფაილები და კატეგორიები.',
            'description_en' => 'Online courses — the link, YouTube playlist videos, files and categories.',
        ]);
    }

    /** ⚠️ რომელი დოკუმენტი იყო სერტიფიკატი, აღარ ვიცით — უკან მხოლოდ აღწერა ბრუნდება */
    public function down(): void
    {
        DB::table('modules')->where('key', 'course')->update([
            'description_ka' => 'ონლაინ-კურსები — გაკვეთილების პროგრესი, სერტიფიკატი და კატეგორიები.',
            'description_en' => 'Online courses — lesson progress, the certificate and categories.',
        ]);
    }
};
