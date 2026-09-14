<?php

namespace App\Services\Translation;

use App\Models\TranslationUsage;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * ორმხრივი თარგმანი EN↔KA (Tasks 7).
 *
 * ერთი წყარო — **Google Gemini** (`GEMINI_API_KEY`, უფასო დონე, ბარათის გარეშე).
 *
 * ⚠️ **Claude აქედან ამოღებულია 2026-09-14-ს** (მომხმარებლის მითითებით):
 * `ANTHROPIC_API_KEY` მხოლოდ Console-ის კრედიტებზე მუშაობს — Claude Code-ის
 * გამოწერა API გასაღებს არ იძლევა — ე.ი. „უფასო თარგმანის" ვარიანტი არ იყო.
 *
 * ⚠️ **უფასო Google Translate-ის fallback-იც ამოღებულია.** ის 429-ს აბრუნებდა,
 * ე.ი. ჩუმად ჩავარდნილი წყარო იყო: ინტერფეისი ამბობდა „ვთარგმნი", ტექსტი კი
 * არ მოდიოდა. ამ პროექტში ჩუმი ჩავარდნა ყველაზე ცუდი ხარვეზია (იგივე წესი,
 * რამაც შეხსენებებს ელფოსტის არხი მოაცილა).
 *
 * ე.ი. გასაღების გარეშე `configured()` false-ია და ინტერფეისი პატიოსნად წერს,
 * რომ მხოლოდ TMDB-ის ტექსტი მოვა.
 */
class Translator
{
    /** ენის კოდი → სახელი პრომპტისთვის */
    private const NAMES = ['ka' => 'Georgian', 'en' => 'English'];

    private const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';

    /** სცადოს თუ არა ხელახლა — მხოლოდ დროებით ხარვეზებზე */
    private const RETRY_STATUSES = [429, 500, 503];

    private const RETRY_TIMES = 3;

    private const RETRY_SLEEP_MS = 2000;

    /* ⚠️ 45 წამი **არ ყოფნიდა** (ცოცხლად დაფიქსირდა 2026-09-14): ფიქრით
       ჩართული მოდელი 236-სიმბოლოიან აღწერაზე 45 წამს სცდებოდა და
       `ConnectionException`-ით მთავრდებოდა, ე.ი. ჩანაწერი უთარგმნელი რჩებოდა. */
    private const TIMEOUT = 90;

    /* ⚠️ **დაპინული ვერსია და არა `gemini-flash-latest` alias.** ცოცხალი
       გაზომვა 2026-09-14: alias იმ დღეს 90 წამის timeout-სა და 503-ს აძლევდა,
       `gemini-3.5-flash` კი იმავე ტექსტს **1.3 წამში** თარგმნიდა. alias იმას
       მიჰყვება, რასაც Google დღეს მიუთითებს — თარგმანს კი სტაბილურობა უნდა.
       სხვა მოდელზე გადასვლა ერთი `.env` ხაზია (`GEMINI_MODEL`). */
    private const DEFAULT_MODEL = 'gemini-3.5-flash';

    /**
     * ბოლო გამოძახების მიზეზი, როცა თარგმანი არ მოვიდა.
     *
     * ⚠️ **`null` დაბრუნება ორ სხვადასხვა ფაქტს ნიშნავდა** — „წყარო ჩავარდა"
     * და „ლიმიტი ამოიწურა" — და ინტერფეისი ვერცერთს ვერ ამბობდა. ეს ველი
     * მათ ერთმანეთისგან აცალკევებს (`bgg_unavailable`-ის იგივე წესი).
     */
    private ?string $lastError = null;

    /** არის თუ არა თარჯიმანი (Gemini) ხელმისაწვდომი */
    public function configured(): bool
    {
        return filled(config('services.gemini.key'));
    }

    public function lastError(): ?string
    {
        return $this->lastError;
    }

