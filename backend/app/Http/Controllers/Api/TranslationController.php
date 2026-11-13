<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\CastMember;
use App\Models\CastMemberSyncPref;
use App\Services\Audit\AuditLogger;
use App\Services\Cast\CastPool;
use App\Services\Sync\SyncFacts;
use App\Services\Sync\SyncHistory;
use App\Services\Tmdb\TmdbClient;
use App\Services\Translation\CastTranslator;
use App\Services\Translation\ItemTranslator;
use App\Services\Translation\TranslationScanner;
use App\Services\Translation\Translator;
use App\Support\AuditRegistry;
use App\Support\MediaDomain;
use App\Support\MissingCredential;
use App\Support\Redact;
use App\Support\SyncOutcome;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

/**
 * თარგმანები.
 *
 * იმავე per-item მოდელით მუშაობს, რაც სინქრონსა და გალერეაზეა: `plan` აბრუნებს
 * რიგს, შემდეგ თითო ჩანაწერზე ერთი მოკლე რექვესთი მიდის — `php artisan serve`
 * ერთ რექვესთს ემსახურება, ე.ი. გრძელი ციკლი მთელ აპლიკაციას დაბლოკავდა.
 *
 * ჟანრები გამონაკლისია: ისინი ათეულებია და გლობალური ლექსიკონია, ამიტომ ერთ
 * რექვესთში მუშავდება (`genres`).
 *
 * ⚠️ **თარგმანი ნაწილებად იშლება** (`TranslationScanner::PARTS`): `parts` თითო ნაწილის
 * რიცხვს აბრუნებს (მთელ ბიბლიოთეკაზე ან ერთ მოდულზე — `type`), `plan` კი მხოლოდ არჩეულ
 * ნაწილებს გეგმავს. მსახიობის ქართული სახელი და ბიოგრაფია ცალკე ერთეულია (`actor`).
 * ⚠️ **ამოწურული დღიური ლიმიტი ისტორიაში ჩავარდნად არ იწერება**: ერთეული შედეგის გარეშე
 * რჩება, გაშვება ჩერდება და მეორე დღეს დარჩენილზე გრძელდება.
 */
class TranslationController extends Controller
{
    /** Gemini-ს დღიური ლიმიტი ამოიწურა (`Translator::lastError()`) */
    private const QUOTA = 'gemini_quota_exceeded';

    /**
     * ჰედერის badge — „გაქვს N სათარგმნი".
     * აბრუნებს იმასაც, თარჯიმანი და TMDB საერთოდ კონფიგურირებულია თუ არა,
     * რომ ინტერფეისმა პატიოსნად თქვას, რატომ ვერ თარგმნის.
     */
    public function summary(Request $request, TranslationScanner $scanner, Translator $translator, TmdbClient $tmdb)
    {
        $counts = $scanner->summary($this->enabledTypes($request));

        return response()->json($counts + [
            'translator_configured' => $translator->configured(),
            'tmdb_configured' => $tmdb->configured(),
        ]);
    }

    /**
     * **ჩაშლილი რიცხვები** — თარგმანის გვერდების ბარათები: თითო ნაწილზე რამდენია სათარგმნი.
     * `type` — მოდულის გვერდი (`/series/translations`): მხოლოდ ამ მოდულის ჩანაწერები და
     * მათი მსახიობები; ჟანრები გლობალურია და ორივეგან ერთია.
     */
    public function parts(Request $request, TranslationScanner $scanner, Translator $translator, TmdbClient $tmdb): JsonResponse
    {
        $data = $request->validate(['type' => ['sometimes', Rule::in(TranslationScanner::TYPES)]]);
        $requested = isset($data['type']) ? [$data['type']] : null;
        $user = $request->user();

        $types = array_values(array_intersect($requested ?? TranslationScanner::TYPES, $this->enabledTypes($request)));

        return response()->json([
            'types' => $types,
            'parts' => $scanner->parts($types, CastPool::typesFor($user, $requested), (int) $user->getKey()),
            'translator_configured' => $translator->configured(),
            'tmdb_configured' => $tmdb->configured(),
        ]);
    }

