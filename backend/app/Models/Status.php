<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Models\Concerns\HasTrash;
use App\Support\DictionaryKey;
use App\Support\DictionaryTrash;
use App\Support\StatusDomain;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

/**
 * **სტატუსი — per-user ლექსიკონი (Tasks §6.2/§6.4).**
 *
 * ერთი ცხრილი ექვსივე დომენზე (`module` სვეტი ჭრის), და არა
 * `movie_statuses`/`video_statuses`/… — ექვსი იდენტური ცხრილი ექვს
 * კონტროლერს, ექვს პოლისსა და ექვს მიგრაციას ნიშნავდა, განსხვავება კი
 * მხოლოდ უცხო გასაღების სახელი იქნებოდა.
 *
 * ⚠️ **`key` არასდროს იცვლება** — გადარქმევა `name_*`-ს ეხება. სწორედ
 * `key` აკავშირებს მომხმარებლის ლექსიკონს კოდში ჩაწერილ ნაგულისხმევებთან
 * (`?view=watched`, `PurgeService::TARGET_STATUSES`, i18n-ის `status.*`),
 * ე.ი. მისი ცვლა ძველ ბმულებს გაწყვეტდა.
 *
 * ⚠️ **`role` არ არის „ფერი"** — სამი სერვისი *მნიშვნელობას* ეკითხება
 * (იხ. `StatusDomain`-ის დოკუმენტაცია). ამიტომ ის `null` ვერ იქნება.
 */
class Status extends Model
{
    /**
     * ⚠️ **ურნა (Tasks §29, ეტაპი 3)** — წაშლა რიგს ურნაში აგზავნის
     * (`DictionaryTrash::trash()`); `trash_meta` იმახსოვრებს გადატანილ
     * ჩანაწერებს, რომ აღდგენამ მათი დაბრუნება შემოგთავაზოს.
     */
    use BelongsToUser, HasTrash;

    protected $guarded = ['id'];

    protected $casts = [
        'trash_meta' => 'array',
        'sort_order' => 'integer',
        'is_default' => 'boolean',
    ];

    /* ---------- აუდიტი ---------- */

    /**
     * ⚠️ ამ მოდელის მოდული **რიგშია და არა კლასში** — ერთი ცხრილი ექვს
     * მოდულს ემსახურება, ე.ი. `AuditRegistry::MODELS`-ის სტატიკური რუკა
     * მას ვერ უპასუხებდა (ლოგში ყველა სტატუსი ერთ ფსევდო-მოდულში
     * მოხვდებოდა და მოდულის ფილტრი მათ ვერ იპოვიდა).
     */
    public function auditModule(): string
    {
        return StatusDomain::usesDictionary($this->module)
            ? StatusDomain::module($this->module)
            : 'account';
    }

    /* ---------- სკოუპები ---------- */

