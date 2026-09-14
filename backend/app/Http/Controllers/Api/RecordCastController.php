<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CastResource;
use App\Models\AuditLog;
use App\Models\CastMember;
use App\Services\Audit\AuditLogger;
use App\Services\Media\MediaDownloader;
use App\Services\Tmdb\TmdbClient;
use App\Support\CastSync;
use App\Support\MediaDomain;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Throwable;

/**
 * **მსახიობის ხელით მართვა ჩანაწერზე (ეტაპი 1, 2026-09-13).**
 *
 * მოთხოვნა: „ფილმზე რამდენიმე მსახიობია შიდა სიაში, მაგრამ არა ყველა —
 * უნდა შეგეძლოს დაამატო, შემდეგ კი ამ მსახიობზე ფოტო/ვიდეო მოძებნო".
 *
 * აქამდე მსახიობს ჩანაწერს **მხოლოდ TMDB-ის სინქრონი** აბამდა
 * (`MovieEnricher`/`TvEnricher`), ე.ი. თუ წყაროს ვინმე აკლდა, ის
 * ბიბლიოთეკაში ვერანაირად ჩნდებოდა.
 *
 * ## სამი წესი, რომელიც აქ იკრიბება
 *
 * ⚠️ **`cast_members` გლობალური ლექსიკონია** — ერთი ადამიანი ყველა
 * ანგარიშზე ერთი რიგია. ამიტომ დამატება **ვერასდროს** ქმნის ახალ რიგს
 * ბრმად: `CastSync::resolve()` ჯერ `tmdb_person_id`-ით ეძებს, მერე
 * ნორმალიზებული სახელით (ორივე ენაზე). `user_id` აქ არ არსებობს და
 * არც უნდა არსებობდეს — ჩემი მხოლოდ **ბმულია** (`castables`), ტეგები
 * (`cast_member_tags`) და ფოტოები (`gallery_images`).
 *
 * ⚠️ **მოხსნა ლექსიკონის რიგს არ შლის.** იმავე ადამიანს სხვისი ფილმიც
 * ეყრდნობა და მისი ფოტოები (ყველა ანგარიშისა) ორფნად დარჩებოდა.
 *
 * ⚠️ **უფლება ცხადად `update`-ია და არა მეთოდიდან გამოყვანილი.**
 * `EnsureModulePermission` POST-იდან `create`-ს, DELETE-იდან `delete`-ს
 * გამოიყვანდა — მაშინ როცა ეს სამივე **ჩანაწერის რედაქტირებაა**. ამიტომ
 * მარშრუტებზე `permission:@type,update` წერია ცხადად (იგივე გადაწყვეტა,
 * რაც `/translations/{type}/{id}`-ს აქვს).
 */
class RecordCastController extends Controller
{
    /** ძებნის შედეგების ჭერი თითო წყაროზე */
    private const SEARCH_LIMIT = 20;

    /** ერთ ჩანაწერზე დაშვებული მსახიობების ჭერი — TMDB 12-ს წერს, ხელით მეტიც შეიძლება */
    private const MAX_PER_RECORD = 60;

    public function __construct(private readonly AuditLogger $audit) {}

