<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Support\AppTime;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;

/**
 * **პარტიის ერთი ერთეულის შედეგი** (Tasks FEAT-03).
 *
 * ⚠️ სამი მდგომარეობაა და სამივე სხვადასხვა ქმედებას ითხოვს:
 *  · `ok`      — შესრულდა;
 *  · `skipped` — კანონიერი გამოტოვება (ჩანაწერი წაიშალა, ანგარიში აღარაა)
 *                — **ხელახლა გაშვება არაფერს შეცვლის**;
 *  · `failed`  — ჩავარდა, `error`-ში მიზეზით — **ესაა ის, რაც გადასაშვებია**.
 *
 * ⚠️ ერთ დროშად („მოხერხდა თუ არა") შეკუმშვა ზუსტად იმ კითხვას ტოვებდა
 * პასუხგაუცემელი, რომლის გამოც ეს ცხრილი არსებობს.
 */
class BatchItem extends Model
{
    use BelongsToUser, MassPrunable;

    /**
     * რამდენ დღეს ვინახავთ (Tasks DEBT-24).
     *
     * ⚠️ **უფრო მოკლეა, ვიდრე მრიცხველებისა და ეს განზრახაა**: ეს პარტიის
     * მიმდინარეობის ჟურნალია — 300-ერთეულიანი გაშვება 300 რიგს ტოვებს და
     * მისი კითხვა მხოლოდ გაშვებისთანავე ან მისი ჩავარდნის მოკვლევისას ხდება.
     * `job_batches`-ს Laravel თვითონ ასუფთავებს `queue:prune-batches`-ით.
     */
    public const KEEP_DAYS = 30;

    public const OK = 'ok';

    public const SKIPPED = 'skipped';

    public const FAILED = 'failed';

    public const RUNNING = 'running';

    protected $guarded = ['id'];

    /**
     * ⚠️ **გლობალური `owner` სკოუპი ცხადად ეხსნება.** `model:prune` CLI-ია,
     * სადაც `Auth::id()` ცარიელია და სკოუპი ისედაც არ მოქმედებს — მაგრამ
     * ამაზე დაყრდნობა ნიშნავდა, რომ ეს ბრძანება **ვებიდან** გაშვებისას
     * ჩუმად მხოლოდ ერთი ანგარიშის რიგებს წაშლიდა.
     */
    public function prunable(): Builder
    {
        return static::withoutGlobalScope('owner')
            ->where('created_at', '<', AppTime::now()->subDays(self::KEEP_DAYS));
    }
}
