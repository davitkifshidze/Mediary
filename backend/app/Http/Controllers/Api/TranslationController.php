<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Tmdb\TmdbClient;
use App\Services\Translation\ItemTranslator;
use App\Services\Translation\TranslationScanner;
use App\Services\Translation\Translator;
use App\Support\MediaDomain;
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
        ]);

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
    public function item(Request $request, string $type, int $id, ItemTranslator $translator)
    {
        if (! in_array($type, TranslationScanner::TYPES, true)) {
            return response()->json(['message' => 'invalid_type'], 422);
        }

        $item = MediaDomain::model($type)::find($id);
        if (! $item) {
            return response()->json(['message' => 'not_found'], 404);
        }

        $result = $translator->translate($item);

        if (! $result['ok']) {
            Log::warning('translate failed', ['type' => $type, 'id' => $id, 'error' => $result['error']]);
        }

        return response()->json([
            'ok' => $result['ok'],
            'skipped' => $result['skipped'],
            'changed' => $result['changed'],
            'error' => $result['error'],
            'title' => $item->title_ka ?: ($item->title_en ?: '#'.$item->id),
        ]);
    }

    /** ჟანრების ლექსიკონი — ერთი გატარებით (გლობალურია, per-user არ იჭრება) */
    public function genres(TranslationScanner $scanner, ItemTranslator $translator)
    {
        $pending = $scanner->pendingGenres();
        if ($pending->isEmpty()) {
            return response()->json(['ok' => true, 'skipped' => true, 'translated' => 0, 'error' => null]);
        }

        try {
            $result = $translator->translateGenres($pending);
        } catch (\Throwable $e) {
            Log::warning('translate genres failed', ['error' => $e->getMessage()]);

            return response()->json(['ok' => false, 'skipped' => false, 'translated' => 0, 'error' => $e->getMessage()]);
        }

        return response()->json([
            'ok' => true,
            'skipped' => $result['translated'] === 0,
            'translated' => $result['translated'],
            'error' => null,
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
