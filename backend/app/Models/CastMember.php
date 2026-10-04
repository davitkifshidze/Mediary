<?php

namespace App\Models;

use App\Models\Concerns\HasGallery;
use App\Services\Storage\StorageMeter;
use App\Support\StorageFolder;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
use Illuminate\Support\Facades\Auth;

class CastMember extends Model
{
    /**
     * Tasks 10 — მსახიობის გალერეა. ⚠️ `cast_members` **გლობალური** ლექსიკონია
     * (ერთი მსახიობი ყველა ანგარიშისთვის), ფოტოები კი `gallery_images`-ია
     * `user_id`-თი, ე.ი. გალერეა მაინც per-user რჩება (`owner` global scope).
     */
    use HasGallery;

    /** TMDB-ის კოდირება (იხ. მიგრაცია): 1 = ქალი, 2 = კაცი */
    public const GENDER_FEMALE = 1;

    public const GENDER_MALE = 2;

    /** `castables`-ის სვეტები ჩანაწერის მხრიდან (`HasCastMembers`-ის იგივე ნაკრები) */
    private const MEDIA_PIVOT = ['character', 'billing_order', 'is_manual', 'is_hidden', 'is_removed', 'is_edited'];

    protected $guarded = ['id'];

    protected $with = ['translations'];

    protected $casts = [
        'tmdb_person_id' => 'integer',
        // §35.3 — ხელით შექმნილის ავტორი (TMDB-ის მსახიობზე `null`)
        'created_by' => 'integer',
        'gender' => 'integer',
        // §8.1 — TMDB-ის `person` + `external_ids`
        'birthday' => 'date',
        'deathday' => 'date',
        'popularity' => 'float',
        'profile_links' => 'array',
        'details_synced_at' => 'datetime',
    ];

    /**
     * ⚠️ **გლობალური ლექსიკონია, მაგრამ წაშლადი მაინც უნდა იყოს უსაფრთხო.**
     * მსახიობი დღეს არსად არ იშლება, თუმცა `morphs()` კასკადს არ ქმნის:
     * წაშლის დღეს მისი ფოტოები (ყველა ანგარიშისა) და ვიდეო-ბმულები
     * ორფნად დარჩებოდა და კვოტაც სამუდამოდ დაკავებული.
     */
    protected static function booted(): void
    {
        /* **Tasks §35.3 (Q9) — ხელით შექმნილი მსახიობი მხოლოდ შემქმნელს უჩანს**,
           სანამ TMDB-ის პირს არ დაუკავშირდება. ⚠️ scope ლექსიკონის **ყველა**
           კარზე მოქმედებს — ძებნა, `{castMember}`-ის მიბმა (სხვისი 404-ია),
           ჩანაწერის მსახიობები, `CastSync::resolve()`-ის სახელით დამთხვევა
           (სხვისი კერძო რიგი ჩემს ფილმს არ მიება). ⚠️ `Auth::id()`-ის გარეშე
           (CLI) არაფერი იჭრება — `owner`-ის წესი; საჯარო გზები მფლობელს ცხადად
           გადასცემენ (`visibleToOwner()`). */
        static::addGlobalScope('creator', function (Builder $query) {
            if ($id = Auth::id()) {
                self::constrainVisible($query, (int) $id);
            }
        });

        static::deleting(function (self $member) {
            $member->deleteGalleryMedia();

            // §35.3 — ატვირთული ფოტო შემქმნელის კვოტაშია; TMDB-ის საერთო ფაილი კი არა
            if ($member->ownsPhotoFile()) {
                app(StorageMeter::class)->deleteUpload($member->created_by, $member->photo_path);
            }
        });
    }

    /**
     * საჯარო გზა (პროფილის გალერეა) — მნახველი სხვაა, ე.ი. `creator` scope
     * იხსნება და ჩანს **მფლობელის** ხელით შექმნილი: ის მისივე შიგთავსია.
     */
    public function scopeVisibleToOwner(Builder $query, int $ownerId): Builder
    {
        return self::constrainVisible($query->withoutGlobalScope('creator'), $ownerId);
    }

    private static function constrainVisible(Builder $query, int $userId): Builder
    {
        $table = $query->getModel()->getTable();

        return $query->where(fn (Builder $w) => $w
            ->whereNull("{$table}.created_by")
            ->orWhereNotNull("{$table}.tmdb_person_id")
            ->orWhere("{$table}.created_by", $userId));
    }

    /** ხელით შექმნილი და ჯერ TMDB-ს არ დაკავშირებია — მხოლოდ შემქმნელისაა */
    public function isPrivate(): bool
    {
        return $this->created_by !== null && $this->tmdb_person_id === null;
    }

