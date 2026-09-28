<?php

namespace App\Support;

/**
 * **გარე წყაროების რეესტრი — „მონაცემები" (Tasks §21 → §30).**
 *
 * აქამდე შვიდივე გასაღები `backend/.env`-ში იდო, ე.ი. **ერთი იყო მთელ
 * ინსტალაციაზე**. მრავალმომხმარებლიან აპში ეს ორ რამეს ნიშნავდა: თავისი
 * გასაღების ჩადება არავის შეეძლო, და — რაც უარესია — ორი კვოტიანი წყაროს
 * (Gemini-ის დღიური, SerpApi-ის თვიური) ხარჯი **საერთო** იყო, ე.ი. ერთი
 * მომხმარებელი მეორეს დღეს ახარჯავდა.
 *
 * ⚠️ **§30-იდან (Q38) საერთო ფენა აღარ არსებობს**: „ტელეგრამის, TMDB-ისა და
 * ნებისმიერი პაროლი მომხმარებელს თავისი უნდა ჰქონდეს — `.env`-ში მსგავსი
 * არაფერი უნდა იყოს". გასაღები **მხოლოდ** `user_credentials`-იდან იკითხება;
 * `config('services.*')` შვიდ წყაროს აღარ იცნობს. ფასი ცხადია: ვისაც თავისი
 * გასაღები არ აქვს, მისთვის ის წყარო არ მუშაობს (`credential_missing`).
 *
 * ⚠️ **ნაგულისხმევი მნიშვნელობა მხოლოდ იმას აქვს, რაც საიდუმლო არაა** —
 * Gemini-ის მოდელს და ლიმიტებს (`default`). ისინი **კოდშია** და არა `.env`-ში:
 * ეს ინსტალაციის არჩევანი კი არაა, წყაროს დოკუმენტირებული უფასო დონეა.
 * პირადი მნიშვნელობა მათ გადაფარავს (`null` = ნაგულისხმევი, `0` = ულიმიტო).
 *
 * ⚠️ **ეს `modules` ცხრილის რიგი განზრახ არ არის.** ამ პროექტში „მოდული"
 * კონტენტის ბიბლიოთეკაა: `RegistryConsistencyTest` ყოველ `modules` რიგს
 * purge-ის სამიზნეს, დეშბორდის მრიცხველსა და `AuditRegistry`-ს ჩანაწერს
 * სთხოვს — გასაღებს კი „ჩანაწერები" არ აქვს. გარდა ამისა მოდულის გამორთვა
 * **ყველა** ანგარიშზე მოქმედებს, ე.ი. ადმინი ერთი გადამრთველით ყველას
 * თარგმანს გათიშავდა.
 *
 * ⚠️ **რომელი ველი საიდუმლოა, აქ წყდება და არა კონტროლერში.** `secret: true`
 * ველი პასუხში **არასდროს** ბრუნდება — მხოლოდ ნიღბიანი კუდი (`••••a1b2`) —
 * და აუდიტ-ლოგშიც მხოლოდ ფაქტი იწერება. ერთი ადგილი იმიტომ, რომ ახალი
 * წყაროს დამატებისას „ესეც საიდუმლოა"-ს გამორჩენა ჩუმად გაჟონვაა.
 */
final class CredentialProviders
{
    public const TMDB = 'tmdb';

    public const GEMINI = 'gemini';

    public const RAWG = 'rawg';

    public const IGDB = 'igdb';

    public const SERPAPI = 'serpapi';

    public const SERPER = 'serper';

    public const YOUTUBE = 'youtube';

    public const TELEGRAM = 'telegram';

