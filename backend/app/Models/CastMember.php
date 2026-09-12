<?php

namespace App\Models;

use App\Models\Concerns\HasGallery;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphToMany;

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

    protected $guarded = ['id'];

    protected $with = ['translations'];

    protected $casts = [
        'tmdb_person_id' => 'integer',
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
        static::deleting(function (self $member) {
            $member->deleteGalleryMedia();
        });
    }

    /* ---------- relations ---------- */

    public function translations(): HasMany
    {
        return $this->hasMany(CastMemberTranslation::class);
    }

    public function movies(): MorphToMany
    {
        return $this->morphedByMany(Movie::class, 'castable')
            ->withPivot('character', 'billing_order');
    }

    public function series(): MorphToMany
    {
        return $this->morphedByMany(Series::class, 'castable')
            ->withPivot('character', 'billing_order');
    }

    /** §7.1 — მესამე მედია-დომენი; მსახიობი ერთია და სამივეს უკავშირდება */
    public function animes(): MorphToMany
    {
        return $this->morphedByMany(Anime::class, 'castable')
            ->withPivot('character', 'billing_order');
    }

    /* ---------- translation accessor (name = canonical column) ---------- */

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
