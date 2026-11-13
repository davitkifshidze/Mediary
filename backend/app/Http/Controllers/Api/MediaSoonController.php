<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\StatusResource;
use App\Models\Genre;
use App\Services\Tmdb\TmdbClient;
use App\Support\AppTime;
use App\Support\CredentialProviders;
use App\Support\Lang;
use App\Support\MediaDomain;
use App\Support\MissingCredential;
use App\Support\SourceLog;
use App\Support\Trailer;
use App\Support\Upcoming;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * **„მალე"** — გამოუსვლელი სათაურები ფილმში, სერიალსა და ანიმეში.
 *
 * ორი სია, ორი კარი:
 *  · `index()` — **ჩემი** დამატებული სათაურები, რომელთა გამოსვლა წინ არის (ფილმის
 *    პრემიერა; სერიალის / ანიმეს პირველი ეთერი ან შემდეგი სეზონი / სერია);
 *  · `tmdb()` — TMDB-ზე გამოცხადებული, ჯერ გამოუსვლელი სათაურები თრეილერით; „დამატება"
 *    არსებული `POST /{module}/from-tmdb`-ია.
 *
 * ⚠️ დომენი მარშრუტის ნაგულისხმევი პარამეტრია (`->defaults('domain', …)`): სამი
 * მოდული, ერთი კოდი.
 *
 * ⚠️ ჩაკეტილი ჩანაწერი „მალეში" არ ჩანს — არც სესიაში გახსნილი (`withoutLocked()`):
 * სია სათაურსა და თარიღს აჩვენებს, ეს კი შიგთავსია.
 */
class MediaSoonController extends Controller
{
    /** ჩემი „მალე" სია ერთი პასუხია — ათეულობით სათაურია და არა ბიბლიოთეკა */
    private const LIMIT = 300;

    private const CACHE_TTL_HOURS = 6;

    /** TMDB-ის მყარი ლიმიტი — `page` > 500 შეცდომას აბრუნებს */
    private const TMDB_MAX_PAGE = 500;

    private const ANIMATION = 16;

    public function index(Request $request, string $domain)
    {
        $tv = MediaDomain::isTv($domain);
        $today = AppTime::now();

        $records = Upcoming::scope(MediaDomain::query($domain)->withoutLocked(), $tv, $today)
            ->limit(self::LIMIT)
            ->get();

        $rows = $records
            ->map(fn (Model $record) => $this->row($record, $tv, $today))
            /* ჯერ თარიღიანები, ახლოდან შორისკენ; უთარიღო (მხოლოდ გამოცხადებული) ბოლოში.
               ⚠️ PHP-ში და არა SQL-ში: თარიღი ორი სვეტიდან ერთ-ერთია (პრემიერა ან შემდეგი სერია). */
            ->sortBy([
                fn (array $a, array $b) => ($a['date'] === null) <=> ($b['date'] === null),
                fn (array $a, array $b) => strcmp((string) $a['date'], (string) $b['date']),
                fn (array $a, array $b) => $a['id'] <=> $b['id'],
            ])
            ->values();

        return response()->json(['data' => $rows]);
    }

    /** @return array<string, mixed> */
    private function row(Model $record, bool $tv, CarbonInterface $today): array
    {
        return [
            'id' => $record->id,
            'title_ka' => $record->title_ka,
            'title_en' => $record->title_en,
            'year' => $record->year,
            'poster' => $record->poster_path ? asset('storage/'.$record->poster_path) : null,
            ...Upcoming::facts($record, $tv, $today),
            'tmdb_status' => $record->tmdb_status,
            'trailer' => Trailer::forPlayer($record->trailer_url),
            'status' => StatusResource::brief($record->status),
            'is_favorite' => (bool) $record->is_favorite,
        ];
    }

