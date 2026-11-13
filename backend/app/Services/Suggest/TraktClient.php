<?php

namespace App\Services\Suggest;

use App\Services\Credentials\CredentialStore;
use App\Support\CredentialProviders;
use App\Support\SourceLog;

/**
 * **Trakt — მსგავსი ფილმები და სერიალები** (`related`).
 *
 * ⚠️ მხოლოდ საჯარო მონაცემი იკითხება: გასაღები Client ID-ია (`trakt-api-key`),
 * Client Secret არ გამოიყენება და არ ინახება.
 * ⚠️ Trakt სათაურს თავისი id-ით, slug-ით ან IMDb id-ით ცნობს — TMDB-ის id-ით არა.
 * IMDb id ჩანაწერს ჩვეულებრივ აქვს; თუ არ აქვს, slug ერთი დამატებითი მოთხოვნით
 * იძებნება (`/search/tmdb/…`). პასუხის ყოველ ელემენტს კი TMDB-ის id თან მოაქვს.
 */
class TraktClient
{
    private const BASE = 'https://api.trakt.tv';

    public function configured(): bool
    {
        return filled(CredentialStore::value(CredentialProviders::TRAKT, 'client_id'));
    }

    /**
     * @return list<array{tmdb_id: int, title: string, year: ?int}> TMDB-ის id-ის გარეშე ელემენტი იყრება
     */
    public function related(bool $tv, int $tmdbId, ?string $imdbId, int $limit = 10): array
    {
        $id = $imdbId ?: $this->slug($tv, $tmdbId);

        if (! $id) {
            return [];
        }

        $out = [];

        foreach ($this->get('/'.($tv ? 'shows' : 'movies').'/'.rawurlencode($id).'/related', ['limit' => $limit]) as $row) {
            $tmdb = (int) ($row['ids']['tmdb'] ?? 0);

            if ($tmdb > 0 && $tmdb !== $tmdbId) {
                $out[] = [
                    'tmdb_id' => $tmdb,
                    'title' => (string) ($row['title'] ?? ''),
                    'year' => isset($row['year']) ? (int) $row['year'] : null,
                ];
            }
        }

        return $out;
    }

    /** TMDB-ის id → Trakt-ის slug; `null` — Trakt ამ სათაურს არ იცნობს */
    private function slug(bool $tv, int $tmdbId): ?string
    {
        $type = $tv ? 'show' : 'movie';
        $ids = $this->get("/search/tmdb/{$tmdbId}", ['type' => $type])[0][$type]['ids'] ?? [];

        return match (true) {
            ! empty($ids['slug']) => (string) $ids['slug'],
            ! empty($ids['trakt']) => (string) $ids['trakt'],
            default => null,
        };
    }

    /** @return array<int, mixed> */
    private function get(string $path, array $query = []): array
    {
        $res = SourceLog::request(15)
            ->withHeaders([
                'Content-Type' => 'application/json',
                'User-Agent' => 'Mediary/1.0',
                'trakt-api-version' => '2',
                'trakt-api-key' => (string) CredentialStore::value(CredentialProviders::TRAKT, 'client_id'),
            ])
            ->get(self::BASE.$path, $query);

        // „ასეთი სათაური არ ვიცი" ჩავარდნა არ არის — ცარიელი პასუხია
        if ($res->status() === 404) {
            return [];
        }

        if (! $res->successful()) {
            SourceLog::status('trakt', $res->status(), $res->body(), ['path' => $path]);
        }

        $res->throw();

        return (array) $res->json();
    }
}
