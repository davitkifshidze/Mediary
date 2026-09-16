<?php

namespace App\Support;

/**
 * **ველების კატალოგი (Tasks §6)** — რომელი ველების მორგება შეუძლია user-ს
 * თითო მოდულზე: ჩვენება/დამალვა, სავალდებულოობა, ლეიბლი/placeholder და
 * საჯარო ბარათზე ჩვენება.
 *
 * ⚠️ **კატალოგი კოდშია და არა ბაზაში.** `module_user.settings['fields']`-ში
 * მხოლოდ **გადახრები** ინახება, ე.ი. კოდში დამატებული ახალი ველი ყველა
 * ანგარიშზე ავტომატურად ჩნდება და მიგრაციას არ მოითხოვს.
 *
 * ⚠️ **§6.5 (2026-09-11) — ახლა აქ ფორმის *ყველა* ველია და აღარ მხოლოდ
 * არჩევითები.** ადრე სავალდებულო ველი (ვიდეოს `url`, ჩანაწერის `title`)
 * კატალოგში საერთოდ არ იწერებოდა, რომ მისი გამორთვა ჩაწერას არ გატეხავდა —
 * მაგრამ მაშინ რედაქტორი „მოდულის ველების" ნაცვლად მხოლოდ ერთ ნაწილს
 * აჩვენებდა. ამის ნაცვლად ასეთ ველს **`locked` დროშა** აქვს: ის სიაშია,
 * ჩანს, მაგრამ ჩართულობის/სავალდებულოობის გადამრთველი გამორთულია — ე.ი.
 * „გამორთე სახელი" ისევ შეუძლებელია, მაგრამ სია აღარ ტყუის.
 *
 * ⚠️ **`locked` ველზე გადახრები იგნორირდება `for()`-შივე** (და არა მხოლოდ
 * UI-ში): ძველი ან ხელით გაგზავნილი რექვესთი ვერ უნდა შეძლოს `title`-ის
 * გამორთვა.
 *
 * ⚠️ **ველი კატალოგში მხოლოდ მაშინ ჩნდება, როცა ფორმა მას მართლა
 * ითვალისწინებს** (`fields.shows()` / `fields.required()` / `fields.label()`).
 * გადამრთველი, რომელიც არაფერს ცვლის, ტყუილია — უარესი, ვიდრე მისი არარსებობა.
 */
final class FieldCatalog
{
    /**
     * ⚠️ **`movie` და `series` ერთსა და იმავე ფორმას იყენებენ** (`MovieFormPage`),
     * მაგრამ კონფიგი per-module-ია — სერიალზე გამორთული ველი ფილმზე უნდა
     * დარჩეს. ამიტომ ორივეს **თავისი** ჩანაწერი აქვს და არა საერთო.
     */
    private const MEDIA_FIELDS = [
        // სათაური ორ ენაზე, ერთ ბარათში; ერთი მათგანი ყოველთვის სავალდებულოა
        ['key' => 'title', 'type' => 'text', 'locked' => true, 'sort_order' => 10],
        ['key' => 'year', 'type' => 'number', 'sort_order' => 20],
        ['key' => 'genres', 'type' => 'list', 'sort_order' => 30],
        ['key' => 'description', 'type' => 'text', 'sort_order' => 40],
        ['key' => 'poster', 'type' => 'file', 'sort_order' => 50],
        ['key' => 'status', 'type' => 'select', 'sort_order' => 60],
        ['key' => 'is_favorite', 'type' => 'bool', 'sort_order' => 70],
        ['key' => 'rating', 'type' => 'number', 'sort_order' => 80],
        [
            // Tasks §2.5 — ხანგრძლივობა ხელით (`DurationInput`, ერთეული **წუთი**).
            // ⚠️ სვეტი TMDB-იდანაც ივსება, ე.ი. ველი მხოლოდ შესწორებისთვისაა —
            // ამიტომ default-ად გამორთულია, ვიდეოს `duration`-ის მსგავსად.
            'key' => 'runtime',
            'type' => 'number',
            'enabled' => false,
            'sort_order' => 90,
        ],
        ['key' => 'ge_url', 'type' => 'link', 'sort_order' => 100],
        ['key' => 'trailer_url', 'type' => 'link', 'sort_order' => 110],
    ];

