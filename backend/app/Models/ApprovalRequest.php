<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ადმინთან გასაგზავნი მოთხოვნა — მოდულის ჩართვა, გლობალური ჟანრის წაშლა,
 * საცავის ლიმიტის გაზრდა (17.4) ან ატვირთვის ლიმიტი (§34.5).
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

    /**
     * Tasks §34.5 — ატვირთვის ლიმიტის მოთხოვნა: `payload` = `kind`, `formats`
     * (**მხოლოდ ახალი** — ის, რაც მოთხოვნის მომენტში არ ჰქონდა), `max_kb`
     * (`null` = ზომა არ იცვლება) და მომენტის კონტექსტი (`current_*`).
     * დამტკიცებისას ადმინი ირჩევს, ვისზე ვრცელდება — `granted_scope`
     * (`user` ნაგულისხმევი — პირადი გამონაკლისი · `all` — ინსტალაციის ლიმიტი).
     */
    public const TYPE_UPLOAD = 'upload_limit';

    /** @var list<string> — `granted_scope`-ის მნიშვნელობები */
    public const UPLOAD_SCOPES = ['user', 'all'];

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
