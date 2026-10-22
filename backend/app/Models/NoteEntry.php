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
 * ჩანაწერი — მოდული `note`.
 *
 * ⚠️ **ცხრილს `note_entries` ჰქვია და არა `notes`.** 2026-09-03-ის წესით
 * უნივერსალური `notes` აღარ არსებობს და სახელი „ჩანიშვნას სხვა ჩანაწერზე"
 * ნიშნავს (`video_notes`, `book_notes`…). აქ კი ჩანაწერი **დამოუკიდებელი
 * ერთეულია**, ამიტომ `note_entries`.
 *
 * ⚠️ **ხილვადობა აქ მკაცრია**: მოდული პირად დოკუმენტებს ინახავს,
 * ე.ი. `private` არა მხოლოდ default-ია — საჯარო პროფილზე მოდული საერთოდ
 * არ ჩანს და „დამთხვევებში" არასდროს მონაწილეობს.
 */
class NoteEntry extends Model
{
    use BelongsToUser;

    /** მორგებულ ველზე ატვირთული ფაილები (წაშლა → დისკი + კვოტა) */
    use HasCustomFields;

    /** სტატუსი per-user ლექსიკონია (`statuses`), enum-ი აღარაა */
    use HasStatus;

    /** ტეგების ერთი ქცევა (`Video::normalizeTags()`) */
    use HasTags;

    /**
     * ⚠️ **კალათა** — `destroy()` `moveToTrash()`-ს იძახის და არა
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
        'is_favorite' => 'boolean',
        'sort_order' => 'integer',
        'finished_at' => 'date',
    ];

    /**
     * ⚠️ ფაილები SQL-ის cascade-ით იშლება, მაგრამ cascade **მოდელის ივენთს
     * არ აგდებს** — ე.ი. ფაილი დისკზე და კვოტის მრიცხველი უცვლელი დარჩებოდა.
     * შეხსენებებსა და შეტყობინებებს ფაილი არ აქვთ, ისინი cascade-ს ენდობა.
     */
    protected static function booted(): void
    {
        static::deleting(function (NoteEntry $entry) {
            /* ⚠️ **`withoutGlobalScope('owner')` სავალდებულოა**:
               `<module>_files` `BelongsToUser`-ს იყენებს, ე.ი. `files()`
               მიმდინარე **ავტორიზებულ** მომხმარებელზე იჭრება. `/admin/purge`
               და ანგარიშის წაშლა სხვის ბიბლიოთეკას შლის ადმინის სესიიდან —
               სია ცარიელი ბრუნდებოდა, ფაილები დისკზე რჩებოდა და კვოტაც არ
               თავისუფლდებოდა. `Video::booted()` ამას თავიდანვე სწორად აკეთებდა. */
            $entry->files()->withoutGlobalScopes(['owner', 'trash'])->get()->each->delete();
        });
    }

    /**
     * **„როდის დავასრულე" — `finished_at`.**
     *
     * ⚠️ აქამდე `null` იყო და ეს **ვიდეოს მიზეზით** იყო გამართლებული:
     * მისი `watched_at` დაკვრის დროშტამპია (`POST /videos/{id}/watched`),
     * ე.ი. სტატუსი მას ვერ შეეხებოდა. ჩანაწერს ასეთი მეორე ფაქტი **არ
     * ჰქონია** — უბრალოდ სვეტი არ არსებობდა, ამიტომ წლიურ მიზანში
     * მონაწილეობას ვერ იღებდა.
     *
     * ⚠️ **ახალი მექანიზმი არ დაწერილა**: `HasStatus::applyStatus()` უკვე
     * არის ერთადერთი წერტილი, სადაც ეს სვეტი `done` როლზე ივსება და უკან
     * დაბრუნებაზე იწმინდება — ე.ი. საკმარისი იყო სახელის დაბრუნება.
     */
    protected function statusDoneColumn(): ?string
    {
        return 'finished_at';
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

    /**
     * ⚠️ **ჩანაწერის აღდგენა მის შეხსენებებსაც ახლიდან ითვლის**:
     * ურნაში ყოფნისას `ReminderDispatcher` მათ არ ისვრის (`whereHas('noteEntry')`),
     * ე.ი. `next_at` წარსულში რჩება და აღდგენისთანავე ყველა ერთად ამოვარდებოდა.
     */
    protected function afterTrashChange(bool $trashed): void
    {
        if ($trashed) {
            return;
        }

        foreach ($this->reminders()->where('is_active', true)->get() as $reminder) {
            $reminder->next_at = $reminder->computeNextAt();
            $reminder->saveQuietly();
        }
    }

    public function reminders(): HasMany
    {
        return $this->hasMany(NoteReminder::class)->orderBy('next_at')->orderBy('id');
    }
}
