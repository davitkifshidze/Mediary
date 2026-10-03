<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasTrash;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ადგილის შენახული მარშრუტი (Tasks §30.4) — ჩემი მდებარეობიდან ადგილამდე,
 * OSRM-ის პასუხი არჩევის მომენტში: მანძილი, დრო, გეომეტრია polyline-ად.
 *
 * ⚠️ **საწყისი წერტილი მარშრუტის ნაწილია** (`from_lat`/`from_lng`): იგივე
 * ადგილამდე სახლიდან და სამსახურიდან ორი სხვადასხვა მარშრუტია და ორივე
 * ინახება — ამიტომაც აქვს სახელი.
 *
 * ⚠️ **ურნა (Tasks §29)** — `destroy()` `moveToTrash()`-ს იძახის; ადგილის
 * საბოლოო წაშლა მარშრუტებს `trash` scope-ის გარეშე პოულობს და შლის.
 */
class PlaceRoute extends Model
{
    use BelongsToUser, HasTrash;

    /** OSRM-ის პროფილები — ერთი სია `RouteClient`-თან */
    public const PROFILES = ['driving', 'foot', 'bike'];

    protected $guarded = ['id'];

    protected $casts = [
        'distance_m' => 'integer',
        'duration_s' => 'integer',
        // ⚠️ `decimal` და არა `float` — `Place::$lat`-ის იგივე მიზეზით
        'from_lat' => 'decimal:7',
        'from_lng' => 'decimal:7',
        'chosen_at' => 'datetime',
    ];

    public function place(): BelongsTo
    {
        return $this->belongsTo(Place::class);
    }
}
