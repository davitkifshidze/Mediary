<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Services\Audit\AuditLogger;
use App\Services\Tmdb\TmdbClient;
use App\Services\Translation\ItemTranslator;
use App\Services\Translation\TranslationScanner;
use App\Services\Translation\Translator;
use App\Support\AuditRegistry;
use App\Support\MediaDomain;
use App\Support\Redact;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * თარგმანები (Tasks 7).
 *
 * იმავე per-item მოდელით მუშაობს, რაც სინქრონსა და გალერეაზეა: `plan` აბრუნებს
 * რიგს, შემდეგ თითო ჩანაწერზე ერთი მოკლე რექვესთი მიდის — `php artisan serve`
 * ერთ რექვესთს ემსახურება, ე.ი. გრძელი ციკლი მთელ აპლიკაციას დაბლოკავდა.
 *
 * ჟანრები გამონაკლისია: ისინი ათეულებია და გლობალური ლექსიკონია, ამიტომ ერთ
 * რექვესთში მუშავდება (`genres`).
 */
class TranslationController extends Controller
{
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

    /** ფილტრები → დასამუშავებელი ჩანაწერების რიგი */
    public function plan(Request $request, TranslationScanner $scanner)
    {
        $data = $request->validate([
            'types' => ['nullable', 'array'],
            'types.*' => ['in:'.implode(',', TranslationScanner::TYPES)],
            /* §6.4 — სტატუსი per-user ლექსიკონია, ე.ი. მისი სია კოდში აღარ დგას.
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
        ]);

        // მხოლოდ ჩართული მოდულების დომენები — გეგმა ორივეს ერთდროულად ეხება,
        // ამიტომ route-ზე `module:` middleware არ დგას და ფილტრი აქ ხდება
        $types = array_values(array_intersect(
            $data['types'] ?? TranslationScanner::TYPES,
            $this->enabledTypes($request),
        ));

        $plan = $scanner->plan($types, [
            'status' => $data['status'] ?? null,
            'favorite' => $request->boolean('favorite'),
            'genres' => $data['genres'] ?? [],
            'ids' => $data['ids'] ?? [],
        ], $request->boolean('review'));

        $genres = $request->boolean('include_genres') ? $plan['genres'] : 0;
        $count = count($plan['items']);

        return response()->json([
            'items' => $plan['items'],
            'count' => $count,
            // ჟანრები ერთი რექვესთია, ე.ი. რიგში ერთ ერთეულად ჯდება
            'genres' => $genres,
            'genres_pending' => $plan['genres'],
            'eta_seconds' => (int) ceil(($count + ($genres ? 1 : 0)) * 60 / TranslationScanner::ITEMS_PER_MINUTE),
        ]);
    }

    /**
     * ერთი ჩანაწერის თარგმნა.
     * per-item შეცდომა 200-ით ბრუნდება (`ok:false` + `error`), რომ ფრონტის ციკლი
     * არ გაწყდეს — მიზეზი ლოგშიც იწერება (იგივე წესი, რაც სინქრონზე).
     */
    public function item(Request $request, string $type, int $id, ItemTranslator $translator, AuditLogger $audit)
    {
        if (! in_array($type, TranslationScanner::TYPES, true)) {
            return response()->json(['message' => 'invalid_type'], 422);
        }

        $sources = $this->sources($request);
        /* ⚠️ **`review` ცალკე დროშაა და არა მესამე „წყარო".** ის სხვა ღერძია:
           წყაროები *ცარიელ* ველს ავსებენ, გადამოწმება კი **არსებულ** ტექსტს
           ეხება. სიაში ჩადებული ის „მარტო TMDB + გადამოწმება"-ს შეუძლებელს
           გახდიდა — რაც სწორედ ყველაზე საჭირო კომბინაციაა. */
        $review = $request->boolean('review');

        $item = MediaDomain::model($type)::find($id);
        if (! $item) {
            return response()->json(['message' => 'not_found'], 404);
        }

        $result = $translator->translate($item, $sources, $review);

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

        return response()->json([
            'ok' => $result['ok'],
            'skipped' => $result['skipped'],
            'changed' => $result['changed'],
            'providers' => $result['providers'],
            'error' => $result['error'],
            'title' => $item->title_ka ?: ($item->title_en ?: '#'.$item->id),
        ]);
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

        return response()->json([
            'gemini' => $translator->usage(),
            'recent' => $recent,
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
