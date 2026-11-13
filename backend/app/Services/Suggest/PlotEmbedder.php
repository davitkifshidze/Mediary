<?php

namespace App\Services\Suggest;

use App\Services\Credentials\CredentialStore;
use App\Support\CredentialProviders;
use App\Support\SourceLog;
use RuntimeException;

/**
 * **აღწერა → ვექტორი** (Gemini-ის embedding).
 *
 * სიუჟეტის მსგავსება ორი აღწერის ვექტორის სიახლოვეა. მოდელი აქ არაფერს არჩევს და
 * არაფერს წერს — მხოლოდ ტექსტს აქცევს რიცხვებად, ამიტომ იმავე არჩევანზე შედეგი
 * ყოველთვის ერთნაირია.
 *
 * ⚠️ გასაღები მომხმარებლისაა („მონაცემები" → Gemini) — იგივე, რაც თარგმანს აქვს;
 * მის გარეშე `configured()` `false`-ია და გვერდი სხვა სიგნალებით მუშაობს.
 * ⚠️ თარგმანის მრიცხველში (`translation_usages`) ეს არ იწერება: embedding-ის მოდელს
 * Google-თან საკუთარი ლიმიტი აქვს და თარგმანის დღიურ ჭერს არ ეხება.
 * ⚠️ 3072-ზე მოკლე ვექტორს Google ნორმირებულს არ აბრუნებს — ნორმირება აქ ხდება,
 * რის შემდეგაც სიახლოვე უბრალო სკალარული ნამრავლია.
 */
class PlotEmbedder
{
    public const MODEL = 'gemini-embedding-001';

    public const DIMENSIONS = 768;

    /** ერთ მოთხოვნაში რამდენი ტექსტი მიდის */
    public const BATCH = 100;

    /** ერთი ტექსტის სიგრძის ჭერი — აღწერა ამაზე მოკლეა, გრძელი კი ლიმიტს უაზროდ ხარჯავს */
    public const MAX_CHARS = 2000;

    private const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';

    public function configured(): bool
    {
        return filled(CredentialStore::value(CredentialProviders::GEMINI));
    }

    /**
     * @param  array<int, string>  $texts  გასაღები — რაც გამომძახებელს სჭირდება (TMDB-ის id)
     * @return array<int, list<float>> იგივე გასაღებებით; ნორმირებული ვექტორები
     */
    public function embed(array $texts): array
    {
        if ($texts === []) {
            return [];
        }

        $keys = array_keys($texts);

        $res = SourceLog::request(60)
            // გასაღები ჰედერშია და არა მისამართში — ლოგსა და გამონაკლისის ტექსტში არ ხვდება
            ->withHeaders(['X-goog-api-key' => (string) CredentialStore::value(CredentialProviders::GEMINI)])
            ->post(self::ENDPOINT.self::MODEL.':batchEmbedContents', [
                'requests' => array_map(fn (string $text) => [
                    'model' => 'models/'.self::MODEL,
                    'content' => ['parts' => [['text' => mb_substr($text, 0, self::MAX_CHARS)]]],
                    'taskType' => 'SEMANTIC_SIMILARITY',
                    'outputDimensionality' => self::DIMENSIONS,
                ], array_values($texts)),
            ]);

        if (! $res->successful()) {
            SourceLog::status('gemini', $res->status(), $res->body(), ['step' => 'embedding']);
        }

        $res->throw();

        $rows = (array) $res->json('embeddings');

        // ⚠️ პასუხი რიგით ემთხვევა მოთხოვნას — სხვა რაოდენობა ნიშნავს, რომ ვექტორები სათაურებს აცდებოდა
        if (count($rows) !== count($keys)) {
            throw new RuntimeException('embedding count mismatch');
        }

        $out = [];

        foreach ($rows as $i => $row) {
            $vector = self::normalize(array_map('floatval', (array) ($row['values'] ?? [])));

            if ($vector !== []) {
                $out[$keys[$i]] = $vector;
            }
        }

        return $out;
    }

    /**
     * სიგრძე 1-ზე დაყვანილი ვექტორი; ნულოვანი ან ცარიელი — `[]`.
     *
     * @param  list<float>  $vector
     * @return list<float>
     */
    public static function normalize(array $vector): array
    {
        $length = sqrt(array_sum(array_map(fn (float $v) => $v * $v, $vector)));

        return $length > 0.0 ? array_map(fn (float $v) => $v / $length, $vector) : [];
    }

    /**
     * ორი ნორმირებული ვექტორის სიახლოვე (−1…1).
     *
     * @param  list<float>  $a
     * @param  list<float>  $b
     */
    public static function similarity(array $a, array $b): float
    {
        $sum = 0.0;

        foreach ($a as $i => $value) {
            $sum += $value * ($b[$i] ?? 0.0);
        }

        return $sum;
    }
}
