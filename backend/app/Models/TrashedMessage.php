<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * **ჩატის წერილი ურნაში (Tasks §29, ეტაპი 5).**
 *
 * წერილი ისედაც არ იშლება — „ორივესთან" `messages.removed_at`-ია, „მხოლოდ
 * ჩემთან" `message_hides`-ის რიგი. ეს რიგი ერთადერთ ახალ ფაქტს ამბობს:
 * **„ეს წაშლა ჯერ კიდევ აღდგება"**.
 *
 * ⚠️ **მისი წაშლა წერილს არ აბრუნებს და არც ანადგურებს** — ურნის „საბოლოოდ
 * წაშლა" და ვადის გასვლა მხოლოდ ამ რიგს შლის, ამიტომ `delete()` აქ
 * უსაფრთხოა ზოგადი გზით (`TrashBin::empty()`/`prune()`). აღდგენა
 * `ChatService::restoreMessage()`-ია.
 *
 * ⚠️ **`message_id` ნამდვილი FK-ია** (`cascadeOnDelete`) — მეორე მონაწილის
 * ანგარიშის წაშლისას მისი წერილები კასკადით ქრება და ელემენტიც მათთან
 * ერთად; `trash_entries` ამას ვერ შეძლებდა (მის `record_id`-ს FK არ აქვს).
 */
class TrashedMessage extends Model
{
    use BelongsToUser;

    protected $guarded = ['id'];

    protected $casts = [
        'user_id' => 'integer',
        'message_id' => 'integer',
        'trashed_at' => 'datetime',
    ];

    /**
     * ურნაში ჩაწერა — წაშლის მომენტში.
     *
     * ⚠️ `firstOrCreate`: ურნაში უკვე მყოფს ვადა თავიდან არ ეწყება.
     */
    public static function remember(int $userId, int $messageId, string $scope): self
    {
        return static::withoutGlobalScope('owner')->firstOrCreate(
            ['user_id' => $userId, 'message_id' => $messageId, 'scope' => $scope],
            ['trashed_at' => now()],
        );
    }

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }
}
