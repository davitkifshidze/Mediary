<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * **Tasks §15 — „საყურებელი" ფილმებში, სერიალებსა და ანიმეში.**
 *
 * სტატუსი კოდიდან არასდროს წასულა (`StatusDomain::WATCH_DEFAULTS`) — ბაზაში
 * დაიკარგა: `Status::ensureDefaults()` ნაკრებს მხოლოდ **ცარიელ** ლექსიკონში
 * თესავს, ე.ი. ერთხელ წაშლილი ნაგულისხმევი თავისით აღარასდროს ბრუნდება.
 * ცოცხალ ბაზაში ორი მდგომარეობა დახვდა და თითოს თავისი ნაბიჯი აქვს
 * (ანგარიში × დომენი):
 *
 *  (ა) `to_watch` რიგი ხელით „ვუყურებ"-ად გადაკეთდა (როლი `doing` გახდა),
 *      `watching` კი თავისუფალია → **გასაღები `watching`-ად გადაერქმევა**
 *      (Q12). ოთხივე მოდულში გასაღებები ერთნაირი ხდება, და „ვუყურებ" თავისი
 *      ფერით იხატება — `lib/statuses.ts::KEY_TONE` ფერს გასაღებით ირჩევს,
 *      ე.ი. დღეს ის „საყურებლის" ფერს ატარებდა.
 *  (ბ) `to_watch` აღარ არის (ან (ა)-მ გაათავისუფლა) → „საყურებელი" ჩაემატება
 *      **„გადაუწყვეტელის" შემდეგ**, დანარჩენები ერთით იწევს.
 *
 * ⚠️ **`Status`-ის წესი „`key` არასდროს იცვლება" აქ ერთხელ და შეგნებულად
 * ირღვევა.** წესი ძველ ბმულებს იცავს, აქ კი `?view=to_watch` ფილმებსა და
 * ვიდეოში ისედაც „საყურებელია" — გადარქმევა მას ოთხივე მოდულში ერთ
 * მნიშვნელობას აძლევს. ერთადერთი, რაც ვერ გადაყვება, აპის გარეთ შენახული
 * სანიშნეა: ის ახლა „საყურებელს" გახსნის.
 *
 * ⚠️ **Q12-ის პირობა — ძველი და ახალი არ აირიოს.** ყველაფერი, რაც ძველ რიგზე
 * **გასაღებით** მიუთითებს, მასთან ერთად `watching`-ზე გადადის:
 *  · ჩანაწერები რიგს `status_id`-ით იცნობს — თავისით რჩება „ვუყურებ"-ზე;
 *  · საიდბარის განლაგება (`module_user.settings.status_sections`) — `hidden`
 *    და ფსევდო-განყოფილების ანკერები აქვე გადაიწერება;
 *  · აუდიტის ლოგი სტატუსს **გასაღებით** ინახავს (`AuditLogger::clean()`) და
 *    `/audit` მას ნედლად ხატავს — ამ ანგარიშისა და დომენის `status =
 *    to_watch` `watching`-ად გადაიწერება. ეს ისტორიის გაყალბება არ არის:
 *    გასაღები რიგის ვინაობაა, და ვინაობა რიგს შეეცვალა და არა ისტორიას.
 * ახალ „საყურებელს" კი ძველი არაფერი მიჰყვება: `hidden`-ში დარჩენილი მკვდარი
 * `to_watch` იშლება (თორემ „საყურებელი" დამალული დაიბადებოდა), მასზე
 * მიბმული მკვდარი ანკერი კი `end` ხდება — იქ, სადაც SPA მას დღესაც ხატავს
 * (`arrangeSections()` უცნობ ანკერს ბოლოში სვამს). იგივე ემართება (ა)-ში
 * მკვდარ `watching`-ს გადარქმევამდე — ის წაშლილ რიგს ეკუთვნოდა.
 *
 * ⚠️ **ხელუხლებელი რჩება:**
 *  · ლექსიკონი, რომელშიც ერთი რიგიც არ არის — `ensureDefaults()` მას
 *    პირველივე გახსნისას სრული ნაკრებით დათესავს;
 *  · ანგარიში, რომელსაც „საყურებელი"/„To watch" უკვე აქვს (ხელით შექმნილი,
 *    სხვა გასაღებით) — ორი „საყურებელი" არ უნდა გაჩნდეს;
 *  · `to_watch`, რომელიც ისევ `todo`-ა — ეს მისი „საყურებელია", სხვა სახელითაც;
 *  · `to_watch`, რომელიც `done`-ად გადაკეთდა, და (ა), სადაც `watching`-იც
 *    დაკავებულია — პირველ შემთხვევაში გადარქმევა რიგს სხვის ფერსა და ბმულს
 *    მისცემდა, მეორეში უნიკალურ ინდექსს დაარღვევდა; სწორ პასუხს ორივეგან
 *    მხოლოდ ადამიანი იცის;
 *  · `users.settings.defaultView` — ის ერთია სამივე ბიბლიოთეკისთვის, და
 *    `to_watch` ფილმებში ისედაც „საყურებელს" ნიშნავდა.
 *
 * ⚠️ **`down()` განზრახ ცარიელია** — `expand_wildcard_role_permissions`-ისა და
 * `strip_plaintext_telegram`-ის წესით. `up()`-ის შედეგი ხელუხლებელი
 * ნაკრებისგან **არ გაირჩევა**: ჩამატებული „საყურებელი" და გადარქმეული
 * „ვუყურებ" ზუსტად ისეთია, როგორსაც `ensureDefaults()` თესავს, ე.ი. წესით
 * აგებული „უკან" სხვა ანგარიშების ხელუხლებელ სტატუსებს წაშლიდა და
 * გადაარქმევდა. უკან გზა გაშვებამდე აღებული ბაზის ასლია.
 */
return new class extends Migration
{
    private const DOMAINS = ['movie', 'series', 'anime'];

    /**
     * ახალი რიგი. ⚠️ **ასლია და არა `StatusDomain`-ის წაკითხვა** — მიგრაცია
     * დღევანდელ ფაქტს წერს, და ხვალინდელმა ნაკრებმა მისი მნიშვნელობა არ
     * უნდა შეცვალოს.
     */
    private const TO_WATCH = [
        'key' => 'to_watch',
        'name_ka' => 'საყურებელი',
        'name_en' => 'To watch',
        'role' => 'todo',
        'icon' => 'Clock',
    ];

    /**
     * გადარქმეულ რიგს ხატულა მხოლოდ მაშინ ეცვლება, თუ ის ისევ `to_watch`-ის
     * ნაგულისხმევია — ხელით არჩეული რჩება (`refresh_default_status_icons`-ის
     * წესი). თორემ „საყურებელი" და „ვუყურებ" ერთი და იმავე საათით დაიხატებოდა.
     */
    private const TO_WATCH_ICON = 'Clock';

    private const WATCHING_ICON = 'Eye';

    /** სახელები, რომლებიც „ეს ანგარიში საყურებელს უკვე ფლობს"-ს ნიშნავს */
    private const TO_WATCH_NAMES = ['საყურებელი', 'to watch'];

    public function up(): void
    {
        if (! Schema::hasTable('statuses')) {
            return;
        }

        DB::transaction(function () {
            /** @var array<string, list<int>> $renamed დომენი → ანგარიშები, სადაც (ა) მოხდა */
            $renamed = [];

            $pairs = DB::table('statuses')
                ->whereIn('module', self::DOMAINS)
                ->select('user_id', 'module')
                ->distinct()
                ->get();

            foreach ($pairs as $pair) {
                if ($this->repair((int) $pair->user_id, (string) $pair->module)) {
                    $renamed[$pair->module][] = (int) $pair->user_id;
                }
            }

            foreach ($renamed as $domain => $userIds) {
                $this->rewriteAuditLog($domain, $userIds);
            }
        });
    }

    public function down(): void {}

    /** @return bool (ა) შესრულდა თუ არა — აუდიტის ლოგს მხოლოდ მაშინ სჭირდება გადაწერა */
    private function repair(int $userId, string $domain): bool
    {
        $rows = DB::table('statuses')
            ->where('user_id', $userId)
            ->where('module', $domain)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        if ($rows->contains(fn (object $row) => $this->namedToWatch($row))) {
            return false;
        }

        $byKey = $rows->keyBy('key');
        $toWatch = $byKey->get('to_watch');
        $renamed = false;

        if ($toWatch !== null) {
            /* ⚠️ **მხოლოდ `doing`.** `done`-ად გადაკეთებული რიგი („მიტოვებული")
               `watching` რომ გამხდარიყო, `KEY_TONE` მას „ვუყურებ"-ის ფერს
               მისცემდა და `?view=watching` მას გახსნიდა — ზუსტად ის აღრევა,
               რასაც ეს მიგრაცია ასწორებს. `todo` კი ისევ მისი „საყურებელია". */
            if ($toWatch->role !== 'doing' || $byKey->has('watching')) {
                return false;
            }

            $this->renameToWatching($userId, $domain, $toWatch);
            $renamed = true;
        }

        $this->insertToWatch($userId, $domain, $byKey->get('undecided'));

        return $renamed;
    }

    /** (ა) — ძველი რიგი თავისი კვალით `watching` ხდება */
    private function renameToWatching(int $userId, string $domain, object $row): void
    {
        $this->editLayout($userId, $domain, function (array $layout) {
            // ⚠️ `watching` თავისუფალია = ასეთი რიგი არ არსებობს, ე.ი. აქ მასზე
            // მიმავალი ყველაფერი წაშლილ რიგს ეკუთვნის და გადარქმეულს არ უნდა მიებას
            $hidden = array_diff($layout['hidden'], ['watching']);
            $layout['hidden'] = array_values(array_unique(
                array_map(fn ($id) => $id === 'to_watch' ? 'watching' : $id, $hidden),
            ));

            $placement = $this->reanchor($layout['placement'], 'watching', 'end');
            $layout['placement'] = $this->reanchor($placement, 'to_watch', 'watching');

            return $layout;
        });

        DB::table('statuses')->where('id', $row->id)->update([
            'key' => 'watching',
            'icon' => $row->icon === self::TO_WATCH_ICON ? self::WATCHING_ICON : $row->icon,
        ]);
    }

    /**
     * (ბ) — „საყურებელი" „გადაუწყვეტელის" შემდეგ.
     *
     * ⚠️ „გადაუწყვეტელი" წაშლილია → პირველ ადგილზე: ნაკრებში „საყურებელი"
     * ყველა დანარჩენ ნაგულისხმევზე წინ დგას.
     */
    private function insertToWatch(int $userId, string $domain, ?object $undecided): void
    {
        $siblings = fn () => DB::table('statuses')->where('user_id', $userId)->where('module', $domain);

        $position = $undecided !== null
            ? (int) $undecided->sort_order + 1
            : (int) $siblings()->min('sort_order');

        $siblings()->where('sort_order', '>=', $position)->increment('sort_order');

        $now = now();

        DB::table('statuses')->insert(self::TO_WATCH + [
            'user_id' => $userId,
            'module' => $domain,
            'color' => null,
            'is_default' => false,
            'sort_order' => $position,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $this->editLayout($userId, $domain, function (array $layout) {
            $layout['hidden'] = array_values(array_diff($layout['hidden'], ['to_watch']));
            $layout['placement'] = $this->reanchor($layout['placement'], 'to_watch', 'end');

            return $layout;
        });
    }

    /**
     * საიდბარის განლაგების შესწორება — მხოლოდ მაშინ იწერება, როცა მართლა შეიცვალა.
     *
     * ⚠️ `DB::table` და არა `ModuleSettings::merge()`: ის pivot-ის რიგს
     * **ქმნის**, აქ კი მხოლოდ არსებული განლაგება სწორდება.
     *
     * @param  callable(array{hidden: list<string>, placement: list<mixed>}): array  $edit
     */
    private function editLayout(int $userId, string $domain, callable $edit): void
    {
        $moduleId = DB::table('modules')->where('key', $domain)->value('id');

        if ($moduleId === null) {
            return;
        }

        $pivot = fn () => DB::table('module_user')->where('user_id', $userId)->where('module_id', $moduleId);
        $settings = json_decode((string) $pivot()->value('settings'), true);

        if (! is_array($settings) || ! is_array($settings['status_sections'] ?? null)) {
            return;
        }

        $layout = [
            ...$settings['status_sections'],
            'hidden' => array_values((array) ($settings['status_sections']['hidden'] ?? [])),
            'placement' => array_values((array) ($settings['status_sections']['placement'] ?? [])),
        ];

        $next = $edit($layout);

        if ($next === $layout) {
            return;
        }

        $settings['status_sections'] = $next;
        $pivot()->update(['settings' => json_encode($settings)]);
    }

    /** ფსევდო-განყოფილების ანკერი `$from` → `$to` (`StatusController::forgetInLayout()`-ის ფორმა) */
    private function reanchor(array $placement, string $from, string $to): array
    {
        return array_map(
            fn ($p) => is_array($p) && ($p['at'] ?? null) === $from ? [...$p, 'at' => $to] : $p,
            $placement,
        );
    }

    /**
     * (ა)-ს ანგარიშების ძველი ლოგი: `status = to_watch` → `watching`.
     *
     * ⚠️ **ლოგის ავტორი ყოველთვის მფლობელი არ არის.** `/admin/purge`-ის წაშლას
     * super_admin წერს, სტატუსი კი სამიზნე ანგარიშის ლექსიკონიდანაა — ამიტომ
     * ჯერ მნიშვნელობებში ჩაწერილი `user_id` იკითხება (`create`/`delete` მთელ
     * რიგს ინახავს), და მხოლოდ მისი არქონისას ავტორი: `update`-ს მხოლოდ
     * მფლობელი წერს, რადგან სხვისი ჩანაწერი `owner` scope-ს მიღმაა.
     *
     * @param  list<int>  $userIds
     */
    private function rewriteAuditLog(string $domain, array $userIds): void
    {
        if (! Schema::hasTable('audit_logs')) {
            return;
        }

        DB::table('audit_logs')
            ->where('subject_type', $domain)
            ->where(fn ($q) => $q->where('old_values', 'like', '%to_watch%')->orWhere('new_values', 'like', '%to_watch%'))
            ->orderBy('id')
            ->lazyById()
            ->each(function (object $log) use ($userIds) {
                $old = $this->decode($log->old_values);
                $new = $this->decode($log->new_values);
                $owner = (int) ($old['user_id'] ?? $new['user_id'] ?? $log->user_id);

                if (! in_array($owner, $userIds, true)) {
                    return;
                }

                $changes = [];

                foreach (['old_values' => $old, 'new_values' => $new] as $column => $values) {
                    if (($values['status'] ?? null) === 'to_watch') {
                        $values['status'] = 'watching';
                        $changes[$column] = json_encode($values);
                    }
                }

                if ($changes !== []) {
                    DB::table('audit_logs')->where('id', $log->id)->update($changes);
                }
            });
    }

    /** @return array<string, mixed> */
    private function decode(?string $json): array
    {
        $values = json_decode((string) $json, true);

        return is_array($values) ? $values : [];
    }

    /**
     * სახელი „საყურებელს" ნიშნავს? შედარება PHP-შია და ნორმალიზებული
     * (რეგისტრი, ზედმეტი ჰარი) — `CastSync::resolve()`-ის წესით: ქართულს
     * `LOWER()` არ ეხება, `COLLATE` კი MySQL-სა და sqlite-ზე სხვადასხვა პასუხს
     * იძლეოდა.
     */
    private function namedToWatch(object $row): bool
    {
        foreach ([$row->name_ka, $row->name_en] as $name) {
            $normalised = mb_strtolower(trim((string) preg_replace('/\s+/u', ' ', (string) $name)));

            if (in_array($normalised, self::TO_WATCH_NAMES, true)) {
                return true;
            }
        }

        return false;
    }
};
