<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * საუბარი ორ მომხმარებელს შორის (Tasks §16.3).
 *
 * ⚠️ **`BelongsToUser` განზრახ არ გამოიყენება.** მისი `owner` global scope
 * „ჩანაწერს ერთი მფლობელი ჰყავს" დაშვებაზეა აგებული; საუბარი კი
 * განსაზღვრებით ორისაა და scope-ი მას ერთ მხარეს მოაჭრიდა. წვდომას
 * **მონაწილეობა** წყვეტს და ის ცხადად მოწმდება.
 */
class Conversation extends Model
{
    /**
     * **ჩატის თემები (Tasks §10.6).**
     *
     * ⚠️ **ეს გასაღებია და არა hex.** ფერები SPA-შია (ღია და
     * მუქი ვარიანტით), ე.ი. პალიტრის შეცვლა ბაზას არ ეხება —
     * `modules.color`-ის საპირისპირო შემთხვევა, სადაც ფერი მართლა მონაცემია.
     */
    public const THEMES = ['default', 'ocean', 'forest', 'sunset', 'rose', 'graphite'];

    protected $guarded = ['id'];

    protected $casts = [
        'last_message_at' => 'datetime',
    ];

    /**
     * **ორი მხარის გასაღები — „ერთი წყვილი, ერთი საუბარი"** (Tasks BUG-07).
     *
     * ⚠️ **დალაგებული და არა „ვინ დაიწყო"**: გასაღები მიმართულებისგან
     * დამოუკიდებელი უნდა იყოს, თორემ A→B და B→A ორ სხვადასხვა რიგად
     * დაჯდებოდა და `conversations.pair_key`-ის unique ინდექსი არაფერს
     * დაიცავდა — ე.ი. ზუსტად ის რბოლა დარჩებოდა, რომლისთვისაც ის დაიდო.
     */
    public static function pairKey(int $a, int $b): string
    {
        return min($a, $b).':'.max($a, $b);
    }

    /**
     * ⚠️ **დადუმება პივოტზეა და არა საუბარზე** (§10.5): ერთმა
     * მონაწილემ შეუძლია დაადუმოს, მეორეს — არა. `theme` პირიქით
     * საუბრისაა, რადგან Messenger-ში ორივე ერთსა და იმავე ფერს ხედავს.
     */
    public function participants(): BelongsToMany
    {
        return $this->belongsToMany(User::class)
            ->withPivot(['last_read_at', 'muted_at', 'muted_until'])
            ->withTimestamps();
    }

    /** §10.11 — ვინ რას ეძახება ამ საუბარში */
    public function nicknames(): HasMany
    {
        return $this->hasMany(ConversationNickname::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }

    public function lastMessage(): HasMany
    {
        return $this->messages()->latest('id')->limit(1);
    }

    /** მონაწილეობს თუ არა ეს user — წვდომის ერთადერთი კრიტერიუმი */
    public function has(int $userId): bool
    {
        return $this->participants->contains('id', $userId)
            || $this->participants()->whereKey($userId)->exists();
    }

    /** მეორე მხარე (1:1 საუბარი) */
    public function otherThan(int $userId): ?User
    {
        return $this->participants->firstWhere('id', '!=', $userId);
    }
}