    /**
     * მოდულის ველები.
     *
     * გამოტოვებული გასაღებების ნაგულისხმევები `defaults()`-შია:
     * `enabled = true` (⚠️ §6.5 — **ახლად დამატებული ველი ავტომატურად
     * მონიშნულია**), `required = false`, `public = true`, `locked = false`.
     *
     * ⚠️ სიაში **სწრაფი შევსების ძებნა (`lookup`) არ არის** — ის ველი არაა,
     * არამედ ხელსაწყო: მისი „გამორთვა" TMDB/RAWG/BGG-ის მთელ შემოტანას
     * გამორთავდა და ეს ველების რედაქტორის საქმე არაა.
     */
    private const FIELDS = [
        'movie' => self::MEDIA_FIELDS,
        'series' => self::MEDIA_FIELDS,
        // §7.1 — ანიმე იმავე ფორმას ხატავს, კონფიგი კი per-module-ია
        'anime' => self::MEDIA_FIELDS,
        'video' => [
            // `url`-ის გარეშე ვიდეო არ არსებობს (`VideoUrl` მისგან იღებს embed-ს)
            ['key' => 'url', 'type' => 'link', 'locked' => true, 'sort_order' => 10],
            ['key' => 'title', 'type' => 'text', 'sort_order' => 20],
            ['key' => 'type_id', 'type' => 'select', 'sort_order' => 30],
            // §6.4 — სტატუსი ვიდეოსაც: მართვადი ლექსიკონი, ფორმა მას ითვალისწინებს
            ['key' => 'status', 'type' => 'select', 'sort_order' => 35],
            [
                'key' => 'duration',
                'type' => 'number',
                // ⚠️ **გამორთულია default-ად** — ხანგრძლივობა ავტომატურად
                // იზომება (`probeMediaDuration`), ხელით შეყვანა კი მხოლოდ
                // მაშინ სჭირდება, როცა ავტომატიკა ვერ მუშაობს.
                'enabled' => false,
                'sort_order' => 40,
            ],
            ['key' => 'description', 'type' => 'text', 'sort_order' => 50],
            ['key' => 'tags', 'type' => 'list', 'sort_order' => 60],
            ['key' => 'thumbnail', 'type' => 'file', 'sort_order' => 70],
        ],
        /* ⚠️ §5.3 — „ჩემი ქულა" (`rating`) კატალოგიდან **მოხსნილია** 2026-09-10-ს:
           ველი ფორმიდან წავიდა, ე.ი. მისი ჩამრთველი აღარაფერს აკეთებდა
           („toggle, რომელიც არაფერს ცვლის, უარესია, ვიდრე მისი არქონა").
           სვეტი და ძველი მნიშვნელობები რჩება — სიაში ისინი ისევ ჩანს. */
        'song' => [
            ['key' => 'url', 'type' => 'link', 'locked' => true, 'sort_order' => 10],
            ['key' => 'title', 'type' => 'text', 'sort_order' => 20],
            ['key' => 'artist', 'type' => 'text', 'sort_order' => 30],
            ['key' => 'album', 'type' => 'text', 'sort_order' => 40],
            ['key' => 'year', 'type' => 'number', 'sort_order' => 50],
            ['key' => 'duration', 'type' => 'number', 'sort_order' => 60],
            ['key' => 'genres', 'type' => 'list', 'sort_order' => 70],
            ['key' => 'thumbnail', 'type' => 'file', 'sort_order' => 80],
            ['key' => 'tags', 'type' => 'list', 'sort_order' => 90],
            ['key' => 'playlists', 'type' => 'list', 'sort_order' => 100],
        ],
        /* ⚠️ §5.1 — `age_rating` და `size_gb` კატალოგიდან **მოხსნილია**
           2026-09-10-ს: ორივე ველი ფორმიდან წავიდა, ე.ი. მათი ჩამრთველი
           აღარაფერს აკეთებდა (იგივე წესი, რაც §5.3/§5.7-ს აქვს). სვეტები და
           ძველი მნიშვნელობები რჩება — RAWG მათ ისევ ავსებს და ჩანაწერზე ჩანს. */
        'game' => [
            ['key' => 'title', 'type' => 'text', 'locked' => true, 'sort_order' => 10],
            ['key' => 'release_date', 'type' => 'date', 'sort_order' => 20],
            ['key' => 'publisher', 'type' => 'text', 'sort_order' => 30],
            ['key' => 'platforms', 'type' => 'list', 'sort_order' => 40],
            ['key' => 'modes', 'type' => 'list', 'sort_order' => 50],
            ['key' => 'genres', 'type' => 'list', 'sort_order' => 60],
            // ⚠️ ტექსტის ნაცვლად მოდალის ღილაკია (§5.1) — ველი მაინც ველია
            ['key' => 'franchise', 'type' => 'text', 'sort_order' => 70],
            ['key' => 'hltb', 'type' => 'number', 'sort_order' => 80],
            ['key' => 'status', 'type' => 'select', 'sort_order' => 90],
            ['key' => 'rawg_id', 'type' => 'number', 'sort_order' => 100],
            ['key' => 'links', 'type' => 'list', 'sort_order' => 110],
            ['key' => 'dlcs', 'type' => 'list', 'sort_order' => 120],
            // ინტერფეისი / ხმა / სუბტიტრები — ერთი ველი სამივე სიისთვის
            ['key' => 'languages', 'type' => 'list', 'sort_order' => 125],
            ['key' => 'cover', 'type' => 'file', 'sort_order' => 130],
            ['key' => 'description', 'type' => 'text', 'sort_order' => 140],
        ],
        /* ⚠️ §5.7 — `isbn` და `rating` კატალოგიდან **მოხსნილია** 2026-09-10-ს:
           ორივე ველი ფორმიდან წავიდა („ველების სია მკაცრად შემოკლდეს"), ე.ი.
           მათი ჩამრთველი აღარაფერს აკეთებდა. სვეტები და მონაცემი რჩება. */
        'book' => [
            ['key' => 'title', 'type' => 'text', 'locked' => true, 'sort_order' => 10],
            ['key' => 'author', 'type' => 'text', 'sort_order' => 20],
            ['key' => 'publisher', 'type' => 'text', 'sort_order' => 30],
            ['key' => 'year', 'type' => 'number', 'sort_order' => 40],
            ['key' => 'pages', 'type' => 'number', 'sort_order' => 50],
            ['key' => 'language', 'type' => 'text', 'sort_order' => 60],
            ['key' => 'source_url', 'type' => 'link', 'sort_order' => 70],
            // ⚠️ **ფორმატი პროგრესის ერთეულს წყვეტს** (`Book::syncProgress()`:
            // აუდიოწიგნზე მხოლოდ პროცენტია), ე.ი. მისი დამალვა გააზრებული
            // არჩევანი უნდა იყოს და არა შემთხვევითი — ამიტომ hint-შიც წერია.
            ['key' => 'format', 'type' => 'select', 'sort_order' => 80],
            ['key' => 'status', 'type' => 'select', 'sort_order' => 90],
            ['key' => 'genre', 'type' => 'select', 'sort_order' => 100],
            ['key' => 'cover', 'type' => 'file', 'sort_order' => 110],
            ['key' => 'description', 'type' => 'text', 'sort_order' => 120],
        ],
        'board_game' => [
            ['key' => 'title', 'type' => 'text', 'locked' => true, 'sort_order' => 10],
            ['key' => 'year', 'type' => 'number', 'sort_order' => 20],
            ['key' => 'designer', 'type' => 'text', 'sort_order' => 30],
            ['key' => 'publisher', 'type' => 'text', 'sort_order' => 40],
            ['key' => 'players', 'type' => 'number', 'sort_order' => 50],
            ['key' => 'playtime', 'type' => 'number', 'sort_order' => 60],
            ['key' => 'age', 'type' => 'number', 'sort_order' => 70],
            ['key' => 'complexity', 'type' => 'number', 'sort_order' => 80],
            ['key' => 'bgg_id', 'type' => 'number', 'sort_order' => 90],
            ['key' => 'status', 'type' => 'select', 'sort_order' => 100],
            ['key' => 'genre', 'type' => 'select', 'sort_order' => 110],
            ['key' => 'links', 'type' => 'list', 'sort_order' => 130],
            ['key' => 'image', 'type' => 'file', 'sort_order' => 140],
            ['key' => 'description', 'type' => 'text', 'sort_order' => 150],
        ],
        'note' => [
            ['key' => 'title', 'type' => 'text', 'locked' => true, 'sort_order' => 10],
            ['key' => 'category', 'type' => 'select', 'sort_order' => 20],
            ['key' => 'status', 'type' => 'select', 'sort_order' => 30],
            ['key' => 'due_at', 'type' => 'date', 'sort_order' => 40],
            ['key' => 'tags', 'type' => 'list', 'sort_order' => 50],
            ['key' => 'description', 'type' => 'text', 'sort_order' => 60],
            ['key' => 'links', 'type' => 'list', 'sort_order' => 70],
        ],
        // §18 — ბუკმარკის იდენტობა თვითონ ბმულია, ე.ი. `url` locked-ია
        'bookmark' => [
            ['key' => 'url', 'type' => 'link', 'locked' => true, 'sort_order' => 10],
            /* ⚠️ სახელი აქ **სავალდებულოა default-ად** და არა `locked`: სვეტი
               nullable-ია (ბმულის `<head>`-იდან ივსება), მაგრამ ფორმა მას
               ყოველთვის ითხოვდა — ე.ი. ნაგულისხმევი ქცევა უცვლელი რჩება,
               მისი მოხსნა კი უკვე შესაძლებელია. */
            ['key' => 'title', 'type' => 'text', 'required' => true, 'sort_order' => 20],
            ['key' => 'status', 'type' => 'select', 'sort_order' => 30],
            ['key' => 'category', 'type' => 'select', 'sort_order' => 40],
            ['key' => 'thumbnail', 'type' => 'file', 'sort_order' => 50],
            ['key' => 'description', 'type' => 'text', 'sort_order' => 60],
            ['key' => 'tags', 'type' => 'list', 'sort_order' => 70],
        ],
    ];

