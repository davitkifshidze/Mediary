<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * მსახიობის ლოკალიზებული ტექსტი — სახელი და (ქართულად) ბიოგრაფია.
 *
 * ⚠️ `name_source` / `biography_source` ამბობს, რამ დაწერა ტექსტი: `tmdb` · `translation`
 * (მანქანამ — გადასამოწმებელია) · `manual` (ადამიანმა დაწერა ან დაადასტურა); `null` —
 * ძველი რიგი, გადასამოწმებლად არ ითვლება.
 */
class CastMemberTranslation extends Model
{
    public const SOURCE_TMDB = 'tmdb';

    /** მანქანური ტექსტი — მსახიობის გვერდზე „გადასამოწმებელია" ნიშნით */
    public const SOURCE_TRANSLATION = 'translation';

    public const SOURCE_MANUAL = 'manual';

    protected $fillable = ['locale', 'name', 'biography', 'name_source', 'biography_source'];

    public function castMember(): BelongsTo
    {
        return $this->belongsTo(CastMember::class);
    }
}
