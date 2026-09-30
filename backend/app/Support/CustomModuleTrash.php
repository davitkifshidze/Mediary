<?php

namespace App\Support;

use App\Models\AuditLog;
use App\Models\CustomRecord;
use App\Models\Module;
use App\Models\Status;
use App\Models\TrashEntry;
use App\Models\User;
use App\Services\Audit\AuditLogger;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\DB;

/**
 * **პირადი მოდულის წაშლა — ურნაში, ერთ ელემენტად (Tasks §37.7, Q31).**
 *
 * შენი გადაწყვეტილება: შენ მიერ შექმნილ მოდულს წაშლი, ის **ჩანაწერებთან
 * ერთად** ურნაში გადადის (§29, Q21 — „დ") და ვადის განმავლობაში აღდგება.
 *
 * ⚠️ **ერთი ელემენტი და არა ას ერთი** (`AuditLogTrash`-ის ფორმა): მოდული
 * `trash_entries`-ის ერთი რიგია (`kind = custom_module`), ჩანაწერები კი
 * ადგილზე რჩება და **თავისით** არ ინიშნება ურნაში — მათ მოდული მალავს:
 * `Module`-ის `trash` scope-ი მოდულს ყველა რეესტრიდან აქრობს (მენიუ,
 * მარშრუტი, ძებნა, სტატისტიკა, ექსპორტი, გალერეა, საჯარო პროფილი), ე.ი.
 * ჩანაწერამდე მისასვლელი გზა აღარ რჩება. ჩანაწერების სათითაოდ მონიშვნა
 * ურნას ასი ელემენტით დამარხავდა, და ერთის ცალკე აღდგენა ურნაში მყოფ
 * მოდულში აზრს დაკარგავდა.
 *
 * ⚠️ **ურნაში უკვე მყოფი ჩანაწერი მოდულს მიჰყვება**: ის მოდულთან ერთად
 * იმალება, აღდგენისას თავისი ძველი ვადით ბრუნდება, საბოლოო წაშლაზე კი
 * მოდულთან ერთად ქრება.
 *
 * ⚠️ **საბოლოო წაშლა კოდია და არა კასკადი** — `TrashEntry`-ის `deleting`
 * მოვლენა `erase()`-ს იძახებს (ხელით წაშლა, დაცლა, ვადის გასვლა): ყოველი
 * ჩანაწერი **მოდელით** იშლება, რომ ფაილები, გალერეა, დამატებითი ველები
 * და კვოტა გათავისუფლდეს (BUG-21-ის გაკვეთილი), და მხოლოდ მერე მოდული.
 * `modules.key`-ის FK-კასკადი ჩანაწერებს ივენთების გარეშე წაშლიდა.
 *
 * ⚠️ **აღდგენა ჯერ მოდულის სვეტს ასუფთავებს და მერე შლის ელემენტს** —
 * `erase()` მხოლოდ **ურნაში მყოფ** მოდულს ეხება, ე.ი. აღდგენის წაშლა მას
 * ვეღარ მოიცავს.
 */
final class CustomModuleTrash
{
    public const KIND = 'custom_module';

    /** `trash_entries.record_type` — ელემენტი მოდულს ეხება და არა ჩანაწერს */
    public const RECORD_TYPE = 'module';

    /** ჩანაწერები, რომლებიც მოდულთან ერთად გადავა (ურნაში უკვე მყოფის გარეშე) */
    public static function liveRecords(Module $module): int
    {
        return CustomRecord::withoutGlobalScopes()
            ->where('module', $module->key)
            ->where('user_id', $module->owner_id)
            ->whereNull('trashed_at')
            ->count();
    }

    /** მოდული ურნაში — ერთ ელემენტად */
    public static function trash(User $owner, Module $module): TrashEntry
    {
        $records = self::liveRecords($module);

        $entry = DB::transaction(function () use ($owner, $module, $records) {
            /* ⚠️ `saveQuietly()` — მომხმარებლის რედაქტირება არ არის (`HasTrash`-ის
               წესი); ჟურნალი ქვემოთ ხელით, ერთი რიგით. */
            $module->forceFill(['trashed_at' => now()])->saveQuietly();

            return TrashEntry::withoutGlobalScope('owner')->create([
                'user_id' => $owner->getKey(),
                'kind' => self::KIND,
                'record_type' => self::RECORD_TYPE,
                'record_id' => $module->getKey(),
                'slot' => $module->key,
                'label' => $module->name_ka ?: $module->name_en,
                'payload' => [
                    'key' => $module->key,
                    'name_ka' => $module->name_ka,
                    'name_en' => $module->name_en,
                    'icon' => $module->icon,
                    'color' => $module->color,
                    'records' => $records,
                ],
                'trashed_at' => now(),
            ]);
        });

        CustomModules::flush();

        app(AuditLogger::class)->model($module, AuditLog::ACTION_DELETE, null, ['trashed' => true, 'records' => $records]);

        return $entry;
    }

