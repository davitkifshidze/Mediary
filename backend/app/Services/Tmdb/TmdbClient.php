<?php

namespace App\Services\Tmdb;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class TmdbClient
{
    private string $base = 'https://api.themoviedb.org/3';

    private ?string $key;

    public function __construct(?string $key = null)
    {
        $this->key = $key ?: config('services.tmdb.key');
    }

    public function configured(): bool
    {
        return filled($this->key);
    }

    private function get(string $path, array $query = []): array
    {
        if (! $this->configured()) {
            throw new RuntimeException('TMDB_API_KEY არ არის კონფიგურირებული backend/.env-ში.');
        }

        $res = Http::baseUrl($this->base)
            ->timeout(15)
            ->withOptions(['verify' => storage_path('cacert.pem')])
            ->get($path, array_merge(['api_key' => $this->key], $query));

        if ($res->status() === 429) {
            sleep(1);

            return $this->get($path, $query);
        }

        $res->throw();

        return $res->json();
    }

    /** IMDb ID-ით TMDB movie id (ან null) */
    public function findByImdb(string $imdb): ?int
    {
        $d = $this->get("/find/{$imdb}", ['external_source' => 'imdb_id']);

        return $d['movie_results'][0]['id'] ?? null;
    }

    /** სახელით (+წლით) TMDB movie id */
    public function search(string $query, ?int $year = null): ?int
    {
        $d = $this->get('/search/movie', array_filter(['query' => $query, 'year' => $year]));

        if (empty($d['results'])) {
            return null;
        }

        if ($year) {
            foreach ($d['results'] as $r) {
                if (str_starts_with($r['release_date'] ?? '', (string) $year)) {
                    return $r['id'];
                }
            }
        }

        return $d['results'][0]['id'];
    }

    /** სახელით ძებნა — ყველა შედეგი (კანდიდატებისთვის) */
    public function searchAll(string $query, ?int $year = null): array
    {
        $d = $this->get('/search/movie', array_filter(['query' => $query, 'year' => $year]));

        return $d['results'] ?? [];
    }

    /** სახელით ძებნა — გვერდებით (discover-ის name-search რეჟიმისთვის) */
    public function searchMoviesPaged(string $query, int $page = 1, ?int $year = null, string $language = 'en-US'): array
    {
        return $this->get('/search/movie', array_filter([
            'query' => $query,
            'year' => $year,
            'page' => $page,
            'include_adult' => 'false',
            'language' => $language,
        ]));
    }

    public function details(int $id, string $language = 'en-US'): array
    {
        return $this->get("/movie/{$id}", ['language' => $language]);
    }

    public function credits(int $id): array
    {
        return $this->get("/movie/{$id}/credits");
    }

    /**
     * ჟანრების ოფიციალური სია მოცემულ ენაზე (Tasks 7).
     *
     * ქართული ჟანრის სახელი TMDB-ს **უკვე აქვს** — ე.ი. მისი თარგმნა Gemini-თ
     * არც საჭიროა და არც სასურველი: აქედან წამოღებული სახელი ავტორიტეტულია
     * და უფასო. ჟანრებს `tmdb_id`-ით ვამთხვევთ (slug ლათინურია, ka-ზე არ დაჯდება).
     *
     * @return array<int, string> tmdb_id => სახელი
     */
    public function genreList(string $language = 'en-US', bool $tv = false): array
    {
        $path = $tv ? '/genre/tv/list' : '/genre/movie/list';
        $out = [];
        foreach ($this->get($path, ['language' => $language])['genres'] ?? [] as $g) {
            if (isset($g['id'], $g['name'])) {
                $out[(int) $g['id']] = (string) $g['name'];
            }
        }

        return $out;
    }

