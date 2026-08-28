<?php

namespace App\Support;

class Lang
{
    /**
     * ქართული სახელი ან null.
     *
     * TMDB-ს `language=ka`-ზე თარგმანი თუ არ აქვს, ჩუმად ორიგინალ ენას აბრუნებს
     * (ინგლისურს, ესპანურს…). ამიტომ სახელს მხოლოდ მაშინ ვიღებთ, თუ მასში
     * მართლა მხედრულია (U+10D0–U+10FF).
     */
    public static function georgian(?string $text): ?string
    {
        $text = trim((string) $text);

        return $text !== '' && preg_match('/\p{Georgian}/u', $text) ? $text : null;
    }
}
