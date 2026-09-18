<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * გალერეის ალბომი (Tasks §26) — „ჯგუფი უკატეგორიოში".
 *
 * ⚠️ **ეს არ არის მშობელი.** მშობელი ჩანაწერია (ფილმი · მსახიობი · სიმღერა)
 * და ფოტოს ვინაობას განსაზღვრავს; ალბომი კი user-ის თავისი დახარისხებაა.
 * ორივე ერთდროულად შეიძლება იყოს ან არცერთი — ამიტომაა ცალკე სვეტი და
 * არა `imageable_type = 'album'`.
 *
 * ⚠️ **სახელი ერთენოვანია** და განზრახ: ეს user-ის ნაწერია და არა
 * ლექსიკონის რიგი — `name_ka`/`name_en` აქ ერთსა და იმავე ტექსტს ორჯერ
 * ათქმევინებდა (ლექსიკონებს ორი ენა იმიტომ აქვთ, რომ მათი ნაგულისხმევები
 * კოდიდან მოდის).
 */
class GalleryAlbum extends Model
{
    use BelongsToUser;

    protected $guarded = ['id'];

    /**
     * **რამდენ ცდაზე იბლოკება ალბომი და რამდენი ხნით** (Tasks FEAT-04).
     *
     * ⚠️ `throttle:album-unlock` (10/წთ) ამას **ვერ ცვლის**: ის ანონიმზე
     * IP + ალბომზე ითვლის, ე.ი. IP-ის როტაცია მას გვერდს უვლის. ეს
     * მრიცხველი **ალბომზეა** — საიდანაც არ უნდა მოვიდეს ცდა, ერთსა და
     * იმავე რიგს ემატება.
     */
    public const MAX_UNLOCK_ATTEMPTS = 10;

    public const UNLOCK_BLOCK_MINUTES = 15;

    protected $casts = [
        'sort_order' => 'integer',
        'failed_unlocks' => 'integer',
        'unlock_blocked_until' => 'datetime',
    ];

    /**
     * ⚠️ hash **არასდროს ტოვებს სერვერს** — `row()` მას ისედაც არ წერს,
     * მაგრამ `$hidden` იმ დღისთვისაა, როცა ვინმე მოდელს პირდაპირ დააბრუნებს.
     */
    protected $hidden = ['password_hash'];

    /** ჩაკეტილია ზუსტად მაშინ, როცა პაროლი ადევს — ცალკე დროშა არ არსებობს */
    public function isLocked(): bool
    {
        return $this->password_hash !== null;
    }

    /** ცდა დროებით აკრძალულია? */
    public function unlockBlocked(): bool
    {
        return $this->unlock_blocked_until !== null && $this->unlock_blocked_until->isFuture();
    }

    /**
     * **ერთი ცდის აღრიცხვა — ორივე endpoint-ის ერთადერთი წერტილი.**
     *
     * ⚠️ `saveQuietly()`: ეს ტექნიკური მრიცხველია და არა მომხმარებლის
     * რედაქტირება — `AuditObserver` მას ყოველ არასწორ პაროლზე ლოგში
     * ჩაწერდა და ჟურნალს დამარხავდა.
     *
     * ⚠️ **ბლოკის დადგმისას მრიცხველი ნულდება**: მომდევნო ბლოკს ისევ სრული
     * `MAX_UNLOCK_ATTEMPTS` ცდა სჭირდება, თორემ ერთხელ დაბლოკილი ალბომი
     * მე-11 ცდიდან სამუდამოდ დაბლოკილი დარჩებოდა.
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

    public function images(): HasMany
    {
        return $this->hasMany(GalleryImage::class, 'album_id');
    }

    /*
     * ⚠️ `booted()` განზრახ არ არსებობს: ალბომის წაშლა **ფოტოებს არ შლის**
     * — `album_id` `nullOnDelete`-ია, ე.ი. ისინი უბრალოდ უკატეგორიოში
     * ბრუნდება. „საქაღალდის" მოშორება ბიბლიოთეკის წაშლა ვერ იქნება.
     */
}
