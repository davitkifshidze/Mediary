<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\UserCredential;
use App\Services\Audit\AuditLogger;
use App\Services\Credentials\CredentialStore;
use App\Services\Credentials\CredentialTester;
use App\Services\Serp\SerpApiClient;
use App\Services\Translation\Translator;
use App\Support\CredentialProviders;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * **„მონაცემები" — თითო მომხმარებლის გასაღებები და ლიმიტები** (Tasks §21 → §30).
 *
 * ⚠️ **§30-იდან გასაღები მხოლოდ მომხმარებლისაა** — `.env`-ის საერთო ფენა,
 * მისი ნიღაბი და სუპერ-ადმინისთვის მისი „ნახვა" აღარ არსებობს. პასუხში
 * `source` ორმნიშვნელოვანია (`user` | `none`), გაუშიფრავი რიგი კი ცალკე
 * ველით ითქმის (`undecryptable`).
 *
 * ⚠️ **საიდუმლო ველი პასუხში არასდროს ბრუნდება.** „ჩავწერე თუ არა" ერთადერთი
 * კითხვაა, რასაც ინტერფეისმა უნდა უპასუხოს, და მას ნიღბიანი კუდი
 * (`••••a1b2`) პასუხობს. სრული მნიშვნელობის დაბრუნება ნიშნავდა, რომ
 * გასაღები ბრაუზერის ქსელის ჩანართში, ქეშსა და ყოველ სქრინშოტში იდებოდა —
 * და ეს ყველაფერი იმ ერთი ღილაკისთვის, რომელსაც მომხმარებელი წელიწადში
 * ერთხელ აჭერს.
 *
 * ⚠️ **გამოტოვებული ველი არ იცვლება, ცარიელი — იშლება.** ეს ორი სხვადასხვა
 * ქმედებაა და ერთმანეთში აურევა ნიშნავს, რომ „მოდელის შეცვლა" ჩუმად
 * გასაღებს წაშლიდა (ფორმა საიდუმლოს ისედაც ცარიელი აქვს — მას ხომ არ
 * ვაბრუნებთ).
 */
class CredentialController extends Controller
{
    public function __construct(private AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        return response()->json([
            'data' => array_map(
                fn (string $provider) => $this->payload($provider, $userId),
                CredentialProviders::keys(),
            ),
            'meta' => [
                // §21.9 — რაც `.env`-შია, მაგრამ გასაღები არაა (მხოლოდ სუპერ-ადმინს)
                'installation' => $this->installation($request),
            ],
        ]);
    }

    public function update(Request $request, string $provider): JsonResponse
    {
        abort_unless(CredentialProviders::has($provider), 404);

        $user = $request->user();
        $definition = CredentialProviders::fields($provider);
        $limits = CredentialProviders::limits($provider);

        $rules = ['is_active' => ['sometimes', 'boolean']];

        foreach (array_keys($definition) as $name) {
            $rules["fields.$name"] = ['sometimes', 'nullable', 'string', 'max:500'];
        }

        foreach (array_keys($limits) as $name) {
            // `null` = კოდის ნაგულისხმევი, `0` = ლიმიტი არაა — ორივე ნებადართულია
            $rules["limits.$name"] = ['sometimes', 'nullable', 'integer', 'min:0', 'max:1000000'];
        }

        $data = $request->validate($rules);

        $row = UserCredential::firstOrNew(['user_id' => $user->id, 'provider' => $provider]);

        $stored = $row->fields();

        /* ⚠️ **გაუშიფრავ რიგზე შენახვა თვითონ ცდებოდა (Tasks GAP-11)** —
           ე.ი. სხვა `APP_KEY`-ით დაშიფრული გასაღების **გადაწერა**, ერთადერთი
           გამოსავალი, 500-ს იძლეოდა. `forgetUnreadable()` ორიგინალს
           მეხსიერებაში აბათილებს და `save()` მთელ სვეტს ახლით გადაწერს. */
        $row->forgetUnreadable();

        $changed = [];

        foreach ($data['fields'] ?? [] as $name => $value) {
            $value = trim((string) $value);

            if ($value === '') {
                // ცხადად გასუფთავება — სავალდებულო ველის გარეშე წყარო ჩერდება
                if (array_key_exists($name, $stored)) {
                    unset($stored[$name]);
                    $changed[] = $name;
                }

                continue;
            }

            if (($stored[$name] ?? null) !== $value) {
                $stored[$name] = $value;
                $changed[] = $name;
            }
        }

        $storedLimits = $row->limits ?? [];

        foreach ($data['limits'] ?? [] as $name => $value) {
            if ($value === null) {
                unset($storedLimits[$name]);
            } else {
                $storedLimits[$name] = (int) $value;
            }

            $changed[] = 'limit:'.$name;
        }

        $row->credentials = $stored;
        $row->limits = $storedLimits ?: null;
        $row->is_active = (bool) ($data['is_active'] ?? ($row->exists ? $row->is_active : true));

        /* ⚠️ გასაღების შეცვლა ძველ „შემოწმებულია"-ს ბათილს ხდის: ისტორიული
           `verified_at` ახალ, ჯერ შეუმოწმებელ გასაღებზე ტყუილი იქნებოდა. */
        if ($changed !== []) {
            $row->verified_at = null;
            $row->last_error = null;
        }

        $row->save();

        CredentialStore::forget($user->id, $provider);

        /* ⚠️ **ლოგში ფაქტი და არა მნიშვნელობა.** აუდიტ-ლოგს ადმინი კითხულობს
           და `/audit` მას ეკრანზე ხატავს — გასაღები იქ ღიად დაწერილი
           სამუდამოდ დარჩებოდა. ამიტომ მხოლოდ ველების **სახელები** იწერება. */
        $this->audit->log(AuditLog::ACTION_UPDATE, [
            'subject_type' => 'credential',
            'subject_label' => $provider,
            'new_values' => ['fields' => $changed, 'is_active' => $row->is_active],
        ]);

        return response()->json(['data' => $this->payload($provider, $user->id)]);
    }

