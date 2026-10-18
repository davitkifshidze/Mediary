<?php

namespace App\Models\Concerns;

use App\Services\Modules\CustomFieldService;

/**
 * **მორგებულ ველებზე ატვირთული ფაილები**.
 *
 * ⚠️ **რატომ არსებობს ეს trait საერთოდ.** თავიდან `<module>_field_values`
 * მშობელს `cascadeOnDelete`-ით ებმოდა და ეს სავსებით საკმარისი იყო: რიგში
 * მხოლოდ ტექსტი/რიცხვი/თარიღი ეწერა. `file` ტიპმა იქ **ფაილი** ჩასვა, ე.ი.
 * ჩანაწერის წაშლას ახლა დისკიც უნდა გაასუფთაოს და კვოტაც გაათავისუფლოს —
 * SQL-ის კასკადი კი მოდელის ივენთს **არ ისვრის** და ორივე ჩუმად დაიკარგებოდა.
 * ზუსტად ის ხაფანგი, რის გამოც `Video::booted()` თავის `video_files`-ს
 * სათითაოდ შლის.
 *
 * ⚠️ **`deleting` და არა `deleted`**: `deleted`-ის მომენტში კასკადს რიგები
 * უკვე წაღებული აქვს და გზა აღარსაიდან იკითხება.
 *
 * ⚠️ **მასობრივი წაშლაც დაფარულია**: `PurgeService` ყოველთვის
 * მოდელით შლის და არა `delete()`-ით query-ზე — სწორედ იმიტომ, რომ ივენთები
 * გაისროლოს.
 */
trait HasCustomFields
{
    protected static function bootHasCustomFields(): void
    {
        static::deleting(function ($model) {
            app(CustomFieldService::class)->purgeRecordFiles($model);
        });
    }
}
