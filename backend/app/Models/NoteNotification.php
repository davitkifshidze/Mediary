<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
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
    use BelongsToUser;

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
}
