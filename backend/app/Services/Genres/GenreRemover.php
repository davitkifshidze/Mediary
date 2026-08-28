<?php

namespace App\Services\Genres;

use App\Models\Genre;
use Illuminate\Support\Facades\DB;

/**
 * ჟანრი გლობალურია (ყველა მომხმარებლისთვის საერთო), ამიტომ წაშლისას
 * მიბმები **ყველა user-ის** ჩანაწერზე უნდა დაითვალოს/გადავიდეს — ე.ი. აქ
 * `owner` global scope განზრახ ითიშება.
 *
 * ჩვეულებრივი user წაშლას პირდაპირ ვერ ასრულებს: მისი მოთხოვნა ადმინთან
 * მიდის (ApprovalRequest::TYPE_GENRE_DELETE) და დამტკიცებისას იგივე კოდი გადის.
 */
class GenreRemover
{
    /** მიბმული ჩანაწერების რაოდენობა ყველა მომხმარებელზე */
    public function globalCounts(Genre $genre): array
    {
        return [
            'movies_count' => $genre->movies()->withoutGlobalScope('owner')->count(),
            'series_count' => $genre->series()->withoutGlobalScope('owner')->count(),
        ];
    }

    /**
     * @return array{ok: bool, reason?: string, movies_count?: int, series_count?: int}
     */
    public function remove(Genre $genre, ?int $reassignTo = null, bool $force = false): array
    {
        $counts = $this->globalCounts($genre);
        $total = $counts['movies_count'] + $counts['series_count'];

        if ($total > 0) {
            if ($reassignTo) {
                $target = Genre::where('id', $reassignTo)->where('id', '!=', $genre->id)->first();
                if (! $target) {
                    return ['ok' => false, 'reason' => 'invalid_reassign_target'];
                }

                DB::transaction(function () use ($genre, $target) {
                    $target->movies()->syncWithoutDetaching(
                        $genre->movies()->withoutGlobalScope('owner')->pluck('movies.id')->all()
                    );
                    $target->series()->syncWithoutDetaching(
                        $genre->series()->withoutGlobalScope('owner')->pluck('series.id')->all()
                    );
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