    /**
     * **ხარჯის სურათი** (შენი მითითება, 2026-09-14: „რამდენი გამოიყენე და
     * რა დარჩა").
     *
     * ⚠️ **ეს *ჩვენი* აღრიცხვაა და არა Google-ის.** Gemini-ს ხარჯის API არ
     * აქვს (SerpApi-სგან განსხვავებით, სადაც `GET /account` ნამდვილ მრიცხველს
     * აბრუნებს), ე.ი. ერთადერთი წყარო `translation_usages`-ია — და ინტერფეისი
     * ამას ცხადად უნდა ამბობდეს, თორემ რიცხვი ავტორიტეტულად წაიკითხებოდა.
     *
     * @return array{provider:string, model:?string, configured:bool, used:int, limit:int, remaining:?int, rpm_used:int, rpm_limit:int, exhausted:bool}
     */
    public function usage(): array
    {
        $limit = (int) config('services.gemini.daily_limit', 0);
        $rpm = (int) config('services.gemini.rpm_limit', 0);
        $used = TranslationUsage::usedToday();

        return [
            'provider' => TranslationUsage::PROVIDER_GEMINI,
            'model' => $this->configured() ? (string) config('services.gemini.model', self::DEFAULT_MODEL) : null,
            'configured' => $this->configured(),
            'used' => $used,
            'limit' => $limit,
            // ⚠️ `null` = ლიმიტი გამორთულია; `0` = ამოიწურა — სხვადასხვა ფაქტია
            'remaining' => $limit > 0 ? max(0, $limit - $used) : null,
            'rpm_used' => TranslationUsage::usedThisMinute(),
            'rpm_limit' => $rpm,
            'exhausted' => $limit > 0 && $used >= $limit,
        ];
    }

    public function toGeorgian(?string $text): ?string
    {
        return $this->translate($text, 'ka');
    }

    public function toEnglish(?string $text): ?string
    {
        return $this->translate($text, 'en');
    }

    /**
     * თარგმანი სამიზნე ენაზე. `$context` პრომპტს აზუსტებს (მაგ. „movie title",
     * „genre name") — მოკლე ტექსტებზე ეს ხარისხს შესამჩნევად ცვლის.
     */
    public function translate(?string $text, string $to, string $context = 'text'): ?string
    {
        $this->lastError = null;
        $text = trim((string) $text);

        if ($text === '' || ! isset(self::NAMES[$to])) {
            return null;
        }

        [$target, $source] = $this->names($to);

        $prompt = "Translate the following {$source} {$context} into natural {$target}. "
            ."Keep proper nouns recognisable. Output ONLY the {$target} translation, "
            ."with no notes, quotes or explanations:\n\n".$text;

        return $this->ask($prompt, $to, $context, mb_strlen($text));
    }

    /**
     * **არსებული თარგმანის გადამოწმება** — `review` რეჟიმი (2026-09-14).
     *
     * აბრუნებს **შესწორებულ ტექსტს**, ან `null`-ს — როცა შესწორება არ დასჭირდა
     * (ან გამოძახება ჩავარდა). ⚠️ **„შესწორება არ სჭირდება" და „ვერ მივიღე"
     * აქ განზრახ ერთი პასუხია**: ორივე შემთხვევაში ტექსტს არ ვცვლით, ე.ი.
     * გამომძახებელს ერთი და იგივე ქცევა სჭირდება. მიზეზი `lastError()`-შია.
     *
     * მოდელს ვეუბნებით „ან გაასწორე, ან იგივე დააბრუნე" — სპეციალური
     * მარკერი განზრახ არაა: ის თავად შეიძლება ტექსტში აღმოჩნდეს, და მაშინ
     * მომხმარებელს აღწერაში „NO_CHANGE" ეწერებოდა.
     */
    public function review(?string $text, ?string $original, string $to, string $context = 'text'): ?string
    {
        $this->lastError = null;
        $text = trim((string) $text);
        $original = trim((string) $original);

        /* ⚠️ **ორიგინალის გარეშე გადამოწმება არ არსებობს.** წყაროს გარეშე ეს
           შემოწმება აღარაა — უბრალოდ გადაწერაა, ე.ი. ზუსტად ის ჩუმი ზიანი,
           რისთვისაც ეს რეჟიმი ცალკე და სახელდებული გახდა. */
        if ($text === '' || $original === '' || ! isset(self::NAMES[$to])) {
            return null;
        }

        [$target, $source] = $this->names($to);

        $prompt = "Below is a {$source} {$context} and an existing {$target} translation of it. "
            .'Check the translation against the original and fix mistranslations, wrong names, '
            .'grammar and unnatural wording. Do NOT add or remove information, and do NOT rewrite '
            ."a translation that is already correct. Output ONLY the final {$target} text — the "
            .'corrected version, or the existing translation unchanged — with no notes, quotes '
            ."or explanations.\n\n{$source} original:\n{$original}\n\n{$target} translation:\n{$text}";

        $out = $this->ask($prompt, $to, 'review '.$context, mb_strlen($text) + mb_strlen($original));

        return $out === null || $this->sameText($out, $text) ? null : $out;
    }

