<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * ჩატის შეტყობინება.
 *
 * **მედია გაკეთდა 2026-09-06-ს** („ქრება ორივესთან").
 *
 * ⚠️ **„ფაილი წაშლილია" ცალკე დროშა არ არის და არც სჭირდება.** მედიის
 * შეტყობინება ფაილის გარეშე ვერასდროს იქმნება (ატვირთვა სავალდებულოა),
 * ე.ი. `type ∈ MEDIA_TYPES` + ცარიელი `attachment_path` **ცალსახად**
 * ნიშნავს „გამგზავნმა წაშალა". სვეტის დამატება იმავეს იტყოდა, ოღონდ
 * მიგრაციითა და ორი ურთიერთსაწინააღმდეგო წყაროს რისკით.
 */
class Message extends Model
{
    /** შეტყობინების ტიპები */
    public const TYPES = ['text', 'emoji', 'gif', 'image', 'video', 'file', 'record'];

    /**
     * გაზიარებული ჩანაწერი.
     *
     * ⚠️ **`MEDIA_TYPES`-ში არ არის და ეს არსებითია**: ის სია იმას
     * ნიშნავს, რომ წერილს **ფაილი** აცვია (დისკზე, კვოტაში), და
     * სწორედ ამაზე დგას `attachmentDeleted()`. გაზიარებული ჩანაწერი
     * მხოლოდ მითითებაა — დისკზე არაფერი იწერება და კვოტა არ იხარჯება.
     */
    public const TYPE_RECORD = 'record';

    /** ტიპები, რომლებიც ატვირთვას ითხოვს */
    public const MEDIA_TYPES = ['image', 'video', 'file'];

    /**
     * წაშლის სკოუპი — `self` მხოლოდ წამშლელთან, `both` ორივესთან.
     *
     * ⚠️ **ეს API-ს ლექსიკონია და არა სვეტის მნიშვნელობები**.
     * ორი სკოუპი ორ **სხვადასხვა ადგილას** ინახება:
     * `both` — `removed_at`/`removed_by`-ში (ფაქტი შეტყობინებისაა),
     * `self` — `message_hides`-ში (ფაქტი **მაყურებლისაა**).
     */
    public const REMOVAL_SCOPES = ['self', 'both'];

    protected $guarded = ['id'];

    protected $casts = [
        'attachment_size' => 'integer',
        'removed_at' => 'datetime',
        // დაპინვა `removed_at`/`removed_by`-ის ზუსტი ფორმით
        'pinned_at' => 'datetime',
        // დომენი, id, გლობალური იდენტობა და სათაური
        'record' => 'array',
    ];

    /** დაპინილია ზუსტად მაშინ, როცა დროშტამპი არსებობს */
    public function isPinned(): bool
    {
        return $this->pinned_at !== null;
    }

    /** რეაქციები; თითო კაცზე ერთი */
    public function reactions(): HasMany
    {
        return $this->hasMany(MessageReaction::class);
    }

    /** ვინ დაიმალა ეს წერილი **თავისთვის** */
    public function hides(): HasMany
    {
        return $this->hasMany(MessageHide::class);
    }

    /**
     * **ამ მომხმარებლისთვის ხილული წერილები**.
     *
     * ⚠️ **`SoftDeletes` განზრახ არ გამოიყენება და სვეტსაც `deleted_at`
     * არ ჰქვია**: „მხოლოდ ჩემთან წაშლილი" მეორე მხარეს **უნდა** უჩანდეს,
     * global scope კი ორივესგან დამალავდა. ე.ი. ხილვადობა ყოველთვის
     * კონკრეტული user-ის ჭრილშია და ცხადად ითქმის.
     *
     * ⚠️ **ორი პირობა ორი სხვადასხვა ფაქტისაა**:
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
