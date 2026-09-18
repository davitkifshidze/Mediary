<?php

namespace App\Services\Modules;

use App\Models\Module;
use App\Models\User;
use App\Services\Storage\StorageMeter;
use App\Support\CustomFields;
use App\Support\SafeMime;
use App\Support\StorageFolder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

/**
 * **მორგებული ველები (Tasks §6, ფაზა 3).**
 *
 * ორი ნახევარი, განზრახ სხვადასხვა ადგილას:
 *  · **განსაზღვრება** — `module_user.settings['custom_fields']`. ის მოდულისაა
 *    და არა ჩანაწერის, ე.ი. იქვე ცხოვრობს, სადაც ჩაშენებული ველების
 *    გადახრები (`FieldSettings`) — მიგრაცია არ სჭირდება.
 *  · **მნიშვნელობა** — `<module>_field_values` ცხრილი (`DECISIONS.md` §2).
 *
 * ⚠️ **განსაზღვრებების ჩაწერა „მთელი სიაა"** და არა თითო ველზე PATCH: წაშლა
 * = სიიდან ამოგდება. იგივე ნიმუში, რაც `PUT /playlists/{id}/songs`-ს აქვს —
 * თანმიმდევრობა და შემადგენლობა ერთ ოპერაციაში ვერ აცდება ერთმანეთს.
 *
 * ⚠️ **key არასდროს იცვლება.** სახელის გადარქმევა ლეიბლს ცვლის და არა key-ს;
 * key-ის შეცვლა ბაზაში დაწერილ მნიშვნელობებს ობლად დატოვებდა.
 */
class CustomFieldService
{
    /** ერთ მოდულზე დაშვებული ველების ჭერი — ფორმა უსასრულოდ არ უნდა გაიზარდოს */
    public const MAX_FIELDS = 20;

    public function __construct(private StorageMeter $meter) {}

    /**
     * ამ user-ის მორგებული ველები ამ მოდულზე, დალაგებული.
     *
     * @return list<array<string, mixed>>
     */
    public function definitions(User $user, string $module): array
    {
        if (! CustomFields::supports($module)) {
            return [];
        }

        $raw = (array) ($this->settings($user, $module)['custom_fields'] ?? []);
        $out = [];

        foreach ($raw as $item) {
            $field = $this->normalize((array) $item, array_column($out, 'key'));
            if ($field) {
                $out[] = $field;
            }
        }

        usort($out, fn (array $a, array $b) => $a['sort_order'] <=> $b['sort_order']);

        return $out;
    }

