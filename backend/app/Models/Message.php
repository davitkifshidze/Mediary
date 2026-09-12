<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ჩატის შეტყობინება (Tasks §16.3).
 *
 * **მედია გაკეთდა 2026-09-06-ს** (`DECISIONS.md` §1: „ქრება ორივესთან").
 *
 * ⚠️ **„ფაილი წაშლილია" ცალკე დროშა არ არის და არც სჭირდება.** მედიის
 * შეტყობინება ფაილის გარეშე ვერასდროს იქმნება (ატვირთვა სავალდებულოა),
 * ე.ი. `type ∈ MEDIA_TYPES` + ცარიელი `attachment_path` **ცალსახად**
 * ნიშნავს „გამგზავნმა წაშალა". სვეტის დამატება იმავეს იტყოდა, ოღონდ
 * მიგრაციითა და ორი ურთიერთსაწინააღმდეგო წყაროს რისკით.
 */
class Message extends Model
{
    /** §16.3 — შეტყობინების ტიპები */
    public const TYPES = ['text', 'emoji', 'gif', 'image', 'video', 'file'];

    /** ტიპები, რომლებიც ატვირთვას ითხოვს */
    public const MEDIA_TYPES = ['image', 'video', 'file'];

    /** წაშლის სკოუპი (§4.6) — `self` მხოლოდ წამშლელთან, `both` ორივესთან */
    public const REMOVAL_SCOPES = ['self', 'both'];

    protected $guarded = ['id'];

    protected $casts = [
        'attachment_size' => 'integer',
        'removed_at' => 'datetime',
    ];

    /**
     * **ამ მომხმარებლისთვის ხილული წერილები (§4.6)**.
     *
     * ⚠️ **`SoftDeletes` განზრახ არ გამოიყენება და სვეტსაც `deleted_at`
     * არ ჰქვია**: „მხოლოდ ჩემთან წაშლილი" მეორე მხარეს **უნდა** უჩანდეს,
     * global scope კი ორივესგან დამალავდა. ე.ი. ხილვადობა ყოველთვის
     * კონკრეტული user-ის ჭრილშია და ცხადად ითქმის.
     */
    public function scopeVisibleTo(Builder $query, int $userId): Builder
    {
        return $query->where(fn (Builder $q) => $q
            ->whereNull('removed_at')
            ->orWhere(fn (Builder $s) => $s
                ->where('removed_scope', 'self')
                ->where('removed_by', '!=', $userId)));
    }

    /** მედიის შეტყობინებაა და ფაილი აღარ არსებობს (იხ. კლასის შენიშვნა) */
    public function attachmentDeleted(): bool
    {
        return in_array($this->type, self::MEDIA_TYPES, true) && ! $this->attachment_path;
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
