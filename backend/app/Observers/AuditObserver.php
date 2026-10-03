<?php

namespace App\Observers;

use App\Models\AuditLog;
use App\Services\Audit\AuditLogger;
use Illuminate\Database\Eloquent\Model;

/**
 * **დამატება / რედაქტირება / წაშლა → აუდიტ-ლოგი (Tasks §4.3)**.
 *
 * ეს observer **ერთხელ** ებმევა ყველა მოდელს `AuditRegistry::MODELS`-იდან
 * (`AppServiceProvider`-ის ციკლი), ე.ი. კონტროლერებში ლოგირების კოდი
 * საერთოდ არ წერია და ვერც დაგვავიწყდება.
 *
 * ⚠️ **`updated`-ზე მხოლოდ ნამდვილად შეცვლილი ველები იწერება**
 * (`getChanges()`), ორივე მხარე კი ერთი და იმავე გასაღებებით — სწორედ ეს
 * არის „ძველი და ახალი გვერდიგვერდ" (§4.1). სრული ჩანაწერის ორჯერ
 * ჩაწერა diff-ს წასაკითხს ვერ გახდიდა და ცხრილს რამდენჯერმე გაზრდიდა.
 *
 * ⚠️ **მხოლოდ `updated_at`-ის ცვლილება ლოგს არ ბადებს.** `touch()`-ს
 * მრავალი კავშირი აკეთებს (ფაილის მიმაგრება, კვოტის განახლება) და
 * თითოეული ცარიელ „რედაქტირებას" ჩაწერდა.
 */
class AuditObserver
{
    /**
     * მანქანის სვეტები — მათი ცვლილება ლოგს არ ბადებს. Tasks §31.1 — სინქრონის/თარგმანის
     * კვალი (`SyncOutcome::stamp()` ისედაც ობსერვერის გარეშე წერს; ეს სარეზერვოა, რომ
     * ჩვეულებრივ `save()`-ში მოყოლილი კვალი ყოველ გაშვებაზე „განახლდა" რიგად არ ჩაიწეროს).
     */
    private const MACHINE_COLUMNS = ['updated_at', 'last_synced_at', 'last_sync_result', 'last_translated_at', 'last_translate_result'];

    public function __construct(private AuditLogger $audit) {}

    public function created(Model $model): void
    {
        $this->audit->model($model, AuditLog::ACTION_CREATE, null, $model->attributesToArray());
    }

    public function updated(Model $model): void
    {
        $changes = $model->getChanges();
        foreach (self::MACHINE_COLUMNS as $column) {
            unset($changes[$column]);
        }

        if ($changes === []) {
            return;
        }

        $original = array_intersect_key($model->getOriginal(), $changes);

        $this->audit->model($model, AuditLog::ACTION_UPDATE, $original, $changes);
    }

    public function deleted(Model $model): void
    {
        // ⚠️ **ძველი მნიშვნელობა სრულად** — წაშლილის ლოგი მხოლოდ მაშინაა
        // რამეს ღირსი, თუ თვითონ ჩანაწერსაც შეიცავს (§4.2).
        $this->audit->model($model, AuditLog::ACTION_DELETE, $model->attributesToArray(), null);
    }
}
