<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ნიკნეიმი ერთ საუბარში (Tasks §10.11).
 *
 * ⚠️ **ცალკე ცხრილი და არა პივოტის სვეტი.** პივოტის სვეტი მხოლოდ იმიტომ
 * იმუშავებდა, რომ მონაწილე ზუსტად ორია — სქემა კი სწორედ ამ დაშვებას
 * გაურბის (`message_hides`-ის პრეცედენტი). აქ სამი მხარეა: **ვისი ხედია**
 * (`user_id`), **ვის** არქმევს (`target_user_id`) და სად (`conversation_id`).
 *
 * ⚠️ **ნამდვილ სახელს არ ანაცვლებს** — პასუხში ორივე მიდის.
 */
class ConversationNickname extends Model
{
    protected $guarded = ['id'];

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }
}