    public function destroy(Request $request, string $provider): JsonResponse
    {
        abort_unless(CredentialProviders::has($provider), 404);

        $user = $request->user();

        UserCredential::where('user_id', $user->id)->where('provider', $provider)->delete();

        CredentialStore::forget($user->id, $provider);

        $this->audit->log(AuditLog::ACTION_DELETE, [
            'subject_type' => 'credential',
            'subject_label' => $provider,
        ]);

        return response()->json(['data' => $this->payload($provider, $user->id)]);
    }

    /**
     * **გასაღების ნახვა და კოპირება (§21.8, შენი მითითება 2026-09-15).**
     *
     * ⚠️ **ცალკე endpoint-ია და არა სიის ველი — და ეს განზრახაა.** სიას
     * გვერდი ყოველ გახსნაზე ითხოვს, ე.ი. სრული გასაღები ბრაუზერის ქეშში,
     * ქსელის ჩანართსა და ყოველ სქრინშოტში აღმოჩნდებოდა. აქ ის მხოლოდ მაშინ
     * გადის, როცა თვალის ღილაკს ცხადად დააჭერ — ე.ი. „ნახვა" მოქმედებაა
     * და არა გვერდის ფონური მონაცემი.
     *
     * ⚠️ **მხოლოდ საკუთარი მნიშვნელობა** — ყველასთვის, სუპერ-ადმინის
     * ჩათვლით. §21.9-ის „სუპერ-ადმინი საერთო `.env`-ის გასაღებსაც ხედავს"
     * §30-მა გააუქმა: საერთო გასაღები აღარ არსებობს, ხოლო სხვისი გასაღების
     * ჩვენება — არც ადმინისთვის — არასდროს ყოფილა ამ endpoint-ის საქმე.
     *
     * ⚠️ **ნახვა აუდიტ-ლოგში იწერება** (მნიშვნელობის გარეშე, რა თქმა უნდა):
     * გასაღების გატანა ის მოქმედებაა, რომელსაც კვალი უნდა დარჩეს.
     */
    public function reveal(Request $request, string $provider): JsonResponse
    {
        abort_unless(CredentialProviders::has($provider), 404);

        $user = $request->user();
        $row = UserCredential::where('user_id', $user->id)->where('provider', $provider)->first();
        $own = $row?->fields() ?? [];

        $fields = [];

        foreach (CredentialProviders::fields($provider) as $name => $meta) {
            // ღია ველი სიაშივე მოდის — მისი გამეორება აქ ზედმეტია
            if (! ($meta['secret'] ?? false)) {
                continue;
            }

            $mine = trim((string) ($own[$name] ?? ''));

            if ($mine !== '') {
                $fields[$name] = $mine;
            }
        }

        $this->audit->log(AuditLog::ACTION_VISIT, [
            'subject_type' => 'credential',
            'subject_label' => 'reveal: '.$provider,
            'new_values' => ['fields' => array_keys($fields)],
        ]);

        return response()->json([
            'fields' => $fields,
            'source' => CredentialStore::source($provider, $user->id),
        ]);
    }