    /**
     * განსაზღვრებების ჩაწერა (მთელი სია).
     *
     * ⚠️ **key-ის გარეშე მოსული ველი ახალია** და key სახელიდან იქმნება;
     * არსებული key უცვლელი რჩება, თუნდაც ლეიბლი შეიცვალოს.
     *
     * @param  list<array<string, mixed>>  $fields
     * @return list<array<string, mixed>>
     */
    public function saveDefinitions(User $user, string $module, array $fields): array
    {
        if (! CustomFields::supports($module)) {
            return [];
        }

        $before = $this->definitions($user, $module);
        $existing = array_column($before, 'key');
        $out = [];
        $taken = [];

        foreach (array_slice($fields, 0, self::MAX_FIELDS) as $i => $item) {
            $item = (array) $item;
            $key = (string) ($item['key'] ?? '');

            // ⚠️ უცნობი key ახალ ველად ითვლება და არა შეცდომად: ძველი SPA
            // შეიძლება key-ს საერთოდ არ აგზავნიდეს
            if ($key === '' || ! in_array($key, $existing, true)) {
                // ⚠️ **ინგლისური სახელი ჯერ** — ქართულიდან key ტრანსლიტერაციით
                // მიიღება („vistan_vnakhe"), რაც ბაზაში წაუკითხავია. ქართული
                // მაინც fallback-ია, თუ ინგლისური არ შეავსეს.
                $key = CustomFields::makeKey(
                    (string) ($item['label_en'] ?? $item['label_ka'] ?? ''),
                    [...$existing, ...$taken],
                );
            }

            $item['key'] = $key;
            $item['sort_order'] ??= ($i + 1) * 10;

            $field = $this->normalize($item, $taken);
            if (! $field) {
                continue;
            }

            $taken[] = $field['key'];
            $out[] = $field;
        }

        $settings = $this->settings($user, $module);
        $settings['custom_fields'] = $out;
        $this->write($user, $module, $settings);

        /* ⚠️ სიიდან ამოღებული ველის **მნიშვნელობებიც** იშლება. სხვაგვარად
           ბაზაში სამუდამოდ დარჩებოდა რიგები, რომლებსაც აღარაფერი კითხულობს —
           და ველის იმავე სახელით დაბრუნება ძველ პასუხებს „გააცოცხლებდა". */
        $removed = array_diff($existing, array_column($out, 'key'));

        /* §6 ფაზა 4b — ⚠️ **ტიპის შეცვლაც წაშლაა, თუ ველი `file` იყო.** სხვა
           ტიპებზე ძველი მნიშვნელობა უბრალოდ აღარ იკითხება და არაფერი ეღუპება;
           ფაილი კი დისკზე რჩებოდა, კვოტიდან არ თავისუფლდებოდა და მასზე
           წვდომა აღარსაიდან იქნებოდა — ე.ი. ობოლი გაჩნდებოდა. */
        $wasFile = array_column(array_filter($before, fn (array $f) => $f['type'] === 'file'), 'key');
        $isFile = array_column(array_filter($out, fn (array $f) => $f['type'] === 'file'), 'key');
        $retyped = array_diff($wasFile, $isFile, $removed);

        $orphaned = [...array_values($removed), ...array_values($retyped)];

        if ($orphaned && $table = CustomFields::table($module)) {
            // ჯერ დისკი და კვოტა, მერე რიგები — შებრუნებული რიგი გზას დაკარგავდა
            $this->releaseFiles($table, DB::table($table)
                ->where('user_id', $user->getKey())
                ->whereIn('field_key', $orphaned));

            /* ⚠️ **რიგები ორივე შემთხვევაში იშლება** (§7.3-ის შემდეგ). ადრე
               მხოლოდ წაშლილი ველის რიგები იშლებოდა, ტიპშეცვლილისა კი
               „გასუფთავებული" რჩებოდა — ერთფაილიან სქემაზე ეს ერთი ცარიელი
               რიგი იყო, ახლა კი **ყველა** ატვირთვისა, `sort_order`-ებით.
               ისინი არავის სჭირდება: `file` ველზე ტექსტი/რიცხვი არასდროს
               იწერება, ე.ი. ფაილის გარეშე რიგში სრულიად არაფერია. */
            DB::table($table)
                ->where('user_id', $user->getKey())
                ->whereIn('field_key', $orphaned)
                ->delete();
        }

        return $out;
    }