    /** ⚠️ რედაქტირება მხოლოდ შემქმნელს და მხოლოდ კერძოზე — TMDB-ის ფაქტს ხელით არ ვცვლით */
    public function isEditableBy(?int $userId): bool
    {
        return $userId !== null && $this->isPrivate() && $this->created_by === $userId;
    }

    /** ფოტო ატვირთულია (`cast/uploads/…`, კვოტაში) და არა TMDB-ის საერთო (`cast/photos/…`) */
    public function ownsPhotoFile(): bool
    {
        return $this->created_by !== null
            && is_string($this->photo_path)
            && str_starts_with($this->photo_path, StorageFolder::CAST_UPLOADS.'/');
    }

    /* ---------- relations ---------- */

    public function translations(): HasMany
    {
        return $this->hasMany(CastMemberTranslation::class);
    }

    /*
     * ⚠️ **სამივე უკუ-რელაცია წაშლილ ბმულს (`is_removed`) ფილტრავს** (Tasks §16)
     * — ზუსტად ისე, როგორც `HasCastMembers::cast()`. ამ რელაციებზე დგას
     * მსახიობის ფილმოგრაფია, `CastMember::whereHas('movies')` (გალერეის
     * ჭრილები, ძებნის „ჩემი მსახიობები", ჩამოტვირთვის აუზი) — ე.ი. ფილმიდან
     * წაშლილი ადამიანი იქ აღარ ჩანს. დამალული (`is_hidden`) ჩანს: ის მხოლოდ
     * ჩანაწერის სიიდან იმალება.
     */

    public function movies(): MorphToMany
    {
        return $this->morphedByMany(Movie::class, 'castable')
            ->withPivot(self::MEDIA_PIVOT)
            ->wherePivot('is_removed', false);
    }

    public function series(): MorphToMany
    {
        return $this->morphedByMany(Series::class, 'castable')
            ->withPivot(self::MEDIA_PIVOT)
            ->wherePivot('is_removed', false);
    }

    /** §7.1 — მესამე მედია-დომენი; მსახიობი ერთია და სამივეს უკავშირდება */
    public function animes(): MorphToMany
    {
        return $this->morphedByMany(Anime::class, 'castable')
            ->withPivot(self::MEDIA_PIVOT)
            ->wherePivot('is_removed', false);
    }

    /* ---------- translation accessor (name = canonical column) ---------- */

    /** Tasks §31.3 — „აღარ განაახლო" თითო მომხმარებლისგან (`cast_member_sync_prefs`) */
    public function syncPauses(): HasMany
    {
        return $this->hasMany(CastMemberSyncPref::class)->withoutGlobalScope('owner');
    }

    public function getNameKaAttribute(): ?string
    {
        return $this->translations->firstWhere('locale', 'ka')?->name;
    }

    /**
     * **მსახიობის სრული ფორმა (Tasks §8.1)** — ერთი ადგილი, სამი გამომძახებელი:
     * `GET /cast/{id}`, `GET /gallery/cast/{id}` და გალერეის ჯგუფები.
     *
     * ⚠️ ორი ასლი ორ სხვადასხვა ველს დაწერდა და მსახიობის გვერდი ერთგან
     * ბიოგრაფიით, სხვაგან მის გარეშე გამოჩნდებოდა.
     *
     * @return array<string, mixed>
     */
    public function toDetailArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'name_ka' => $this->name_ka,
            // §35.3 — „ჩემი ხელით შექმნილი" (რედაქტირდება) და „მხოლოდ მე ვხედავ"
            'created_by_me' => $this->created_by !== null && $this->created_by === Auth::id(),
            'is_private' => $this->isPrivate(),
            'gender' => $this->gender,
            'photo_path' => $this->photo_path,
            'has_tmdb' => (bool) $this->tmdb_person_id,
            'tmdb_person_id' => $this->tmdb_person_id,
            'imdb_id' => $this->imdb_id,
            'birthday' => $this->birthday?->toDateString(),
            'deathday' => $this->deathday?->toDateString(),
            'place_of_birth' => $this->place_of_birth,
            'biography' => $this->biography,
            'known_for' => $this->known_for,
            'popularity' => $this->popularity,
            'homepage' => $this->homepage,
            // ⚠️ უცნობი ქსელიც ინახება — ინტერფეისი მხოლოდ ნაცნობებს ხატავს
            'profile_links' => $this->profile_links ?: null,
            'details_synced_at' => $this->details_synced_at?->toIso8601String(),
        ];
    }

    /** ლოკალიზებული სახელის ჩაწერა/განახლება (მაგ. ka ტრანსლიტერაცია). */
    public function setTranslation(string $locale, ?string $name): void
    {
        if ($name === null || $name === '') {
            return;
        }
        $this->translations()->updateOrCreate(['locale' => $locale], ['name' => $name]);
        $this->load('translations');
    }
}