    /** ფილტრები → დასამუშავებელი ჩანაწერების რიგი */
    public function plan(Request $request, TranslationScanner $scanner, Translator $translator)
    {
        $data = $request->validate([
            'types' => ['nullable', 'array'],
            'types.*' => ['in:'.implode(',', TranslationScanner::TYPES)],
            // რომელი ნაწილები გაეშვას; გასაღების გარეშე — ყველა ველი (ძველი ქცევა), მსახიობების გარეშე
            'parts' => ['sometimes', 'array'],
            'parts.*' => [Rule::in(TranslationScanner::PARTS)],
            /* სტატუსი per-user ლექსიკონია, ე.ი. მისი სია კოდში აღარ დგას.
               ფილტრი **გასაღებით** მოდის; უცნობი გასაღები უბრალოდ ცარიელ
               შედეგს იძლევა (ეს ფილტრია და არა წაშლის სკოუპი). */
            'status' => ['nullable', 'string', 'max:60'],
            'favorite' => ['nullable', 'boolean'],
            'genres' => ['nullable', 'array'],
            'genres.*' => ['string'],
            'ids' => ['nullable', 'array'],
            'include_genres' => ['nullable', 'boolean'],
            // `review` — TMDB-ის ქართული აღწერის გადამოწმება (2026-09-14)
            'review' => ['nullable', 'boolean'],
            // ბოლო გაშვებაზე ნათარგმნის დამალვა
            'hide_processed' => ['nullable', 'boolean'],
        ]);

        // მხოლოდ ჩართული მოდულების დომენები — გეგმა ორივეს ერთდროულად ეხება,
        // ამიტომ route-ზე `module:` middleware არ დგას და ფილტრი აქ ხდება
        $types = array_values(array_intersect(
            $data['types'] ?? TranslationScanner::TYPES,
            $this->enabledTypes($request),
        ));

        /* ნაწილები: `parts`-ით მოსული არჩევანი ველებს, გადამოწმებას, ჟანრებსა და მსახიობებს
           ერთად წყვეტს; მის გარეშე მოქმედებს ძველი გასაღებები (`review`, `include_genres`). */
        $parts = $request->has('parts') ? array_values(array_unique($data['parts'] ?? [])) : null;
        $fields = $parts === null ? null : array_values(array_intersect(TranslationScanner::FIELDS, $parts));
        $review = $parts === null ? $request->boolean('review') : in_array(TranslationScanner::PART_REVIEW, $parts, true);
        $withGenres = $parts === null ? $request->boolean('include_genres') : in_array(TranslationScanner::PART_GENRES, $parts, true);

        $plan = $scanner->plan($types, [
            'status' => $data['status'] ?? null,
            'favorite' => $request->boolean('favorite'),
            'genres' => $data['genres'] ?? [],
            'ids' => $data['ids'] ?? [],
            'hide_processed' => $request->boolean('hide_processed'),
        ], $review, $fields);

        // მსახიობები — იმავე მოდულების ბიბლიოთეკიდან; ჩანაწერების ფილტრი (სტატუსი, ჟანრი…) მათ არ ეხება
        $user = $request->user();
        $cast = $scanner->castPlan(CastPool::typesFor($user, $types), (int) $user->getKey(), $parts ?? []);

        $genres = $withGenres ? $plan['genres'] : 0;
        $count = count($plan['items']);

        return response()->json([
            'items' => $plan['items'],
            'count' => $count,
            // მსახიობები ცალკე ერთეულებია (`type: actor`) — რიგში ჩანაწერების შემდეგ დგება
            'cast' => $cast,
            'cast_count' => count($cast),
            // ჟანრები ერთი რექვესთია, ე.ი. რიგში ერთ ერთეულად ჯდება
            'genres' => $genres,
            'genres_pending' => $plan['genres'],
            'eta_seconds' => (int) ceil(($count + count($cast) + ($genres ? 1 : 0)) * 60 / TranslationScanner::ITEMS_PER_MINUTE),
            'gemini' => $this->geminiCost($plan['items'], $cast, $review, $translator),
        ]);
    }