    /**
     * `GET /api/cast/search?q=&type=&id=` — ორი წყარო ერთ პასუხში.
     *
     * ⚠️ **ჯერ ჩვენი ლექსიკონი და მერე TMDB.** ბიბლიოთეკაში უკვე ნაცნობი
     * ადამიანი უფასოა და სწორედ ის არის ხშირი შემთხვევა („ეს მსახიობი
     * სხვა ფილმზე მყავს, აქ არა"); TMDB-ის გამოძახება მხოლოდ ამის შემდეგ
     * ხდება და ჩავარდნა **200-ია და არა 5xx** (`bgg_unavailable`-ის წესი) —
     * წყაროს გაჩერება ხელით შეყვანას ვერ დაბლოკავს.
     *
     * ⚠️ **`type`+`id` არასავალდებულოა და მხოლოდ ნიშნისთვისაა**: შედეგში
     * წერია, ვინ **უკვე აბია** ამ ჩანაწერს, თორემ ერთი და იგივე ადამიანი
     * ორჯერ დაემატებოდა ისე, რომ სიაში ვერაფერს შეამჩნევდი.
     */
    public function search(Request $request, TmdbClient $tmdb): JsonResponse
    {
        $data = $request->validate([
            'q' => ['required', 'string', 'min:2', 'max:100'],
            'type' => ['nullable', MediaDomain::rule()],
            'id' => ['nullable', 'integer'],
        ]);

        $query = trim($data['q']);
        $attached = $this->attachedIds($data['type'] ?? null, isset($data['id']) ? (int) $data['id'] : null);

        $items = [];
        $seenTmdb = [];

        foreach ($this->localMatches($query) as $member) {
            if ($member->tmdb_person_id) {
                $seenTmdb[$member->tmdb_person_id] = true;
            }
            $items[] = [
                'source' => 'local',
                'id' => $member->id,
                'tmdb_person_id' => $member->tmdb_person_id,
                'name' => $member->name,
                'name_ka' => $member->name_ka,
                'photo' => $member->photo_path ? asset('storage/'.$member->photo_path) : null,
                'known_for' => $member->known_for,
                'attached' => in_array($member->id, $attached, true),
            ];
        }

        $tmdbOk = null;
        if ($tmdb->configured()) {
            $tmdbOk = false;
            try {
                $results = $tmdb->searchPerson($query)['results'] ?? [];
                $tmdbOk = true;
                foreach (array_slice($results, 0, self::SEARCH_LIMIT) as $p) {
                    // უკვე ლექსიკონში მყოფი იმავე ადამიანი მეორედ არ იხატება
                    if (isset($p['id']) && isset($seenTmdb[$p['id']])) {
                        continue;
                    }
                    $items[] = [
                        'source' => 'tmdb',
                        'id' => null,
                        'tmdb_person_id' => (int) ($p['id'] ?? 0),
                        'name' => $p['name'] ?? '',
                        'name_ka' => null,
                        'photo' => ! empty($p['profile_path'])
                            ? 'https://image.tmdb.org/t/p/w185'.$p['profile_path']
                            : null,
                        'known_for' => $this->knownFor($p),
                        'attached' => false,
                    ];
                }
            } catch (Throwable $e) {
                // ⚠️ წყაროს ჩავარდნა შედეგის არარსებობა არაა — ეს ორი ცალკე ამბავია
                report($e);
            }
        }

        return response()->json([
            'items' => $items,
            // `null` = გასაღები არ გვაქვს · `false` = არ გვიპასუხა · `true` = გვიპასუხა
            'tmdb' => $tmdbOk,
        ]);
    }

    /** `GET /api/media/cast/{type}/{id}` — ჩანაწერის მსახიობები (რიგით) */
    public function index(string $type, int $id): JsonResponse
    {
        $record = $this->record($type, $id);

        return response()->json([
            'data' => CastResource::collection($record->cast()->get())->resolve(),
        ]);
    }

