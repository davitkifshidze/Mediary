<?php

namespace App\Models;

use App\Services\Sync\SyncHistory;
use App\Support\RecordLocks;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;

/**
 * **გაშვების ერთი ერთეული** — რა დაბრუნდა, რატომ და რა შეიცვალა: ველების სია
 * (`changes`) და რა რით (`details` — `SyncFacts`).
 *
 * ⚠️ `user_id` არ აქვს — მფლობელი გაშვებაა (`sync_run_id`), და ყოველი მკითხველი
 * ჯერ ჩემს გაშვებას პოულობს (`SyncRun`-ის `owner` scope).
 * ⚠️ სათაური **ასლია** (ჩანაწერი მოგვიანებით შეიძლება წაიშალოს) — სწორედ ამიტომ
 * ყოველი წაკითხვა `visible()`-ზე გადის: მერე ჩაკეტილი ჩანაწერის სათაური და
 * მნიშვნელობები ისტორიიდან არ უნდა გაჟონოს.
 */
class SyncRunItem extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'record_id' => 'integer',
        'changes' => 'array',
    ];

    public function run(): BelongsTo
    {
        return $this->belongsTo(SyncRun::class, 'sync_run_id');
    }

    /**
     * რა რით შეიცვალა — სია (`SyncFacts::between()`).
     *
     * ⚠️ `array` cast-ის ნაცვლად საკუთარი ჩაწერა: ნაგულისხმევი JSON ქართულ ასოს
     * `\u10d8`-ად წერს — ექვსი ბაიტი ერთ ასოზე, აქ კი მთელი აღწერებია.
     */
    protected function details(): Attribute
    {
        return Attribute::make(
            get: fn (?string $value) => $value === null ? null : json_decode($value, true),
            set: fn (?array $value) => $value === null || $value === []
                ? null
                : json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE),
        );
    }

    /**
     * ჩაკეტილი (ამ სესიაში დაუხსნელი) ჩანაწერის ერთეულის გარეშე — სია, რიცხვები, ძებნა.
     *
     * ⚠️ მედიის ტიპი თვითონ morph-ალიასია (`movie`…), მსახიობი კი ისტორიაში `actor`-ია
     * და ლოკში `cast_member` — ამიტომ მასზე ცალკე პირობაა. ⚠️ შესვლის გარეშე (CLI)
     * არაფერი იჭრება — ბრძანება ყველაფერს ხედავს (`owner`-ის წესი).
     */
    public function scopeVisible(Builder $query): Builder
    {
        if (! Auth::id()) {
            return $query;
        }

        $type = $this->qualifyColumn('type');
        $id = $this->qualifyColumn('record_id');

        RecordLocks::excludeMorph($query, $type, $id);

        return $query->where(fn (Builder $either) => $either
            ->where($type, '!=', SyncHistory::ACTOR)
            ->orWhere(fn (Builder $actor) => RecordLocks::exclude($actor->where($type, SyncHistory::ACTOR), (new CastMember)->getMorphClass(), $id)));
    }
}
