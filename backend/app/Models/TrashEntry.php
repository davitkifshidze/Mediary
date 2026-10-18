<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Support\CastMemberTrash;
use App\Support\CustomModuleTrash;
use Illuminate\Database\Eloquent\Model;

/**
 * **ურნის ელემენტი საკუთარი რიგის გარეშე**.
 *
 * ჩანაწერიდან მოხსნილი მსახიობის ბმული (`castables`-ს `id` არ აქვს —
 * გასაღები სამსვეტიანია), ასევე აუდიტის ლოგის გასუფთავება ერთ
 * ელემენტად. აღწერა `payload`-შია, აღდგენა მას უკან სვამს.
 *
 * ⚠️ **ფაილი აქ არასდროს ინახება** — ამისთვის `TrashedFile` არსებობს
 * (`StoredFile` საბოლოო წაშლისას ფაილსაც შლის და კვოტასაც ათავისუფლებს).
 * ეს რიგი მხოლოდ მონაცემია, ე.ი. მისი წაშლა არაფერს ანადგურებს.
 */
class TrashEntry extends Model
{
    use BelongsToUser;

    protected $guarded = ['id'];

    protected $casts = [
        'record_id' => 'integer',
        'payload' => 'array',
        'trashed_at' => 'datetime',
    ];

    /**
     * ⚠️ **პირადი მოდულის ელემენტის წაშლა მოდულის საბოლოო წაშლაა.**
     * მოვლენაზეა და არა `TrashBin`-ის სამ გზაზე (ხელით წაშლა, დაცლა, ვადის
     * გასვლა) ცალ-ცალკე — მეოთხე გზა ერთ დღეს დაივიწყებდა და ჩანაწერები
     * FK-კასკადით, ფაილების გარეშე გაქრებოდა. აღდგენის წაშლას `erase()`
     * თვითონ ცნობს (მოდული ურნაში აღარაა) და არაფერს ეხება.
     */
    protected static function booted(): void
    {
        static::deleting(function (TrashEntry $entry) {
            if ($entry->kind === CustomModuleTrash::KIND) {
                CustomModuleTrash::erase($entry);
            }

            // ხელით შექმნილი მსახიობი: იგივე წესი, იგივე სამი გზა
            if ($entry->kind === CastMemberTrash::KIND) {
                CastMemberTrash::erase($entry);
            }
        });
    }
}
