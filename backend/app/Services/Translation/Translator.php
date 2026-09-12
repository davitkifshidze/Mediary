<?php

namespace App\Services\Translation;

use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * ორმხრივი თარგმანი EN↔KA (Tasks 7).
 *
 * პრიორიტეტი: Claude (თუ `ANTHROPIC_API_KEY` არის) → fallback: Google Translate.
 * ⚠️ უფასო Google endpoint დღეს ხშირად **429**-ს აბრუნებს, ე.ი. კლავიშის გარეშე
 * თარგმანზე დაყრდნობა არ შეიძლება — `configured()` სწორედ ამას ეუბნება
 * გამომძახებელს, რომ ინტერფეისმა პატიოსნად თქვას „კლავიში არ არის".
 */
class Translator
{
    /** ენის კოდი → სახელი პრომპტისთვის */
    private const NAMES = ['ka' => 'Georgian', 'en' => 'English'];

    /** არის თუ არა საიმედო თარჯიმანი (Claude) ხელმისაწვდომი */
    public function configured(): bool
    {
        return filled(config('services.anthropic.key'));
    }

    public function toGeorgian(?string $text): ?string
    {
        return $this->translate($text, 'ka');
    }

    public function toEnglish(?string $text): ?string
    {
        return $this->translate($text, 'en');
    }

    /**
     * თარგმანი სამიზნე ენაზე. `$context` პრომპტს აზუსტებს (მაგ. „movie title",
     * „genre name") — მოკლე ტექსტებზე ეს ხარისხს შესამჩნევად ცვლის.
     */
    public function translate(?string $text, string $to, string $context = 'text'): ?string
    {
        $text = trim((string) $text);
        if ($text === '' || ! isset(self::NAMES[$to])) {
            return null;
        }

        if ($this->configured()) {
            try {
                if ($r = $this->claude($text, $to, $context)) {
                    return $r;
                }
            } catch (Throwable) {
                // fallback to Google
            }
        }

        try {
            return $this->google($text, $to);
        } catch (Throwable) {
            return null;
        }
    }

    /** ბევრი ტექსტი ერთ მოთხოვნაში (ხაზებად); აბრუნებს იმავე რაოდენობის მასივს */
    public function translateBatch(array $texts, string $to, string $context = 'text'): array
    {
        $texts = array_values(array_map(fn ($t) => str_replace("\n", ' ', trim((string) $t)), $texts));
        if (! $texts) {
            return [];
        }

        $result = $this->translate(implode("\n", $texts), $to, $context);
        if (! $result) {
            return $texts;
        }

        $lines = array_map('trim', explode("\n", $result));

        // თუ ხაზები არ ემთხვევა — ვაბრუნებთ ორიგინალებს (უსაფრთხოდ)
        return count($lines) === count($texts) ? $lines : $texts;
    }

    /** უკან თავსებადობა: ძველი გამოძახება `toGeorgianBatch()` */
    public function toGeorgianBatch(array $texts): array
    {
        return $this->translateBatch($texts, 'ka');
    }

    private function options(): array
    {
        return ['verify' => storage_path('cacert.pem')];
    }

    private function claude(string $text, string $to, string $context): ?string
    {
        $target = self::NAMES[$to];
        $source = self::NAMES[$to === 'ka' ? 'en' : 'ka'];

        $res = Http::withOptions($this->options())
            ->timeout(45)
            ->withHeaders([
                'x-api-key' => config('services.anthropic.key'),
                'anthropic-version' => '2023-06-01',
            ])
            ->post('https://api.anthropic.com/v1/messages', [
                'model' => config('services.anthropic.model', 'claude-sonnet-5'),
                'max_tokens' => 2048,
                'messages' => [[
                    'role' => 'user',
                    'content' => "Translate the following {$source} {$context} into natural {$target}. "
                        ."Keep proper nouns recognisable. Output ONLY the {$target} translation, "
                        ."with no notes, quotes or explanations:\n\n".$text,
                ]],
            ]);
        $res->throw();

        return trim($res->json('content.0.text') ?? '') ?: null;
    }

    private function google(string $text, string $to): ?string
    {
        $res = Http::withOptions($this->options())
            ->timeout(20)
            ->get('https://translate.googleapis.com/translate_a/single', [
                'client' => 'gtx',
                'sl' => $to === 'ka' ? 'en' : 'ka',
                'tl' => $to,
                'dt' => 't',
                'q' => $text,
            ]);
        $res->throw();

        $data = $res->json();
        if (! is_array($data) || ! isset($data[0]) || ! is_array($data[0])) {
            return null;
        }

        $out = '';
        foreach ($data[0] as $seg) {
            $out .= $seg[0] ?? '';
        }

        return trim($out) ?: null;
    }
}
