<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ადმინთან გასაგზავნი მოთხოვნა — მოდულის ჩართვა, გლობალური ჟანრის წაშლა
 * ან საცავის ლიმიტის გაზრდა (17.4).
 *
 * ტიპების ნაკრები **აქ ცხოვრობს** და არა ბაზის enum-ში: ახალი ტიპი =
 * ერთი კონსტანტა + ერთი handler `AdminRequestController::approve()`-ში.
 */
class ApprovalRequest extends Model
{
    public const TYPE_MODULE = 'module_access';

    public const TYPE_GENRE_DELETE = 'genre_delete';

    /** 17.4 — `payload.requested_bytes` = **სასურველი სრული ლიმიტი** და არა მატება */
    public const TYPE_STORAGE = 'storage_increase';

    protected $guarded = ['id'];

    protected $casts = [
        'payload' => 'array',
        'reviewed_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function module(): BelongsTo
    {
        return $this->belongsTo(Module::class);
    }

    public function genre(): BelongsTo
    {
        return $this->belongsTo(Genre::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function scopePending(Builder $q): Builder
    {
        return $q->where('status', 'pending');
    }
}