    /** გადახრებში დაშვებული ტექსტური ატრიბუტები */
    public const TEXT_ATTRS = ['label_ka', 'label_en', 'placeholder_ka', 'placeholder_en'];

    /** გადახრებში დაშვებული დროშები — `locked` ველზე ისინი იგნორირდება */
    public const FLAGS = ['enabled', 'required', 'public'];

    /**
     * მოდულის ველები, user-ის გადახრებით შერწყმული.
     *
     * ⚠️ ლეიბლი/placeholder `null`-ია, სანამ user არ გადაწერს. **ნაგულისხმევი
     * ტექსტი backend-ს არ აქვს და არც უნდა ჰქონდეს** — ის ლოკალიზაციაშია
     * (`fields.name.<module>.<key>`), ე.ი. ორ ენაზე. `null` ფრონტს ეუბნება
     * „აიღე i18n-იდან"; ცარიელი სტრიქონი კი მისგან განსხვავებით ცხადი
     * არჩევანია და ისე რჩება.
     *
     * @param  array<string, mixed>  $overrides  `module_user.settings['fields']`
     * @return list<array{key: string, type: string, locked: bool, unlocked: bool, enabled: bool, required: bool, public: bool, sort_order: int, label_ka: ?string, label_en: ?string, placeholder_ka: ?string, placeholder_en: ?string}>
     */
    public static function for(string $module, array $overrides = []): array
    {
        $out = [];

        foreach (self::FIELDS[$module] ?? [] as $field) {
            $field = self::defaults($field);
            $override = (array) ($overrides[$field['key']] ?? []);

            $row = [
                'key' => $field['key'],
                'type' => $field['type'],
                'locked' => $field['locked'],
                'sort_order' => $field['sort_order'],
            ];

            /* ⚠️ **`locked` კატალოგის ფაქტია და ისე რჩება** — ის სქემაზე
               ამბობს სიმართლეს („ამ ველის გარეშე ჩანაწერი არ ჩაიწერება").
               მესამე მდგომარეობა `unlocked`-ია: **მომხმარებლის ცხადი
               არჩევანი** (Tasks §4.3), რომელსაც მხოლოდ `super_admin` წერს.

               ⚠️ ორივე ბრუნდება განზრახ: `locked: true, unlocked: true`
               ინტერფეისს აძლევს იმის თქმის საშუალებას, რომ „ჩაკეტილია,
               მაგრამ შენ მოხსენი" — მარტო `locked: false`-ის დაბრუნება
               გაფრთხილებას სამუდამოდ წაშლიდა. */
            $unlocked = $field['locked'] && ! empty($override['unlocked']);
            $row['unlocked'] = $unlocked;

            foreach (self::FLAGS as $flag) {
                $row[$flag] = ($field['locked'] && ! $unlocked)
                    ? true
                    : (array_key_exists($flag, $override) ? (bool) $override[$flag] : $field[$flag]);
            }

            foreach (self::TEXT_ATTRS as $attr) {
                $value = $override[$attr] ?? null;
                $row[$attr] = is_string($value) && trim($value) !== '' ? $value : null;
            }

            $out[] = $row;
        }

        usort($out, fn (array $a, array $b) => $a['sort_order'] <=> $b['sort_order']);

        return $out;
    }

