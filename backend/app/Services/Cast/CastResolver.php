<?php

namespace App\Services\Cast;

use App\Models\CastMember;
use App\Services\Media\MediaDownloader;
use App\Services\Tmdb\TmdbClient;
use App\Support\CastSync;
use Illuminate\Support\Facades\Auth;
use Throwable;

/**
 * **სამი შესვლიდან ერთი მსახიობი — დუბლის გარეშე (ეტაპი 1 → Tasks §35.3).**
 *
 * არსებული `cast_member_id` · `tmdb_person_id` (შემოიყვანება) · სრულიად ხელით
 * `name`. ორი გამომძახებელი: ჩანაწერზე მიბმა (`RecordCastController::store()`)
 * და `/actors`-ის „ახალი მსახიობი" (`CastController::store()`).
 *
 * ⚠️ **`cast_members` გლობალური ლექსიკონია** — დამატება **ვერასდროს** ქმნის
 * ახალ რიგს ბრმად: `CastSync::resolve()` ჯერ `tmdb_person_id`-ით ეძებს, მერე
 * ნორმალიზებული სახელით (ორივე ენაზე). ⚠️ `creator` scope-ის წყალობით სხვისი
 * კერძო (ხელით შექმნილი) რიგი აქ არ ჩანს, ე.ი. მას ვერ „ვიპოვით" და ჩემს
 * ფილმს არ მივაბამთ.
 *
 * ⚠️ **ახალი ხელით შექმნილი რიგი შემქმნელისაა** (`created_by`, Q9) — სხვას არ
 * უჩანს, სანამ TMDB-ის პირს არ დაუკავშირდება; TMDB-იანი კი ყველასია.
 */
final class CastResolver
{
    public function __construct(
        private readonly TmdbClient $tmdb,
        private readonly MediaDownloader $media,
    ) {}

    /**
     * @param  array{cast_member_id?: int|null, tmdb_person_id?: int|null, name?: string|null, name_ka?: string|null, gender?: int|null}  $data
     */
    public function resolve(array $data): ?CastMember
    {
        if ($data['cast_member_id'] ?? null) {
            return CastMember::find($data['cast_member_id']);
        }

        $tmdbId = $data['tmdb_person_id'] ?? null;
        $name = trim((string) ($data['name'] ?? ''));
        $nameKa = trim((string) ($data['name_ka'] ?? ''));

        $existing = CastSync::resolve($tmdbId, ['en' => $name ?: null, 'ka' => $nameKa ?: null]);

        $person = [];
        if ($tmdbId && $this->tmdb->configured()) {
            try {
                $person = $this->tmdb->person($tmdbId);
            } catch (Throwable $e) {
                report($e);
            }
            $name = $name ?: (string) ($person['name'] ?? '');
        }

        if (! $existing && $name === '') {
            // ⚠️ სახელის გარეშე ლექსიკონში ცარიელი რიგი არ იქმნება
            return null;
        }

        $member = $existing ?: new CastMember;

        if (! $member->exists) {
            $member->name = $name;
            // §35.3 — ხელით შექმნილი ახალი რიგი კერძოა; TMDB-ის პირი კი საერთო
            $member->created_by = $tmdbId ? null : Auth::id();
        }
        if ($tmdbId && ! $member->tmdb_person_id) {
            $member->tmdb_person_id = $tmdbId;
        }
        if (! $member->gender) {
            $member->gender = (int) ($data['gender'] ?? $person['gender'] ?? 0) ?: null;
        }

        // ფოტო TMDB-დან — ⚠️ **გაზიარებული ფაილია და კვოტას არ ხარჯავს** (19.4/B)
        if ($tmdbId && ! $member->photo_path && ! empty($person['profile_path'])) {
            if ($photo = $this->media->profile($person['profile_path'], $tmdbId)) {
                $member->photo_path = $photo;
            }
        }

        $member->save();

        if ($nameKa) {
            $member->setTranslation('ka', $nameKa);
        }

        return $member;
    }
}
