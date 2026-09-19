<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasStatus;
use App\Models\Concerns\HasTags;
use App\Models\Concerns\HasTrash;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * ჩანაწერი — მოდული `note` (Tasks §13).
 *
 * ⚠️ **ცხრილს `note_entries` ჰქვია და არა `notes`.** 2026-09-03-ის წესით
 * უნივერსალური `notes` აღარ არსებობს და სახელი „ჩანიშვნას სხვა ჩანაწერზე"
 * ნიშნავს (`video_notes`, `book_notes`…). აქ კი ჩანაწერი **დამოუკიდებელი
 * ერთეულია**, ამიტომ `note_entries`.
 *
 * ⚠️ **ხილვადობა აქ მკაცრია** (§13.1): მოდული პირად დოკუმენტებს ინახავს,
 * ე.ი. `private` არა მხოლოდ default-ია — საჯარო პროფილზე მოდული საერთოდ
 * არ ჩანს და „დამთხვევებში" (16.2) არასდროს მონაწილეობს.
 */
class NoteEntry extends Model
{
    use BelongsToUser;

    /** §6 ფაზა 4b — მორგებულ ველზე ატვირთული ფაილები (წაშლა → დისკი + კვოტა) */
    use HasCustomFields;

    /** Tasks §6.4 — სტატუსი per-user ლექსიკონია (`statuses`), enum-ი აღარაა */
    use HasStatus;

    /** FEAT-18 — ტეგების ერთი ქცევა (`Video::normalizeTags()`) */
    use HasTags;

    /**
     * ⚠️ **კალათა (FEAT-11)** — `destroy()` `moveToTrash()`-ს იძახის და არა
     * `delete()`-ს; `trash` scope წაშლილს ყველა ჩვეულებრივ query-ს მალავს.
     */
    use HasTrash;

    protected $guarded = ['id'];

    /* ⚠️ სტატუსი ყოველთვის იტვირთოს: სიაში ბეჯი, ფილტრი და როლი
       ყველგან სჭირდება, ცალკე `with()` კი ოცამდე ადგილას დაგვავიწყდებოდა. */
    protected $with = ['status'];

    protected $casts = [
        'tags' => 'array',
        'links' => 'array',
        'due_at' => 'datetime',
        'is_favorite' => 'boolean',
        'sort_order' => 'integer',
    ];

    /**
     * ⚠️ ფაილები SQL-ის cascade-ით იშლება, მაგრამ cascade **მოდელის ივენთს
     * არ აგდებს** — ე.ი. ფაილი დისკზე და კვოტის მრიცხველი უცვლელი დარჩებოდა.
     * შეხსენებებსა და შეტყობინებებს ფაილი არ აქვთ, ისინი cascade-ს ენდობა.
     */
    protected static function booted(): void
    {
        static::deleting(function (NoteEntry $entry) {
            /* ⚠️ **`withoutGlobalScope('owner')` სავალდებულოა** (Tasks BUG-21):
               `<module>_files` `BelongsToUser`-ს იყენებს, ე.ი. `files()`
               მიმდინარე **ავტორიზებულ** მომხმარებელზე იჭრება. `/admin/purge`
               და ანგარიშის წაშლა სხვის ბიბლიოთეკას შლის ადმინის სესიიდან —
               სია ცარიელი ბრუნდებოდა, ფაილები დისკზე რჩებოდა და კვოტაც არ
               თავისუფლდებოდა. `Video::booted()` ამას თავიდანვე სწორად აკეთებდა. */
            $entry->files()->withoutGlobalScope('owner')->get()->each->delete();
        });
    }

    /** სტატუსი `watched_at`-ს არ ეხება — იხ. `HasStatus::statusDoneColumn()` */
    protected function statusDoneColumn(): ?string
    {
        return null;
    }

    /* ---------- relations ---------- */

    public function category(): BelongsTo
    {
        return $this->belongsTo(NoteCategory::class, 'category_id');
    }

    public function files(): HasMany
    {
        return $this->hasMany(NoteEntryFile::class)->orderBy('sort_order')->orderBy('id');
    }

    public function reminders(): HasMany
    {
        return $this->hasMany(NoteReminder::class)->orderBy('next_at')->orderBy('id');
    }
}
