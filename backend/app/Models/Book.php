<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasGallery;
use App\Services\Storage\StorageMeter;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * წიგნი — მოდული `book` (Tasks §12).
 *
 * ორენოვანი ტექსტი **ბრტყელი სვეტებია** (`title_ka`/`title_en`) და არა
 * translation-ცხრილი: წყარო (Open Library) ერთენოვანია, ე.ი. ცხრილი მხოლოდ
 * ცარიელ სტრუქტურას შემატებდა — მიზეზი მიგრაციის docblock-შია.
 */
class Book extends Model
{
    use BelongsToUser, HasGallery;

    /** §6 ფაზა 4b — მორგებულ ველზე ატვირთული ფაილები (წაშლა → დისკი + კვოტა) */
    use HasCustomFields;

    /** „ჩემი ქულის" შკალა — ერთი წყარო ვალიდაციისთვისაც და UI-სთვისაც */
    public const MAX_RATING = 10;

    public const FORMATS = ['print', 'ebook', 'audio'];

    public const STATUSES = ['to_read', 'reading', 'read', 'abandoned'];

    protected $guarded = ['id'];

    protected $casts = [
        'year' => 'integer',
        'pages' => 'integer',
        'series_number' => 'integer',
        'rating' => 'integer',
        'is_favorite' => 'boolean',
        'progress_page' => 'integer',
        'progress_percent' => 'integer',
        'links' => 'array',
        'tags' => 'array',
        'sort_order' => 'integer',
    ];

    /**
     * ⚠️ `book_files`/`book_notes` SQL-ის cascade-ით იშლება, მაგრამ cascade
     * **მოდელის ივენთს არ აგდებს** — ე.ი. ფაილი დისკზე და კვოტის მრიცხველი
     * უცვლელი დარჩებოდა. ამიტომ ფაილებს სათითაოდ ვშლით (იგივე წესი, რაც `Video`-ზე).
     */
    protected static function booted(): void
    {
        static::deleting(function (Book $book) {
            $book->deleteCover();
            $book->files()->get()->each->delete();
            $book->deleteGalleryMedia();
        });
    }

    /* ---------- relations ---------- */

    /** per-user ჟანრის ლექსიკონი */
    public function genre(): BelongsTo
    {
        return $this->belongsTo(BookGenre::class, 'genre_id');
    }

    public function files(): HasMany
    {
        return $this->hasMany(BookFile::class)->orderBy('sort_order')->orderBy('id');
    }

    public function notes(): HasMany
    {
        return $this->hasMany(BookNote::class)->orderByDesc('id');
    }

    /* ---------- helpers ---------- */

    /**
     * ⚠️ **მხოლოდ ხელით ატვირთული ყდა იშლება.** Open Library-ის ფაილის სახელი
     * მისი `cover_id`-ია, ე.ი. ერთი და იგივე ფაილი რამდენიმე ანგარიშის წიგნს
     * ემსახურება — წაშლა სხვისთვის სურათს გატეხავდა. ზუსტად ასე იქცევა
     * TMDB-ის პოსტერიც (`poster_source = 'tmdb'`); უპატრონოდ დარჩენილს
     * 17.5-ის ობოლების სკანერი აგროვებს.
     *
     * ჩამოტვირთული ყდა კვოტაშიც არ ითვლება (19.4/B).
     */
    public function deleteCover(): void
    {
        if ($this->cover_path && $this->cover_source === 'upload') {
            app(StorageMeter::class)->deleteUpload($this->user_id, $this->cover_path);
        }
    }

    /**
     * პროგრესი ორ ერთეულშია (გვერდი და პროცენტი). აქ **ერთდროულად** იწერება
     * ორივე, რომ სია და ბარათი ვერასდროს აჩვენონ ერთმანეთს დაცილებული რიცხვი.
     *
     * გვერდი უპირატესია, თუ საერთო რაოდენობა ცნობილია; აუდიოწიგნზე
     * (გვერდები არაა) მხოლოდ პროცენტი რჩება.
     */
    public function syncProgress(?int $page, ?int $percent): void
    {
        $pages = (int) $this->pages;

        if ($page !== null && $pages > 0) {
            $page = max(0, min($page, $pages));
            $this->progress_page = $page;
            $this->progress_percent = (int) round($page / $pages * 100);

            return;
        }

        if ($percent !== null) {
            $percent = max(0, min($percent, 100));
            $this->progress_percent = $percent;
            $this->progress_page = $pages > 0 ? (int) round($pages * $percent / 100) : null;

            return;
        }

        if ($page !== null) {
            // გვერდი ვიცით, სულ რამდენია — არა: პროცენტი ვერ გამოითვლება
            $this->progress_page = max(0, $page);
            $this->progress_percent = null;
        }
    }

    /** ტეგები იმავე წესებით ნორმალიზდება, რაც ვიდეოზე/სიმღერაზე */
    public static function normalizeTags(array $tags): array
    {
        return Video::normalizeTags($tags);
    }

    /** სათაური ფაილის სახელისთვის — ინგლისური ჯობია (ლათინური slug) */
    public function title(): string
    {
        return (string) ($this->title_en ?: $this->title_ka ?: '');
    }
}
