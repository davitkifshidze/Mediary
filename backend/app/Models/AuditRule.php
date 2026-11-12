<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * **ჟურნალის ერთი წესი** — სახეობა · მოდული · მომხმარებელი → ჩართული / გამორთული.
 *
 * ⚠️ **პირდაპირ არსად იკითხება და არსად იწერება** — ერთადერთი მკითხველი და
 * მწერალი `App\Support\AuditRules`-ია: იქაა დონეების რიგი, მოთხოვნის ქეში და
 * ვადის შემოწმება. მოდელი იმისთვის არსებობს, რომ ჩაწერა **მოვლენებით** მოხდეს —
 * `AuditObserver` წესის ცვლილებას თვითონ წერს (`AuditRegistry::MODELS` → `admin`).
 *
 * ⚠️ `user_id` აქ **მფლობელი არ არის** — ის ანგარიშია, რომლის ქმედებებსაც წესი
 * ეხება; წესი ინსტალაციისაა (მთავარი ადმინის), ამიტომ `BelongsToUser` არ აქვს.
 */
class AuditRule extends Model
{
    protected $fillable = ['kind', 'module', 'user_id', 'enabled', 'expires_at', 'updated_by'];

    protected $casts = [
        'user_id' => 'integer',
        'enabled' => 'boolean',
        'expires_at' => 'datetime',
        'updated_by' => 'integer',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** ჟურნალში წესის სახელი: „click · movie · @alice" (ყველაზე — „*") */
    public function auditLabel(): string
    {
        $who = $this->user_id === null ? '*' : '@'.($this->user?->username ?? $this->user_id);

        return implode(' · ', [$this->kind, $this->module ?? '*', $who]);
    }
}
