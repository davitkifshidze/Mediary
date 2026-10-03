<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasTrash;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * **ადამიანი პირად გალერეაში (Tasks §33)** — მოდულის ჩანაწერი (`personal`).
 *
 * ⚠️ **`cast_members` არ არის და არც უნდა გახდეს** — ის გლობალური ლექსიკონია
 * (ყველა ანგარიშს უჩანს), ახლობლის სახელი კი მხოლოდ შენია.
 *
 * ⚠️ **ალბომები და ფოტოები მისი ნაწილებია** (ადგილისა და მისი ფაილების
 * წესი): ურნაში მასთან ერთად „მიდის" ყველაფერი, რაც მასზეა მიბმული —
 * `PersonalAlbum`/`PersonalMedia`-ს `personal_parent` scope მათ მალავს, აღდგენა
 * აბრუნებს, საბოლოო წაშლა კი მათაც შლის (ფაილებით და კვოტით). „შიგთავსი
 * დამიტოვე" ცხადი არჩევანია (`release()`): ფოტოები და ალბომები უჯგუფოდ
 * რჩება, აღდგენა კი მათ უკან მიაბამს (`trashed_children`).
 *
 * ⚠️ **morph-ალიასი `personal`-ია** — მოდულის გასაღები, ზუსტად ისე, როგორც
 * `place` ადგილისაა: ურნის სახე, `trashed_files.record_type` და დამატებითი
 * ველების `record_type` ერთსა და იმავე სიტყვას კითხულობს.
 */
class Person extends Model
{
    use BelongsToUser;

    /** §33.4 — დამატებითი ველები ადამიანზე (წაშლა → ფაილი + კვოტა) */
    use HasCustomFields;

    /** FEAT-11 — ურნა: `destroy()` `moveToTrash()`-ს იძახის */
    use HasTrash;

    protected $table = 'persons';

    protected $guarded = ['id'];

    protected $casts = [
        'birthday' => 'date',
        'sort_order' => 'integer',
        'cover_media_id' => 'integer',
        'trashed_children' => 'array',
    ];

    /**
     * ⚠️ **საბოლოო წაშლა ნაწილებსაც შლის — მოდელით, სათითაოდ.** SQL-ის
     * `nullOnDelete` მხოლოდ მეორე ფენაა: ის ფაილს დისკზე და ბაიტებს კვოტაში
     * დატოვებდა. ⚠️ `withoutGlobalScopes()` — ურნაში მყოფი ნაწილიც და
     * მშობლის გამო დამალულიც (BUG-21-ის გაკვეთილი).
     */
    protected static function booted(): void
    {
        static::deleting(function (Person $person) {
            PersonalMedia::withoutGlobalScopes()
                ->where('user_id', $person->user_id)
                ->where('person_id', $person->id)
                ->get()
                ->each->delete();

            PersonalAlbum::withoutGlobalScopes()
                ->where('user_id', $person->user_id)
                ->where('person_id', $person->id)
                ->get()
                ->each->delete();
        });
    }

    /* ---------- relations ---------- */

    public function media(): HasMany
    {
        return $this->hasMany(PersonalMedia::class, 'person_id');
    }

    public function albums(): HasMany
    {
        return $this->hasMany(PersonalAlbum::class, 'person_id');
    }

    /** ყდა — ერთ-ერთი ფოტო; ურნაში მყოფი/დამალული ფოტო უბრალოდ არ ჩაიტვირთება */
    public function cover(): BelongsTo
    {
        return $this->belongsTo(PersonalMedia::class, 'cover_media_id');
    }

    /* ---------- ურნა ---------- */

    /**
     * **„შიგთავსი დამიტოვე"** — ურნაში გადატანამდე ფოტოები და ალბომები ადამიანს
     * ეხსნება და უჯგუფოდ რჩება; id-ები ინახება, რომ აღდგენამ უკან მიაბას.
     *
     * ⚠️ ურნაში უკვე მყოფი ნაწილი **არ** ეხსნება — ის ადამიანთან ერთად რჩება
     * ურნაში და მასთან ერთად ბრუნდება.
     */
    public function release(): void
    {
        $media = PersonalMedia::withoutGlobalScopes()
            ->where('user_id', $this->user_id)
            ->where('person_id', $this->id)
            ->whereNull('trashed_at')
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $albums = PersonalAlbum::withoutGlobalScopes()
            ->where('user_id', $this->user_id)
            ->where('person_id', $this->id)
            ->whereNull('trashed_at')
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        PersonalMedia::withoutGlobalScopes()->whereIn('id', $media)->update(['person_id' => null]);
        PersonalAlbum::withoutGlobalScopes()->whereIn('id', $albums)->update(['person_id' => null]);

        $this->trashed_children = ['media' => $media, 'albums' => $albums];
        $this->saveQuietly();
    }

    /**
     * აღდგენა — გამოშვებული შიგთავსი უკან მიება.
     *
     * ⚠️ **მხოლოდ ის, ვინც მას შემდეგ არ შეცვლილა** (გალერეის ალბომის წესი):
     * სხვა ადამიანზე გადატანილი ან ურნაში მყოფი ფოტო შენი ახალი
     * გადაწყვეტილებაა და აღდგენა მას ხელს არ ახლებს.
     */
    protected function afterTrashChange(bool $trashed): void
    {
        if ($trashed) {
            return;
        }

        $children = $this->trashed_children ?? [];

        if ($ids = array_map('intval', $children['albums'] ?? [])) {
            PersonalAlbum::withoutGlobalScopes()
                ->where('user_id', $this->user_id)
                ->whereIn('id', $ids)
                ->whereNull('person_id')
                ->whereNull('trashed_at')
                ->update(['person_id' => $this->id]);
        }

        if ($ids = array_map('intval', $children['media'] ?? [])) {
            PersonalMedia::withoutGlobalScopes()
                ->where('user_id', $this->user_id)
                ->whereIn('id', $ids)
                ->whereNull('person_id')
                ->whereNull('trashed_at')
                ->update(['person_id' => $this->id]);
        }

        $this->trashed_children = null;
        $this->saveQuietly();
    }
}
