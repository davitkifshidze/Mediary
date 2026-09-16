<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

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

    /**
     * წაშლის სკოუპი (§4.6) — `self` მხოლოდ წამშლელთან, `both` ორივესთან.
     *
     * ⚠️ **ეს API-ს ლექსიკონია და არა სვეტის მნიშვნელობები** (აუდიტი
     * 2026-09-14, §B2). ორი სკოუპი ორ **სხვადასხვა ადგილას** ინახება:
     * `both` — `removed_at`/`removed_by`-ში (ფაქტი შეტყობინებისაა),
     * `self` — `message_hides`-ში (ფაქტი **მაყურებლისაა**).
     */
    public const REMOVAL_SCOPES = ['self', 'both'];

    protected $guarded = ['id'];

    protected $casts = [
        'attachment_size' => 'integer',
        'removed_at' => 'datetime',
        // §10.7 — დაპინვა `removed_at`/`removed_by`-ის ზუსტი ფორმით
        'pinned_at' => 'datetime',
    ];

    /** §10.7 — დაპინილია ზუსტად მაშინ, როცა დროშტამპი არსებობს */
    public function isPinned(): bool
    {
        return $this->pinned_at !== null;
    }

    /** §10.10 — რეაქციები; თითო კაცზე ერთი */
    public function reactions(): HasMany
    {
        return $this->hasMany(MessageReaction::class);
    }

    /** §4.6/§B2 — ვინ დაიმალა ეს წერილი **თავისთვის** */
    public function hides(): HasMany
    {
        return $this->hasMany(MessageHide::class);
    }

    /**
     * **ამ მომხმარებლისთვის ხილული წერილები (§4.6)**.
     *
     * ⚠️ **`SoftDeletes` განზრახ არ გამოიყენება და სვეტსაც `deleted_at`
     * არ ჰქვია**: „მხოლოდ ჩემთან წაშლილი" მეორე მხარეს **უნდა** უჩანდეს,
     * global scope კი ორივესგან დამალავდა. ე.ი. ხილვადობა ყოველთვის
     * კონკრეტული user-ის ჭრილშია და ცხადად ითქმის.
     *
     * ⚠️ **ორი პირობა ორი სხვადასხვა ფაქტისაა** (აუდიტი 2026-09-14, §B2):
     * `removed_at` — „ავტორმა ორივესთან წაშალა" (შეტყობინების ფაქტი) —
     * და `message_hides` — „მე დავიმალე" (მაყურებლის ფაქტი). ადრე ორივე
     * ერთ სამეულში ეწერა, ე.ი. **მეორე მხარის დამალვა პირველისას აუქმებდა**.
     */
    public function scopeVisibleTo(Builder $query, int $userId): Builder
    {
        return $query
            ->whereNull('removed_at')
            ->whereDoesntHave('hides', fn (Builder $q) => $q->where('user_id', $userId));
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