    /**
     * ფილმის ვიდეოები — ტრეილერისთვის (Tasks 9).
     *
     * ⚠️ `language=` აქ **არ** გამოგვადგა: TMDB ვიდეოს ზუსტი ლოკალით ჭრის და
     * `en-US`-ზე ბევრი ჩანაწერი ცარიელს აბრუნებდა (ვიდეო `en`-ითაა ან
     * ლოკალის გარეშე). `include_video_language`-ს კი სია ეძლევა — `null`
     * სწორედ „ლოკალის გარეშე" ვიდეოებს ნიშნავს.
     */
    public function videos(int $id, string $videoLanguages = 'en,null'): array
    {
        return $this->get("/movie/{$id}/videos", ['include_video_language' => $videoLanguages]);
    }

    /**
     * ფილმის სურათები — გალერეისთვის (Tasks 10): `backdrops`, `posters`, `logos`.
     *
     * ⚠️ `include_image_language`-ის გარეშე TMDB **მხოლოდ** მიმდინარე ლოკალის
     * სურათებს აბრუნებს და ბევრ ჩანაწერზე სია ცარიელია. `null` = ტექსტის
     * გარეშე გადაღებული კადრი, რაც ზუსტად „ოფიციალური კადრებია".
     */
    public function images(int $id, string $imageLanguages = 'en,null'): array
    {
        return $this->get("/movie/{$id}/images", ['include_image_language' => $imageLanguages]);
    }

    /**
     * **პიროვნების ძებნა სახელით (ეტაპი 1, 2026-09-13).**
     *
     * ამაზე დგას „დაამატე მსახიობი, რომელიც TMDB-ს არ დაუდვია ამ
     * ფილმზე": ადამიანი იძებნება სახელით და არა კონკრეტული ფილმიდან.
     *
     * ⚠️ **ეს ძებნა მხოლოდ ლათინურია** — ქართულ სახელზე TMDB 0
     * შედეგს აბრუნებს (იგივე შეზღუდვა, რაც ფილმის ძებნას აქვს), ამიტომ
     * არსებობს მესამე გზა — ხელით შეტანა (`tmdb_person_id = null`).
     */
    public function searchPerson(string $query, int $page = 1): array
    {
        return $this->get('/search/person', [
            'query' => $query,
            'page' => $page,
            'include_adult' => 'false',
        ]);
    }

    /** მსახიობის/პირის ფოტოები — გალერეის „მსახიობები" ნაწილი (Tasks 10) */
    public function personImages(int $personId): array
    {
        return $this->get("/person/{$personId}/images");
    }

    /**
     * **პიროვნების მონაცემები + გარე id-ები (Tasks §8.1).**
     *
     * ⚠️ **ერთი გამოძახება და არა ორი**: `external_ids` `append_to_response`-ით
     * მოდის, ე.ი. IMDb-ის `nm…`, Instagram-ი და Wikidata იმავე პასუხშია.
     * სწორედ ეს ქმნის „ოფიციალურ საიტებზე" გასვლას მსახიობის გვერდიდან.
     */
    public function person(int $personId, string $language = 'en-US'): array
    {
        return $this->get("/person/{$personId}", [
            'language' => $language,
            'append_to_response' => 'external_ids',
        ]);
    }

    /**
     * **პიროვნებაზე „მონიშნული" სურათები (Tasks §8.1)** —
     * იმ ფილმების/სერიალების კადრები და პოსტერები, სადაც ეს მსახიობია.
     *
     * ⚠️ **ეს არის პასუხი იმაზე, რომ „TMDB-ზე მსახიობს სამი ფოტო აქვს".**
     * `/person/{id}/images` მხოლოდ პორტრეტებია (`profiles`, ხშირად 3–5 ცალი),
     * `tagged_images` კი ათეულობით — ოღონდ სხვა ფორმით: თითო რიგს აქვს
     * `image_type` (`poster|backdrop|still`) და `media` (რომელი ფილმიდანაა).
     *
     * ⚠️ **გვერდიანია** (20 ცალი გვერდზე) — `profiles`-ისგან განსხვავებით,
     * რომელიც ერთ სიას აბრუნებს. ამიტომ გამომძახებელი გვერდს ცხადად ითხოვს.
     */
    public function personTaggedImages(int $personId, int $page = 1): array
    {
        return $this->get("/person/{$personId}/tagged_images", ['page' => $page]);
    }

