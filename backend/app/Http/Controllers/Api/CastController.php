<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AnimeListResource;
use App\Http\Resources\MovieListResource;
use App\Http\Resources\SeriesListResource;
use App\Models\CastMember;
use App\Models\CastMemberTag;
use App\Models\Genre;
use App\Models\Video;
use App\Services\Cast\CastEnricher;
use App\Services\Cast\CastResolver;
use App\Services\Storage\StorageMeter;
use App\Services\Tmdb\TmdbClient;
use App\Support\CastMemberTrash;
use App\Support\CastSync;
use App\Support\CredentialProviders;
use App\Support\Lang;
use App\Support\MissingCredential;
use App\Support\RecordLocks;
use App\Support\StorageFolder;
use App\Support\UploadLimits;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Throwable;

class CastController extends Controller
{
    /** ⚠️ მსახიობზე რამდენი საძიებო ტეგი შეიძლება — უსასრულო სია
        ძებნის შეკითხვას 255 სიმბოლოს ჭერს გადააცილებდა */
    private const MAX_TAGS = 20;

    /** მსახიობის გვერდი: ფილმები + სერიალები + ანიმეები (ჩემი კოლექცია + TMDB შემოთავაზება) */
    public function show(CastMember $castMember, TmdbClient $tmdb)
    {
        /* ჩემ მიერ ჩაკეტილი, ამ სესიაში დაუხსნელი: მხოლოდ სახელი და ბოქლომი.
           ⚠️ ფილმოგრაფია, ბიოგრაფია და TMDB-ის შემოთავაზებები საერთოდ არ გამოდის. */
        if (RecordLocks::hiddenRecord($castMember)) {
            return response()->json([
                'actor' => $castMember->lockedCard(),
                'movies' => [],
                'series' => [],
                'animes' => [],
                'suggestions' => [],
                'series_suggestions' => [],
            ]);
        }

        $movies = $castMember->movies()->with('genres')->orderByDesc('year')->get();
        $series = $castMember->series()->with('genres')->orderByDesc('year')->get();
        // მესამე მედია-დომენი; მსახიობი ერთია და სამივეს უკავშირდება
        $animes = $castMember->animes()->with('genres')->orderByDesc('year')->get();

        $suggestions = [];
        $seriesSuggestions = [];

        if ($castMember->tmdb_person_id && $tmdb->configured()) {
            $genreMap = Genre::whereNotNull('tmdb_id')->get()->keyBy('tmdb_id');

            // --- ფილმების შემოთავაზება ---
            try {
                // უკვე დამატებული → tmdb_id ⇒ ლოკალური id. სიიდან **არ** ვშლით —
                // დამატების შემდეგ ჩანაწერი უნდა დარჩეს და „დამატებულია"-დ მოინიშნოს
                $ownIds = $movies->whereNotNull('tmdb_id')->pluck('id', 'tmdb_id');
                $cast = $tmdb->personCredits($castMember->tmdb_person_id)['cast'] ?? [];
                usort($cast, fn ($a, $b) => ($b['popularity'] ?? 0) <=> ($a['popularity'] ?? 0));
                $kaTitles = $this->localizedTitles(
                    fn () => $tmdb->personCredits($castMember->tmdb_person_id, 'ka')['cast'] ?? [],
                    'title',
                );

                // TMDB თითო როლზე აბრუნებს ჩანაწერს — ერთი და იგივე ტაიტლი მეორდება;
                // ვტოვებთ პირველს (სია პოპულარობით არის დალაგებული)
                $seen = [];

                foreach ($cast as $c) {
                    if (empty($c['poster_path']) || isset($seen[$c['id']])) {
                        continue;
                    }
                    $seen[$c['id']] = true;
                    $oid = $ownIds[$c['id']] ?? null;
                    $suggestions[] = [
                        'tmdb_id' => $c['id'],
                        'title' => $c['title'] ?? ($c['original_title'] ?? ''),
                        'title_ka' => Lang::georgian($kaTitles[$c['id']] ?? null),
                        'year' => ! empty($c['release_date']) ? (int) substr($c['release_date'], 0, 4) : null,
                        'rating' => isset($c['vote_average']) ? round((float) $c['vote_average'], 1) : null,
                        'poster' => 'https://image.tmdb.org/t/p/w342'.$c['poster_path'],
                        'overview' => $c['overview'] ?? null,
                        'genres' => $this->mapGenres($c['genre_ids'] ?? [], $genreMap),
                        'owned' => $oid !== null,
                        'movie_id' => $oid,
                    ];
                }
            } catch (Throwable $e) {
                $suggestions = [];
            }

            // --- სერიალების შემოთავაზება ---
            try {
                $ownSeriesIds = $series->whereNotNull('tmdb_id')->pluck('id', 'tmdb_id');
                $tvCast = $tmdb->personTvCredits($castMember->tmdb_person_id)['cast'] ?? [];
                usort($tvCast, fn ($a, $b) => ($b['popularity'] ?? 0) <=> ($a['popularity'] ?? 0));
                $kaNames = $this->localizedTitles(
                    fn () => $tmdb->personTvCredits($castMember->tmdb_person_id, 'ka')['cast'] ?? [],
                    'name',
                );

                // სერიალებში დუბლიკატი განსაკუთრებით ხშირია (თითო სეზონი/როლი ცალკე ჩანაწერია)
                $seenSeries = [];

                foreach ($tvCast as $c) {
                    if (empty($c['poster_path']) || isset($seenSeries[$c['id']])) {
                        continue;
                    }
                    $seenSeries[$c['id']] = true;
                    $oid = $ownSeriesIds[$c['id']] ?? null;
                    $seriesSuggestions[] = [
                        'tmdb_id' => $c['id'],
                        'title' => $c['name'] ?? ($c['original_name'] ?? ''),
                        'title_ka' => Lang::georgian($kaNames[$c['id']] ?? null),
                        'year' => ! empty($c['first_air_date']) ? (int) substr($c['first_air_date'], 0, 4) : null,
                        'rating' => isset($c['vote_average']) ? round((float) $c['vote_average'], 1) : null,
                        'poster' => 'https://image.tmdb.org/t/p/w342'.$c['poster_path'],
                        'overview' => $c['overview'] ?? null,
                        'genres' => $this->mapGenres($c['genre_ids'] ?? [], $genreMap),
                        'owned' => $oid !== null,
                        'movie_id' => $oid,
                    ];
                }
            } catch (Throwable $e) {
                $seriesSuggestions = [];
            }
        }

        return response()->json([
            /* მსახიობს ახლა **შიდა გვერდი** აქვს, ე.ი. პასუხს
               ბიოგრაფია, დაბადების თარიღი, IMDb-ის id და ოფიციალური ბმულები
               მოსდევს. ფორმა ერთია (`CastMember::toDetailArray()`) — გალერეის
               `castShow()`-იც იმავეს აბრუნებს. */
            'actor' => $this->actorPayload($castMember),
            'movies' => MovieListResource::collection($movies),
            'series' => SeriesListResource::collection($series),
            'animes' => AnimeListResource::collection($animes),
            /* ⚠️ **ანიმეს ცალკე შემოთავაზება განზრახ არ არსებობს**:
               TMDB-ზე ანიმე ჩვეულებრივი `tv` ჩანაწერია, ე.ი. `personTvCredits`
               ერთსა და იმავე სიას აბრუნებდა და გვერდზე ორი იდენტური ბადე
               გაჩნდებოდა. „რა მაქვს" კი დომენებად გაყოფილია — `animes` ზემოთ. */
            'suggestions' => $suggestions,
            'series_suggestions' => $seriesSuggestions,
        ]);
    }