    /**
     * `POST /api/media/cast/{type}/{id}` — მიბმა.
     *
     * სამი ურთიერთგამომრიცხავი შესვლა: არსებული `cast_member_id` ·
     * `tmdb_person_id` (შემოიყვანება) · სრულიად ხელით `name`.
     */
    public function store(Request $request, string $type, int $id, TmdbClient $tmdb, MediaDownloader $media): JsonResponse
    {
        $record = $this->record($type, $id);

        $data = $request->validate([
            'cast_member_id' => ['nullable', 'integer', 'exists:cast_members,id'],
            'tmdb_person_id' => ['nullable', 'integer', 'min:1'],
            'name' => ['nullable', 'string', 'max:200'],
            'name_ka' => ['nullable', 'string', 'max:200'],
            'gender' => ['nullable', Rule::in([0, 1, 2, 3])],
            'character' => ['nullable', 'string', 'max:255'],
            'billing_order' => ['nullable', 'integer', 'min:0', 'max:999'],
        ]);

        $hasSource = ($data['cast_member_id'] ?? null)
            || ($data['tmdb_person_id'] ?? null)
            || trim((string) ($data['name'] ?? '')) !== '';

        if (! $hasSource) {
            return response()->json(['message' => 'cast_source_required'], 422);
        }

        if ($record->cast()->count() >= self::MAX_PER_RECORD) {
            return response()->json(['message' => 'cast_limit_reached'], 422);
        }

        $member = $this->resolveMember($data, $tmdb, $media);
        if (! $member) {
            return response()->json(['message' => 'cast_member_not_found'], 404);
        }

        if ($record->cast()->whereKey($member->id)->exists()) {
            return response()->json(['message' => 'cast_already_attached'], 409);
        }

        /* ⚠️ **რიგი ბოლოში** — TMDB-ის `billing_order` კრედიტების რიგია და
           ხელით დამატებულის მის შუაში ჩაჭედვა სხვის ადგილს გადაანაცვლებდა. */
        $order = $data['billing_order'] ?? ((int) $record->cast()->max('billing_order') + 1);

        $record->cast()->attach($member->id, [
            'character' => $data['character'] ?? null,
            'billing_order' => $order,
            // ⚠️ ეს ნიშანია, რომელიც მას `/sync`-ისგან იცავს (იხ. `CastSync`)
            'is_manual' => true,
        ]);

        $source = ($data['tmdb_person_id'] ?? null)
            ? 'tmdb'
            : (($data['cast_member_id'] ?? null) ? 'library' : 'manual');

        $this->logCast($record, $member, AuditLog::ACTION_CAST_ATTACH, [
            'character' => $data['character'] ?? null,
            'billing_order' => $order,
            'source' => $source,
        ]);

        return response()->json([
            'data' => (new CastResource($record->cast()->whereKey($member->id)->first()))->resolve(),
        ], 201);
    }

    /** `PATCH /api/media/cast/{type}/{id}/{castMember}` — როლი და რიგი */
    public function update(Request $request, string $type, int $id, CastMember $castMember): JsonResponse
    {
        $record = $this->record($type, $id);

        abort_unless($record->cast()->whereKey($castMember->id)->exists(), 404);

        $data = $request->validate([
            'character' => ['nullable', 'string', 'max:255'],
            'billing_order' => ['nullable', 'integer', 'min:0', 'max:999'],
        ]);

        $pivot = [];
        if ($request->has('character')) {
            $pivot['character'] = $data['character'] ?? null;
        }
        if (isset($data['billing_order'])) {
            $pivot['billing_order'] = $data['billing_order'];
        }

        if ($pivot) {
            $record->cast()->updateExistingPivot($castMember->id, $pivot);
        }

        return response()->json([
            'data' => (new CastResource($record->cast()->whereKey($castMember->id)->first()))->resolve(),
        ]);
    }

    /**
     * `DELETE /api/media/cast/{type}/{id}/{castMember}` — მხოლოდ ბმის მოხსნა.
     *
     * ⚠️ **ლექსიკონის რიგი რჩება.** იხ. კლასის შენიშვნა.
     */
    public function destroy(string $type, int $id, CastMember $castMember): JsonResponse
    {
        $record = $this->record($type, $id);

        abort_unless($record->cast()->whereKey($castMember->id)->exists(), 404);

        $record->cast()->detach($castMember->id);
        $this->logCast($record, $castMember, AuditLog::ACTION_CAST_DETACH);

        return response()->json(['ok' => true]);
    }

    /* ---------------------------------------------------------------- */

    private function record(string $type, int $id): Model
    {
        abort_unless(MediaDomain::has($type), 422);

        /* ⚠️ `BelongsToUser`-ის `owner` scope-ის წყალობით სხვისი ჩანაწერი
           **404-ია** და არა 403 — „ეს ჩანაწერი არსებობს" თავისთავად ინფორმაციაა. */
        $record = MediaDomain::query($type)->find($id);
        abort_unless($record, 404);

        return $record;
    }

    /**
     * ჩანაწერზე უკვე მიბმულები — ძებნის შედეგზე ნიშნისთვის.
     *
     * @return list<int>
     */
    private function attachedIds(?string $type, ?int $id): array
    {
        if (! $type || ! $id || ! MediaDomain::has($type)) {
            return [];
        }

        $record = MediaDomain::query($type)->find($id);

        return $record ? $record->cast()->pluck('cast_members.id')->all() : [];
    }

