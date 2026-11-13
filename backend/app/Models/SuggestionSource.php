<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * **გარე წყაროს პასუხი ერთ სათაურზე** — „შემოთავაზებების" გლობალური ქეში.
 *
 * ⚠️ `user_id` არ აქვს: „რა ჰგავს ამ ფილმს" ყველა ანგარიშზე ერთი და იგივეა, ამიტომ
 * ერთი სათაური წყაროს ერთხელ ეკითხება, ვინც არ უნდა იკითხოს. მკითხველი და მწერალი
 * ერთია — `SuggestionSources`.
 */
class SuggestionSource extends Model
{
    /** რეკომენდაციები, მსგავსი სათაურები, საკვანძო სიტყვები, ჟანრები და აღწერა */
    public const TMDB = 'tmdb';

    public const TRAKT = 'trakt';

    public const ANILIST = 'anilist';

    /** ერთი სათაურის მოკლე აღწერა — როცა ის მხოლოდ დამატებითმა წყარომ მოიტანა */
    public const TITLE = 'title';

    protected $guarded = ['id'];

    protected $casts = [
        'tmdb_id' => 'integer',
        'payload' => 'array',
        'fetched_at' => 'datetime',
    ];
}
