<?php

namespace App\Services\Video;

use App\Models\Video;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * ვიდეოს ძებნა და „მსგავსი ვიდეოები" (Tasks K4).
 *
 * ძებნა ორ ბიჯად:
 *  1. **SQL LIKE** — სათაური, აღწერა, ტეგები, წყარო/პლატფორმა, URL და ჩანიშვნები.
 *  2. თუ ზუსტი დამთხვევა ცოტაა — **fuzzy pass PHP-ში** (mb-aware Levenshtein),
 *     ე.ი. ბეჭდვის შეცდომაც და ნაწილობრივი ფორმაც ამოვა: „კორირება" → „კორეა".
 *
 * ⚠️ FULLTEXT განზრახ **არ** გამოიყენება: ტესტები sqlite `:memory:`-ზე გადის
 * (FULLTEXT არ აქვს — იხ. CLAUDE.md), ხოლო natural-language რეჟიმი ქართულზე
 * მაინც სუსტია (stopwords/stemmer არ არსებობს) და 4-სიმბოლოიანი მინიმალური
 * სიტყვის ლიმიტი აქვს. პირადი ბიბლიოთეკის მასშტაბზე (ასეულები) PHP-ის გავლა
 * უფრო ზუსტიცაა და პორტატულიც.
 *
 * ⚠️ `similar()` **მხოლოდ ჩემი ბიბლიოთეკიდან** ითვლის — YouTube-ის
 * „related videos" API 2023-ში გაუქმდა (`relatedToVideoId` ამოიღეს).
 */
class VideoSearch
{
    /** რამდენ ზუსტ დამთხვევაზე აღარ ვრთავთ fuzzy-ს */
    private const ENOUGH = 5;

    /** fuzzy გავლის ჭერი — ბიბლიოთეკა უფრო დიდი რომ არ დაგვამუხრუჭოს */
    private const FUZZY_POOL = 2000;

    /** მინიმალური მსგავსება (0–1), რომ ტოკენი დამთხვევად ჩაითვალოს */
    private const MIN_SIMILARITY = 0.55;

    /** უმოკლესი ტოკენი, რომელსაც fuzzy-ს ვუშვებთ */
    private const MIN_FUZZY_LEN = 4;

    /**
     * $query — უკვე გაფილტრული და დასორტირებული ბაზა.
     * დაბრუნება: relevance-ით დალაგებული (თანაბარზე ბაზის სორტირება რჩება —
     * PHP-ის sort სტაბილურია).
     */
    public function search(Builder $query, string $term): Collection
    {
        $term = trim((string) preg_replace('/\s+/u', ' ', $term));
        if ($term === '') {
            return $query->get();
        }

        $tokens = $this->tokens($term);

        // `notes` relevance-ს სჭირდება (ჩანიშვნაში დამთხვევაც ქულიანია)
        $exact = (clone $query)
            ->with('notes')
            ->where(fn (Builder $w) => $this->likeWhere($w, $term, $tokens))
            ->get();

        $results = $exact;

        if ($exact->count() < self::ENOUGH && mb_strlen($term) >= 3) {
            $pool = (clone $query)->with('notes')->limit(self::FUZZY_POOL);
            if ($exact->isNotEmpty()) {
                $pool->whereNotIn('videos.id', $exact->pluck('id')->all());
            }

            $fuzzy = $pool->get()->filter(fn (Video $v) => $this->fuzzyScore($v, $tokens) > 0);
            $results = $exact->concat($fuzzy);
        }

        return $results
            ->sortByDesc(fn (Video $v) => $this->relevance($v, $term, $tokens))
            ->values();
    }

    /**
     * „მსგავსი ვიდეოები" — საერთო ტეგები (ყველაზე მძიმე სიგნალი) + იგივე
     * პლატფორმა/ტიპი + სათაურის მსგავსება.
     *
     * $query — ბაზა თვითონ ჩანაწერის გარეშე (`whereKeyNot`); მფლობელობას
     * `BelongsToUser`-ის global scope ითვალისწინებს.
     */
    public function similar(Builder $query, Video $video, int $limit = 8): Collection
    {
        $tags = array_map($this->normalize(...), $video->tags ?? []);
        $titleTokens = $this->tokens((string) $video->title);

        return (clone $query)
            ->limit(self::FUZZY_POOL)
            ->get()
            ->map(fn (Video $v) => [$v, $this->similarity($v, $video, $tags, $titleTokens)])
            ->filter(fn (array $pair) => $pair[1] > 0)
            ->sortByDesc(fn (array $pair) => $pair[1])
            ->take($limit)
            ->map(fn (array $pair) => $pair[0])
            ->values();
    }