    /**
     * **რამდენ დღეს გაწვდება Gemini-ს დღიური ლიმიტი** — გაშვებამდე.
     *
     * ⚠️ რიცხვი **ზედა ზღვარია**: თითო ნაკლულ ველზე, გადასამოწმებელ აღწერაზე და მსახიობის
     * სახელსა თუ ბიოგრაფიაზე ერთი მოთხოვნა; რასაც TMDB თვითონ შეავსებს, Gemini-მდე არ მიდის.
     * `days` — `null`, როცა ლიმიტი გამორთულია ან გასაღები არ არის.
     *
     * @param  array<int, array<string, mixed>>  $items
     * @param  list<array<string, mixed>>  $cast
     * @return array{requests: int, limit: int, remaining: ?int, days: ?int}
     */
    private function geminiCost(array $items, array $cast, bool $review, Translator $translator): array
    {
        $requests = 0;

        foreach ($items as $item) {
            $requests += count($item['missing']) + ($review && $item['review'] ? 1 : 0);
        }

        foreach ($cast as $actor) {
            $requests += count($actor['missing']);
        }

        $usage = $translator->usage();
        $limit = (int) $usage['limit'];
        $remaining = $usage['remaining'];

        return [
            'requests' => $requests,
            'limit' => $limit,
            'remaining' => $remaining,
            // დღეს — რაც დარჩა; შემდეგ დღეებში — სრული ლიმიტი
            'days' => ! $usage['configured'] || $limit <= 0 || $requests === 0
                ? null
                : ($requests <= (int) $remaining ? 1 : 1 + (int) ceil(($requests - (int) $remaining) / $limit)),
        ];
    }

