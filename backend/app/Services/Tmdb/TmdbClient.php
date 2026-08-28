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
