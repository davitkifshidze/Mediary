<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * **ჩემი დამოკიდებულება ფრანჩაიზის ნაწილთან**: უკვე მეცნობა (`notified_at`) ან ვთქვი
 * „აღარ შემახსენო" (`muted_at`). `tmdb_id = 0` — მთელი ფრანჩაიზი.
 *
 * ⚠️ `BelongsToUser`-ის გარეშე: რიგებს `FranchiseTracker` ყოველთვის ცხადი `user_id`-ით
 * კითხულობს და წერს — ღამის ბრძანებაც, სადაც `Auth` ხელით ისმება.
 */
class FranchiseReminder extends Model
{
    /** მთელი ფრანჩაიზის რიგი */
    public const WHOLE = 0;

    protected $guarded = ['id'];

    protected $casts = [
        'user_id' => 'integer',
        'tmdb_collection_id' => 'integer',
        'tmdb_id' => 'integer',
        'notified_at' => 'datetime',
        'muted_at' => 'datetime',
    ];
}