    /**
     * `limits` — მხოლოდ ორ წყაროს აქვს. ⚠️ `default` **კოდის** ნაგულისხმევია:
     * ცარიელი პირადი მნიშვნელობა მას ნიშნავს, `0` კი „ლიმიტი არ მაქვს"-ს
     * (ეს ორი სხვადასხვა ფაქტია და `Translator` ისედაც ასე კითხულობს).
     */
    public const PROVIDERS = [
        self::TMDB => [
            'required' => ['key'],
            'fields' => [
                'key' => ['secret' => true],
            ],
            'limits' => [],
            'docs' => 'https://www.themoviedb.org/settings/api',
            // რომელი მოდულები დგანან ამ წყაროზე — გვერდი ამას წერს
            'modules' => ['movie', 'series', 'anime', 'gallery'],
        ],

        self::GEMINI => [
            'required' => ['key'],
            'fields' => [
                'key' => ['secret' => true],
                /* ⚠️ **დაპინული ვერსია და არა `gemini-flash-latest` alias.**
                   ცოცხალი გაზომვა 2026-09-14: alias იმ დღეს 90 წამის timeout-სა და
                   503-ს აძლევდა, `gemini-3.5-flash` კი იმავე ტექსტს **1.3 წამში**
                   თარგმნიდა. ⚠️ `*-flash-lite` მოდელები `thinkingBudget`-ს 400-ით
                   უარყოფენ — `Translator` ამას თვითონ ხვდება, ე.ი. აქ ნებისმიერი
                   მოდელის ჩაწერა უსაფრთხოა. */
                'model' => ['secret' => false, 'default' => 'gemini-3.5-flash'],
            ],
            'limits' => [
                /* უფასო დონე — **ჩვენი აღრიცხვის ჭერი** და არა Google-ისა:
                   Gemini-ს „რამდენი დავხარჯე" API არ აქვს, ე.ი. ერთადერთი
                   მრიცხველი `translation_usages`-ია და ინტერფეისი ამას წერს. */
                'daily' => ['default' => 1500],
                'rpm' => ['default' => 15],
            ],
            'docs' => 'https://aistudio.google.com/apikey',
            'modules' => [],
        ],

        self::RAWG => [
            'required' => ['key'],
            'fields' => [
                'key' => ['secret' => true],
            ],
            'limits' => [],
            'docs' => 'https://rawg.io/apidocs',
            'modules' => ['game'],
        ],

        self::IGDB => [
            // ⚠️ ორივე სავალდებულოა: Twitch-ის OAuth ერთით არ მუშაობს
            'required' => ['client_id', 'client_secret'],
            'fields' => [
                'client_id' => ['secret' => false],
                'client_secret' => ['secret' => true],
            ],
            'limits' => [],
            'docs' => 'https://dev.twitch.tv/console/apps',
            'modules' => ['game'],
        ],

        self::SERPAPI => [
            'required' => ['key'],
            'fields' => [
                'key' => ['secret' => true],
            ],
            'limits' => [
                /* ⚠️ მხოლოდ **ჩვენი** აღრიცხვის ჭერი — ნამდვილი რიცხვი
                   `GET https://serpapi.com/account`-იდან მოდის და ის გამოძახება
                   კვოტას **არ ხარჯავს**. 250 უფასო გეგმის თვიური ბიუჯეტია. */
                'monthly' => ['default' => 250],
            ],
            'docs' => 'https://serpapi.com/manage-api-key',
            'modules' => ['gallery'],
        ],

        self::SERPER => [
            'required' => ['key'],
            'fields' => [
                'key' => ['secret' => true],
            ],
            'limits' => [],
            'docs' => 'https://serper.dev/api-key',
            'modules' => ['gallery'],
        ],

        self::YOUTUBE => [
            'required' => ['key'],
            'fields' => [
                'key' => ['secret' => true],
            ],
            'limits' => [],
            'docs' => 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
            'modules' => ['video', 'song'],
        ],

        /*
         | **ტელეგრამის ბოტი (§21.9).** ⚠️ **`chat_id` საიდუმლო არაა** — ის უბრალო
         | რიცხვია და მისი დამალვა მხოლოდ გამართვას გაართულებდა; საიდუმლო
         | ტოკენია, რომელიც ბოტზე სრულ წვდომას იძლევა.
         */
        self::TELEGRAM => [
            'required' => ['bot_token', 'chat_id'],
            'fields' => [
                'bot_token' => ['secret' => true],
                'chat_id' => ['secret' => false],
            ],
            'limits' => [],
            'docs' => 'https://t.me/BotFather',
            'modules' => ['note'],
        ],
    ];