    /**
     * **ახალი მსახიობი `/actors`-იდან.**
     *
     * ორი გზა: TMDB-ის პირი (`tmdb_person_id` — საერთო ლექსიკონი, ფოტო TMDB-დან,
     * კვოტის გარეშე) ან სრულიად ხელით (სახელი, დეტალები, ატვირთული ფოტო
     * **შენი კვოტით**, `cast/uploads/{id}`-ში) — ⚠️ ხელით შექმნილი მხოლოდ შენ
     * გიჩანს (`created_by`).
     *
     * ⚠️ **დუბლი არ იქმნება** (`CastResolver`-ის წესი): იგივე TMDB-ის პირი ან
     * იგივე სახელი ლექსიკონში უკვე თუ არის, ის ბრუნდება `existing: true`-ით —
     * გვერდი მასზე გადადის და არა ახალ ასლზე.
     */
    public function store(Request $request, CastResolver $resolver, StorageMeter $meter): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'tmdb_person_id' => ['nullable', 'integer', 'min:1'],
            'name' => ['required_without:tmdb_person_id', 'nullable', 'string', 'max:200'],
            'name_ka' => ['nullable', 'string', 'max:200'],
            ...$this->detailRules($request),
        ]);

        $tmdbId = $data['tmdb_person_id'] ?? null;
        $names = ['en' => trim((string) ($data['name'] ?? '')) ?: null, 'ka' => trim((string) ($data['name_ka'] ?? '')) ?: null];

        if ($found = CastSync::resolve($tmdbId, $names)) {
            return response()->json(['actor' => $this->actorPayload($found), 'existing' => true]);
        }

        if ($tmdbId) {
            $member = $resolver->resolve(['tmdb_person_id' => $tmdbId, 'name' => $names['en'], 'name_ka' => $names['ka']]);
            abort_unless($member !== null, 404, 'cast_member_not_found');

            return response()->json(['actor' => $this->actorPayload($member), 'existing' => false], 201);
        }

        $member = CastMember::create([
            'name' => $names['en'] ?? $names['ka'],
            'created_by' => $user->id,
            ...$this->details($data),
        ]);
        $member->setTranslation('ka', $names['ka']);

        if ($file = $request->file('photo')) {
            $member->update(['photo_path' => $meter->storeUpload($user, $file, StorageFolder::CAST_UPLOADS.'/'.$member->id)]);
        }

        return response()->json(['actor' => $this->actorPayload($member->refresh()), 'existing' => false], 201);
    }

    /**
     * **ხელით შექმნილის რედაქტირება** — `POST` + `_method=PUT` (ფოტოს გამო multipart).
     *
     * ⚠️ **მხოლოდ შემქმნელს და მხოლოდ კერძოზე** (`isEditableBy()`): TMDB-ის
     * მსახიობი ფაქტია და ყველასია — მისი სახელი ან ბიოგრაფია ერთი ანგარიშის
     * ხელით არ იცვლება (მასზე ჩემი მხოლოდ ტეგები და ფოტოებია). სხვისი კერძო
     * `creator` scope-ით ისედაც 404-ია.
     */
    public function update(Request $request, CastMember $castMember, StorageMeter $meter): JsonResponse
    {
        $user = $request->user();
        abort_unless($castMember->isEditableBy((int) $user->id), 403, 'cast_member_readonly');

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:200'],
            'name_ka' => ['sometimes', 'nullable', 'string', 'max:200'],
            'remove_photo' => ['nullable', 'boolean'],
            ...$this->detailRules($request),
        ]);

        $changes = $this->details($data);
        if (array_key_exists('name', $data)) {
            $changes['name'] = trim($data['name']);
        }

        $old = $castMember->photo_path;
        $file = $request->file('photo');
        $dropOld = $file !== null || $request->boolean('remove_photo');

        if ($file) {
            $changes['photo_path'] = $meter->storeUpload($user, $file, StorageFolder::CAST_UPLOADS.'/'.$castMember->id);
        } elseif ($dropOld) {
            $changes['photo_path'] = null;
        }

        $castMember->update($changes);

        // ⚠️ ძველი ატვირთვა მხოლოდ შენახვის შემდეგ იშლება და მხოლოდ საკუთარი (კვოტიდანაც)
        if ($dropOld && $old && str_starts_with($old, StorageFolder::CAST_UPLOADS.'/')) {
            $meter->deleteUpload($castMember->created_by, $old);
        }

        if (array_key_exists('name_ka', $data)) {
            $nameKa = trim((string) $data['name_ka']);
            $nameKa !== ''
                ? $castMember->setTranslation('ka', $nameKa)
                : $castMember->translations()->where('locale', 'ka')->delete();
        }

        return response()->json(['actor' => $this->actorPayload($castMember->refresh())]);
    }

    /**
     * **ხელით შექმნილი მსახიობის წაშლა — ურნაში.**
     *
     * მსახიობი, მისი ბმულები ჩანაწერებზე და ჩემი ფოტოები ერთ ელემენტად გადადის
     * ურნაში და ერთად ბრუნდება (`CastMemberTrash`); ვადის ბოლოს — სამუდამოდ.
     *
     * ⚠️ **მხოლოდ შემქმნელს და მხოლოდ კერძოზე** (`isEditableBy()`, `update()`-ის
     * წესი): TMDB-ის მსახიობი ყველასია — მისგან მხოლოდ „ჩემი ჩანაწერებიდან"
     * მოხსნა შეიძლება (`ActorController::detachEverywhere()`). სხვისი კერძო
     * `creator` scope-ით ისედაც 404-ია, დამალული (ჩაკეტილი) — 423.
     */
    public function destroy(Request $request, CastMember $castMember): JsonResponse
    {
        $user = $request->user();
        abort_unless($castMember->isEditableBy((int) $user->id), 403, 'cast_member_readonly');
        RecordLocks::ensureOpen($castMember);

        $entry = CastMemberTrash::trash($user, $castMember);

        return response()->json([
            'trashed' => true,
            'trash_id' => $entry->id,
            'links' => CastMemberTrash::count($entry),
            'photos' => count((array) ($entry->payload['image_ids'] ?? [])),
        ]);
    }

    /**
     * **მსახიობის მონაცემების განახლება TMDB-დან.**
     *
     * ავსებს ბიოგრაფიას, დაბადების თარიღს, დაბადების ადგილს, IMDb-ის id-სა
     * და ოფიციალურ ბმულებს — ე.ი. სწორედ იმას, რაც „მსახიობის შიდა გვერდს"
     * გვერდად აქცევს.
     *
     * ⚠️ **ცხადი ღილაკია და არა ავტომატური შევსება ყოველ გახსნაზე** —
     * TMDB-ის ლიმიტი საერთოა, მსახიობის გვერდი კი ხშირად იხსნება.
     *
     * ⚠️ **`resync` და არა `sync`**: `EnsureModulePermission::UPDATE_ENDPOINTS`
     * სწორედ `resync`-ს იცნობს, ე.ი. თუ ეს მარშრუტი ოდესმე მოდულის ჯგუფში
     * გადავა, POST-იდან `create` არ გამოვა და update-ის უფლებით
     * მომხმარებელი 403-ს არ მიიღებს (არსებული ხაფანგი).
     *
     * ⚠️ **წყაროს ჩავარდნა შეცდომა არ არის** — 200 ბრუნდება `updated: false`-ით
     * (`bgg_unavailable`-ის წესი: „ვერ ვიპოვე" და „წყარო არ პასუხობს" სხვადასხვა
     * ფაქტია, მაგრამ არცერთი არ უნდა ტეხდეს გვერდს).
     */
    public function resync(CastMember $castMember, CastEnricher $enricher): JsonResponse
    {
        if (! $enricher->configured()) {
            return MissingCredential::response(CredentialProviders::TMDB);
        }

        if (! $castMember->tmdb_person_id) {
            return response()->json(['message' => 'no_tmdb_id'], 422);
        }

        $updated = $enricher->sync($castMember);

        return response()->json([
            'updated' => $updated,
            'actor' => $castMember->refresh()->toDetailArray(),
        ]);
    }

    /**
     * მსახიობის საძიებო ტეგები — რითაც ვებში ფოტოები იძებნება.
     *
     * ⚠️ **`PUT`-ია და არა `POST`:** ეს მთელი ნაკრების ჩანაცვლებაა (ერთი
     * წყვილი = ერთი რიგი), თანაც `EnsureModulePermission` POST-იდან `create`-ს
     * გამოიყვანდა და update-ის უფლებით მომხმარებელი 403-ს მიიღებდა.
     *
     * ⚠️ **ცარიელი სია რიგს შლის** — „ტეგები არ მაქვს" და „ცარიელი ნაკრები
     * მაქვს" ერთი და იგივეა (იგივე წესი, რაც მორგებულ ველს აქვს).
     */
    public function updateTags(Request $request, CastMember $castMember): JsonResponse
    {
        $data = $request->validate([
            'tags' => ['present', 'array', 'max:'.self::MAX_TAGS],
            'tags.*' => ['string', 'max:60'],
        ]);

        // ⚠️ დუბლი ერთი და იმავე წესით იჭრება, რითაც ყველა სხვა მოდულის ტეგი
        $tags = Video::normalizeTags($data['tags']);
        $userId = (int) $request->user()->id;

        if (! $tags) {
            CastMemberTag::withoutGlobalScope('owner')
                ->where('user_id', $userId)
                ->where('cast_member_id', $castMember->id)
                ->delete();

            return response()->json(['tags' => []]);
        }

        CastMemberTag::withoutGlobalScope('owner')->updateOrCreate(
            ['user_id' => $userId, 'cast_member_id' => $castMember->id],
            ['tags' => $tags],
        );

        return response()->json(['tags' => $tags]);
    }

    /**
     * მსახიობის გვერდის ფორმა — ⚠️ ერთი ადგილი (`show`, `store`, `update`):
     * ორი ასლი ერთ დღეს სხვადასხვა ველს დაწერდა.
     *
     * @return array<string, mixed>
     */
    private function actorPayload(CastMember $member): array
    {
        return [
            ...$member->toDetailArray(),
            'photo' => $member->photo_path ? asset('storage/'.$member->photo_path) : null,
            /* საძიებო ტეგები **ჩემია და არა გლობალური**: `cast_members`
               საერთო ლექსიკონია, ტეგები კი `cast_member_tags`-შია, user-ზე. */
            'tags' => CastMemberTag::forActor((int) auth()->id(), $member->id),
        ];
    }

    /** @return array<string, mixed> ხელით შექმნილის დეტალების წესები */
    private function detailRules(Request $request): array
    {
        return [
            'gender' => ['nullable', Rule::in([CastMember::GENDER_FEMALE, CastMember::GENDER_MALE])],
            'birthday' => ['nullable', 'date_format:Y-m-d'],
            'deathday' => ['nullable', 'date_format:Y-m-d'],
            'place_of_birth' => ['nullable', 'string', 'max:200'],
            'biography' => ['nullable', 'string', 'max:10000'],
            'photo' => ['nullable', ...UploadLimits::rule('primary', $request->user())],
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function details(array $data): array
    {
        $out = [];

        foreach (['gender', 'birthday', 'deathday', 'place_of_birth', 'biography'] as $field) {
            if (array_key_exists($field, $data)) {
                $value = is_string($data[$field]) ? trim($data[$field]) : $data[$field];
                $out[$field] = $value === '' ? null : $value;
            }
        }

        return $out;
    }

    /**
     * TMDB-ის ლოკალიზებული (ka) სახელები: tmdb_id ⇒ სახელი.
     * არასავალდებულოა — ჩავარდნაზე ცარიელი მასივი ბრუნდება და მხოლოდ ინგლისური რჩება.
     * Translator-ს (EN→KA) აქ აღარ ვიყენებთ — იხ. DiscoverController-ის კომენტარი.
     */
    private function localizedTitles(callable $fetch, string $key): array
    {
        try {
            $out = [];
            foreach ($fetch() as $c) {
                $out[$c['id']] = $c[$key] ?? null;
            }

            return $out;
        } catch (Throwable $e) {
            return [];
        }
    }

    /** TMDB genre_ids → ლოკალური ჟანრების ორენოვანი სახელები */
    private function mapGenres(array $ids, $genreMap): array
    {
        $out = [];
        foreach ($ids as $gid) {
            if ($g = $genreMap->get($gid)) {
                $out[] = ['name_en' => $g->name_en, 'name_ka' => $g->name_ka];
            }
        }

        return $out;
    }
}