    /**
     * ერთი ჩანაწერის თარგმნა.
     * per-item შეცდომა 200-ით ბრუნდება (`ok:false` + `error`), რომ ფრონტის ციკლი
     * არ გაწყდეს — მიზეზი ლოგშიც იწერება (იგივე წესი, რაც სინქრონზე).
     */
    public function item(Request $request, string $type, int $id, ItemTranslator $translator, AuditLogger $audit, SyncHistory $history)
    {
        if (! in_array($type, TranslationScanner::TYPES, true)) {
            return response()->json(['message' => 'invalid_type'], 422);
        }

        $sources = $this->sources($request);
        // ერთი ნაწილის გაშვება სხვას არ ეხება: `fields` — მხოლოდ ეს ველები (მის გარეშე — რაც აკლია)
        $fields = $this->fields($request);
        /* ⚠️ **`review` ცალკე დროშაა და არა მესამე „წყარო".** ის სხვა ღერძია:
           წყაროები *ცარიელ* ველს ავსებენ, გადამოწმება კი **არსებულ** ტექსტს
           ეხება. სიაში ჩადებული ის „მარტო TMDB + გადამოწმება"-ს შეუძლებელს
           გახდიდა — რაც სწორედ ყველაზე საჭირო კომბინაციაა. */
        $review = $request->boolean('review');

        $item = MediaDomain::model($type)::find($id);
        if (! $item) {
            return response()->json(['message' => 'not_found'], 404);
        }

        // ისტორიისთვის: ჩანაწერი თარგმნამდე — რა ტექსტი ჩაიწერა, სხვაობიდან მოდის
        $facts = SyncFacts::watch($item, SyncHistory::KIND_TRANSLATE, $history->tracks($request));

        $result = $translator->translate($item, $sources, $review, $fields);

        if (! $result['ok']) {
            Log::warning('translate failed', ['type' => $type, 'id' => $id, 'error' => $result['error']]);
        }

        /* **„რა რითი ითარგმნა" — ლოგში** (შენი მითითება, 2026-09-14).
           ⚠️ **ცალკე მოქმედებაა და არა `update`**: ტექსტი `<domain>_translations`-ში
           ჯდება, რომელიც `AuditRegistry::MODELS`-ში არ არის — ე.ი. თარგმანი
           ლოგში საერთოდ არ ჩანდა.
           ⚠️ გამოტოვებული ჩანაწერი **არ იწერება** — ვინც 300-ჩანაწერიან
           ბიბლიოთეკაზე გაუშვებს რიგს, არაფერს არ უნდა იპოვოს 300 „გამოვტოვე" რიგში. */
        if ($result['ok'] && $result['changed']) {
            $audit->log(AuditLog::ACTION_TRANSLATE, [
                'module' => $type,
                'subject_type' => AuditRegistry::typeFor($item),
                'subject_id' => $item->getKey(),
                'subject_label' => $item->title_ka ?: $item->title_en,
                // ველი → წყარო (`tmdb` / `gemini`) — ესაა „რა რითი"
                'new_values' => $result['providers'],
                'old_values' => ['sources' => implode(',', $sources)] + ($review ? ['review' => '1'] : []),
            ]);
        }

        $title = $item->title_ka ?: ($item->title_en ?: '#'.$item->id);

        /* რიგის გაშვება (`run`) სინქრონიზაციის ისტორიაში იწერება — რომელი ველი ითარგმნა და რით.
           ⚠️ ამოწურული ლიმიტი ჩავარდნად არ იწერება: ერთეული შედეგის გარეშე რჩება და გაშვების
           გაგრძელებას ელის. */
        if ($result['error'] !== self::QUOTA) {
            [$outcome, $details] = $facts->settle(SyncHistory::outcome($result), $result['providers'] ?? []);
            $history->fromRequest($request, SyncHistory::KIND_TRANSLATE, $type, $id, $title, $outcome, $details);
        }

        return response()->json([
            'ok' => $result['ok'],
            'skipped' => $result['skipped'],
            'changed' => $result['changed'],
            'providers' => $result['providers'],
            // `updated` · `empty` · `failed` (`SyncOutcome`); გამოტოვებაზე `null`
            'result' => $result['result'] ?? null,
            'error' => $result['error'],
            'title' => $title,
        ]);
    }

