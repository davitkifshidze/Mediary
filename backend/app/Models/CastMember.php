<?php

namespace App\Models;

use App\Models\Concerns\HasGallery;
use App\Models\Concerns\HidesLockedRecords;
use App\Services\Storage\StorageMeter;
use App\Support\RecordLocks;
use App\Support\StorageFolder;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphToMany;
use Illuminate\Support\Facades\Auth;

class CastMember extends Model
{
    /**
     * მსახიობის გალერეა. ⚠️ `cast_members` **გლობალური** ლექსიკონია
     * (ერთი მსახიობი ყველა ანგარიშისთვის), ფოტოები კი `gallery_images`-ია
     * `user_id`-თი, ე.ი. გალერეა მაინც per-user რჩება (`owner` global scope).
     */
    use HasGallery;

    /**
     * მსახიობის ჩაკეტვა. ⚠️ ლოკი **მნახველისაა** (`RecordLocks::ownerOf()` —
     * `user_id` აქ არ არის): ჩემი პაროლი მას მხოლოდ ჩემგან მალავს — ჩემს სიაში,
     * ძებნაში, ჩანაწერის მსახიობებში და გალერეაში; სხვა ანგარიშს ის ჩვეულებრივ უჩანს.
     */
    use HidesLockedRecords;

    /** TMDB-ის კოდირება (იხ. მიგრაცია): 1 = ქალი, 2 = კაცი */
    public const GENDER_FEMALE = 1;

    public const GENDER_MALE = 2;

    /** `castables`-ის სვეტები ჩანაწერის მხრიდან (`HasCastMembers`-ის იგივე ნაკრები) */
    private const MEDIA_PIVOT = ['character', 'billing_order', 'is_manual', 'is_hidden', 'is_removed', 'is_edited'];

    protected $guarded = ['id'];

    protected $with = ['translations'];

    protected $casts = [
        'tmdb_person_id' => 'integer',
        // ხელით შექმნილის ავტორი (TMDB-ის მსახიობზე `null`)
        'created_by' => 'integer',
        'gender' => 'integer',
        // TMDB-ის `person` + `external_ids`
        'birthday' => 'date',
        'deathday' => 'date',
        'popularity' => 'float',
        'profile_links' => 'array',
        'details_synced_at' => 'datetime',
        // ხელით შექმნილი მსახიობი ურნაში (`CastMemberTrash`)
        'trashed_at' => 'datetime',
    ];

