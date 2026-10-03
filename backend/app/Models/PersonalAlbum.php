<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasTrash;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * **პირადი გალერეის ალბომი (Tasks §33)** — „გარეთ" (`person_id = null`) ან
 * ადამიანის შიგნით.
 *
 * ⚠️ **ფოტოს ადამიანი ალბომისას მიჰყვება**: ადამიანის ალბომში მდგომი ფოტო
 * ყოველთვის იმავე ადამიანისაა (`PersonalGallery::move()` ამას იცავს), ე.ი.
 * „ადამიანის ფოტოები" ერთი `where`-ია და ალბომის გავლით არ ითვლება. „გარე"
 * ალბომში კი სხვადასხვა ადამიანის ფოტოც შეიძლება ერთად იდოს.
 *
 * ⚠️ **ალბომის წაშლა ნაგულისხმევად ფოტოებს არ შლის** (გალერეის ალბომის
 * წესი): კონტროლერი მათ ჯერ ათავისუფლებს (`release()`) და აღდგენა უკან აბამს.
 * „ფოტოებიც წაიშალოს" არჩევანზე ისინი ალბომთან ერთად რჩება — `personal_parent`
 * scope მათ მალავს, საბოლოო წაშლა კი შლის.
 */
class PersonalAlbum extends Model
{
    use BelongsToUser, HasTrash;

    protected $guarded = ['id'];

    protected $casts = [
        'person_id' => 'integer',
        'cover_media_id' => 'integer',
        'sort_order' => 'integer',
        'trashed_children' => 'array',
    ];

    protected static function booted(): void
    {
        /* **ურნაში მყოფი ადამიანის ალბომი არსად ჩანს** — ის მასთან ერთად
           ურნაშია (ადამიანის ნაწილია). ⚠️ `whereNull` აუცილებელია: SQL-ში
           `NULL NOT IN (…)` `NULL`-ია და „გარე" ალბომები ამოვარდებოდა. */
        static::addGlobalScope('personal_parent', function (Builder $q) {
            $table = $q->getModel()->getTable();

            $q->where(fn (Builder $w) => $w
                ->whereNull("{$table}.person_id")
                ->orWhereNotIn("{$table}.person_id", fn ($sub) => $sub->select('id')->from('persons')->whereNotNull('trashed_at')));
        });

        /* ⚠️ **საბოლოო წაშლა ალბომთან ერთად დარჩენილ ფოტოებს შლის** — ესენი
           „ფოტოებიც წაიშალოს" არჩევანით ურნაში მასთან ერთად წასულებია
           (ნაგულისხმევად ისინი ჯერ თავისუფლდება). მოდელით, სათითაოდ — ფაილი
           და კვოტა. */
        static::deleting(function (PersonalAlbum $album) {
            PersonalMedia::withoutGlobalScopes()
                ->where('user_id', $album->user_id)
                ->where('album_id', $album->id)
                ->get()
                ->each->delete();
        });
    }

    /* ---------- relations ---------- */

    public function person(): BelongsTo
    {
        return $this->belongsTo(Person::class);
    }

    public function media(): HasMany
    {
        return $this->hasMany(PersonalMedia::class, 'album_id');
    }

    public function cover(): BelongsTo
    {
        return $this->belongsTo(PersonalMedia::class, 'cover_media_id');
    }

    /* ---------- ურნა ---------- */

    /**
     * **„ფოტოები დამიტოვე"** — ურნაში გადატანამდე ფოტოები ალბომს ეხსნება
     * (ადამიანი რჩებათ); id-ები ინახება აღდგენისთვის.
     */
    public function release(): void
    {
        $ids = PersonalMedia::withoutGlobalScopes()
            ->where('user_id', $this->user_id)
            ->where('album_id', $this->id)
            ->whereNull('trashed_at')
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        PersonalMedia::withoutGlobalScopes()->whereIn('id', $ids)->update(['album_id' => null]);

        $this->trashed_children = ['media' => $ids];
        $this->saveQuietly();
    }

    /**
     * აღდგენა — გამოშვებული ფოტოები ალბომში ბრუნდება.
     *
     * ⚠️ მხოლოდ ის, რაც მას შემდეგ არ შეცვლილა (სხვა ალბომში არ გადასულა);
     * ადამიანის ალბომზე ფოტოს ადამიანიც ალბომისას უბრუნდება — ინვარიანტი
     * „ადამიანის ალბომის ფოტო მისია" აღდგენის შემდეგაც მართალია.
     */
    protected function afterTrashChange(bool $trashed): void
    {
        if ($trashed) {
            return;
        }

        if ($ids = array_map('intval', ($this->trashed_children ?? [])['media'] ?? [])) {
            PersonalMedia::withoutGlobalScopes()
                ->where('user_id', $this->user_id)
                ->whereIn('id', $ids)
                ->whereNull('album_id')
                ->whereNull('trashed_at')
                ->when($this->person_id !== null, fn ($q) => $q->where(fn ($w) => $w
                    ->whereNull('person_id')
                    ->orWhere('person_id', $this->person_id)))
                ->update(array_filter([
                    'album_id' => $this->id,
                    'person_id' => $this->person_id,
                ], fn ($v) => $v !== null));
        }

        $this->trashed_children = null;
        $this->saveQuietly();
    }
}
