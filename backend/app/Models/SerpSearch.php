<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * **ერთი დახარჯული SerpApi-ის ძებნა (Tasks §7.6.1)**.
 *
 * ⚠️ **რიგი მხოლოდ მაშინ იწერება, როცა ძებნა მართლა დაიხარჯა.** ქეშიდან
 * დაბრუნებული პასუხი აქ არ ჩანს — სწორედ ესაა ქეშის აზრი (§7.6.1: „ჩვენს
 * მხარეს ქეშირებული პასუხი საერთოდ არ ხარჯავს ძებნას"). ჩავარდნილი რექვესთიც
 * არ იწერება: SerpApi შეცდომას არ გვახარჯვინებს და მისი დათვლა მრიცხველს
 * ტყუილად ამოწურავდა.
 *
 * ⚠️ **`BelongsToUser` განზრახ არ გამოიყენება** — `user_id` აქ „ვინ დახარჯა"
 * არის და არა „ვისია ეს ჩანაწერი" (`AuditLog`-ის ზუსტი პრეცედენტი). კვოტა
 * **ანგარიშისაა და არა მომხმარებლისა**, ე.ი. სხვისი ხარჯის დამალვა ჯამს
 * უბრალოდ მცდარს გახდიდა.
 */
class SerpSearch extends Model
{
    protected $fillable = [
        'user_id',
        'engine',
        'query',
        'fingerprint',
        'results',
    ];

    protected function casts(): array
    {
        return [
            'results' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