    /**
     * ⚠️ **გლობალური ლექსიკონია, მაგრამ წაშლადი მაინც უნდა იყოს უსაფრთხო.**
     * იშლება მხოლოდ ხელით შექმნილი — ურნის გავლით (`CastMemberTrash`)
     * და ანგარიშის წაშლისას; `morphs()` კი კასკადს არ ქმნის, ე.ი. მისი ფოტოები
     * და ვიდეო-ბმულები ორფნად დარჩებოდა და კვოტაც სამუდამოდ დაკავებული.
     */
    protected static function booted(): void
    {
        /* **ხელით შექმნილი მსახიობი მხოლოდ შემქმნელს უჩანს**,
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

        /* **ურნაში მყოფი მსახიობი ყველა კარიდან ქრება**: სია,
           გვერდი (404), ძებნა, ჩანაწერის მსახიობები, გალერეის ჯგუფები, საჯარო
           პროფილი. ⚠️ `creator`-ისგან განსხვავებით **ავტორიზაციის გარეშეც** —
           ურნაში მხოლოდ კერძო მსახიობი ხვდება, ე.ი. მისი დამალვა სხვას არაფერს უცვლის. */
        static::addGlobalScope('trash', fn (Builder $query) => $query->whereNull($query->getModel()->qualifyColumn('trashed_at')));

        static::deleting(function (self $member) {
            $member->deleteGalleryMedia();

            // ატვირთული ფოტო შემქმნელის კვოტაშია; TMDB-ის საერთო ფაილი კი არა
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

    /**
     * ბოქლომიანი ბარათი — სახელი და ლოკის ფაქტები (`HidesLockedRecords`-ის
     * `title_*`-ის ნაცვლად). ⚠️ ლოკი მნახველისაა, ე.ი. ფაქტები `state()`-ია.
     *
     * @return array<string, mixed>
     */
    public function lockedCard(): array
    {
        return [
            'id' => $this->getKey(),
            'name' => $this->name,
            'name_ka' => $this->name_ka,
            'hidden' => true,
            ...RecordLocks::state($this),
        ];
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
     * ⚠️ **სამივე უკუ-რელაცია წაშლილ ბმულს (`is_removed`) ფილტრავს**
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

    /** მესამე მედია-დომენი; მსახიობი ერთია და სამივეს უკავშირდება */
    public function animes(): MorphToMany
    {
        return $this->morphedByMany(Anime::class, 'castable')
            ->withPivot(self::MEDIA_PIVOT)
            ->wherePivot('is_removed', false);
    }

    /* ---------- translation accessor (name = canonical column) ---------- */

    /** „აღარ განაახლო" თითო მომხმარებლისგან (`cast_member_sync_prefs`) */
    public function syncPauses(): HasMany
    {
        return $this->hasMany(CastMemberSyncPref::class)->withoutGlobalScope('owner');
    }

    public function getNameKaAttribute(): ?string
    {
        return $this->georgian()?->name ?: null;
    }

    /** ქართული ბიოგრაფია — `cast_member_translations`-ში; ინგლისური `biography` სვეტია */
    public function getBiographyKaAttribute(): ?string
    {
        return $this->georgian()?->biography ?: null;
    }

    /** ქართული ტექსტის რიგი (სახელი, ბიოგრაფია და რამ დაწერა ისინი) */
    public function georgian(): ?CastMemberTranslation
    {
        return $this->translations->firstWhere('locale', 'ka');
    }

    /** ქართული ტექსტი მანქანამ დაწერა და ჯერ არავის დაუდასტურებია — `name` · `biography` */
    public function georgianUnverified(string $field): bool
    {
        return $this->georgian()?->{$field.'_source'} === CastMemberTranslation::SOURCE_TRANSLATION
            && filled($this->georgian()?->{$field});
    }

    /**
     * ქართული ტექსტის ჩაწერა წყაროსთან ერთად (`tmdb` · `translation` · `manual`).
     * `$text` `null` — ტექსტი უცვლელია, იცვლება მხოლოდ წყარო (დადასტურება).
     */
    public function setGeorgian(string $field, ?string $text, ?string $source): void
    {
        $this->translations()->updateOrCreate(
            ['locale' => 'ka'],
            [...($text === null ? [] : [$field => $text]), $field.'_source' => $source],
        );
        $this->load('translations');
    }

    /**
     * **მსახიობის სრული ფორმა** — ერთი ადგილი, სამი გამომძახებელი:
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
            // „ჩემი ხელით შექმნილი" (რედაქტირდება) და „მხოლოდ მე ვხედავ"
            'created_by_me' => $this->created_by !== null && $this->created_by === Auth::id(),
            'is_private' => $this->isPrivate(),
            // ჩემი ლოკი ამ მსახიობზე (ფაქტები, hash არასდროს)
            ...RecordLocks::state($this),
            'gender' => $this->gender,
            'photo_path' => $this->photo_path,
            'has_tmdb' => (bool) $this->tmdb_person_id,
            'tmdb_person_id' => $this->tmdb_person_id,
            'imdb_id' => $this->imdb_id,
            'birthday' => $this->birthday?->toDateString(),
            'deathday' => $this->deathday?->toDateString(),
            'place_of_birth' => $this->place_of_birth,
            'biography' => $this->biography,
            // ქართული ბიოგრაფია; გვერდი ენის მიხედვით აჩვენებს (ქართული არ არის — ინგლისური)
            'biography_ka' => $this->biography_ka,
            // მანქანამ დაწერა და ჯერ არავის დაუდასტურებია — გვერდზე „გადასამოწმებელია"
            'name_ka_unverified' => $this->georgianUnverified('name'),
            'biography_ka_unverified' => $this->georgianUnverified('biography'),
            'known_for' => $this->known_for,
            'popularity' => $this->popularity,
            'homepage' => $this->homepage,
            // ⚠️ უცნობი ქსელიც ინახება — ინტერფეისი მხოლოდ ნაცნობებს ხატავს
            'profile_links' => $this->profile_links ?: null,
            'details_synced_at' => $this->details_synced_at?->toIso8601String(),
        ];
    }

    /**
     * ლოკალიზებული სახელის ჩაწერა/განახლება. `$source` — რამ დაწერა (`tmdb` · `manual`);
     * მის გარეშე წყარო უცვლელი რჩება.
     */
    public function setTranslation(string $locale, ?string $name, ?string $source = null): void
    {
        if ($name === null || $name === '') {
            return;
        }
        $this->translations()->updateOrCreate(
            ['locale' => $locale],
            ['name' => $name, ...($source === null ? [] : ['name_source' => $source])],
        );
        $this->load('translations');
    }

    /**
     * ქართული სახელის მოხსნა. ⚠️ რიგი მხოლოდ მაშინ იშლება, როცა მასში სხვა არაფერია —
     * ქართული ბიოგრაფია სახელთან ერთად არ უნდა გაქრეს.
     */
    public function clearGeorgianName(): void
    {
        $row = $this->georgian();

        if (! $row) {
            return;
        }

        filled($row->biography)
            ? $row->update(['name' => null, 'name_source' => null])
            : $row->delete();

        $this->load('translations');
    }
}