    /**
     * ლექსიკონში ძებნა — სახელით ორივე ენაზე.
     *
     * @return Collection<int, CastMember>
     */
    private function localMatches(string $query): Collection
    {
        return CastMember::where('name', 'like', '%'.$query.'%')
            ->orWhereHas('translations', fn ($q) => $q->where('name', 'like', '%'.$query.'%'))
            ->orderBy('name')
            ->limit(self::SEARCH_LIMIT)
            ->get();
    }

    /** TMDB-ის „რითი არის ცნობილი" — ერთსახელიანების გასარჩევად */
    private function knownFor(array $person): ?string
    {
        $titles = [];
        foreach (array_slice($person['known_for'] ?? [], 0, 3) as $k) {
            $title = $k['title'] ?? $k['name'] ?? null;
            if ($title) {
                $titles[] = $title;
            }
        }

        return $titles ? implode(' · ', $titles) : null;
    }

    /** სამი შესვლიდან ერთი მსახიობი (დუბლის აცილებით) */
    private function resolveMember(array $data, TmdbClient $tmdb, MediaDownloader $media): ?CastMember
    {
        if ($data['cast_member_id'] ?? null) {
            return CastMember::find($data['cast_member_id']);
        }

        $tmdbId = $data['tmdb_person_id'] ?? null;
        $name = trim((string) ($data['name'] ?? ''));
        $nameKa = trim((string) ($data['name_ka'] ?? ''));

        $existing = CastSync::resolve($tmdbId, ['en' => $name ?: null, 'ka' => $nameKa ?: null]);

        $person = [];
        if ($tmdbId && $tmdb->configured()) {
            try {
                $person = $tmdb->person($tmdbId);
            } catch (Throwable $e) {
                report($e);
            }
            $name = $name ?: (string) ($person['name'] ?? '');
        }

        if (! $existing && $name === '') {
            // ⚠️ სახელის გარეშე ლექსიკონში ცარიელი რიგი არ იქმნება
            return null;
        }

        $member = $existing ?: new CastMember;

        if (! $member->exists) {
            $member->name = $name;
        }
        if ($tmdbId && ! $member->tmdb_person_id) {
            $member->tmdb_person_id = $tmdbId;
        }
        if (! $member->gender) {
            $member->gender = (int) ($data['gender'] ?? $person['gender'] ?? 0) ?: null;
        }

        // ფოტო TMDB-დან — ⚠️ **გაზიარებული ფაილია და კვოტას არ ხარჯავს** (19.4/B)
        if ($tmdbId && ! $member->photo_path && ! empty($person['profile_path'])) {
            if ($photo = $media->profile($person['profile_path'], $tmdbId)) {
                $member->photo_path = $photo;
            }
        }

        $member->save();

        if ($nameKa) {
            $member->setTranslation('ka', $nameKa);
        }

        return $member;
    }

    /**
     * მიბმა/მოხსნა აუდიტში.
     *
     * ⚠️ **`castables` მოდელი არაა**, ე.ი. `AuditObserver` მას ვერ ხედავს —
     * ერთადერთი გზა ცხადი ჩაწერაა. ⚠️ სუბიექტი **ჩანაწერია და არა
     * მსახიობი**: „ვინ დაამატა ეს მსახიობი ამ ფილმს" ფილმის ისტორიის
     * ნაწილია, ლექსიკონი კი გლობალურია და მასზე „ვისი" კითხვა არ დგას.
     *
     * @param  array<string, mixed>  $context
     */
    private function logCast(Model $record, CastMember $member, string $action, array $context = []): void
    {
        $this->audit->log($action, [
            'module' => MediaDomain::typeOf($record),
            'subject_type' => $record->getMorphClass(),
            'subject_id' => $record->getKey(),
            'subject_label' => $record->title_en ?: $record->title_ka,
            'context' => [
                'cast_member_id' => $member->id,
                'cast_member' => $member->name,
                ...$context,
            ],
        ]);
    }
}