    /**
     * ერთი ჩანაწერის მნიშვნელობები: `field_key => მნიშვნელობა`.
     *
     * ⚠️ ტიპი **განსაზღვრებიდან** მოდის და არა იქიდან, რომელი სვეტია სავსე:
     * ველის ტიპის შეცვლის შემდეგ ძველი მნიშვნელობა უბრალოდ არ იკითხება,
     * ნაცვლად იმისა, რომ არასწორი ტიპით გამოჩნდეს.
     *
     * @return array<string, mixed>
     */
    public function values(User $user, string $module, int $recordId): array
    {
        $table = CustomFields::table($module);
        if (! $table) {
            return [];
        }

        $types = array_column($this->definitions($user, $module), 'type', 'key');

        $rows = DB::table($table)
            ->where('user_id', $user->getKey())
            ->where('record_id', $recordId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        $out = [];

        foreach ($rows as $row) {
            $type = $types[$row->field_key] ?? null;
            if ($type === null) {
                continue;
            }

            /* §7.3 — ⚠️ **`file` ველი **სია**-ა და არა ერთი ობიექტი**, თუნდაც
               ერთი ფაილი ედოს. ცვალებადი ფორმა („ერთზე ობიექტი, ორზე მასივი")
               ფრონტზე `Array.isArray()`-ის შემოწმებას ყოველ გამოყენებაზე
               მოითხოვდა და ერთ დღეს სადმე დაავიწყდებოდა. */
            if ($type === 'file') {
                $out[$row->field_key][] = $this->readFile($module, $recordId, $row);

                continue;
            }

            $out[$row->field_key] = $this->read($type, $row);
        }

        return $out;
    }

    /**
     * მნიშვნელობების ჩაწერა.
     *
     * ⚠️ **ცარიელი მნიშვნელობა რიგს შლის** და არა ცარიელს წერს: „არ შევსებული"
     * და „ცარიელი ტექსტი" ერთი და იგივეა, ორი ჩანაწერი კი ფილტრაციას გაართულებდა.
     *
     * @param  array<string, mixed>  $values
     * @return array<string, mixed>
     */
    public function setValues(User $user, string $module, int $recordId, array $values): array
    {
        $table = CustomFields::table($module);
        if (! $table) {
            return [];
        }

        $types = array_column($this->definitions($user, $module), 'type', 'key');

        foreach ($values as $key => $value) {
            $type = $types[$key] ?? null;
            // უცნობი ველი ჩუმად იგნორირდება — იგივე წესი, რაც `FieldSettings`-ს
            if ($type === null) {
                continue;
            }

            /* §6 ფაზა 4b — ⚠️ **`file` აქ არასდროს იწერება.** ატვირთვას თავისი
               endpoint აქვს; ბარათი კი მთელ მონახაზს აგზავნის და ფაილის
               აღწერა მასშიც ზის. აქ გატარება იმას ნიშნავდა, რომ ჩვეულებრივი
               „შენახვა" ცარიელ მნიშვნელობად წაიკითხავდა და ატვირთულ ფაილს
               ჩუმად წაშლიდა (რიგის წაშლა = ფაილის დაკარგვა). */
            if ($type === 'file') {
                continue;
            }

            $columns = $this->write_columns($type, $value);

            if ($columns === null) {
                DB::table($table)
                    ->where('user_id', $user->getKey())
                    ->where('record_id', $recordId)
                    ->where('field_key', $key)
                    ->delete();

                continue;
            }

            /* §7.3 — ⚠️ **არა-`file` ველი მუდამ `sort_order = 0`-ზე ზის.**
               unique ინდექსი სამსვეტიანი გახდა (`record_id, field_key,
               sort_order`), ე.ი. ამის გარეშე ერთსა და იმავე ტექსტურ ველს
               ორი პასუხი შეეძლო ჰქონოდა და ბაზა აღარ დაიცავდა იმას, რასაც
               აქამდე იცავდა. */
            /* ⚠️ **`created_at` მხოლოდ insert-ზე** (Tasks BUG-12). მეორე მასივი
               UPDATE-ის payload-იც არის, ე.ი. ფიქსირებული `'created_at' => now()`
               არსებული მნიშვნელობის ყოველ რედაქტირებაზე შექმნის თარიღს
               ახლანდელზე აყენებდა — `StorageMeter::files()` კი სწორედ ამ სვეტს
               კითხულობს „ატვირთვის თარიღად", ე.ი. custom-field ფაილის თარიღი
               ჩანაწერის ყოველ უკავშირო შენახვაზე წინ მიცოცავდა.
               ⚠️ closure-ს `$exists` `updateOrInsert()`-ის **უკვე გაკეთებული**
               `exists()`-იდან მოსდის, ე.ი. დამატებით query არ ჩნდება. */
            DB::table($table)->updateOrInsert(
                ['record_id' => $recordId, 'field_key' => $key, 'sort_order' => 0],
                fn (bool $exists) => [
                    'user_id' => $user->getKey(),
                    ...$columns,
                    'updated_at' => now(),
                    ...($exists ? [] : ['created_at' => now()]),
                ],
            );
        }

        return $this->values($user, $module, $recordId);
    }

    /* ---------- §6 ფაზა 4b — `ფაილი` ტიპი (🔗 §17) ---------- */

    /**
     * ველის ტიპი განსაზღვრებიდან — კონტროლერს ატვირთვამდე სჭირდება,
     * რომ არა-`file` ველზე ატვირთვა 422-ით შეაჩეროს.
     */
    public function typeOf(User $user, string $module, string $key): ?string
    {
        return array_column($this->definitions($user, $module), 'type', 'key')[$key] ?? null;
    }

    /**
     * ფაილის ატვირთვა ერთ ველზე — **ემატება და არა ანაცვლებს** (Tasks §7.3).
     *
     * ფაზა 4b-ში ერთეული ერთი იყო (`unique(record_id, field_key)`) და ახალი
     * ატვირთვა ძველს შლიდა. ახლა ინდექსი სამსვეტიანია და თითო ფაილს თავისი
     * `sort_order` აქვს, ე.ი. ველზე `FILE_MAX_COUNT` ფაილამდე ჯდება.
     *
     * ⚠️ **ჭერი ატვირთვამდე მოწმდება** (`false` = უარი): თუ ჯერ ავტვირთავდით
     * და მერე დავთვლიდით, კვოტა უკვე დახარჯული იქნებოდა და ბაიტებიც
     * დისკზე — „უარი" ისეთი რამის შემდეგ, რაც უკვე მოხდა.
     *
     * ⚠️ **რიგი მაქსიმუმს ემატება და არა რაოდენობას** — შუიდან წაშლილი
     * ფაილის შემდეგ რაოდენობა უკან იწევს და ახალი ატვირთვა არსებულს
     * დაეჯახებოდა (unique-ის დარღვევა).
     *
     * @return list<array<string, mixed>>|null ველის ახალი სია, ან `null` თუ ჭერი ამოიწურა
     */
    public function storeFile(User $user, string $module, int $recordId, string $key, UploadedFile $file): ?array
    {
        $table = CustomFields::table($module);

        $rows = DB::table($table)
            ->where('record_id', $recordId)
            ->where('field_key', $key)
            ->whereNotNull('value_path');

        if ((clone $rows)->count() >= CustomFields::FILE_MAX_COUNT) {
            return null;
        }

        $next = (int) ((clone $rows)->max('sort_order') ?? -1) + 1;

        // ⚠️ კვოტა `storeUpload()`-შია — ამოწურვაზე 413 **აქამდე** ამოვარდება
        $path = $this->meter->storeUpload($user, $file, StorageFolder::customFields($module));

        DB::table($table)->insert([
            'user_id' => $user->getKey(),
            'record_id' => $recordId,
            'field_key' => $key,
            'value_text' => null,
            'value_number' => null,
            'value_date' => null,
            'value_bool' => null,
            'value_path' => $path,
            'value_name' => mb_substr($file->getClientOriginalName(), 0, 255),
            // SEC-08 — ⚠️ **სერვერი ადგენს შიგთავსიდან**, და არა `getClientMimeType()`
            'value_mime' => SafeMime::ofUpload($file),
            // ⚠️ **ჩაწერილი ზომა** — წაშლისას სწორედ ის დაუბრუნდება კვოტას
            'value_size' => (int) $file->getSize(),
            'sort_order' => $next,
            'updated_at' => now(),
            'created_at' => now(),
        ]);

        return $this->values($user, $module, $recordId)[$key] ?? [];
    }

    /**
     * ფაილის მოშორება ერთი ველიდან.
     *
     * ⚠️ **რიგიც იშლება და არა მარტო სვეტები** — `file` ველზე ფაილი *არის*
     * მნიშვნელობა, ე.ი. უფაილო რიგი „შევსებულად" ჩაითვლებოდა.
     *
     * ⚠️ **`$fileId` არჩევითია განზრახ** (§7.3): მითითებით ერთი ფაილი მიდის,
     * მის გარეშე — ველის **ყველა** ფაილი. ძველი ერთფაილიანი გამოძახება
     * (`DELETE …/file/{key}`) ამიტომ ისევ იმას აკეთებს, რასაც აკეთებდა.
     */
    public function clearFile(User $user, string $module, int $recordId, string $key, ?int $fileId = null): bool
    {
        $table = CustomFields::table($module);

        $query = DB::table($table)
            ->where('user_id', $user->getKey())
            ->where('record_id', $recordId)
            ->where('field_key', $key)
            ->when($fileId !== null, fn ($q) => $q->where('id', $fileId));

        if ($this->releaseFiles($table, clone $query) === 0) {
            return false;
        }

        $query->delete();

        return true;
    }

    /**
     * ერთი ჩანაწერის ყველა ატვირთვის მოშორება — `HasCustomFields`-ის `deleting`.
     *
     * ⚠️ **ეს განზრახ trait-იდან იძახება და არა კასკადს ეყრდნობა.** რიგებს
     * SQL-ის `cascadeOnDelete` წაიღებს, ფაილს დისკზე კი **არავინ** — კასკადი
     * მოდელის ივენთს არ ისვრის (იგივე მიზეზი, რის გამოც `Video::booted()`
     * თავის ფაილებს სათითაოდ შლის).
     */
    public function purgeRecordFiles(Model $record): void
    {
        $module = CustomFields::moduleOf($record);
        $table = $module ? CustomFields::table($module) : null;

        if (! $table) {
            return;
        }

        $this->releaseFiles($table, DB::table($table)->where('record_id', $record->getKey()));
    }

    /**
     * დისკიდან წაშლა + კვოტის დაბრუნება + სვეტების გასუფთავება.
     * `$query`-ს **არ** შლის — რიგის ბედს გამომძახებელი წყვეტს.
     *
     * @return int რამდენ ფაილს შეეხო
     */
    private function releaseFiles(string $table, Builder $query): int
    {
        $rows = (clone $query)->whereNotNull('value_path')->get();

        foreach ($rows as $row) {
            $this->meter->deleteUpload(null, $row->value_path);
            $this->meter->addFor((int) $row->user_id, -(int) $row->value_size);

            DB::table($table)->where('id', $row->id)->update([
                'value_path' => null,
                'value_name' => null,
                'value_mime' => null,
                'value_size' => null,
                'updated_at' => now(),
            ]);
        }

        return $rows->count();
    }

    /**
     * ფაილის აღწერა ბარათისთვის.
     *
     * ⚠️ **`url` API-ს გზაა და არა `/storage/…`**. მიზეზი ორია: `notes/fields`
     * პრივატულ დისკზეა (§17.5) და საერთოდ url-ის გამოცნობით სხვისი ჩანაწერის
     * ატვირთვა არ უნდა იხსნებოდეს. ერთი გზა ორივე დისკზე — ორი განსხვავებული
     * ქცევა ფრონტზე `if`-ს დაბადებდა.
     *
     * @return array<string, mixed>
     */
    private function readFile(string $module, int $recordId, object $row): array
    {
        return [
            // §7.3 — ⚠️ **id სავალდებულოა**: ერთ ველზე რამდენიმე ფაილია და
            // სახელი უნიკალური არაა, ე.ი. „წაშალე ეს" სხვანაირად ვერ ითქმის
            'id' => (int) $row->id,
            'name' => $row->value_name,
            'mime' => $row->value_mime,
            'size' => (int) $row->value_size,
            'url' => "/custom-fields/{$module}/{$recordId}/file/{$row->field_key}/{$row->id}",
        ];
    }

    /* ---------- შიგნეული ---------- */

    /**
     * ერთი განსაზღვრების ნორმალიზება; `null` = გამოსაგდებია (უტიპო/დუბლი).
     *
     * @param  array<string, mixed>  $item
     * @param  list<string>  $taken
     * @return array<string, mixed>|null
     */
    private function normalize(array $item, array $taken): ?array
    {
        $key = (string) ($item['key'] ?? '');
        $type = (string) ($item['type'] ?? '');

        if ($key === '' || in_array($key, $taken, true) || ! in_array($type, CustomFields::TYPES, true)) {
            return null;
        }

        $text = function (string $attr) use ($item): ?string {
            $value = $item[$attr] ?? null;

            return is_string($value) && trim($value) !== '' ? mb_substr(trim($value), 0, 120) : null;
        };

        return [
            'key' => $key,
            'type' => $type,
            // ⚠️ **მორგებულ ველს ნაგულისხმევი ლეიბლი არ აქვს** — ჩაშენებულისგან
            // განსხვავებით ის ლოკალიზაციაში ვერ იქნება, ე.ი. key-ია fallback-ი
            'label_ka' => $text('label_ka'),
            'label_en' => $text('label_en'),
            'placeholder_ka' => $text('placeholder_ka'),
            'placeholder_en' => $text('placeholder_en'),
            'enabled' => (bool) ($item['enabled'] ?? true),
            'required' => (bool) ($item['required'] ?? false),
            /* ⚠️ **მორგებული ველი საჯარო ბარათზე არ ჩანს** და გადამრთველიც
               არ ეძლევა. საჯარო ბარათი `PublicDomain::card()`-ის ვიწრო,
               ხელით აწყობილი ფორმაა (§16.1) — მასში მორგებული მნიშვნელობის
               ჩართვა §16-ის ცალკე გაფართოებაა. გადამრთველი, რომელიც
               არაფერს ცვლის, ტყუილი იქნებოდა. */
            'public' => false,
            'sort_order' => (int) ($item['sort_order'] ?? 100),
            // ჩაშენებულისგან გასარჩევად — UI-ს წაშლის ღილაკი ამაზე დგას
            'custom' => true,
        ];
    }

    /** სვეტები ჩასაწერად; `null` = მნიშვნელობა ცარიელია, რიგი უნდა წაიშალოს */
    private function write_columns(string $type, mixed $value): ?array
    {
        $empty = ['value_text' => null, 'value_number' => null, 'value_date' => null, 'value_bool' => null];

        if ($type === 'switch') {
            // ⚠️ გადამრთველზე `false` **მნიშვნელობაა** და არა სიცარიელე
            return $value === null ? null : [...$empty, 'value_bool' => (bool) $value];
        }

        if ($type === 'list') {
            $list = array_values(array_filter(
                array_map(fn ($v) => is_string($v) ? trim($v) : null, (array) $value),
                fn (?string $v) => $v !== null && $v !== '',
            ));

            return $list ? [...$empty, 'value_text' => json_encode($list, JSON_UNESCAPED_UNICODE)] : null;
        }

        if (is_string($value)) {
            $value = trim($value);
        }
        if ($value === null || $value === '') {
            return null;
        }

        return match ($type) {
            'number' => is_numeric($value) ? [...$empty, 'value_number' => (float) $value] : null,
            'date' => [...$empty, 'value_date' => (string) $value],
            default => [...$empty, 'value_text' => mb_substr((string) $value, 0, 2000)],
        };
    }

    private function read(string $type, object $row): mixed
    {
        return match ($type) {
            'switch' => (bool) $row->value_bool,
            'number' => $row->value_number === null ? null : (float) $row->value_number,
            'date' => $row->value_date === null ? null : substr((string) $row->value_date, 0, 10),
            'list' => json_decode((string) $row->value_text, true) ?: [],
            default => $row->value_text,
        };
    }

    /** @return array<string, mixed> */
    private function settings(User $user, string $module): array
    {
        $moduleId = Module::where('key', $module)->value('id');

        if (! $moduleId) {
            return [];
        }

        // ⚠️ `DB::table` განზრახ: pivot-ის JSON-ს Eloquent არ cast-ავს (CLAUDE.md)
        $json = DB::table('module_user')
            ->where('user_id', $user->getKey())
            ->where('module_id', $moduleId)
            ->value('settings');

        return json_decode((string) $json, true) ?: [];
    }

    private function write(User $user, string $module, array $settings): void
    {
        $moduleRow = Module::where('key', $module)->first();

        if (! $moduleRow) {
            return;
        }

        $attrs = ['settings' => json_encode($settings)];

        if (! $user->modules()->where('modules.id', $moduleRow->id)->exists()) {
            $attrs['enabled_at'] = now();
        }

        $user->modules()->syncWithoutDetaching([$moduleRow->id => $attrs]);
    }
}