    /**
     * **„TMDB-ზე მალე"** — გამოცხადებული, ჯერ გამოუსვლელი სათაურები (ხვალიდან), პოპულარობით.
     *
     * ⚠️ თრეილერი თითო სათაურზე ცალკე მოთხოვნაა (`/videos`), ამიტომ გვერდი ქეშირდება —
     * დღეში რამდენჯერმე გახსნილი ჩანართი TMDB-ს ყოველ ჯერზე 21 მოთხოვნას არ უგზავნის.
     * `owned` ქეშის გარეთაა: ის ჩემი ბიბლიოთეკაა და ყოველ ჯერზე ახლიდან ითვლება.
     */
    public function tmdb(Request $request, TmdbClient $tmdb)
    {
        if (! $tmdb->configured()) {
            return MissingCredential::response(CredentialProviders::TMDB);
        }

        $data = $request->validate([
            'type' => ['required', MediaDomain::rule()],
            'page' => ['nullable', 'integer', 'min:1', 'max:'.self::TMDB_MAX_PAGE],
        ]);

        $type = $data['type'];
        $page = (int) ($data['page'] ?? 1);
        // ხვალიდან — დღეს გამოსული უკვე „გამოვიდა"
        $from = AppTime::now()->addDay()->format('Y-m-d');

        try {
            $payload = Cache::remember(
                "soon:tmdb:{$type}:{$from}:{$page}",
                now()->addHours(self::CACHE_TTL_HOURS),
                fn () => $this->fetch($tmdb, $type, $from, $page),
            );
        } catch (Throwable $e) {
            // გამონაკლისის ტექსტი კლიენტს არ მიდის: Guzzle მას სრულ URL-ს (`?api_key=…`) უწერს
            SourceLog::threw('tmdb', $e);

            return response()->json(['message' => 'tmdb_error'], 502);
        }

        $owned = MediaDomain::query($type)->whereNotNull('tmdb_id')->pluck('id', 'tmdb_id');

        return response()->json([
            'page' => $payload['page'],
            'total_pages' => $payload['total_pages'],
            'results' => array_map(function (array $row) use ($owned) {
                $id = $owned[$row['tmdb_id']] ?? null;

                return [...$row, 'owned' => $id !== null, 'record_id' => $id];
            }, $payload['results']),
        ]);
    }

    /** @return array{page: int, total_pages: int, results: list<array<string, mixed>>} */
    private function fetch(TmdbClient $tmdb, string $type, string $from, int $page): array
    {
        $tv = MediaDomain::isTv($type);
        $params = [
            'page' => $page,
            'sort_by' => 'popularity.desc',
            'language' => 'en-US',
            ($tv ? 'first_air_date.gte' : 'primary_release_date.gte') => $from,
            /* ანიმე TMDB-ის `/tv`-ზე იაპონური ანიმაციაა (`MediaTypeHint`-ის იგივე წესი);
               სერიალების ჩანართში ის არ ჩანს — თორემ ერთი სათაური ორ მოდულს შესთავაზებდა თავს */
            ...match ($type) {
                'anime' => ['with_genres' => self::ANIMATION, 'with_origin_country' => 'JP'],
                'series' => ['without_genres' => self::ANIMATION],
                default => [],
            },
        ];

        $res = $tv ? $tmdb->discoverTv($params) : $tmdb->discover($params);

        // ქართული სახელები — იმავე გვერდის ლოკალიზებული პასუხიდან; არ მოვიდა — ინგლისურით ვაგრძელებთ
        $ka = [];
        try {
            $localized = $tv ? $tmdb->discoverTv([...$params, 'language' => 'ka']) : $tmdb->discover([...$params, 'language' => 'ka']);
            foreach ($localized['results'] ?? [] as $r) {
                $ka[$r['id']] = $tv ? ($r['name'] ?? null) : ($r['title'] ?? null);
            }
        } catch (Throwable) {
            $ka = [];
        }

        $genres = Genre::whereNotNull('tmdb_id')->get()->keyBy('tmdb_id');
        $out = [];

        foreach ($res['results'] ?? [] as $r) {
            if (empty($r['poster_path'])) {
                continue;
            }

            $date = (string) ($tv ? ($r['first_air_date'] ?? '') : ($r['release_date'] ?? ''));

            $out[] = [
                'tmdb_id' => (int) $r['id'],
                'title' => $tv ? ($r['name'] ?? ($r['original_name'] ?? '')) : ($r['title'] ?? ($r['original_title'] ?? '')),
                'title_ka' => Lang::georgian($ka[$r['id']] ?? null),
                'date' => $date !== '' ? $date : null,
                'poster' => 'https://image.tmdb.org/t/p/w342'.$r['poster_path'],
                'overview' => $r['overview'] ?? null,
                'genres' => collect($r['genre_ids'] ?? [])
                    ->map(fn ($id) => $genres->get($id))
                    ->filter()
                    ->map(fn (Genre $g) => ['name_en' => $g->name_en, 'name_ka' => $g->name_ka])
                    ->values()
                    ->all(),
                'trailer' => Trailer::forPlayer($this->tmdbTrailer($tmdb, (int) $r['id'], $tv)),
            ];
        }

        return [
            'page' => $page,
            'total_pages' => max(1, min((int) ($res['total_pages'] ?? 1), self::TMDB_MAX_PAGE)),
            'results' => $out,
        ];
    }

    /** ოფიციალური თრეილერი; ჩავარდნა ჩუმია — თრეილერის არქონა სიას არ უნდა აჩერებდეს */
    private function tmdbTrailer(TmdbClient $tmdb, int $id, bool $tv): ?string
    {
        try {
            // ერთი მოთხოვნა სამივე ენაზე — სიაში ოცი სათაურია
            return Trailer::pick($tv ? $tmdb->tvVideos($id, 'ka,en,null') : $tmdb->videos($id, 'ka,en,null'));
        } catch (Throwable) {
            return null;
        }
    }
}
