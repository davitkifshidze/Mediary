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
 * ⚠️ **გაშვებამ იცის, რაზე და რით გაეშვა**: `plan` (ტიპი → id-ები) და `params` —
 * გაწყვეტილი გაშვება ამით გრძელდება (`SyncResume`). `batch_id` ის ფონური პარტიაა,
 * რომელიც გაშვებას ახლა ავსებს; გაგრძელებაზე იცვლება, გასაღები — არა.
 */
class SyncRun extends Model
{
    use BelongsToUser, MassPrunable;

    /** რამდენ დღეს ინახება ისტორია; ერთეულები გაშვებასთან ერთად იშლება (FK) */
    public const KEEP_DAYS = 90;

    /** გაშვების მდგომარეობები: მიმდინარეობს · გაწყდა (ერთეულები დარჩა და აღარ მიდის) · დასრულდა */
    public const RUNNING = 'running';

    public const INTERRUPTED = 'interrupted';

    public const FINISHED = 'finished';

    /**
     * სიის query-სთვის: ყველაფერი დაგეგმილი სიის გარდა. `plan` ათასობით id შეიძლება იყოს
     * და სიას მხოლოდ ის სჭირდება, არსებობს თუ არა (`planned`).
     */
    public const LIST_COLUMNS = ['id', 'user_id', 'key', 'kind', 'source', 'total', 'params', 'batch_id', 'stopped_at', 'created_at', 'updated_at'];

    protected $guarded = ['id'];

    protected $casts = [
        'total' => 'integer',
        'params' => 'array',
        'plan' => 'array',
        'stopped_at' => 'datetime',
    ];

    public function getRouteKeyName(): string
    {
        return 'key';
    }

    public function items(): HasMany
    {
        return $this->hasMany(SyncRunItem::class);
    }

    /** სიის query: `plan`-ის გარეშე, მის ნაცვლად — `planned` (არსებობს თუ არა) */
    public function scopeForList(Builder $query): Builder
    {
        return $query->select(self::LIST_COLUMNS)->selectRaw('case when plan is null then 0 else 1 end as planned');
    }

    /** დაგეგმილი სია ინახება? — სიის query-ზე `planned` სვეტიდან, სრულ მოდელზე თვითონ `plan`-იდან */
    public function hasPlan(): bool
    {
        return array_key_exists('planned', $this->attributes)
            ? (bool) $this->attributes['planned']
            : $this->plan !== null;
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
