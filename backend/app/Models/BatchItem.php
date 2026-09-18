<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
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
    use BelongsToUser;

    public const OK = 'ok';

    public const SKIPPED = 'skipped';

    public const FAILED = 'failed';

    public const RUNNING = 'running';

    protected $guarded = ['id'];
}