    /**
     * აღდგენა — მოდული ბრუნდება ყველაფრით, რაც მას ეკუთვნოდა.
     *
     * @return string|null უარის კოდი (`TrashBin::blocked()`-ის ენაზე) ან `null`
     */
    public static function restore(TrashEntry $entry): ?string
    {
        $module = self::moduleOf($entry);

        if (! $module || $module->trashed_at === null) {
            return 'parent_missing';
        }

        DB::transaction(function () use ($module, $entry) {
            $module->forceFill(['trashed_at' => null])->saveQuietly();

            // ⚠️ სვეტი უკვე ცარიელია — `deleting`-ის `erase()` მას აღარ შეეხება
            $entry->delete();
        });

        CustomModules::flush();

        app(AuditLogger::class)->model($module, AuditLog::ACTION_RESTORE, null, ['trashed' => false]);

        return null;
    }

    /**
     * **საბოლოო წაშლა** — `TrashEntry::deleting`-იდან.
     *
     * ⚠️ **ჩანაწერები მოდელით, სათითაოდ** (`lazyById` — წაშლისას offset-ის
     * ცდომა არ ხდება): ყოველი მათგანის `deleting` თავის ფოტოს, ფაილებს,
     * ჩანიშვნებს, გალერეას და დამატებით ველებს შლის და კვოტას ათავისუფლებს.
     * ⚠️ `withoutGlobalScopes()` — გასუფთავება CLI-დანაც ეშვება (`Auth::id()`
     * ცარიელია) და ურნაში მყოფი ჩანაწერიც უნდა წავიდეს.
     */
    public static function erase(TrashEntry $entry): void
    {
        $module = self::moduleOf($entry);

        if (! $module || $module->trashed_at === null) {
            return;
        }

        $key = (string) $module->key;

        foreach (CustomRecord::withoutGlobalScopes()->where('module', $key)->lazyById() as $record) {
            $record->delete();
        }

        // სტატუსები (ურნაში მყოფიც) — ფაილი არ აქვთ, ჩანაწერები კი უკვე აღარ არის
        Status::withoutGlobalScopes()->where('module', $key)->delete();

        /* ⚠️ მოდელით — `AuditObserver` წაშლას თვითონ წერს; FK-კასკადი
           `module_user`-სა და კლასიფიკატორს (`custom_categories`) წაიღებს. */
        $module->delete();

        CustomModules::flush();
    }

    /**
     * **ამ ანგარიშის ურნაში მყოფი მოდულები** — `გასაღები => ელემენტის id`.
     * `StorageMeter::markTrash()` ამით მოდულის ფაილებს ელემენტს მიაწერს.
     *
     * @return array<string, int>
     */
    public static function entriesOf(User $user): array
    {
        return TrashEntry::withoutGlobalScope('owner')
            ->where('user_id', $user->getKey())
            ->where('kind', self::KIND)
            ->pluck('id', 'slot')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /** ელემენტის სათაური — მოდულის სახელი ინტერფეისის ენაზე */
    public static function title(TrashEntry $entry): string
    {
        $payload = (array) $entry->payload;
        $name = App::getLocale() === 'en' ? ($payload['name_en'] ?? null) : ($payload['name_ka'] ?? null);

        return (string) ($name ?: $entry->label ?: ($payload['key'] ?? '#'.$entry->getKey()));
    }

    /** რამდენი ჩანაწერი გადავიდა მოდულთან ერთად */
    public static function count(TrashEntry $entry): int
    {
        return (int) (((array) $entry->payload)['records'] ?? 0);
    }

    private static function moduleOf(TrashEntry $entry): ?Module
    {
        return Module::withoutGlobalScope('trash')
            ->whereKey($entry->record_id)
            ->whereNotNull('owner_id')
            ->first();
    }
}