    /**
     * ცოცხალი შემოწმება (§21.6).
     *
     * ⚠️ **Serper-ის შემოწმება კრედიტს ხარჯავს**, ამიტომ ცხად დასტურს
     * ითხოვს: ბიუჯეტი მომხმარებლის ფულია და მისი ჩუმად დახარჯვა აქ
     * ყველაზე ცუდი ვარიანტია.
     */
    public function test(Request $request, string $provider, CredentialTester $tester): JsonResponse
    {
        abort_unless(CredentialProviders::has($provider), 404);

        /* ⚠️ `accepted` **არმყოფ ველსაც** ამოაგდებს, ე.ი. ერთ წესში
           `requiredIf`-თან შეერთება უფასო წყაროებსაც დაბლოკავდა. */
        if (CredentialTester::costsCredit($provider)) {
            $request->validate(['confirm' => ['required', 'accepted']]);
        }

        $user = $request->user();
        $result = $tester->test($provider, $user->id);

        /* ⚠️ შედეგი მხოლოდ მაშინ იწერება, როცა ჩანაწერი **სრულია და ჩართული**:
           შეუვსებელ ან გამორთულ რიგზე ტესტი „გასაღები ჯერ არაა" პასუხობს,
           და მისი `last_error`-ად დაწერა ჩანაწერს ცრუ ჩავარდნას მიაწერდა. */
        if (CredentialStore::usesOwnKey($provider, $user->id)) {
            UserCredential::where('user_id', $user->id)
                ->where('provider', $provider)
                ->update([
                    'verified_at' => $result['ok'] ? now() : null,
                    'last_error' => $result['ok'] ? null : $result['error'],
                    'updated_at' => now(),
                ]);

            CredentialStore::forget($user->id, $provider);
        }

        return response()->json([
            'ok' => $result['ok'],
            'error' => $result['error'],
            'data' => $this->payload($provider, $user->id),
        ]);
    }

    /**
     * **ინსტალაციის პარამეტრები — მხოლოდ საჩვენებლად** (§21.9).
     *
     * ⚠️ **ეს გასაღებები არაა და per-user ვერ გახდება**: `yt-dlp`-ის ბილიკი
     * ამ *კომპიუტერის* ფაქტია, ღია რეგისტრაცია — მთელი ინსტალაციისა.
     * მაგრამ „რატომ არ ჩანს, რაც `.env`-შია" სამართლიანი კითხვაა, ამიტომ
     * ისინი ერთ, **წასაკითხ** ბლოკად ჩანს და გვერდი ცხადად წერს, რომ
     * მათი შეცვლა `backend/.env`-შია.
     *
     * ⚠️ **`super_admin`-ზეა**: ბილიკები სერვერის შიდა აგებულებას ამხელს.
     * ⚠️ **პაროლი/საიდუმლო აქ არასდროს ხვდება** — სია ცხადად აწერილია და
     * `config('database')`/`mail`/`aws` მასში საერთოდ არ შედის.
     *
     * @return array<int, array<string, mixed>>
     */
    private function installation(Request $request): array
    {
        if (! $request->user()->isSuperAdmin()) {
            return [];
        }

        $rows = [
            ['key' => 'YTDLP_BINARY', 'value' => config('mediary.ytdlp.binary')],
            ['key' => 'FFMPEG_BINARY', 'value' => config('mediary.ytdlp.ffmpeg')],
            ['key' => 'MYSQLDUMP_BINARY', 'value' => config('mediary.backup.mysqldump')],
            ['key' => 'MYSQL_BINARY', 'value' => config('mediary.backup.mysql')],
            ['key' => 'ALLOW_REGISTRATION', 'value' => config('mediary.allow_registration')],
            ['key' => 'PUBLIC_PROFILES', 'value' => config('mediary.public_profiles')],
            ['key' => 'SAFE_HTTP_ALLOW_PRIVATE', 'value' => config('mediary.safe_http.allow_private')],
        ];

        return array_map(fn (array $row) => [
            'key' => $row['key'],
            // ⚠️ `bool` სტრიქონად: `false` JSON-ში მოდის, მაგრამ ინტერფეისზე
            // ცარიელი ველისგან უნდა განსხვავდებოდეს („გამორთულია" ≠ „არ არის")
            'value' => is_bool($row['value'])
                ? ($row['value'] ? 'true' : 'false')
                : (($row['value'] === null || $row['value'] === '') ? null : (string) $row['value']),
        ], $rows);
    }

