<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\StoredFile;
use Illuminate\Database\Eloquent\Model;

/**
 * **ურნაში მყოფი ფაილი, რომლის წყაროს რიგი აღარ მას ატარებს** (Tasks §29).
 *
 * ჩატის მიმაგრებაზე შეტყობინება რჩება და მისი სვეტები ცარიელდება; ველის
 * ფაილზე `<module>_field_values`-ის რიგი იშლება. ორივე შემთხვევაში ფაილი
 * დისკზე და კვოტაში რჩება, მისი აღწერა კი აქ ინახება — აღდგენა მას უკან
 * ჩასვამს, საბოლოო წაშლა კი ნამდვილად წაშლის.
 *
 * ⚠️ **`StoredFile` განზრახაა**: `delete()` ფაილს დისკიდან შლის და
 * **ჩაწერილ** `size`-ს ათავისუფლებს — ზუსტად ის, რაც საბოლოო წაშლაა.
 * აღდგენა კი `deleteQuietly()`-ით შლის ამ რიგს, რომ ფაილს და კვოტას
 * არაფერი მოუვიდეს (ფაილი ხომ ახლა ისევ წყაროს ეკუთვნის).
 *
 * ⚠️ **`trash` scope აქ არ არის**: ამ ცხრილში ყოფნა თვითონ ნიშნავს
 * „ურნაშია", ე.ი. ფილტრი არაფერს გაფილტრავდა.
 */
class TrashedFile extends Model
{
    use BelongsToUser, StoredFile;

    protected $guarded = ['id'];

    protected $casts = [
        'record_id' => 'integer',
        'size' => 'integer',
        'meta' => 'array',
        'trashed_at' => 'datetime',
    ];

    /**
     * ფაილის აღწერის შენახვა — წყაროს რიგი გამომძახებელმა თვითონ უნდა
     * გაასუფთაოს **ამის შემდეგ** (ჯერ აქ, მერე იქ — ჩავარდნაზე ფაილი
     * ორივეგან არ დაიკარგება).
     *
     * @param  array{path: string, name?: ?string, mime?: ?string, size?: ?int}  $file
     * @param  array<string, mixed>  $meta
     */
    public static function capture(
        int $userId,
        string $kind,
        array $file,
        ?string $recordType,
        ?int $recordId,
        ?string $slot,
        array $meta = [],
    ): self {
        return static::withoutGlobalScope('owner')->create([
            'user_id' => $userId,
            'kind' => $kind,
            'record_type' => $recordType,
            'record_id' => $recordId,
            'slot' => $slot,
            'path' => $file['path'],
            'name' => $file['name'] ?? null,
            'mime' => $file['mime'] ?? null,
            'size' => (int) ($file['size'] ?? 0),
            'meta' => $meta ?: null,
            'trashed_at' => now(),
        ]);
    }
}