    /**
     * **ერთი მსახიობის ქართული სახელი და/ან ბიოგრაფია** — რიგის ერთი ნაბიჯი.
     *
     * ⚠️ **`module:`/`permission:` middleware აქ ვერ დგას** — მსახიობს მოდული არ აქვს;
     * „ვის შეუძლია" ჩართული მედია-მოდული წყვეტს (`CastPool::typesFor()` — მსახიობების
     * სინქრონიზაციის წესი). ⚠️ ჩემი „აღარ განაახლო" მსახიობზე თარგმანსაც აჩერებს.
     * ⚠️ per-item შეცდომა 200-ით ბრუნდება, რომ რიგი არ გაწყდეს; ამოწურულ ლიმიტზე
     * (`gemini_quota_exceeded`) რიგი თვითონ ჩერდება და ერთეული ისტორიაში არ იწერება.
     */
    public function actor(Request $request, CastMember $castMember, CastTranslator $translator, AuditLogger $audit, SyncHistory $history): JsonResponse
    {
        $user = $request->user();

        if (! CastPool::typesFor($user)) {
            return response()->json(['message' => 'module_disabled'], 403);
        }

        $data = $request->validate([
            'fields' => ['sometimes', 'array', 'min:1'],
            'fields.*' => [Rule::in(CastTranslator::FIELDS)],
        ]);
        $sources = $this->sources($request);
        $title = $castMember->name_ka ?: $castMember->name;

        if (CastMemberSyncPref::withoutGlobalScope('owner')->where('user_id', $user->getKey())->where('cast_member_id', $castMember->getKey())->exists()) {
            $history->fromRequest($request, SyncHistory::KIND_TRANSLATE, SyncHistory::ACTOR, (int) $castMember->getKey(), $title, [SyncHistory::SKIPPED, [], 'sync_paused']);

            return response()->json(['ok' => true, 'skipped' => true, 'changed' => [], 'providers' => [], 'result' => null, 'error' => null, 'title' => $title]);
        }

        // ისტორიისთვის: მსახიობი თარგმნამდე — რა ტექსტი ჩაიწერა, სხვაობიდან მოდის
        $facts = SyncFacts::watch($castMember, SyncHistory::KIND_TRANSLATE, $history->tracks($request));

        $result = $translator->translate($castMember, $data['fields'] ?? CastTranslator::FIELDS, $sources);

        if (! $result['ok']) {
            Log::warning('translate actor failed', ['id' => $castMember->getKey(), 'error' => $result['error']]);
        }

        $title = $castMember->name_ka ?: $castMember->name;

        // „რა რითი ითარგმნა" — ლოგში, როგორც ჩანაწერზე; გამოტოვებული არ იწერება
        if ($result['changed']) {
            $audit->log(AuditLog::ACTION_TRANSLATE, [
                'module' => 'cast',
                'subject_id' => $castMember->getKey(),
                'subject_label' => $title,
                'new_values' => $result['providers'],
                'old_values' => ['sources' => implode(',', $sources)],
            ]);
        }

        if (! $result['quota']) {
            [$outcome, $details] = $facts->settle(SyncHistory::outcome($result), $result['providers']);
            $history->fromRequest($request, SyncHistory::KIND_TRANSLATE, SyncHistory::ACTOR, (int) $castMember->getKey(), $title, $outcome, $details);
        }

        return response()->json([
            'ok' => $result['ok'] && ! $result['quota'],
            'skipped' => $result['skipped'],
            'changed' => $result['changed'],
            'providers' => $result['providers'],
            'result' => $result['result'],
            'error' => $result['error'],
            'title' => $title,
        ]);
    }

    /**
     * რომელი ველები ითარგმნოს (`TranslationScanner::FIELDS`); გასაღების გარეშე — `null`,
     * ე.ი. ყველაფერი, რაც აკლია. ⚠️ ცარიელი სია ნიშნავს „არცერთი ველი" — მხოლოდ გადამოწმება.
     *
     * @return array<int, string>|null
     */
    private function fields(Request $request): ?array
    {
        $data = $request->validate([
            'fields' => ['sometimes', 'array'],
            'fields.*' => [Rule::in(TranslationScanner::FIELDS)],
        ]);

        return $request->has('fields') ? array_values(array_unique($data['fields'] ?? [])) : null;
    }

    /**
     * არჩეული წყაროები (შენი მითითება, 2026-09-14).
     *
     * ⚠️ **ცარიელი არჩევანი 422-ია და არა ჩუმად „ორივე"** — „თავისით
     * არ უნდა ხდებოდეს" ზუსტად ამას ნიშნავს.
     * ⚠️ **გარეშე დატოვებული გასაღები ორივე წყაროს ნიშნავს** — ძველი
     * კლიენტი (და CLI) დღევანდელ ქცევას ინარჩუნებს; **ცარიელი მასივი — 422**.
     *
     * @return array<int, string>
     */
    private function sources(Request $request): array
    {
        $data = $request->validate([
            'sources' => ['nullable', 'array'],
            'sources.*' => ['in:'.implode(',', ItemTranslator::SOURCES)],
            'review' => ['nullable', 'boolean'],
        ]);

        if (! $request->has('sources')) {
            return ItemTranslator::SOURCES;
        }

        abort_if(! ($data['sources'] ?? []), 422, 'no_translation_source');

        return array_values(array_unique($data['sources']));
    }