    /**
     * ერთი წყაროს სრული სურათი — **ერთი ფორმა** სამივე endpoint-ისთვის,
     * თორემ „შენახვის შემდეგ" და „სიაში" ერთი და იგივე წყარო სხვადასხვანაირად
     * გამოიყურებოდა.
     *
     * @return array<string, mixed>
     */
    private function payload(string $provider, int $userId): array
    {
        $row = UserCredential::where('user_id', $userId)->where('provider', $provider)->first();
        $own = $row?->fields() ?? [];
        $required = CredentialProviders::required($provider);

        $fields = [];

        foreach (CredentialProviders::fields($provider) as $name => $meta) {
            $secret = (bool) ($meta['secret'] ?? false);
            $mine = trim((string) ($own[$name] ?? ''));
            $default = CredentialProviders::default($provider, $name);

            $fields[] = [
                'name' => $name,
                'secret' => $secret,
                'required' => in_array($name, $required, true),
                'has_own' => $mine !== '',
                /* ⚠️ საიდუმლო **არასდროს** მიდის სრულად. ღია ველი (მოდელი,
                   `client_id`) კი ფორმას სჭირდება. */
                'value' => $secret ? null : ($mine !== '' ? $mine : null),
                'masked' => $secret ? CredentialProviders::mask($mine) : null,
                // კოდის ნაგულისხმევი — მხოლოდ ღია ველს აქვს (მოდელი); placeholder-ად ჩანს
                'default' => $default === null ? null : (string) $default,
            ];
        }

        $limits = [];

        foreach (array_keys(CredentialProviders::limits($provider)) as $name) {
            $default = CredentialProviders::default($provider, $name);

            $limits[] = [
                'name' => $name,
                'own' => isset($row?->limits[$name]) ? (int) $row->limits[$name] : null,
                'default' => $default === null ? null : (int) $default,
                'effective' => CredentialStore::limit($provider, $name, $userId),
            ];
        }

        return [
            'provider' => $provider,
            'source' => CredentialStore::source($provider, $userId),
            /* ⚠️ **ცალკე ველი და არა `source`-ის მესამე მნიშვნელობა (Tasks GAP-11).**
               `source` პასუხობს კითხვას „მოქმედებს თუ არა ჩემი გასაღები", და
               გაუშიფრავ რიგზე პასუხი მართლაც `none`-ია — აპი ზუსტად ასე
               იქცევა. „ჩემი გასაღები აქ წერია, მაგრამ ვერ იკითხება" მეორე
               ფაქტია, და ერთ ველში შერევა ერთს მათგანს ატყუებდა. */
            'undecryptable' => $row !== null && ! $row->isReadable(),
            'configured' => CredentialStore::configured($provider, $userId),
            'is_active' => $row?->is_active ?? true,
            'verified_at' => $row?->verified_at?->toIso8601String(),
            'last_error' => $row?->last_error,
            'docs' => CredentialProviders::PROVIDERS[$provider]['docs'] ?? null,
            'modules' => CredentialProviders::PROVIDERS[$provider]['modules'] ?? [],
            'test_costs_credit' => CredentialTester::costsCredit($provider),
            'fields' => $fields,
            'limits' => $limits,
            'usage' => $this->usage($provider),
        ];
    }

    /**
     * ხარჯის სურათი იმ ორ წყაროზე, რომელსაც კვოტა აქვს.
     *
     * ⚠️ **ხარჯი ყოველთვის ჩემია** (`CredentialStore::quotaOwner()`, §30) —
     * გასაღები ჩემია, ე.ი. სხვისი გამოძახება ამ რიცხვში ვერ მოხვდება.
     * ⚠️ `period` ბარათს ეუბნება, რა ფანჯარას ითვლის ზოლი: Gemini — დღე,
     * SerpApi — თვე (მისი განახლების თარიღიდან).
     *
     * @return array<string, mixed>|null
     */
    private function usage(string $provider): ?array
    {
        if ($provider === CredentialProviders::GEMINI) {
            return app(Translator::class)->usage();
        }

        if ($provider === CredentialProviders::SERPAPI) {
            $serp = app(SerpApiClient::class);

            return [
                'used' => $serp->usage(),
                'limit' => $serp->limit(),
                'remaining' => $serp->remaining(),
                'period' => 'month',
            ];
        }

        return null;
    }
}
