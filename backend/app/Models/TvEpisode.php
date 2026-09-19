<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * **TMDB-ის ეპიზოდი (FEAT-09) — გლობალური ფაქტი.**
 *
 * `BelongsToUser` აქ **განზრახ არ არის**: ეპიზოდის სახელი და ეთერის თარიღი
 * ყველა ანგარიშისთვის ერთია, ზუსტად ისე, როგორც `Genre` და `CastMember`.
 * რაც ჩემია, `EpisodeWatch`-შია.
 *
 * ⚠️ `EnsureRecordOwnership` ამ მოდელს **ავტომატურად ტოვებს** — `user_id`
 * არ აქვს და policy-ც არ აქვს, ე.ი. „გლობალური ლექსიკონის" ტოტში ხვდება.
 */
class TvEpisode extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'tmdb_series_id' => 'integer',
        'season_number' => 'integer',
        'episode_number' => 'integer',
        'runtime' => 'integer',
        'air_date' => 'date',
    ];

    public function watches(): HasMany
    {
        return $this->hasMany(EpisodeWatch::class);
    }
}
