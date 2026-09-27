<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Model;

/**
 * **ურნის ელემენტი საკუთარი რიგის გარეშე** (Tasks §29, ეტაპი 2).
 *
 * ჩანაწერიდან მოხსნილი მსახიობის ბმული (`castables`-ს `id` არ აქვს —
 * გასაღები სამსვეტიანია), მე-7 ეტაპზე კი აუდიტის ლოგის გასუფთავება ერთ
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
}
