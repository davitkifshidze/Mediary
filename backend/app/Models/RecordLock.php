<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Support\RecordLocks;
use Illuminate\Database\Eloquent\Model;

/**
 * **ჩანაწერის პაროლი** — ერთი რიგი ერთ ჩაკეტილ ჩანაწერზე.
 *
 * ⚠️ hash **არასდროს ტოვებს სერვერს** (`$hidden`); რესურსები მხოლოდ ორ ფაქტს
 * წერს — „ჩაკეტილია" და „ამ სესიაში ღიაა" (`RecordLocks`).
 *
 * ⚠️ **ცდების მრიცხველი ჩანაწერზეა და არა IP-ზე** (გალერეის ალბომის წესი):
 * IP-ის როტაცია მას გვერდს ვერ აუვლის; `throttle:record-unlock` კი მეორე ფენაა.
 */
class RecordLock extends Model
{
    use BelongsToUser;

    /** რამდენ არასწორ ცდაზე იბლოკება და რამდენი ხნით (ალბომის რიცხვები) */
    public const MAX_UNLOCK_ATTEMPTS = 10;

    public const UNLOCK_BLOCK_MINUTES = 15;

    protected $guarded = ['id'];

    protected $hidden = ['password_hash'];

    protected $casts = [
        'lockable_id' => 'integer',
        'failed_unlocks' => 'integer',
        'unlock_blocked_until' => 'datetime',
    ];

    /* ⚠️ ახალი ან მოხსნილი ლოკი მემოს აბათილებს — თორემ იმავე პროცესში
       (ტესტი, Octane) „ჩაკეტე" მომდევნო query-ზე არ იმოქმედებდა. */
    protected static function booted(): void
    {
        static::saved(fn () => RecordLocks::flush());
        static::deleted(fn () => RecordLocks::flush());
    }

    public function unlockBlocked(): bool
    {
        return $this->unlock_blocked_until !== null && $this->unlock_blocked_until->isFuture();
    }

    /**
     * ერთი ცდის აღრიცხვა. ⚠️ `saveQuietly()` — ტექნიკური მრიცხველია და არა
     * რედაქტირება; ⚠️ ბლოკის დადგმისას მრიცხველი ნულდება (მომდევნო ბლოკს ისევ
     * სრული 10 ცდა სჭირდება) — `GalleryAlbum::registerUnlockAttempt()`-ის წესი.
     */
    public function registerUnlockAttempt(bool $ok): void
    {
        if ($ok) {
            $this->forceFill(['failed_unlocks' => 0, 'unlock_blocked_until' => null])->saveQuietly();

            return;
        }

        $failed = (int) $this->failed_unlocks + 1;

        $this->forceFill($failed >= self::MAX_UNLOCK_ATTEMPTS
            ? ['failed_unlocks' => 0, 'unlock_blocked_until' => now()->addMinutes(self::UNLOCK_BLOCK_MINUTES)]
            : ['failed_unlocks' => $failed])->saveQuietly();
    }
}