    /* ---------- ბიჯი 1: SQL ---------- */

    /** ყველა ტექსტური ველი + ჩანიშვნები; მთელ ფრაზაზეც და თითო სიტყვაზეც */
    private function likeWhere(Builder $where, string $term, array $tokens): void
    {
        $needles = array_values(array_unique(array_merge([$term], $tokens)));

        foreach ($needles as $needle) {
            $like = '%'.$this->escapeLike($needle).'%';

            $where->orWhere(function (Builder $w) use ($like) {
                // `tags` json-ია, LIKE ტექსტად კითხულობს — MySQL-ზეც და sqlite-ზეც მუშაობს
                foreach (['title', 'description', 'tags', 'platform', 'url'] as $column) {
                    $w->orWhere($column, 'like', $like);
                }
                $w->orWhereHas('notes', fn ($n) => $n->where('body', 'like', $like));
            });
        }
    }

    /** `%` და `_` ძებნის ტექსტში ლიტერალია, არა wildcard */
    private function escapeLike(string $value): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $value);
    }

    /* ---------- ბიჯი 2: fuzzy ---------- */

    /** მაქსიმალური მსგავსება ჩანაწერის ტოკენებთან (0, თუ ვერაფერი დაემთხვა) */
    private function fuzzyScore(Video $video, array $tokens): float
    {
        $haystack = $this->haystackTokens($video);
        $best = 0.0;

        foreach ($tokens as $token) {
            if (mb_strlen($token) < self::MIN_FUZZY_LEN) {
                continue;
            }
            foreach ($haystack as $candidate) {
                $score = $this->similarityOf($token, $candidate);
                if ($score > $best) {
                    $best = $score;
                }
            }
        }

        return $best >= self::MIN_SIMILARITY ? $best : 0.0;
    }

    /**
     * ჩანაწერის ყველა ტექსტური ველი ერთ ტოკენების სიად (K4 — „ძებნა ყველაფერში").
     * აღწერას/ჩანიშვნებს ვჭრით, რომ გრძელ ტექსტზე fuzzy არ გაძვირდეს.
     *
     * @return string[]
     */
    private function haystackTokens(Video $video): array
    {
        $text = implode(' ', [
            (string) $video->title,
            implode(' ', $video->tags ?? []),
            (string) $video->platform,
            mb_substr((string) $video->description, 0, 600),
            $video->relationLoaded('notes')
                ? mb_substr($video->notes->pluck('body')->implode(' '), 0, 600)
                : '',
        ]);

        return $this->tokens($text);
    }

    /**
     * ორი სიტყვის მსგავსება (0–1). mb-aware — `levenshtein()` ბაიტებზე მუშაობს,
     * ქართული სიმბოლო კი 3 ბაიტია, ე.ი. სტანდარტული ფუნქცია მანძილს ამახინჯებს.
     * საერთო პრეფიქსს (მინ. 2 სიმბოლო) მოვითხოვთ — ხმაურის მოსაჭრელად.
     */
    private function similarityOf(string $a, string $b): float
    {
        if ($a === $b) {
            return 1.0;
        }

        $x = mb_str_split($a);
        $y = mb_str_split($b);
        $max = max(count($x), count($y));
        if ($max === 0 || abs(count($x) - count($y)) / $max > 0.5) {
            return 0.0;
        }
        if ($this->commonPrefix($x, $y) < 2) {
            return 0.0;
        }

        return 1 - $this->levenshtein($x, $y) / $max;
    }

    private function commonPrefix(array $x, array $y): int
    {
        $n = 0;
        $limit = min(count($x), count($y));
        while ($n < $limit && $x[$n] === $y[$n]) {
            $n++;
        }

        return $n;
    }

    /** კლასიკური DP ორ რიგზე, სიმბოლოების მასივებით */
    private function levenshtein(array $x, array $y): int
    {
        $n = count($x);
        $m = count($y);
        $prev = range(0, $m);

        for ($i = 1; $i <= $n; $i++) {
            $row = [$i];
            for ($j = 1; $j <= $m; $j++) {
                $row[$j] = min(
                    $prev[$j] + 1,                                   // წაშლა
                    $row[$j - 1] + 1,                                // ჩამატება
                    $prev[$j - 1] + ($x[$i - 1] === $y[$j - 1] ? 0 : 1), // ჩანაცვლება
                );
            }
            $prev = $row;
        }

        return $prev[$m];
    }

    /* ---------- relevance ---------- */

    /**
     * დალაგების ქულა: სად დაემთხვა (სათაური > ტეგი > აღწერა > ჩანიშვნა > წყარო)
     * და რამდენად ზუსტად. fuzzy დამთხვევა ყოველთვის ზუსტის ქვემოთაა.
     */
    private function relevance(Video $video, string $term, array $tokens): float
    {
        $needle = $this->normalize($term);
        $title = $this->normalize((string) $video->title);
        $score = 0.0;

        if ($title === $needle) {
            $score += 200;
        } elseif (str_starts_with($title, $needle)) {
            $score += 140;
        } elseif ($this->contains($title, $needle)) {
            $score += 100;
        }

        foreach ($video->tags ?? [] as $tag) {
            if ($this->contains($this->normalize((string) $tag), $needle)) {
                $score += 80;
                break;
            }
        }

        if ($this->contains($this->normalize((string) $video->description), $needle)) {
            $score += 50;
        }
        if ($video->relationLoaded('notes')) {
            foreach ($video->notes as $note) {
                if ($this->contains($this->normalize((string) $note->body), $needle)) {
                    $score += 40;
                    break;
                }
            }
        }
        if ($this->contains($this->normalize((string) $video->platform.' '.$video->url), $needle)) {
            $score += 20;
        }

        // ცალკეული სიტყვების დამთხვევა მრავალსიტყვიან ძებნაზე
        if (count($tokens) > 1) {
            foreach ($tokens as $token) {
                if ($this->contains($title, $this->normalize($token))) {
                    $score += 15;
                }
            }
        }

        // ზუსტი დამთხვევა არ არის → მხოლოდ fuzzy (ყოველთვის ბოლოში)
        return $score > 0 ? $score : $this->fuzzyScore($video, $tokens) * 25;
    }

    private function similarity(Video $candidate, Video $source, array $tags, array $titleTokens): float
    {
        $score = 0.0;

        $shared = array_intersect($tags, array_map($this->normalize(...), $candidate->tags ?? []));
        $score += count($shared) * 10;

        if ($candidate->platform === $source->platform && $candidate->platform !== 'other') {
            $score += 3;
        }
        // იგივე ტიპი (5.1 — ადრე `kind` enum იყო); ტიპის გარეშე ვიდეოები არ ემსგავსება
        if ($candidate->type_id && $candidate->type_id === $source->type_id) {
            $score += 2;
        }

        // სათაურის საერთო სიტყვები (მოკლე დამხმარე სიტყვების გარეშე)
        $candidateTokens = $this->tokens((string) $candidate->title);
        foreach ($titleTokens as $token) {
            if (mb_strlen($token) < 3) {
                continue;
            }
            foreach ($candidateTokens as $other) {
                if ($token === $other || $this->similarityOf($token, $other) >= 0.8) {
                    $score += 4;
                    break;
                }
            }
        }

        return $score;
    }

    /* ---------- დამხმარეები ---------- */

    /** @return string[] */
    private function tokens(string $value): array
    {
        $parts = preg_split('/[^\p{L}\p{N}]+/u', $this->normalize($value), -1, PREG_SPLIT_NO_EMPTY);

        return array_values(array_unique($parts ?: []));
    }

    private function normalize(string $value): string
    {
        return mb_strtolower(trim($value));
    }

    private function contains(string $haystack, string $needle): bool
    {
        return $needle !== '' && str_contains($haystack, $needle);
    }
}
