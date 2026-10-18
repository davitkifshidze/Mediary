<?php

namespace App\Models\Concerns;

use App\Support\RecordLocks;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\Auth;

/**
 * **ჩაკეტილი ჩანაწერი იმალება ყველგან** — ფილმი, სერიალი, ანიმე.
 *
 * ⚠️ **სამი სახე, სამი კითხვა:**
 *  · global scope `record_lock` — სიები და ძებნა: **დამალული** (ჩაკეტილი და ამ
 *    სესიაში დაუხსნელი) არ ჩანს, გახსნილი — ჩვეულებრივად (`RecordLocks::exclude()`);
 *  · `withoutLocked()` — ჯამები, სტატისტიკა, საჯარო, გაზიარება, ექსპორტი, „რა ვნახო
 *    დღეს", სინქრონიზაციის გეგმა: **ყველა** ჩაკეტილი გარეთაა, სესიის მიუხედავად
 *    („ჯამები ჩაკეტილის გარეშე ითვლება");
 *  · `onlyLocked()` — ფილტრი „ჩაკეტილები": მხოლოდ ჩემი ჩაკეტილები, დამალულიც.
 *
 * ⚠️ **მისამართის მიბმა დამალულსაც პოულობს** (`resolveRouteBindingQuery()`) —
 * თორემ ჩანაწერის გვერდი 404 იქნებოდა და ბოქლომის ეკრანი ვერ დაიხატებოდა.
 * დანარჩენ კარს `EnsureRecordOwnership` კეტავს: დამალულზე ყველაფერი 423-ია,
 * გარდა თვითონ გვერდისა (`GET …/{record}` — ბოქლომიანი ბარათი) და ლოკის კარებისა.
 *
 * ⚠️ `HasRecordLock`-ს თვითონ იყენებს — საბოლოო წაშლა ლოკის რიგსაც შლის.
 */
trait HidesLockedRecords
{
    use HasRecordLock;

    protected static function bootHidesLockedRecords(): void
    {
        static::addGlobalScope('record_lock', function (Builder $query) {
            $model = $query->getModel();
            RecordLocks::exclude($query, $model->getMorphClass(), $model->qualifyColumn($model->getKeyName()));
        });
    }

    /** ჯამები, საჯარო, ექსპორტი — **ყველა** ჩაკეტილის გარეშე, სესიის მიუხედავად */
    public function scopeWithoutLocked(Builder $query): Builder
    {
        $model = $query->getModel();

        return RecordLocks::exclude(
            $query->withoutGlobalScope('record_lock'),
            $model->getMorphClass(),
            $model->qualifyColumn($model->getKeyName()),
            session: false,
        );
    }

    /**
     * **ამ ადამიანის ყველა ჩაკეტილის გარეშე** — გლობალურ ჩანაწერზე (მსახიობი):
     * ჩემი სტატისტიკა და ჩემი საჯარო გალერეა ჩემს ლოკებს ითვალისწინებს, სხვისას — არა.
     */
    public function scopeWithoutLockedBy(Builder $query, int $userId): Builder
    {
        $model = $query->getModel();

        return RecordLocks::exclude(
            $query->withoutGlobalScope('record_lock'),
            $model->getMorphClass(),
            $model->qualifyColumn($model->getKeyName()),
            owner: $userId,
        );
    }

    /** ფილტრი „ჩაკეტილები" — ჩემი ჩაკეტილები, დამალულიც და გახსნილიც */
    public function scopeOnlyLocked(Builder $query): Builder
    {
        $model = $query->getModel();

        return $query->withoutGlobalScope('record_lock')->whereExists(fn (QueryBuilder $sub) => $sub
            ->selectRaw('1')
            ->from('record_locks')
            ->where('record_locks.lockable_type', $model->getMorphClass())
            ->whereColumn('record_locks.lockable_id', $model->qualifyColumn($model->getKeyName()))
            ->where('record_locks.user_id', Auth::id()));
    }

    /** მისამართი დამალულსაც პოულობს — კარს `EnsureRecordOwnership` კეტავს (423) */
    public function resolveRouteBindingQuery($query, $value, $field = null)
    {
        $query = $query instanceof Model ? $query->newQuery() : $query;

        return $query->withoutGlobalScope('record_lock')->where($field ?? $this->getRouteKeyName(), $value);
    }

    /**
     * **ბოქლომიანი ბარათი** — სათაური და ლოკის ფაქტები; ⚠️ პოსტერი, აღწერა,
     * სტატუსი, ჟანრები და ყველა სხვა ველი სერვერიდან არ გამოდის.
     *
     * @return array<string, mixed>
     */
    public function lockedCard(): array
    {
        return [
            'id' => $this->getKey(),
            'title_ka' => $this->title_ka,
            'title_en' => $this->title_en,
            'hidden' => true,
            // ⚠️ ლოკის ველები მხოლოდ მფლობელს (საჯარო გზა ჩაკეტილს ისედაც არ აჩვენებს)
            ...RecordLocks::ownerState($this),
        ];
    }
}
