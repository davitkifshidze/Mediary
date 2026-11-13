<?php

namespace App\Services\Suggest;

use App\Support\SourceLog;

/**
 * **AniList — ანიმეს რეკომენდაციები** (GraphQL, გასაღების გარეშე).
 *
 * ⚠️ AniList-მა TMDB-ის id არ იცის: სათაური სახელით იძებნება და პასუხიც მხოლოდ
 * სახელი და წელია — TMDB-თან დაკავშირება გამომძახებლის საქმეა (`SuggestionSources`).
 * ⚠️ „ვერ ვიპოვე" აქ **HTTP 404-ია** (`data.Media: null`) — ჩავარდნა არ არის.
 * ⚠️ ლიმიტი წუთში ~30 მოთხოვნაა, ამიტომ პასუხი ქეშში ინახება და ერთ სათაურზე ერთი
 * მოთხოვნა გადის.
 */
class AniListClient
{
    private const ENDPOINT = 'https://graphql.anilist.co';

    /**
     * ფილმი (`MOVIE`), კლიპი და სპეციალური გამოშვება გამორჩეულია: ანიმეს მოდული
     * TMDB-ის სერიალების მხარეს ზის და იქ ისინი ან არ არის, ან სხვა სათაურს დაემთხვევა.
     */
    private const FORMATS = ['TV', 'TV_SHORT', 'ONA'];

    private const QUERY = <<<'GQL'
        query ($search: String, $limit: Int) {
          Media(search: $search, type: ANIME) {
            id
            recommendations(sort: RATING_DESC, perPage: $limit) {
              nodes {
                rating
                mediaRecommendation { id format title { romaji english } startDate { year } }
              }
            }
          }
        }
        GQL;

    /**
     * @return list<array{title: string, alt: ?string, year: ?int}> მომხმარებლების ხმებით დალაგებული
     */
    public function recommendations(string $title, int $limit = 8): array
    {
        $title = trim($title);

        if ($title === '') {
            return [];
        }

        $res = SourceLog::request(15)
            ->acceptJson()
            ->asJson()
            ->post(self::ENDPOINT, ['query' => self::QUERY, 'variables' => ['search' => $title, 'limit' => $limit]]);

        if ($res->status() === 404) {
            return [];
        }

        if (! $res->successful()) {
            SourceLog::status('anilist', $res->status(), $res->body(), ['title' => $title]);
        }

        $res->throw();

        $out = [];

        foreach ((array) $res->json('data.Media.recommendations.nodes') as $node) {
            $media = $node['mediaRecommendation'] ?? null;

            // უარყოფითი ხმები — მომხმარებლებმა ეს წყვილი დაიწუნეს
            if (! is_array($media) || (int) ($node['rating'] ?? 0) <= 0 || ! in_array($media['format'] ?? null, self::FORMATS, true)) {
                continue;
            }

            $english = trim((string) ($media['title']['english'] ?? ''));
            $romaji = trim((string) ($media['title']['romaji'] ?? ''));

            if ($english === '' && $romaji === '') {
                continue;
            }

            $out[] = [
                'title' => $english !== '' ? $english : $romaji,
                'alt' => $english !== '' && $romaji !== '' && $romaji !== $english ? $romaji : null,
                'year' => isset($media['startDate']['year']) ? (int) $media['startDate']['year'] : null,
            ];
        }

        return $out;
    }
}
