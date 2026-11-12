<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Support\AppTime;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * **სინქრონიზაციის ერთი გაშვება** — ისტორიის რიგი (`SyncHistory` წერს).
 *
 * ⚠️ **მისამართში გასაღებითაა** (`key`, UUID): ფონურ პარტიაზე ეს პარტიის id-ია,
 * ბრაუზერის რიგზე — რიგის მიერ გენერირებული; რიგის id არც ერთმა არ იცის.
 * ⚠️ რიცხვები (რამდენი განახლდა / ჩავარდა) აქ **არ ინახება** — ერთეულებიდან
 * ითვლება, რომ ჩაკეტილი ჩანაწერის ერთეული არც რიცხვში მოხვდეს.
 */
class SyncRun extends Model
{
    use BelongsToUser, MassPrunable;

    /** რამდენ დღეს ინახება ისტორია; ერთეულები გაშვებასთან ერთად იშლება (FK) */
    public const KEEP_DAYS = 90;

    protected $guarded = ['id'];

    protected $casts = [
        'total' => 'integer',
    ];

    public function getRouteKeyName(): string
    {
        return 'key';
    }

    public function items(): HasMany
    {
        return $this->hasMany(SyncRunItem::class);
    }

    /**
     * ⚠️ `owner` სკოუპი ცხადად ეხსნება (`BatchItem`-ის წესი): `model:prune` ვებიდან
     * გაშვებისას მხოლოდ ერთი ანგარიშის რიგებს წაშლიდა. ზომავს **ბოლო ერთეულის**
     * დროს (`updated_at`) — გრძელი გაშვება შუაში არ იჭრება.
     */
    public function prunable(): Builder
    {
        return static::withoutGlobalScope('owner')
            ->where('updated_at', '<', AppTime::now()->subDays(self::KEEP_DAYS));
    }
}