    public function scopeForDomain(Builder $query, string $domain): Builder
    {
        return $query->where('module', $domain);
    }

    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('sort_order')->orderBy('id');
    }

    /* ---------- ლენივი დეფაულტები ---------- */

    /**
     * ამ user-ს ამ დომენზე ჯერ ერთი სტატუსიც არ აქვს → ნაკრები შეიქმნას.
     * ლენივი შევსება მიგრაციაზე საიმედოა (`VideoType::ensureDefaults()`-ის
     * წესი): ახალი ანგარიშიც და მოგვიანებით ჩართული მოდულიც ერთ გზას გადის.
     */
    public static function ensureDefaults(int $userId, string $domain): void
    {
        if (! StatusDomain::usesDictionary($domain)) {
            return;
        }

        /* ⚠️ ურნაში მყოფიც ითვლება (Tasks §29) — ყველა სტატუსის ურნაში გადატანის
           შემდეგ ნაგულისხმევები იმავე გასაღებებით თავიდან ჩაიწერებოდა და
           `unique(user_id, module, key)` 500-ს დააბრუნებდა. */
        $query = static::withoutGlobalScopes(['owner', 'trash'])->where('user_id', $userId)->where('module', $domain);

        if ((clone $query)->exists()) {
            return;
        }

        /* ⚠️ **query builder-ით და არა `create()`-ით.** საწყისი ნაკრები
           მანქანის დაწერილია და არა ადამიანის, ე.ი. აუდიტ-ლოგში არ უნდა
           მოხვდეს — თორემ ბიბლიოთეკის პირველივე გახსნა ლოგს ოცამდე
           „შექმნილია სტატუსი" რიგით ავსებდა და ნამდვილ ცვლილებებს ფარავდა. */
        $now = now();
        $rows = [];

        foreach (StatusDomain::defaults($domain) as $i => $status) {
            $rows[] = $status + [
                'user_id' => $userId,
                'module' => $domain,
                'is_default' => (bool) ($status['is_default'] ?? false),
                'icon' => $status['icon'] ?? null,
                'sort_order' => $i + 1,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        DB::table((new static)->getTable())->insert($rows);
    }

    /**
     * **„ნაგულისხმევი სტატუსების აღდგენა" (Tasks 2026-10-02 §1)** — მხოლოდ ღილაკით.
     *
     * ამატებს მხოლოდ იმას, რაც აკლია, და **არაფერს შლის**: ცოცხალი სტატუსი
     * (გადარქმეულიც — გასაღებით იცნობა) ხელუხლებელია; ურნაში მყოფი ნაგულისხმევი
     * **იქიდან ბრუნდება** (ახალი იმავე გასაღებით ვერც შეიქმნებოდა —
     * `unique(user_id, module, key)` ურნისასაც ხედავს); დანარჩენი თავიდან იქმნება.
     *
     * ⚠️ **ავტომატურად — არასდროს** (`ensureDefaults()` ამიტომ მხოლოდ ცარიელ
     * ლექსიკონს ავსებს): განზრახ წაშლილი სტატუსი თავისით რომ ბრუნდებოდეს,
     * „ყველაფერი წაშლადია" მოტყუება იქნებოდა.
     * ⚠️ **თანამოსახელე გამოტოვდება** (`skipped`): იმავე სახელის საკუთარი
     * სტატუსი სხვა გასაღებით რომ გაქვს, მეორე „საყურებელი" ორ ერთნაირ რიგს
     * დახატავდა (`restore_to_watch_status` მიგრაციის წესი).
     * ⚠️ **ადგილი კანონიკურია**: აღდგენილი უახლოეს წინა ნაგულისხმევს მოსდევს
     * („საყურებელი" — „გადაუწყვეტელს"); წინა თუ არ არის — სიის თავშია.
     * რიგის გადაწერა query builder-ითაა (`reorder`-ის წესი — ჟურნალს არ ავსებს);
     * შექმნა კი მოდელით — ეს ადამიანის ქმედებაა და ჟურნალში უნდა ჩანდეს.
     * ⚠️ ნაგულისხმევი (`is_default`) მხოლოდ მაშინ ინიშნება, როცა ცოცხალ სიაში
     * არცერთი არ არის — თორემ არჩეულს ჩუმად შეცვლიდა.
     *
     * @return array{restored: list<string>, from_trash: list<string>, skipped: list<string>}
     */
    public static function restoreDefaults(int $userId, string $domain): array
    {
        $defaults = array_values(StatusDomain::defaults($domain));
        $result = ['restored' => [], 'from_trash' => [], 'skipped' => []];

        if ($defaults === []) {
            return $result;
        }

        $base = fn () => static::withoutGlobalScopes(['owner', 'trash'])->where('user_id', $userId)->where('module', $domain);
        $all = $base()->get();
        $live = $all->filter(fn (self $s) => $s->trashed_at === null);

        $norm = fn (?string $v) => mb_strtolower(trim((string) preg_replace('/\s+/u', ' ', (string) $v)));
        $taken = $live->flatMap(fn (self $s) => [$norm($s->name_ka), $norm($s->name_en)])->filter()->unique()->values()->all();

        $back = [];

        foreach ($defaults as $default) {
            $key = (string) $default['key'];

            if ($live->contains(fn (self $s) => $s->key === $key)) {
                continue;
            }

            $names = array_filter([$norm($default['name_ka'] ?? null), $norm($default['name_en'] ?? null)]);

            if (array_intersect($names, $taken) !== []) {
                $result['skipped'][] = $key;

                continue;
            }

            $trashed = $all->first(fn (self $s) => $s->key === $key);

            if ($trashed) {
                // ⚠️ ურნის აღდგენის იგივე გზა (`TrashBin::restore()` ჩანაწერების გარეშე): ჟურნალს `HasTrash` წერს
                $trashed->restoreFromTrash();
                DictionaryTrash::forget($trashed);
                $result['from_trash'][] = $key;
                $back[$key] = $trashed;
            } else {
                $row = new static;
                $row->forceFill([
                    'user_id' => $userId,
                    'module' => $domain,
                    'key' => $key,
                    'name_ka' => $default['name_ka'],
                    'name_en' => $default['name_en'],
                    'role' => $default['role'],
                    'icon' => $default['icon'] ?? null,
                    'color' => $default['color'] ?? null,
                    'is_default' => false,
                    'sort_order' => 0,
                ])->save();

                $result['restored'][] = $key;
                $back[$key] = $row;
            }

            $taken = [...$taken, ...$names];
        }

        if ($back === []) {
            return $result;
        }

        // ---------- რიგი: აღდგენილი — უახლოეს წინა ნაგულისხმევს მოსდევს ----------
        $order = $base()->whereNull('trashed_at')
            ->whereNotIn('id', array_map(fn (self $s) => $s->getKey(), array_values($back)))
            ->orderBy('sort_order')->orderBy('id')
            ->get()
            ->all();
        $canonical = array_map(fn (array $d) => (string) $d['key'], $defaults);

        foreach ($canonical as $i => $key) {
            if (! isset($back[$key])) {
                continue;
            }

            $position = 0;

            for ($j = $i - 1; $j >= 0; $j--) {
                foreach ($order as $index => $row) {
                    if ($row->key === $canonical[$j]) {
                        $position = $index + 1;
                        break 2;
                    }
                }
            }

            array_splice($order, $position, 0, [$back[$key]]);
        }

        foreach ($order as $index => $row) {
            if ((int) $row->sort_order !== $index + 1) {
                static::withoutGlobalScopes(['owner', 'trash'])->whereKey($row->getKey())->update(['sort_order' => $index + 1]);
            }
        }

        // ---------- ნაგულისხმევი — მხოლოდ მაშინ, როცა არცერთი არ არის ----------
        $hasDefault = $base()->whereNull('trashed_at')->where('is_default', true)->exists();
        $canonicalDefault = collect($defaults)->first(fn (array $d) => ! empty($d['is_default']));

        if (! $hasDefault && $canonicalDefault) {
            $base()->whereNull('trashed_at')->where('key', $canonicalDefault['key'])->first()
                ?->forceFill(['is_default' => true])
                ->save();
        }

        return $result;
    }

    /**
     * ამ user-ის ნაგულისხმევი სტატუსი — ახალი ჩანაწერი მას იღებს.
     * ⚠️ `is_default`-იანი წაშლილია → პირველი რიგი; სია ცარიელია → `null`
     * (სტატუსის გარეშე ჩანაწერიც კანონიერია, იხ. `HasStatus`).
     */
    public static function defaultFor(int $userId, string $domain): ?self
    {
        static::ensureDefaults($userId, $domain);

        $query = static::withoutGlobalScope('owner')
            ->where('user_id', $userId)
            ->where('module', $domain)
            ->ordered();

        return (clone $query)->where('is_default', true)->first() ?? $query->first();
    }

    /**
     * ვალიდაციის წესი ჩანაწერის `status` ველზე — **გასაღები ამ ანგარიშის
     * ლექსიკონში უნდა არსებობდეს**.
     *
     * ⚠️ `ensureDefaults()` აქვე ეშვება: ახალ ანგარიშზე ჯერ ერთი რიგიც არ
     * არსებობს, ე.ი. `status=watched` წესიერი მოთხოვნაც 422-ად დაბრუნდებოდა.
     */
    public static function rule(string $domain, ?int $userId = null): Exists
    {
        $userId ??= (int) Auth::id();
        static::ensureDefaults($userId, $domain);

        // ⚠️ ურნაში მყოფი სტატუსი ჩანაწერს ვერ მიენიჭება (Tasks §29)
        return Rule::exists('statuses', 'key')
            ->where('user_id', $userId)
            ->where('module', $domain)
            ->whereNull('trashed_at');
    }

    /** ამ ანგარიშის გასაღებები ამ დომენზე (რიგის დაცვით) */
    public static function keysFor(int $userId, string $domain): array
    {
        static::ensureDefaults($userId, $domain);

        return static::withoutGlobalScope('owner')
            ->where('user_id', $userId)
            ->where('module', $domain)
            ->ordered()
            ->pluck('key')
            ->all();
    }

    /**
     * სახელიდან უნიკალური key — ლათინური slug, ქართულ სახელზეც მუშაობს.
     *
     * ⚠️ **`all`/`favorite`/`downloaded` დაკავებულია** (ეტაპი 8): ისინი
     * `?view=`-ის ფსევდო-განყოფილებებია. „Favorite" სახელის სტატუსი
     * `favorite` გასაღებს რომ მიეღო, მისი სექცია რჩეულებს გაიხსნიდა, და
     * საიდბარის განლაგებაში ორი რიგი ერთ id-ს იკავებდა.
     */
    public static function makeKey(int $userId, string $domain, string $name): string
    {
        /* ⚠️ **ალგორითმი საერთოა** (`DictionaryKey`, აუდიტი §B3): აქ იდო
           ცხრა ასლიდან ერთ-ერთი, რომელიც უნიკალურობას სრულ სტრიქონზე
           ამოწმებდა და მხოლოდ შემდეგ ჭრიდა 60-მდე — ე.ი. გრძელ ქართულ
           სახელზე ჩაწერილი გასაღები შემოწმებულს **არ** ემთხვეოდა.
           აქაური განსხვავება მხოლოდ ისაა, რომ დაკავებულად ჩაითვლება
           დაცული გასაღებიც (`all`/`favorite`/`downloaded`). */
        return DictionaryKey::make(
            $name,
            fn (string $key) => in_array($key, StatusDomain::RESERVED_KEYS, true)
                // ⚠️ ურნაში მყოფი რიგი გასაღებს ინარჩუნებს (Tasks §29)
                || static::withoutGlobalScopes(['owner', 'trash'])
                    ->where('user_id', $userId)
                    ->where('module', $domain)
                    ->where('key', $key)
                    ->exists(),
            'status',
        );
    }
}
