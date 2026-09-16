<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * წერილზე რეაქცია (Tasks §10.10).
 *
 * ⚠️ **თითო ადამიანზე ერთი რეაქცია** (`unique(message_id, user_id)`) —
 * Messenger/Instagram-ის სემანტიკა. გაფართოება მოგვიანებით უსაფრთხოა,
 * შევიწროება — არა.
 *
 * ⚠️ **`AuditRegistry`-ში განზრახ არ არის**: რეაქცია ერთი დაწკაპუნებაა და
 * ლოგს დამარხავდა — ზუსტად ის მიზეზი, რის გამოც `castables`-იც ხელით
 * იწერება და არა ობსერვერით.
 */
class MessageReaction extends Model
{
    protected $guarded = ['id'];

    public function message(): BelongsTo
    {
        return $this->belongsTo(Message::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
