<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * **ერთი შესვლა ჩანაწერზე** (Tasks §10).
 *
 * ⚠️ **`BelongsToUser` განზრახ არ არის**: იქ `user_id` მფლობელია, აქ კი
 * მნახველი. მფლობელი `owner_id`-შია და წაკითხვა მასზე იფილტრება
 * (`RecordVisits::summary()`), თორემ შენს ჩანაწერზე სხვისი შესვლა შენ
 * ვერ დაინახავდი — ეს კი ჟურნალის მთელი აზრია („ვინ, სად შევიდა").
 *
 * ⚠️ `timestamps` არ აქვს — `visited_at` ერთადერთი დროა და ის ფაქტია, არა
 * რიგის ტექნიკური ნიშანი.
 */
class RecordVisit extends Model
{
    public const SOURCE_LIBRARY = 'library';

    public const SOURCE_PUBLIC = 'public';

    public const SOURCE_SHARE = 'share';

    public const SOURCES = [self::SOURCE_LIBRARY, self::SOURCE_PUBLIC, self::SOURCE_SHARE];

    public $timestamps = false;

    protected $guarded = ['id'];

    protected $casts = [
        'owner_id' => 'integer',
        'user_id' => 'integer',
        'visitable_id' => 'integer',
        'visited_at' => 'datetime',
    ];

    public function visitable(): MorphTo
    {
        return $this->morphTo();
    }

    /** ვინ შევიდა — ანონიმზე `null` */
    public function viewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }
}
