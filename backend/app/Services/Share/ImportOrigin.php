<?php

namespace App\Services\Share;

use App\Models\ShareLink;
use App\Models\User;

/**
 * **საიდან მოდის „ჩემს ბიბლიოთეკაში დამატება"** — გაზიარების ბმულიდან თუ საჯარო
 * პროფილიდან.
 *
 * ⚠️ ჩანაწერის ასლი ორივე გზაზე ერთნაირია (`ShareImporter` — ფაქტები, მთავარი ფოტო
 * მიმღების კვოტით, სტატუსი როლით); განსხვავდება მხოლოდ ის, რაც **ბმულს** ეკუთვნის:
 * მისი მრიცხველი, „ვინ დაიმატა" და მფლობელის შეტყობინება. პროფილს არც მრიცხველი
 * აქვს და არც შეტყობინება — მფლობელი პროფილიდან გადმოტანას ვერ ხედავს.
 */
final class ImportOrigin
{
    public const SHARE = 'share';

    public const PROFILE = 'profile';

    private function __construct(
        public readonly string $source,
        public readonly User $owner,
        public readonly ?ShareLink $link,
    ) {}

    public static function link(ShareLink $link, User $owner): self
    {
        return new self(self::SHARE, $owner, $link);
    }

    public static function profile(User $owner): self
    {
        return new self(self::PROFILE, $owner, null);
    }
}
