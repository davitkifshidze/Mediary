<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * **აუდიტ-ლოგის ერთი რიგი (Tasks §4)**.
 *
 * ⚠️ **მოქმედების ტიპები კონსტანტებშია და არა enum-სვეტში** (§4.1-ის ცხადი
 * მოთხოვნა, `ApprovalRequest::TYPE_*`-ის იგივე წესი): ახალი ტიპი მიგრაციას
 * არ უნდა ითხოვდეს, sqlite-ზე კი `check` შეზღუდვა ახალ მნიშვნელობას
 * უბრალოდ აგდებდა და ტესტი ჩავარდებოდა.
 *
 * ⚠️ **`updated_at` არ არსებობს** — ლოგის რიგი იწერება ერთხელ და აღარ
 * იცვლება. `UPDATED_AT = null` სწორედ ამას ეუბნება Eloquent-ს.
 *
 * ⚠️ **`BelongsToUser` განზრახ არ გამოიყენება.** `user_id` აქ „ვინ გააკეთა"
 * არის და არა „ვისია ეს ჩანაწერი" — global scope ადმინს **სხვის** ლოგს
 * დაუმალავდა, ე.ი. მთელი სექციის აზრს გააქრობდა. წვდომა
 * `admin_access:audit`-ითაა.
 */
class AuditLog extends Model
{
    public const ACTION_LOGIN = 'login';

    public const ACTION_LOGOUT = 'logout';

    public const ACTION_REGISTER = 'register';

    /** სექციაში/მოდულში შესვლა (§4.1) */
    public const ACTION_VISIT = 'visit';

    public const ACTION_CREATE = 'create';

    public const ACTION_UPDATE = 'update';

    public const ACTION_DELETE = 'delete';

    /**
     * ჩატის წერილის წაშლა (§4.6) — ჩვეულებრივი `delete` განზრახ არ არის:
     * ამ რიგებს გასუფთავება ვერ ეხება (იხ. `PROTECTED_ACTIONS`).
     */
    public const ACTION_CHAT_DELETE = 'chat_delete';

    /** სრული ნაკრები — ფილტრისთვისაც და ვალიდაციისთვისაც */
    public const ACTIONS = [
        self::ACTION_LOGIN,
        self::ACTION_LOGOUT,
        self::ACTION_REGISTER,
        self::ACTION_VISIT,
        self::ACTION_CREATE,
        self::ACTION_UPDATE,
        self::ACTION_DELETE,
        self::ACTION_CHAT_DELETE,
    ];

    /**
     * ⚠️ **გასუფთავებას (§4.7) არ ექვემდებარება.** წაშლილი წერილის აღდგენა
     * `messages`-ის რიგზე დგას, მაგრამ „**ვინ, როდის და რა მეთოდით** წაშალა"
     * მხოლოდ აქ წერია (§4.6). ლოგის მასობრივი წმენდა ამ ჩანაწერს რომ
     * წაშლიდეს, აღდგენა შესაძლებელი დარჩებოდა, აღრიცხვა კი — არა.
     */
    public const PROTECTED_ACTIONS = [self::ACTION_CHAT_DELETE];

    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected $casts = [
        'old_values' => 'array',
        'new_values' => 'array',
        'context' => 'array',
        'created_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** გასუფთავებადი რიგები — ერთი წყარო კონტროლერის დათვლისა და წაშლისთვის */
    public function scopeCleanable(Builder $q): Builder
    {
        return $q->whereNotIn('action', self::PROTECTED_ACTIONS);
    }
}
