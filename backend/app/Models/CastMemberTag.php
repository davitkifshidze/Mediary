<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * **მსახიობზე გაწერილი საძიებო ტეგები (Tasks §7.5)**.
 *
 * ⚠️ **ეს `cast_members`-ის სვეტი ვერ იქნებოდა** — ის გლობალური ლექსიკონია
 * (ერთი მსახიობი ყველა ანგარიშზე ერთი რიგია, `genres`-ის წესით), ე.ი. იქ
 * ჩაწერილ ტეგებს ყველა დაინახავდა და ერთმანეთს გადააწერდნენ. აქ კი
 * `BelongsToUser` ჩვეულებრივად მუშაობს: სხვისი ნაკრები უბრალოდ არ ჩანს.
 *
 * ⚠️ **ტეგები `Video::normalizeTags()`-ზე გადის** — დუბლის შედარება ყველგან
 * ერთნაირი უნდა იყოს (არსებული წესი: ერთი წყარო ტეგების ნორმალიზაციაზე).
 */
class CastMemberTag extends Model
{
    use BelongsToUser;

    protected $fillable = ['user_id', 'cast_member_id', 'tags'];

    protected $casts = [
        'tags' => 'array',
    ];

    public function castMember(): BelongsTo
    {
        return $this->belongsTo(CastMember::class);
    }

    /**
     * მომხმარებლის ტეგები ერთ მსახიობზე.
     *
     * @return list<string>
     */
    public static function forActor(int $userId, int $castMemberId): array
    {
        $tags = static::withoutGlobalScope('owner')
            ->where('user_id', $userId)
            ->where('cast_member_id', $castMemberId)
            ->value('tags');

        return is_array($tags) ? array_values(array_filter($tags, 'is_string')) : [];
    }
}
