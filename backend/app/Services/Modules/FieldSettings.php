<?php

namespace App\Services\Modules;

use App\Models\Module;
use App\Models\User;
use App\Support\FieldCatalog;
use Illuminate\Support\Facades\DB;

/**
 * **ველების კონფიგი (Tasks §6, ფაზა 1)** — `module_user.settings['fields']`.
 *
 * ⚠️ **მთელ `settings`-ს არ ვწერთ თავიდან** — ვკითხულობთ, `fields` გასაღებს
 * ვცვლით და უკან ვწერთ. `settings` სხვა რამესაც ინახავს (გალერეის
 * პარამეტრები, ჩანაწერების არხები), ე.ი. ბრმა გადაწერა მათ წაშლიდა.
 *
 * ⚠️ **pivot-ის რიგი შეიძლება საერთოდ არ არსებობდეს** — super_admin-ს
 * მოდულები იმპლიციტურად აქვს. ამიტომ ჩაწერა `syncWithoutDetaching`-ია
 * და არა `updateExistingPivot` (იგივე ხაფანგი, რაც `ModuleController`-ს).
 */
class FieldSettings
{
    public function __construct(private CustomFieldService $custom) {}

    /**
     * მოდულის ველები კატალოგიდან + user-ის გადახრები + **მისივე მორგებული
     * ველები** (ფაზა 3).
     *
     * ⚠️ ორივე სახე **ერთ სიაში** ბრუნდება და `custom` დროშით გაირჩევა:
     * ფორმას („დახატე ეს ველი, ამ ლეიბლით, ამ რიგზე") განსხვავება არ
     * აინტერესებს — მას მხოლოდ UI-ის წაშლის ღილაკი კითხულობს.
     *
     * @return list<array{key: string, type: string, enabled: bool, sort_order: int}>
     */
    public function for(User $user, string $module): array
    {
        $fields = array_map(
            fn (array $f) => [...$f, 'custom' => false],
            FieldCatalog::for($module, $this->overrides($user, $module)),
        );

        /* ⚠️ **მორგებული ველი არასდროსაა `locked`** — მას user თვითონ ქმნის და
           თვითონ შლის. დროშა მაინც ცხადად იწერება, რომ ორივე სახეს ერთი და
           იგივე ფორმა ჰქონდეს და ფრონტს `undefined`-ის შემოწმება არ სჭირდეს. */
        $customs = array_map(
            fn (array $f) => [...$f, 'locked' => false],
            $this->custom->definitions($user, $module),
        );

        $all = [...$fields, ...$customs];

        usort($all, fn (array $a, array $b) => $a['sort_order'] <=> $b['sort_order']);

        return $all;
    }

    /** ჩართულია თუ არა კონკრეტული ველი (backend-ის მხრიდან შემოწმებისთვის) */
    public function enabled(User $user, string $module, string $key): bool
    {
        foreach ($this->for($user, $module) as $field) {
            if ($field['key'] === $key) {
                return $field['enabled'];
            }
        }

        return false;
    }

    /**
     * **საჯარო ბარათზე დამალული ველები** (§6 ფაზა 4 → §16).
     *
     * ⚠️ **მფლობელის კონფიგი იკითხება და არა მნახველის** — საჯარო პროფილზე
     * წყვეტს ის, ვისიც ჩანაწერია. `PublicDomain::card()` ამ სიას იღებს.
     *
     * @return list<string>
     */
    public function hiddenOnPublic(User $user, string $module): array
    {
        // მორგებული ველი ისედაც არ ხვდება ბარათზე (იხ. `CustomFieldService`),
        // ე.ი. აქ მხოლოდ ჩაშენებულების არჩევანი ითვლება
        return FieldCatalog::hiddenOnPublic($module, $this->overrides($user, $module));
    }