    /**
     * **ძველი `.env`-ის ცვლადები — წყარო, ველი და „გასაღების ნაწილია თუ არა"**
     * (Tasks §30).
     *
     * ⚠️ აპი მათ **აღარ კითხულობს**. სია სამ ადგილს სჭირდება და ერთ ადგილას
     * წერია: გადატანის მიგრაციას (რისი და ვისთან), `mediary:doctor`-ს და
     * `RegistryConsistencyTest`-ს (`.env.example` მათ აღარ უნდა შეიცავდეს —
     * ცარიელი ხაზი შევსებას იწვევს).
     *
     * ⚠️ ბოლო ელემენტი `true` = **გასაღების ნაწილია** (`doctor`-ზე FAIL):
     * IGDB-ის `client_id` თვითონ საიდუმლო არაა, მაგრამ წყვილის ნახევარია და
     * ისიც ადამიანისაა. `false` — პარამეტრია (მოდელი, ლიმიტი): `.env`-ში ის
     * უბრალოდ აღარ მოქმედებს (WARN).
     *
     * @var array<string, array{0: string, 1: 'field'|'limit', 2: string, 3: bool}>
     */
    public const LEGACY_ENV = [
        'TMDB_API_KEY' => [self::TMDB, 'field', 'key', true],
        'GEMINI_API_KEY' => [self::GEMINI, 'field', 'key', true],
        'GEMINI_MODEL' => [self::GEMINI, 'field', 'model', false],
        'GEMINI_DAILY_LIMIT' => [self::GEMINI, 'limit', 'daily', false],
        'GEMINI_RPM_LIMIT' => [self::GEMINI, 'limit', 'rpm', false],
        'RAWG_API_KEY' => [self::RAWG, 'field', 'key', true],
        'IGDB_CLIENT_ID' => [self::IGDB, 'field', 'client_id', true],
        'IGDB_CLIENT_SECRET' => [self::IGDB, 'field', 'client_secret', true],
        'SERPAPI_KEY' => [self::SERPAPI, 'field', 'key', true],
        'SERPAPI_MONTHLY_LIMIT' => [self::SERPAPI, 'limit', 'monthly', false],
        'SERPER_API_KEY' => [self::SERPER, 'field', 'key', true],
        'YOUTUBE_API_KEY' => [self::YOUTUBE, 'field', 'key', true],
    ];

    /** @return array<int, string> */
    public static function keys(): array
    {
        return array_keys(self::PROVIDERS);
    }

    public static function has(string $provider): bool
    {
        return isset(self::PROVIDERS[$provider]);
    }

    /** ვალიდაციისთვის — `in:tmdb,gemini,…` */
    public static function rule(): string
    {
        return 'in:'.implode(',', self::keys());
    }

    /** @return array<string, array<string, mixed>> */
    public static function fields(string $provider): array
    {
        return self::PROVIDERS[$provider]['fields'] ?? [];
    }

    /** @return array<string, array<string, mixed>> */
    public static function limits(string $provider): array
    {
        return self::PROVIDERS[$provider]['limits'] ?? [];
    }

    /** @return array<int, string> */
    public static function required(string $provider): array
    {
        return self::PROVIDERS[$provider]['required'] ?? [];
    }

    public static function isSecret(string $provider, string $field): bool
    {
        return (bool) (self::PROVIDERS[$provider]['fields'][$field]['secret'] ?? false);
    }

    /**
     * ველის ან ლიმიტის **კოდის** ნაგულისხმევი მნიშვნელობა; `null` — არ აქვს.
     *
     * ⚠️ საიდუმლოს ნაგულისხმევი არასდროს აქვს — სწორედ ეს იყო §30-ის საგანი.
     */
    public static function default(string $provider, string $name): mixed
    {
        if (self::isSecret($provider, $name)) {
            return null;
        }

        return self::PROVIDERS[$provider]['fields'][$name]['default']
            ?? self::PROVIDERS[$provider]['limits'][$name]['default']
            ?? null;
    }

    /**
     * ნიღბიანი კუდი — „ჩავწერე თუ არა" ერთადერთი კითხვაა, რასაც ინტერფეისმა
     * გასაღებზე უნდა უპასუხოს. ⚠️ მოკლე მნიშვნელობა **მთლიანად** იმალება,
     * თორემ ოთხსიმბოლოიანი გასაღები სრულად გამოჩნდებოდა.
     */
    private const MASK_DOTS = 12;

    public static function mask(?string $value): ?string
    {
        $value = (string) $value;

        if ($value === '') {
            return null;
        }

        /* ⚠️ **სიგრძე ფიქსირებულია და არა ნამდვილი.** ნიღაბი ინტერფეისზე
           ველის *შიგთავსია* (და არა ფერმკრთალი placeholder), ე.ი. მან
           „შევსებული ველი" უნდა დახატოს — ოთხი წერტილი ამისთვის მოკლეა.
           ნამდვილი სიგრძის გამეორება კი თვითონ იქნებოდა მინიშნება
           გასაღებზე, ამიტომ ყველა ერთნაირად გამოიყურება. */
        return mb_strlen($value) <= 8
            ? str_repeat('•', self::MASK_DOTS)
            : str_repeat('•', self::MASK_DOTS).mb_substr($value, -4);
    }
}
