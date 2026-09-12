<?php

namespace App\Support;

/**
 * ოფიციალური ტრეილერის შერჩევა TMDB-ის `/videos` პასუხიდან (Tasks 9).
 *
 * TMDB ერთ ჩანაწერზე ათობით ვიდეოს აბრუნებს (Teaser, Clip, Featurette,
 * „Behind the Scenes"…), ხშირად არა-ოფიციალურ არხებიდან. ამიტომ ვირჩევთ
 * ქულებით: ტიპი → ოფიციალურობა → სიახლე. YouTube-ის გარდა სხვა site-ს
 * არ ვიღებთ, რადგან `VideoUrl`-ის allowlist სწორედ მას იცნობს.
 */
class Trailer
{
    /** რომელი `type` რამდენად გვინდა — ტრეილერი > თიზერი > კლიპი */
    private const TYPE_SCORE = [
        'Trailer' => 100,
        'Teaser' => 60,
        'Clip' => 20,
        'Featurette' => 10,
    ];

    /**
     * საუკეთესო ტრეილერის YouTube URL, ან `null`.
     *
     * პასუხები **პრიორიტეტის რიგით** გადმოეცემა (მაგ. ka, შემდეგ en) და
     * პირველივე, რომელშიც ვარგისი ვიდეოა, იმარჯვებს — ე.ი. ka→en კასკადი.
     *
     * @param  array<string, mixed>  ...$payloads  TMDB-ის `/videos` პასუხები
     */
    public static function pick(array ...$payloads): ?string
    {
        foreach ($payloads as $payload) {
            $best = null;
            $bestScore = 0;

            foreach ($payload['results'] ?? $payload as $v) {
                if (! is_array($v) || ($v['site'] ?? null) !== 'YouTube' || empty($v['key'])) {
                    continue;
                }

                $score = self::TYPE_SCORE[$v['type'] ?? ''] ?? 0;
                if ($score === 0) {
                    continue;
                }

                if (! empty($v['official'])) {
                    $score += 25;
                }
                // თანაბარზე უფრო ახალი; თარიღის გარეშე ჩანაწერი ბოლოში
                $score += empty($v['published_at']) ? 0 : 1;

                if ($score > $bestScore) {
                    $bestScore = $score;
                    $best = $v;
                }
            }

            if ($best) {
                return 'https://www.youtube.com/watch?v='.$best['key'];
            }
        }

        return null;
    }
}
