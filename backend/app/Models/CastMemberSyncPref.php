<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * „აღარ განაახლო" მსახიობზე — **თითო მომხმარებლის** პარამეტრი (Tasks §31.3).
 *
 * ⚠️ მსახიობი გლობალური ლექსიკონია (`cast_members`), ე.ი. გადამრთველი
 * სვეტად ვერ დაჯდებოდა: ერთი მომხმარებლის „აღარ" სხვის გეგმას შეცვლიდა.
 * რიგი არსებობს = შეჩერებულია; მოხსნა რიგს შლის. ⚠️ `AuditRegistry::NOT_LOGGED`
 * და `RegistryConsistencyTest::NOT_TRASHED` — პარამეტრია და არა შიგთავსი.
 */
class CastMemberSyncPref extends Model
{
    use BelongsToUser;

    protected $guarded = ['id'];

    protected $casts = [
        'paused_at' => 'datetime',
    ];

    public function castMember(): BelongsTo
    {
        return $this->belongsTo(CastMember::class);
    }
}