    /**
     * ერთი გამოძახება — **ლიმიტი, აღრიცხვა და შეცდომა ერთ ადგილას**.
     *
     * ⚠️ `translate()` და `review()` მხოლოდ პრომპტით განსხვავდებიან; კვოტის
     * შემოწმებისა და `translation_usages`-ის ჩაწერის მეორე ასლი მრიცხველს
     * ჩუმად ააცდენდა — ზუსტად ის, რისთვისაც „ერთი წყარო, ერთი მრიცხველი"
     * წესი დაიწერა.
     */
    private function ask(string $prompt, string $to, string $context, int $chars): ?string
    {
        if (! $this->configured()) {
            $this->lastError = 'translator_not_configured';

            return null;
        }

        /* ⚠️ **ლიმიტი გამოძახებამდე მოწმდება და ამოწურული რიგი არ იწერება.**
           რიგი „დახარჯულს" ნიშნავს — დაბლოკილი მოთხოვნა კი Google-ს არ
           მისულა, ე.ი. მისი ჩაწერა მრიცხველს თავად გაბერავდა. */
        if ($this->usage()['exhausted']) {
            $this->lastError = 'gemini_quota_exceeded';

            return null;
        }

        try {
            $out = $this->gemini($prompt);
            $this->record($to, $context, $chars, true, null);

            return $out;
        } catch (Throwable $e) {
            /* ⚠️ **ჩავარდნილი მოთხოვნაც იწერება.** Gemini-ის კვოტას უარყოფილი
               მოთხოვნაც ხარჯავს (429 სწორედ იმიტომ მოდის, რომ ლიმიტს მიაღწიე),
               ე.ი. „ვცადე და ვერ გავიდა" აღრიცხვის ნაწილია და არა ხმაური. */
            $this->record($to, $context, $chars, false, $e->getMessage());
            $this->lastError = 'translator_failed';

            return null;
        }
    }

    /** სამიზნე/წყარო ენის სახელი პრომპტისთვის */
    private function names(string $to): array
    {
        return [self::NAMES[$to], self::NAMES[$to === 'ka' ? 'en' : 'ka']];
    }

    /** იგივე ტექსტია თუ არა — მხოლოდ გამოტოვებების სხვაობა ცვლილება არაა */
    private function sameText(string $a, string $b): bool
    {
        $norm = fn (string $s) => preg_replace('/\s+/u', ' ', trim($s));

        return $norm($a) === $norm($b);
    }

    /** ერთი გამოძახების აღრიცხვა — **ერთადერთი ჩამწერი ადგილი** */
    private function record(string $to, string $context, int $chars, bool $ok, ?string $error): void
    {
        TranslationUsage::create([
            'user_id' => Auth::id(),
            'provider' => TranslationUsage::PROVIDER_GEMINI,
            'model' => (string) config('services.gemini.model', self::DEFAULT_MODEL),
            'target_lang' => $to,
            'context' => mb_substr($context, 0, 60),
            'chars' => $chars,
            'ok' => $ok,
            'error' => $error === null ? null : mb_substr($error, 0, 255),
        ]);
    }

    /** ბევრი ტექსტი ერთ მოთხოვნაში (ხაზებად); აბრუნებს იმავე რაოდენობის მასივს */
    public function translateBatch(array $texts, string $to, string $context = 'text'): array
    {
        $texts = array_values(array_map(fn ($t) => str_replace("\n", ' ', trim((string) $t)), $texts));
        if (! $texts) {
            return [];
        }

        $result = $this->translate(implode("\n", $texts), $to, $context);
        if (! $result) {
            return $texts;
        }

        $lines = array_map('trim', explode("\n", $result));

        // თუ ხაზები არ ემთხვევა — ვაბრუნებთ ორიგინალებს (უსაფრთხოდ)
        return count($lines) === count($texts) ? $lines : $texts;
    }

    /** უკან თავსებადობა: ძველი გამოძახება `toGeorgianBatch()` */
    public function toGeorgianBatch(array $texts): array
    {
        return $this->translateBatch($texts, 'ka');
    }

    private function gemini(string $prompt): ?string
    {
        $model = config('services.gemini.model', self::DEFAULT_MODEL);

        try {
            return $this->send($model, $prompt, true);
        } catch (RequestException $e) {
            /* ⚠️ **`thinkingBudget` ყველა მოდელს არ აქვს.** `*-flash-lite` მას
               **400-ით** უარყოფს (ცოცხლად შემოწმებული 2026-09-14-ს), ე.ი.
               `.env`-ში lite-მოდელის ჩაწერა თარგმანს სრულიად კლავდა — ჩუმად,
               რადგან 400 დროებითი არაა და `translate()` null-ს აბრუნებს.
               ერთხელ ვიმეორებთ ფიქრის პარამეტრის გარეშე: lite ისედაც არ ფიქრობს,
               ე.ი. შედეგი იგივეა. ეს **მოდელების სია არ არის** — სია დაძველდებოდა. */
            if ($e->response->status() === 400) {
                return $this->send($model, $prompt, false);
            }

            throw $e;
        }
    }

