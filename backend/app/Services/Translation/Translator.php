<?php

namespace App\Services\Translation;

use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * EN → KA თარგმანი.
 * პრიორიტეტი: Claude (თუ ANTHROPIC_API_KEY არის) → fallback: Google Translate (უფასო).
 */
class Translator
{
    public function toGeorgian(?string $text): ?string
    {
        $text = trim((string) $text);
        if ($text === '') {
            return null;
        }

        if (filled(config('services.anthropic.key'))) {
            try {
                if ($r = $this->claude($text)) {
                    return $r;
                }
            } catch (Throwable $e) {
                // fallback to Google
            }
        }

        try {
            return $this->google($text);
        } catch (Throwable $e) {
            return null;
        }
    }

    /** ბევრი ტექსტი ერთ მოთხოვნაში (ხაზებად); აბრუნებს იმავე რაოდენობის მასივს */
    public function toGeorgianBatch(array $texts): array
    {
        $texts = array_values(array_map(fn ($t) => str_replace("\n", ' ', trim((string) $t)), $texts));
        if (empty($texts)) {
            return [];
        }

        $result = $this->toGeorgian(implode("\n", $texts));
        if (! $result) {
            return $texts;
        }

        $lines = array_map('trim', explode("\n", $result));

        // თუ ხაზები არ ემთხვევა — ვაბრუნებთ ორიგინალებს (უსაფრთხოდ)
        return count($lines) === count($texts) ? $lines : $texts;
    }

    private function options(): array
    {
        return ['verify' => storage_path('cacert.pem')];
    }

    private function claude(string $text): ?string
    {
        $res = Http::withOptions($this->options())
            ->timeout(30)
            ->withHeaders([
                'x-api-key' => config('services.anthropic.key'),
                'anthropic-version' => '2023-06-01',
            ])
            ->post('https://api.anthropic.com/v1/messages', [
                'model' => config('services.anthropic.model', 'claude-sonnet-5'),
                'max_tokens' => 1024,
                'messages' => [[
                    'role' => 'user',
                    'content' => 'Translate the following English movie text into natural Georgian. '
                        ."Output ONLY the Georgian translation, no notes:\n\n".$text,
                ]],
            ]);
        $res->throw();

        return trim($res->json('content.0.text') ?? '') ?: null;
    }

    private function google(string $text): ?string
    {
        $res = Http::withOptions($this->options())
            ->timeout(20)
            ->get('https://translate.googleapis.com/translate_a/single', [
                'client' => 'gtx',
                'sl' => 'en',
                'tl' => 'ka',
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
