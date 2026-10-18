<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasRecordLock;
use App\Models\Concerns\HasTrash;
use App\Services\Gallery\AlbumVault;
use App\Support\RecordLocks;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Hash;

/**
 * გალერეის ალბომი — „ჯგუფი უკატეგორიოში".
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
    /**
     * ⚠️ **ურნა** — `destroy()` `moveToTrash()`-ს იძახის;
     * რიგი ადგილზე რჩება და ურნიდან ბრუნდება.
     */
    /**
     * ⚠️ **პაროლი `record_locks`-შია** — `HasRecordLock` საბოლოო
     * წაშლისას ლოკის რიგს შლის; ურნა მას არ ეხება (აღდგენილი ისევ ჩაკეტილია).
     */
    use BelongsToUser, HasRecordLock, HasTrash;

    protected $guarded = ['id'];

    /**
     * **რამდენ ცდაზე იბლოკება ალბომი და რამდენი ხნით**.
     *
     * ⚠️ `throttle:album-unlock` (10/წთ) ამას **ვერ ცვლის**: ის ანონიმზე
     * IP + ალბომზე ითვლის, ე.ი. IP-ის როტაცია მას გვერდს უვლის. ეს
     * მრიცხველი **ლოკის რიგზეა** — საიდანაც არ უნდა მოვიდეს ცდა, ერთსა და
     * იმავე რიგს ემატება. რიცხვები ზოგადი ლოკისაა (`RecordLock`) — ერთი წესი.
     */
    public const MAX_UNLOCK_ATTEMPTS = RecordLock::MAX_UNLOCK_ATTEMPTS;

    public const UNLOCK_BLOCK_MINUTES = RecordLock::UNLOCK_BLOCK_MINUTES;

    protected $casts = [
        'sort_order' => 'integer',
        // წაშლისას ალბომიდან გამოსული ფოტოები; აღდგენა მათ აბრუნებს
        'trashed_photo_ids' => 'array',
    ];

    /**
     * **აღდგენა ფოტოებს ალბომში აბრუნებს და ჩაკეტილს თავიდან კეტავს**.
     *
     * ⚠️ **მხოლოდ ის ფოტო ბრუნდება, რომელიც მას შემდეგ არ შეცვლილა** —
     * ე.ი. ისევ იქ დევს, სადაც წაშლამ დატოვა (`album_id` = ალბომის გარეშე ან
     * `move_to`-ს სამიზნე). სხვა ალბომში გადატანილს ან ურნაში მყოფს აღდგენა
     * ხელს არ ახლებს — ეს უკვე შენი ახალი გადაწყვეტილებაა.
     *
     * ⚠️ ფაილი `AlbumVault::placeMany()`-ით გადადის: ჩაკეტილ ალბომზე
     * `gallery/locked`-ში (და მთავარი ფოტოს ბმული იხსნება), სხვაზე — საჯაროში.
     */
    protected function afterTrashChange(bool $trashed): void
    {
        if ($trashed) {
            return;
        }

        $ids = array_map('intval', $this->trashed_photo_ids['ids'] ?? []);
        $from = $this->trashed_photo_ids['from'] ?? null;

        $photos = $ids
            ? GalleryImage::withoutGlobalScopes(['owner', 'album_lock', 'trash'])
                ->where('user_id', $this->user_id)
                ->whereIn('id', $ids)
                ->when($from, fn ($q) => $q->where('album_id', $from), fn ($q) => $q->whereNull('album_id'))
                ->get()
            : collect();

        if ($photos->isNotEmpty()) {
            GalleryImage::withoutGlobalScopes(['owner', 'album_lock', 'trash'])
                ->whereIn('id', $photos->modelKeys())
                ->update(['album_id' => $this->id]);

            AlbumVault::placeMany($photos, $this);
        }

        $this->trashed_photo_ids = null;
        $this->saveQuietly();
    }

    /** ლოკის რიგი (`record_locks`) — `null`, თუ პაროლი არ ადევს */
    public function lockRow(): ?RecordLock
    {
        return RecordLocks::lockOf($this);
    }

    /** ჩაკეტილია ზუსტად მაშინ, როცა პაროლი ადევს — ცალკე დროშა არ არსებობს */
    public function isLocked(): bool
    {
        return $this->lockRow() !== null;
    }

    /** ცდა დროებით აკრძალულია? */
    public function unlockBlocked(): bool
    {
        return $this->lockRow()?->unlockBlocked() ?? false;
    }

    /** პაროლი სწორია? ⚠️ ლოკის გარეშე — ყოველთვის „არა" (პასუხი არაფერს ამხელს) */
    public function passwordMatches(string $password): bool
    {
        $lock = $this->lockRow();

        return $lock !== null && Hash::check($password, $lock->password_hash);
    }

    /**
     * **ერთი ცდის აღრიცხვა — ორივე endpoint-ის ერთადერთი წერტილი** (`RecordLock`-ის
     * მრიცხველი: ბლოკის დადგმისას ნულდება, `saveQuietly()` — აუდიტის ხმაურის გარეშე).
     */
    public function registerUnlockAttempt(bool $ok): void
    {
        $this->lockRow()?->registerUnlockAttempt($ok);
    }

    /**
     * **პაროლის დადება, შეცვლა ან მოხსნა** (`null`). ⚠️ ახალი პაროლი ახალი
     * დასაწყისია — ძველი ცდები და ბლოკი აღარ მოქმედებს. ფაილების გადატანა
     * (`AlbumVault::seal()/reveal()`) და სესია გამომძახებლის საქმეა.
     */
    public function setPassword(?string $password): void
    {
        $lock = $this->lockRow();

        if ($password === null) {
            $lock?->delete();

            return;
        }

        $changes = ['password_hash' => Hash::make($password), 'failed_unlocks' => 0, 'unlock_blocked_until' => null];

        $lock
            ? $lock->update($changes)
            : RecordLock::create([
                ...$changes,
                'user_id' => $this->user_id,
                'lockable_type' => $this->getMorphClass(),
                'lockable_id' => $this->getKey(),
            ]);
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
