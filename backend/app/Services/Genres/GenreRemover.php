<?php

namespace App\Services\Genres;

use App\Models\Genre;
use App\Support\MediaDomain;
use Illuminate\Support\Facades\DB;

/**
 * ჟანრი გლობალურია (ყველა მომხმარებლისთვის საერთო), ამიტომ წაშლისას
 * მიბმები **ყველა user-ის** ჩანაწერზე უნდა დაითვალოს/გადავიდეს — ე.ი. აქ
 * `owner` global scope განზრახ ითიშება.
 *
 * ჩვეულებრივი user წაშლას პირდაპირ ვერ ასრულებს: მისი მოთხოვნა ადმინთან
 * მიდის (ApprovalRequest::TYPE_GENRE_DELETE) და დამტკიცებისას იგივე კოდი გადის.
 *
 * ⚠️ **დომენებზე ციკლია და არა სამი ხელით ჩაწერილი ხაზი** (Tasks BUG-19).
 * აქამდე მხოლოდ `movies`/`series` ითვლებოდა, ანიმე კი §7.1-ის შემდეგ მესამე
 * TMDB-დომენია — ე.ი. **მხოლოდ ანიმეზე** გამოყენებული ჟანრი „უხმარად"
 * ითვლებოდა და დადასტურების გარეშე იშლებოდა, `reassign_to`-ზე კი ანიმეს
 * მიბმები `genreables`-ის კასკადით უხმოდ ქრებოდა. სწორედ ის ტიპის შეცდომა,
 * რისთვისაც `MediaDomain::TYPES` დაიწერა.
 */
class GenreRemover
{
    /**
     * მიბმული ჩანაწერების რაოდენობა ყველა მომხმარებელზე.
     *
     * ⚠️ გასაღებები `<relation>_count`-ია (`movies_count`, `series_count`,
     * `animes_count`) — ფრონტი და `ApprovalRequest`-ის payload სწორედ მათ
     * კითხულობენ, ე.ი. მეოთხე დომენი აქ თავისით გამოჩნდება.
     *
     * @return array<string, int>
     */
    public function globalCounts(Genre $genre): array
    {
        $counts = [];

        foreach (MediaDomain::TYPES as $type) {
            $relation = MediaDomain::relation($type);
            $counts[$relation.'_count'] = $genre->{$relation}()
                ->withoutGlobalScope('owner')
                ->count();
        }

        return $counts;
    }

    /**
     * @return array{ok: bool, reason?: string}&array<string, int>
     */
    public function remove(Genre $genre, ?int $reassignTo = null, bool $force = false): array
    {
        $counts = $this->globalCounts($genre);
        $total = array_sum($counts);

        if ($total > 0) {
            if ($reassignTo) {
                $target = Genre::where('id', $reassignTo)->where('id', '!=', $genre->id)->first();
                if (! $target) {
                    return ['ok' => false, 'reason' => 'invalid_reassign_target'];
                }

                DB::transaction(function () use ($genre, $target) {
                    foreach (MediaDomain::TYPES as $type) {
                        $relation = MediaDomain::relation($type);
                        $table = MediaDomain::model($type)::query()->getModel()->getTable();

                        $target->{$relation}()->syncWithoutDetaching(
                            $genre->{$relation}()->withoutGlobalScope('owner')->pluck($table.'.id')->all()
                        );
                    }
                });
            } elseif (! $force) {
                return ['ok' => false, 'reason' => 'genre_in_use'] + $counts;
            }
        }

        // genreables.genre_id → cascadeOnDelete: pivot-ები თავად წაიშლება
        $genre->delete();

        return ['ok' => true] + $counts;
    }
}
