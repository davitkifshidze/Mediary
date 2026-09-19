<?php

namespace App\Models;

use App\Support\AppTime;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\MassPrunable;
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
    use MassPrunable;

    /**
     * რამდენი თვე ვინახავთ (Tasks DEBT-24).
     *
     * ⚠️ **კვოტის ფანჯარა ერთი თვეა** (გეგმა 7 რიცხვში განახლდება), ე.ი.
     * ამაზე ძველი რიგი მრიცხველს ვეღარაფერში ემსახურება — სამი თვე
     * ისტორიისთვისაა და არა დათვლისთვის.
     */
    public const KEEP_MONTHS = 3;

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

    /**
     * ⚠️ **`MassPrunable` და არა `Prunable`**: წაშლა ერთი query-ია, მოვლენების
     * გარეშე. ეს მოდელი `AuditRegistry::NOT_LOGGED`-შია, ე.ი. observer-ს
     * ისედაც არაფერი ეთქმოდა — სამაგიეროდ ათასობით მოდელის ჩატვირთვა
     * მხოლოდ იმისთვის, რომ წაიშალოს, სუფთა ფუჭი ხარჯია.
     */
    public function prunable(): Builder
    {
        return static::where('created_at', '<', AppTime::now()->subMonths(self::KEEP_MONTHS));
    }
}
