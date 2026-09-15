<?php

namespace App\Support;

/**
 * **გარე წყაროების რეესტრი — „მონაცემები" (Tasks §21).**
 *
 * აქამდე შვიდივე გასაღები `backend/.env`-ში იდო, ე.ი. **ერთი იყო მთელ
 * ინსტალაციაზე**. მრავალმომხმარებლიან აპში ეს ორ რამეს ნიშნავდა: თავისი
 * გასაღების ჩადება არავის შეეძლო, და — რაც უარესია — ორი კვოტიანი წყაროს
 * (Gemini-ის დღიური, SerpApi-ის თვიური) ხარჯი **საერთო** იყო, ე.ი. ერთი
 * მომხმარებელი მეორეს დღეს ახარჯავდა.
 *
 * ⚠️ **ეს `modules` ცხრილის რიგი განზრახ არ არის.** ამ პროექტში „მოდული"
 * კონტენტის ბიბლიოთეკაა: `RegistryConsistencyTest` ყოველ `modules` რიგს
 * purge-ის სამიზნეს, დეშბორდის მრიცხველსა და `AuditRegistry`-ს ჩანაწერს
 * სთხოვს — გასაღებს კი „ჩანაწერები" არ აქვს. გარდა ამისა მოდულის გამორთვა
 * **ყველა** ანგარიშზე მოქმედებს, ე.ი. ადმინი ერთი გადამრთველით ყველას
 * თარგმანს გათიშავდა. სექცია `/dictionaries`-ის წესით იგება: თავისი გვერდი,
 * თავისი ცხრილი, `modules`-თან შეხების გარეშე.
 *
 * ⚠️ **`config('services.*')` რჩება ნაგულისხმევად და არა წაშლილად.** ასე
 * დღევანდელი, ერთმომხმარებლიანი ინსტალაცია უცვლელად მუშაობს (`.env`-ის
 * გასაღები „საერთოა"), ხოლო ვინც თავისას ჩადებს — თავისით მუშაობს და
 * თავის კვოტას ხარჯავს. ინტერფეისი ცხადად წერს, რომელს იყენებ.
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
     * ⚠️ `config` თითო ველზე **სრული** გასაღებია `config/services.php`-ში:
     * ე.ი. რეესტრი თვითონ ამბობს, საიდან მოდის საერთო მნიშვნელობა და
     * `CredentialStore`-ს მეორე რუკა აღარ სჭირდება.
     *
     * `limits` — მხოლოდ ორ წყაროს აქვს; `null` ლიმიტი „ინსტალაციის
     * ნაგულისხმევს" ნიშნავს, `0` კი „ლიმიტი არ მაქვს"-ს (ეს ორი სხვადასხვა
     * ფაქტია და `Translator`-ის დღევანდელი კოდი ისედაც ასე კითხულობს).
     */
    public const PROVIDERS = [
        self::TMDB => [
            'required' => ['key'],
            'fields' => [
                'key' => ['secret' => true, 'config' => 'services.tmdb.key'],
            ],
            'limits' => [],
            'docs' => 'https://www.themoviedb.org/settings/api',
            // რომელი მოდულები დგანან ამ წყაროზე — გვერდი ამას წერს
            'modules' => ['movie', 'series', 'anime', 'gallery'],
        ],

        self::GEMINI => [
            'required' => ['key'],
            'fields' => [
                'key' => ['secret' => true, 'config' => 'services.gemini.key'],
                'model' => ['secret' => false, 'config' => 'services.gemini.model'],
            ],
            'limits' => [
                'daily' => ['config' => 'services.gemini.daily_limit'],
                'rpm' => ['config' => 'services.gemini.rpm_limit'],
            ],
            'docs' => 'https://aistudio.google.com/apikey',
            'modules' => [],
        ],

        self::RAWG => [
            'required' => ['key'],
            'fields' => [
                'key' => ['secret' => true, 'config' => 'services.rawg.key'],
            ],
            'limits' => [],
            'docs' => 'https://rawg.io/apidocs',
            'modules' => ['game'],
        ],

        self::IGDB => [
            // ⚠️ ორივე სავალდებულოა: Twitch-ის OAuth ერთით არ მუშაობს
            'required' => ['client_id', 'client_secret'],
            'fields' => [
                'client_id' => ['secret' => false, 'config' => 'services.igdb.client_id'],
                'client_secret' => ['secret' => true, 'config' => 'services.igdb.client_secret'],
            ],
            'limits' => [],
            'docs' => 'https://dev.twitch.tv/console/apps',
            'modules' => ['game'],
        ],

        self::SERPAPI => [
            'required' => ['key'],
            'fields' => [
                'key' => ['secret' => true, 'config' => 'services.serpapi.key'],
            ],
            'limits' => [
                'monthly' => ['config' => 'services.serpapi.monthly_limit'],
            ],
            'docs' => 'https://serpapi.com/manage-api-key',
            'modules' => ['gallery'],
        ],

        self::SERPER => [
            'required' => ['key'],
            'fields' => [
                'key' => ['secret' => true, 'config' => 'services.serper.key'],
            ],
            'limits' => [],
            'docs' => 'https://serper.dev/api-key',
            'modules' => ['gallery'],
        ],

        self::YOUTUBE => [
            'required' => ['key'],
            'fields' => [
                'key' => ['secret' => true, 'config' => 'services.youtube.key'],
            ],
            'limits' => [],
            'docs' => 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
            'modules' => ['video', 'song'],
        ],

        /*
         | **ტელეგრამის ბოტი (§21.9, შენი მითითება 2026-09-15).**
         |
         | ⚠️ **`.env`-ში არასდროს ყოფილა და ვერც იქნება** — ბოტი *პირადია*:
         | ერთი საერთო ტოკენი იმას ნიშნავდა, რომ ყველას შეხსენება ერთი და
         | იმავე ბოტიდან წავიდოდა, `chat_id` კი ისედაც თითო ადამიანისაა.
         | ამიტომ `config` აქ არცერთ ველს არ აქვს: `shared()` `null`-ს
         | აბრუნებს და მდგომარეობა ან „ჩემია", ან „არაა".
         |
         | ⚠️ **`chat_id` საიდუმლო არაა** — ის უბრალო რიცხვია და მისი დამალვა
         | მხოლოდ გამართვას გაართულებდა; საიდუმლო ტოკენია, რომელიც ბოტზე
         | სრულ წვდომას იძლევა.
         */
        self::TELEGRAM => [
            'required' => ['bot_token', 'chat_id'],
            'fields' => [
                'bot_token' => ['secret' => true, 'config' => null],
                'chat_id' => ['secret' => false, 'config' => null],
            ],
            'limits' => [],
            'docs' => 'https://t.me/BotFather',
            'modules' => ['note'],
        ],
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

    /** ამ ველის **საერთო** (ინსტალაციის) მნიშვნელობა `config/services.php`-იდან */
    public static function shared(string $provider, string $field): mixed
    {
        $key = self::PROVIDERS[$provider]['fields'][$field]['config']
            ?? self::PROVIDERS[$provider]['limits'][$field]['config']
            ?? null;

        return $key === null ? null : config($key);
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