    /**
     * გადახრების ჩაწერა.
     *
     * ⚠️ **უცნობი key ჩუმად იგნორირდება** და არა 422: კატალოგი დროთა
     * განმავლობაში იცვლება და ძველი ფრონტის რექვესთი ამით არ უნდა ტყდებოდეს.
     *
     * @param  array<string, array{enabled?: bool, required?: bool, public?: bool, label_ka?: ?string, label_en?: ?string, placeholder_ka?: ?string, placeholder_en?: ?string}>  $changes
     */
    public function save(User $user, string $module, array $changes): array
    {
        $settings = $this->settings($user, $module);
        $fields = (array) ($settings['fields'] ?? []);

        foreach ($changes as $key => $value) {
            if (! FieldCatalog::knows($module, (string) $key)) {
                continue;
            }

            $value = (array) $value;
            $current = (array) ($fields[$key] ?? []);

            /* ⚠️ **`unlocked` მხოლოდ `super_admin`-ს შეუძლია** (Tasks §4, შენი
               პასუხი 2026-09-16). კონფიგი თავისია და ზიანიც თავისივე ფორმებია,
               მაგრამ ჩაკეტვის მთელი ღირებულება შემთხვევითი დაჭერის შეჩერებაა —
               ე.ი. მოხსნა იმას რჩება, ვინც ცხადად თქვა, რომ შედეგს იღებს.
               ⚠️ უარი **ჩუმია და არა 422** — ფაილის არსებული წესი უცნობ
               გასაღებზე (ძველი ფრონტი არ უნდა ტყდებოდეს). */
            if (array_key_exists('unlocked', $value) && $user->isSuperAdmin()) {
                $current['unlocked'] = (bool) $value['unlocked'];

                /* ⚠️ **ხელახლა ჩაკეტვა დროშებსაც აბრუნებს** — თორემ დამალული
                   და თან „ჩაკეტილი" ველი დარჩებოდა, ე.ი. ფორმა გატეხილი
                   იქნებოდა და გვერდი კი იტყოდა, რომ ყველაფერი წესრიგშია. */
                if (! $current['unlocked']) {
                    foreach (FieldCatalog::FLAGS as $flag) {
                        unset($current[$flag]);
                    }
                }
            }

            /* ⚠️ **`locked` ველზე დროშები არ ინახება** (§6.5): სახელის ან
               ბმულის გამორთვა/არასავალდებულოდ გამოცხადება ჩაწერას გატეხავდა.
               `FieldCatalog::for()` ისედაც აიძულებს `true`-ს, ე.ი. ჩაწერა
               მხოლოდ ნაგავს დატოვებდა settings-ში. ⚠️ მოხსნილ ველზე კი
               ინახება — სწორედ ეს არის მოხსნის აზრი. */
            if (! FieldCatalog::isLocked($module, (string) $key) || ! empty($current['unlocked'])) {
                foreach (FieldCatalog::FLAGS as $flag) {
                    if (array_key_exists($flag, $value)) {
                        $current[$flag] = (bool) $value[$flag];
                    }
                }
            }

            /* ⚠️ **`sort_order` ჩაშენებულ ველზე აღარ ინახება** (§6.5 — „დალაგება
               აქ არ გვინდა"): რიგი კატალოგისაა, ე.ი. კოდის. მორგებულ ველებს
               თავისი რედაქტორი აქვს და მათი რიგი `CustomFieldService`-შია. */

            /* ⚠️ ცარიელი ტექსტი **გადახრას შლის** და არა ცარიელ ლეიბლს წერს:
               user-ის ქმედება „დააბრუნე ნაგულისხმევი"-ა და არა „ლეიბლი
               საერთოდ არ იყოს". ნაგულისხმევი ტექსტი ლოკალიზაციაშია. */
            foreach (FieldCatalog::TEXT_ATTRS as $attr) {
                if (! array_key_exists($attr, $value)) {
                    continue;
                }
                $text = is_string($value[$attr]) ? trim($value[$attr]) : '';
                if ($text === '') {
                    unset($current[$attr]);
                } else {
                    $current[$attr] = mb_substr($text, 0, 120);
                }
            }

            $fields[$key] = $current;
        }

        $settings['fields'] = $fields;
        $this->write($user, $module, $settings);

        return $this->for($user, $module);
    }

    /**
     * **ნაგულისხმევზე დაბრუნება** (Tasks §4) — ჩაშენებული ველების მთელი
     * გადახრა იშლება: ჩამრთველები, ლეიბლები და მოხსნილი ჩაკეტვები.
     *
     * ⚠️ **მხოლოდ `fields` გასაღები** ქრება. `module_user.settings` ერთი
     * საერთო JSON ბლოკია — იქვე ზის გალერეის ნაგულისხმევები, ჩანაწერების
     * არხები (ტელეგრამის ჩათვლით) და სტატუსების საიდბარული განლაგება;
     * მთელი ბლოკის წაშლა ოთხ სხვა ფუნქციას წაშლიდა.
     *
     * ⚠️ **მორგებულ ველებს არ ეხება** — ისინი `settings['custom_fields']`-ია
     * და თავისი რედაქტორი აქვთ; „ველები ნაგულისხმევზე" მათ წაშლას არ
     * ნიშნავს (ეს მონაცემის დაკარგვა იქნებოდა, აქ კი კონფიგია).
     *
     * @return list<array<string, mixed>>
     */
    public function reset(User $user, string $module): array
    {
        $settings = $this->settings($user, $module);
        unset($settings['fields']);
        $this->write($user, $module, $settings);

        return $this->for($user, $module);
    }

    /* ---------- შიგნეული ---------- */

    /** @return array<string, mixed> */
    private function overrides(User $user, string $module): array
    {
        return (array) ($this->settings($user, $module)['fields'] ?? []);
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
