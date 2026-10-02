<?php

namespace App\Services\Share;

use App\Models\ShareLink;
use App\Models\User;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * **ტოკენიდან ბმული და მისი მფლობელი — ან 404 / 410 (Tasks §40.6, §40.8).**
 *
 * ⚠️ **ერთი ადგილი ორი კონტროლერისთვის** — მიმღების გვერდი (ავტორიზაციის
 * გარეშე) და ბიბლიოთეკაში დამატება (შესულისთვის) ერთსა და იმავე კითხვას
 * სვამენ: „ცოცხალია ეს ბმული?". ორი ასლი ერთ დღეს გაუქმებულ ბმულს ერთ კარში
 * ჩაკეტავდა და მეორეში ღიად დატოვებდა.
 *
 * ⚠️ **410 ≠ 404** (`ResetLink`-ის წესი): უცნობი ტოკენი, წაშლილი ან გათიშული
 * მფლობელი და გამორთული მექანიზმი — 404 („ასეთი არ არსებობს"); გაუქმებული
 * ან ვადაგასული — 410 („იყო, ამოიწურა" — მფლობელს ახალი სთხოვე).
 */
final class ShareResolver
{
    /**
     * @return array{0: ShareLink, 1: User}
     */
    public static function resolve(string $token): array
    {
        if (! config('mediary.share_links')) {
            self::deny('share_not_found', 404);
        }

        $link = ShareLink::findByToken($token);

        if (! $link) {
            self::deny('share_not_found', 404);
        }

        $owner = User::find($link->user_id);

        // ⚠️ გათიშული ანგარიშის ბმული „არ არსებობს" და არა „ამოიწურა"
        if (! $owner || ! $owner->is_active) {
            self::deny('share_not_found', 404);
        }

        if ($link->isRevoked()) {
            self::deny('share_revoked', 410);
        }

        if ($link->isExpired()) {
            self::deny('share_expired', 410);
        }

        return [$link, $owner];
    }

    /** @return never */
    public static function deny(string $code, int $status): void
    {
        throw new HttpResponseException(response()->json(['message' => $code], $status));
    }
}