    /** ერთი გამოძახება; `$noThinking` — ვურთავთ თუ არა `thinkingConfig`-ს */
    private function send(string $model, string $prompt, bool $noThinking): ?string
    {
        $config = ['temperature' => 0.3];

        if ($noThinking) {
            /* ⚠️ **ფიქრის გამორთვა აუცილებელია და არა ოპტიმიზაცია.** ცოცხალი
               გაზომვა 2026-09-14: 236-სიმბოლოიან აღწერაზე მოდელმა **1183 ფიქრის
               ტოკენი** დახარჯა და 45 წამს გადააჭარბა — მოთხოვნა timeout-ით
               ჩავარდა. გამორთვის შემდეგ იგივე თარგმანი **1.3 წამია**.
               ⚠️ სახელი ზუსტად ასეა: `thinkingLevel` ამ endpoint-ზე **400-ია**. */
            $config['thinkingConfig'] = ['thinkingBudget' => 0];
        }

        $res = Http::withOptions([
            // ⚠️ Windows-ის cURL-ს CA bundle არ აქვს (იხ. CLAUDE.md)
            'verify' => storage_path('cacert.pem'),
        ])
            ->timeout(self::TIMEOUT)
            /* ⚠️ გასაღები **ჰედერშია და არა query-ში**: `?key=` მისამართის ნაწილი
               ხდება, ე.ი. ლოგში, გამონაკლისის ტექსტსა და proxy-ის ჩანაწერში
               ჩაჯდებოდა. `X-goog-api-key` Google-ის სტანდარტული ჰედერია. */
            ->withHeaders(['X-goog-api-key' => config('services.gemini.key')])
            /* ⚠️ **ხელახლა ცდა აუცილებელია და არა კომფორტი.** Gemini დროდადრო
               503-ს აბრუნებს („მოდელი გადატვირთულია") — ცოცხლად შემოწმებულია
               2026-09-14-ს. ერთი ცდის შემთხვევაში `translate()` null-ს
               დააბრუნებდა, ველი ავსებული არ იქნებოდა და რიგი დაწერდა
               „შესრულდა" — ე.ი. ჩანაწერი **ჩუმად** გამოტოვებული დარჩებოდა.
               ⚠️ მხოლოდ დროებით სტატუსებზე: 400 (არასწორი მოდელი) ან 403
               (ცუდი გასაღები) სამჯერ გამეორებას არ იმსახურებს. */
            ->retry(self::RETRY_TIMES, self::RETRY_SLEEP_MS, fn (Throwable $e) => $e instanceof ConnectionException
                || ($e instanceof RequestException && in_array($e->response->status(), self::RETRY_STATUSES, true)))
            ->post(self::ENDPOINT.$model.':generateContent', [
                'contents' => [['parts' => [['text' => $prompt]]]],
                'generationConfig' => $config,
            ]);
        $res->throw();

        return $this->textOf($res->json()) ?: null;
    }

    /**
     * პასუხიდან ტექსტის ამოღება.
     *
     * ⚠️ `parts[0]` **არ გამოდგება**: 3.x მოდელები ფიქრის ბლოკებსაც აბრუნებენ
     * (`thought: true`), ე.ი. პირველი ნაწილი შეიძლება მსჯელობა იყოს და არა
     * თარგმანი. ამიტომ მხოლოდ არა-„thought" ნაწილებს ვკრებთ.
     *
     * ⚠️ **`thoughtSignature` სულ სხვა რამაა და მის მიხედვით გაფილტვრა ტექსტს
     * წაშლიდა**: ის *იმავე* ნაწილზე ზის, სადაც თარგმანია (ცოცხლად ნანახი
     * 2026-09-14-ს — `{"text": "მატრიცა", "thoughtSignature": "…"}`).
     * ვამოწმებთ მხოლოდ `thought`-ს.
     *
     * ⚠️ ცარიელი `candidates` (მაგ. `blockReason`) გამონაკლისი არაა — null-ია,
     * გამომძახებელი კი ველს უბრალოდ არ შეავსებს.
     */
    private function textOf(mixed $data): string
    {
        $parts = data_get($data, 'candidates.0.content.parts');
        if (! is_array($parts)) {
            return '';
        }

        $out = '';
        foreach ($parts as $part) {
            if (! is_array($part) || ($part['thought'] ?? false)) {
                continue;
            }
            $out .= $part['text'] ?? '';
        }

        return trim($out);
    }
}
