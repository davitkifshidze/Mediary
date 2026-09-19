<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Support\AppTime;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ერთი მიწოდება — შეხსენების „გასროლის" კვალი (Tasks §13.3).
 *
 * თითო არხზე თითო რიგი: ბრაუზერისა **რიგია** (ფრონტი მას წაიღებს და
 * წაკითხულად მონიშნავს), ტელეგრამისა/ელფოსტისა კი **ჟურნალი** — გაიგზავნა
 * თუ ჩავარდა და რატომ. ერთი ცხრილი ორივესთვის იმიტომ, რომ „რა და როდის
 * გაეგზავნა" ერთ ადგილას იკითხებოდეს.
 */
class NoteNotification extends Model
{
    use BelongsToUser, MassPrunable;

    /**
     * რამდენ დღეს ვინახავთ **წაკითხულს** (Tasks DEBT-24).
     *
     * ⚠️ **მხოლოდ წაკითხული იშლება და ეს ფუნქციის ნაწილია**: `read_at`-ის
     * გარეშე რიგი ან ჯერ არ მიუტანია ფრონტს (§8.2-ის რიგი), ან ჩავარდნილია
     * (`failed` + მიზეზი) — ორივე შემთხვევაში ის ეკრანზე უნდა გამოჩნდეს.
     * ვადის მიხედვით ბრმა წაშლა უბრალოდ დაკარგავდა შეხსენებას, რომელიც
     * მომხმარებელს არასდროს უნახავს.
     */
    public const KEEP_READ_DAYS = 90;

    public const STATUS_PENDING = 'pending';

    public const STATUS_SENT = 'sent';

    public const STATUS_FAILED = 'failed';

    protected $guarded = ['id'];

    protected $casts = [
        'scheduled_for' => 'datetime',
        'sent_at' => 'datetime',
        'read_at' => 'datetime',
    ];

    public function noteEntry(): BelongsTo
    {
        return $this->belongsTo(NoteEntry::class);
    }

    public function reminder(): BelongsTo
    {
        return $this->belongsTo(NoteReminder::class, 'note_reminder_id');
    }

    /**
     * ⚠️ **`MassPrunable`** — ერთი query; მოდელი `AuditRegistry::NOT_LOGGED`-შია.
     *
     * ⚠️ **`owner` სკოუპი ცხადად ეხსნება** — `model:prune` CLI-ია (სადაც ის
     * ისედაც არ მოქმედებს), მაგრამ ვებიდან გაშვებისას ჩუმად მხოლოდ ერთი
     * ანგარიშის რიგებს წაშლიდა.
     */
    public function prunable(): Builder
    {
        return static::withoutGlobalScope('owner')
            ->whereNotNull('read_at')
            ->where('read_at', '<', AppTime::now()->subDays(self::KEEP_READ_DAYS));
    }
}
