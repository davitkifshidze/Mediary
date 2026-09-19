<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * **„ვნახე ეს ეპიზოდი" (FEAT-09) — ჩემი ფაქტი.**
 *
 * ⚠️ **რიგის არსებობა თვითონ არის პასუხი.** „ნანახია თუ არა" ლოგიკური
 * ფაქტია, ამიტომ `is_watched` სვეტი არ არსებობს — ორი წყარო ერთი ფაქტისა
 * (რიგი + დროშა) ზუსტად ის ხაფანგია, რომელსაც `Book::syncProgress()`
 * ებრძვის. `watched_at` მხოლოდ **როდის**-ს პასუხობს.
 *
 * ⚠️ **`AuditRegistry`-ში განზრახ არ არის**: ერთი მონიშვნა ერთი დაჭერაა და
 * სეზონის მონიშვნა ოცი — ლოგს ისინი ისევე დამარხავდნენ, როგორც ჩატის
 * რეაქციები (იგივე გადაწყვეტილება, §10.9).
 */
class EpisodeWatch extends Model
{
    use BelongsToUser;

    protected $guarded = ['id'];

    protected $casts = ['watched_at' => 'datetime'];

    public function episode(): BelongsTo
    {
        return $this->belongsTo(TvEpisode::class, 'tv_episode_id');
    }
}
