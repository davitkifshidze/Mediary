<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * **„არ მაინტერესებს"** — სათაური, რომელიც ამ მოდულში აღარ შემომთავაზდება.
 *
 * ⚠️ `BelongsToUser`-ის გარეშე: რიგებს `SuggestionEngine` და კონტროლერი ყოველთვის
 * ცხადი `user_id`-ით კითხულობენ და წერენ (`FranchiseReminder`-ის წესი).
 * ⚠️ სათაური, წელი და პოსტერი აქვე ინახება — „დამალულების" სია წყაროს არ ეკითხება
 * და ქეშის გასუფთავების შემდეგაც იხატება.
 */
class HiddenSuggestion extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'user_id' => 'integer',
        'tmdb_id' => 'integer',
        'year' => 'integer',
    ];
}