    /** მსახიობის ფილმოგრაფია (`language` — ლოკალიზებული სახელებისთვის, მაგ. 'ka') */
    public function personCredits(int $personId, string $language = 'en-US'): array
    {
        return $this->get("/person/{$personId}/movie_credits", ['language' => $language]);
    }

    /** ფრანჩაიზის (კოლექციის) ნაწილები */
    public function collection(int $id): array
    {
        return $this->get("/collection/{$id}", ['language' => 'en-US']);
    }

    /** ფილმების აღმოჩენა ფილტრებით */
    public function discover(array $params): array
    {
        return $this->get('/discover/movie', array_merge(
            ['language' => 'en-US', 'include_adult' => 'false'],
            $params,
        ));
    }

    /* ---------- სერიალები (TV) ---------- */

    /** IMDb ID-ით TMDB tv id (ან null) */
    public function findTvByImdb(string $imdb): ?int
    {
        $d = $this->get("/find/{$imdb}", ['external_source' => 'imdb_id']);

        return $d['tv_results'][0]['id'] ?? null;
    }

    /** სახელით (+წლით) TMDB tv id */
    public function searchTv(string $query, ?int $year = null): ?int
    {
        $d = $this->get('/search/tv', array_filter(['query' => $query, 'first_air_date_year' => $year]));

        if (empty($d['results'])) {
            return null;
        }

        if ($year) {
            foreach ($d['results'] as $r) {
                if (str_starts_with($r['first_air_date'] ?? '', (string) $year)) {
                    return $r['id'];
                }
            }
        }

        return $d['results'][0]['id'];
    }

    /** სახელით ძებნა — ყველა შედეგი (კანდიდატებისთვის) */
    public function searchAllTv(string $query, ?int $year = null): array
    {
        $d = $this->get('/search/tv', array_filter(['query' => $query, 'first_air_date_year' => $year]));

        return $d['results'] ?? [];
    }

    /** სახელით ძებნა — გვერდებით (discover-ის name-search რეჟიმისთვის) */
    public function searchTvPaged(string $query, int $page = 1, ?int $year = null, string $language = 'en-US'): array
    {
        return $this->get('/search/tv', array_filter([
            'query' => $query,
            'first_air_date_year' => $year,
            'page' => $page,
            'include_adult' => 'false',
            'language' => $language,
        ]));
    }

    /** სერიალის დეტალები (imdb_id external_ids-ში მოდის) */
    public function tvDetails(int $id, string $language = 'en-US'): array
    {
        return $this->get("/tv/{$id}", ['language' => $language, 'append_to_response' => 'external_ids']);
    }

    public function tvCredits(int $id): array
    {
        return $this->get("/tv/{$id}/credits");
    }

    /** სერიალის ვიდეოები — ტრეილერისთვის (Tasks 9). იხ. `videos()`-ის შენიშვნა. */
    public function tvVideos(int $id, string $videoLanguages = 'en,null'): array
    {
        return $this->get("/tv/{$id}/videos", ['include_video_language' => $videoLanguages]);
    }

    /** სერიალის სურათები — გალერეისთვის (Tasks 10). იხ. `images()`-ის შენიშვნა. */
    public function tvImages(int $id, string $imageLanguages = 'en,null'): array
    {
        return $this->get("/tv/{$id}/images", ['include_image_language' => $imageLanguages]);
    }

    /** მსახიობის სერიალოგრაფია (`language` — ლოკალიზებული სახელებისთვის, მაგ. 'ka') */
    public function personTvCredits(int $personId, string $language = 'en-US'): array
    {
        return $this->get("/person/{$personId}/tv_credits", ['language' => $language]);
    }

    /** სერიალების აღმოჩენა ფილტრებით */
    public function discoverTv(array $params): array
    {
        return $this->get('/discover/tv', array_merge(
            ['language' => 'en-US'],
            $params,
        ));
    }
}