    /**
     * **ველები, რომლებიც საჯარო ბარათზე არ უნდა გამოჩნდეს** (§6 ფაზა 4 → §16).
     *
     * ⚠️ ეს **ჩანაწერის მფლობელის** არჩევანია და არა მნახველის — საჯარო
     * პროფილზე წყვეტს ის, ვისიც ჩანაწერია.
     *
     * @param  array<string, mixed>  $overrides
     * @return list<string>
     */
    public static function hiddenOnPublic(string $module, array $overrides = []): array
    {
        return array_values(array_map(
            fn (array $f) => $f['key'],
            array_filter(self::for($module, $overrides), fn (array $f) => ! $f['public']),
        ));
    }

    /** აქვს თუ არა ამ მოდულს კონფიგურირებადი ველები (UI სექციას მალავს) */
    public static function has(string $module): bool
    {
        return ! empty(self::FIELDS[$module]);
    }

    /** ცნობს თუ არა კატალოგი ამ ველს — უცნობი გადახრა ჩუმად იგნორირდება */
    public static function knows(string $module, string $key): bool
    {
        foreach (self::FIELDS[$module] ?? [] as $field) {
            if ($field['key'] === $key) {
                return true;
            }
        }

        return false;
    }

    /**
     * ჩაკეტილია თუ არა ველი (სქემა მის გარეშე ვერ ჩაიწერება).
     * `FieldSettings::save()` მასზე დროშებს არ წერს.
     */
    public static function isLocked(string $module, string $key): bool
    {
        foreach (self::FIELDS[$module] ?? [] as $field) {
            if ($field['key'] === $key) {
                return (bool) ($field['locked'] ?? false);
            }
        }

        return false;
    }

    /**
     * გამოტოვებული გასაღებების შევსება.
     *
     * ⚠️ `enabled` ნაგულისხმევად **`true`-ია** (§6.5): ახლად დამატებული ველი
     * მაშინვე უნდა ჩანდეს, თორემ კოდში ველის დამატება ჩუმად არაფერს იძლევა.
     *
     * @param  array<string, mixed>  $field
     * @return array<string, mixed>
     */
    private static function defaults(array $field): array
    {
        return $field + [
            'locked' => false,
            'enabled' => true,
            'required' => false,
            'public' => true,
        ];
    }
}
