<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * **„ეს წერილი მე დავიმალე" (აუდიტი 2026-09-14, §B2).**
 *
 * ⚠️ **ცალკე ცხრილი, რადგან ფაქტი თითო მხარისაა.** „ორივესთან წაშლა"
 * შეტყობინების ფაქტია და `messages.removed_at`-ში ზის; „მხოლოდ ჩემთან" კი
 * **მაყურებლის** ფაქტია — ერთ საერთო სვეტში ორი მონაწილე ერთმანეთს
 * აუქმებდა (B დაიმალავდა, A დაიმალავდა, და B-ს ისევ გამოუჩნდებოდა).
 *
 * ⚠️ **`BelongsToUser` არ გამოიყენება.** `user_id` აქ „ვის დაემალა" არის და
 * არა „ვისია ეს ჩანაწერი" — იგივე პრეცედენტი, რაც `SerpSearch`-სა და
 * `TranslationUsage`-ს აქვს. ხილვადობას `Message::scopeVisibleTo()` წყვეტს.
 *
 * ⚠️ **აუდიტ-ლოგში ცალკე არ ეწერება**: წაშლას `ChatController` ისედაც
 * ცხადად წერს (`AuditLog::ACTION_CHAT_DELETE`, `PROTECTED_ACTIONS`-ში), ე.ი.
 * მოდელის დამატება `AuditRegistry`-ში ერთსა და იმავეს ორჯერ ჩაწერდა.
 */
class MessageHide extends Model
{
    public $timestamps = false;

    protected $guarded = ['id'];

    protected $casts = [
        'hidden_at' => 'datetime',
    ];

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
