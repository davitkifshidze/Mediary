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
use App\Services\Tmdb\TmdbClient;
use App\Support\Lang;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class CastController extends Controller
{
    /** ⚠️ მსახიობზე რამდენი საძიებო ტეგი შეიძლება (§7.5) — უსასრულო სია
        ძებნის შეკითხვას 255 სიმბოლოს ჭერს გადააცილებდა */
    private const MAX_TAGS = 20;

    /** მსახიობის გვერდი: ფილმები + სერიალები + ანიმეები (ჩემი კოლექცია + TMDB შემოთავაზება) */
    public function show(CastMember $castMember, TmdbClient $tmdb)
    {
        $movies = $castMember->movies()->with('genres')->orderByDesc('year')->get();
        $series = $castMember->series()->with('genres')->orderByDesc('year')->get();
        // §7.1 — მესამე მედია-დომენი; მსახიობი ერთია და სამივეს უკავშირდება
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
            /* §8.1 — მსახიობს ახლა **შიდა გვერდი** აქვს, ე.ი. პასუხს
               ბიოგრაფია, დაბადების თარიღი, IMDb-ის id და ოფიციალური ბმულები
               მოსდევს. ფორმა ერთია (`CastMember::toDetailArray()`) — გალერეის
               `castShow()`-იც იმავეს აბრუნებს. */
            'actor' => [
                ...$castMember->toDetailArray(),
                'photo' => $castMember->photo_path ? asset('storage/'.$castMember->photo_path) : null,
                /* §7.5 — საძიებო ტეგები **ჩემია და არა გლობალური**: `cast_members`
                   საერთო ლექსიკონია, ტეგები კი `cast_member_tags`-შია, user-ზე. */
                'tags' => CastMemberTag::forActor((int) auth()->id(), $castMember->id),
            ],
            'movies' => MovieListResource::collection($movies),
            'series' => SeriesListResource::collection($series),
            'animes' => AnimeListResource::collection($animes),
            /* ⚠️ **ანიმეს ცალკე შემოთავაზება განზრახ არ არსებობს** (§7.1):
               TMDB-ზე ანიმე ჩვეულებრივი `tv` ჩანაწერია, ე.ი. `personTvCredits`
               ერთსა და იმავე სიას აბრუნებდა და გვერდზე ორი იდენტური ბადე
               გაჩნდებოდა. „რა მაქვს" კი დომენებად გაყოფილია — `animes` ზემოთ. */
            'suggestions' => $suggestions,
            'series_suggestions' => $seriesSuggestions,
        ]);
    }

    /**
     * **მსახიობის მონაცემების განახლება TMDB-დან (Tasks §8.1).**
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
            return response()->json(['message' => 'TMDB_API_KEY არ არის კონფიგურირებული backend/.env-ში.'], 503);
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
     * მსახიობის საძიებო ტეგები (§7.5) — რითაც ვებში ფოტოები იძებნება.
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