    /** ჟანრების ლექსიკონი — ერთი გატარებით (გლობალურია, per-user არ იჭრება) */
    public function genres(Request $request, TranslationScanner $scanner, ItemTranslator $translator)
    {
        $sources = $this->sources($request);

        $pending = $scanner->pendingGenres();
        if ($pending->isEmpty()) {
            return response()->json(['ok' => true, 'skipped' => true, 'translated' => 0, 'error' => null]);
        }

        try {
            $result = $translator->translateGenres($pending, $sources);
        } catch (\Throwable $e) {
            Log::warning('translate genres failed', ['error' => Redact::secrets($e->getMessage())]);

            return response()->json(['ok' => false, 'skipped' => false, 'translated' => 0, 'error' => Redact::secrets($e->getMessage())]);
        }

        /* ⚠️ არჩეული წყაროებიდან არცერთის გასაღები არ მაქვს →
           ეს შეცდომაა და არა „გამოტოვება" (`ItemTranslator::translate()`-ის წესი) */
        if ($result['translated'] === 0 && ! $translator->anyConfigured($sources)) {
            return response()->json(['ok' => false, 'skipped' => false, 'translated' => 0, 'error' => MissingCredential::CODE]);
        }

        return response()->json([
            'ok' => true,
            'skipped' => $result['translated'] === 0,
            'translated' => $result['translated'],
            'error' => null,
        ]);
    }

    /**
     * **ხარჯი და ბოლო თარგმანები** (შენი მითითება, 2026-09-14).
     *
     * ⚠️ **ლოგი `audit_logs`-იდან იკითხება და არა ცალკე ცხრილიდან.** „რა
     * რითი ითარგმნა" ერთი ფაქტია — ორი ცხრილი აუცილებლად აცდებოდა,
     * და გვერდის სია იმავეს აღარაფერს აჩვენებდა, რასაც `/audit`.
     *
     * ⚠️ `translation_usages` ამ სიას **არ** კვებავს: იქ გამოძახებებია
     * (ხარჯი), აქ — ჩანაწერები. ერთ აღწერაში ჩადება „რამდენი დავხარჯე"-ს
     * და„რა ითარგმნა"-ს ერთმანეთში არევდა (ერთი ჩანაწერი = ორი გამოძახება).
     */
    public function usage(Request $request, Translator $translator)
    {
        $recent = AuditLog::query()
            ->where('action', AuditLog::ACTION_TRANSLATE)
            ->where('user_id', $request->user()->id)
            ->latest('created_at')
            ->limit(30)
            ->get(['id', 'module', 'subject_id', 'subject_label', 'new_values', 'created_at'])
            ->map(fn (AuditLog $row) => [
                'id' => $row->id,
                'type' => $row->module,
                'record_id' => $row->subject_id,
                'title' => $row->subject_label,
                // ველი → წყარო
                'fields' => is_array($row->new_values) ? $row->new_values : [],
                'at' => $row->created_at?->toIso8601String(),
            ]);

        /* **ცარიელი და ჩავარდნილი გაშვებებიც ჩანს**: ლოგი მხოლოდ შეცვლილს
           წერს (300 „გამოვტოვე" რიგი არავის სჭირდება), ეს სია კი ჩანაწერის კვალიდან
           მოდის (`last_translated_at`/`last_translate_result`) — ის, რაც ვერ შეივსო. */
        $unfilled = collect(TranslationScanner::TYPES)
            ->flatMap(fn (string $type) => MediaDomain::query($type)
                ->with('translations')
                ->whereIn('last_translate_result', SyncOutcome::RETRY)
                ->orderByDesc('last_translated_at')
                ->limit(30)
                ->get()
                ->map(fn ($row) => [
                    'type' => $type,
                    'record_id' => $row->id,
                    'title' => $row->title_ka ?: $row->title_en,
                    'result' => $row->last_translate_result,
                    'at' => $row->last_translated_at?->toIso8601String(),
                ]))
            ->sortByDesc('at')
            ->take(30)
            ->values();

        return response()->json([
            'gemini' => $translator->usage(),
            'recent' => $recent,
            'unfilled' => $unfilled,
        ]);
    }

    /** @return array<int, string> */
    private function enabledTypes(Request $request): array
    {
        return array_values(array_filter(
            TranslationScanner::TYPES,
            fn ($type) => $request->user()->hasModule($type),
        ));
    }
}
