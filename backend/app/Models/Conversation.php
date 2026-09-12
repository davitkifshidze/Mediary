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
    protected $guarded = ['id'];

    protected $casts = [
        'last_message_at' => 'datetime',
    ];

    public function participants(): BelongsToMany
    {
        return $this->belongsToMany(User::class)->withPivot('last_read_at')->withTimestamps();
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
