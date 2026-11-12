<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Support\AppTime;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * **მსახიობზე ჩემი ნიშნები — რჩეული და გახსნების მთვლელი.**
 *
 * ⚠️ `cast_members` გლობალური ლექსიკონია, ამიტომ „რჩეული" და „რამდენჯერ გავხსენი"
 * მომხმარებლის ცალკე რიგია (`CastMemberTag`-ის წესი); `BelongsToUser` სხვის რიგს მალავს.
 *
 * ⚠️ **მთვლელი დალაგებისთვისაა და არა სტატისტიკისთვის**: რიცხვი მხოლოდ მსახიობის
 * გვერდის `i`-ში ჩანს, ბარათზე — არა. ერთი მსახიობი წუთში ერთხელ ითვლება
 * (გვერდის განახლება და უკან დაბრუნება ახალი გახსნა არ არის).
 */
class ActorMark extends Model
{
    use BelongsToUser;

    /** რამდენ წამში ერთხელ ითვლება ერთი მსახიობის გახსნა */
    public const OPEN_WINDOW_SECONDS = 60;

    protected $fillable = ['user_id', 'cast_member_id', 'is_favorite', 'opens', 'last_opened_at'];

    protected $casts = [
        'is_favorite' => 'boolean',
        'opens' => 'integer',
        'last_opened_at' => 'datetime',
    ];

    public function castMember(): BelongsTo
    {
        return $this->belongsTo(CastMember::class);
    }

    /** ჩემი რიგი ამ მსახიობზე — არსებული ან ახალი (შეუნახავი) */
    public static function forActor(int $userId, int $castMemberId): self
    {
        return self::withoutGlobalScope('owner')->firstOrNew(['user_id' => $userId, 'cast_member_id' => $castMemberId]);
    }

    /**
     * გახსნის დათვლა — `true`, თუ მთვლელი გაიზარდა.
     *
     * ⚠️ ფანჯარა რიგის `last_opened_at`-ია და არა ქეში: ქეშის გასუფთავება მთვლელს
     * ორჯერ არ უნდა ზრდიდეს.
     */
    public static function countOpen(int $userId, int $castMemberId): bool
    {
        $mark = self::forActor($userId, $castMemberId);
        $now = AppTime::now();

        if ($mark->last_opened_at && $mark->last_opened_at->diffInSeconds($now, true) < self::OPEN_WINDOW_SECONDS) {
            return false;
        }

        $mark->opens = (int) $mark->opens + 1;
        $mark->last_opened_at = $now;
        $mark->save();

        return true;
    }

    /**
     * გახსნების განულება — ერთ მსახიობზე ან ყველაზე ერთად (`null`).
     *
     * ⚠️ რჩეულის ნიშანი რჩება: განულება მხოლოდ მთვლელს ეხება.
     */
    public static function resetOpens(int $userId, ?int $castMemberId = null): int
    {
        return self::withoutGlobalScope('owner')
            ->where('user_id', $userId)
            ->when($castMemberId !== null, fn ($q) => $q->where('cast_member_id', $castMemberId))
            ->where('opens', '>', 0)
            ->update(['opens' => 0, 'last_opened_at' => null]);
    }
}
