<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Movie;
use App\Models\Series;
use App\Services\Enrichment\MovieEnricher;
use App\Services\Enrichment\SeriesEnricher;
use Illuminate\Http\Request;
use Throwable;

class MediaController extends Controller
{
    /**
     * ყველა ჩანაწერის პოსტერი + მსახიობთა ფოტოები TMDB-დან ხელახლა ჩამოტვირთვა.
     * გამოსადეგია ახალ მანქანაზე კლონის შემდეგ, სადაც storage/ ცარიელია
     * (სურათები git-ში არ იტვირთება). tmdb_id-ის მიხედვით მუშაობს; თარგმანს არ ცვლის.
     *
     * body: { type?: 'movie' | 'series' } — ცარიელი = ორივე დომენი.
     */
    public function redownload(Request $request, MovieEnricher $movies, SeriesEnricher $series)
    {
        if (! $movies->configured()) {
            return response()->json(['message' => 'TMDB_API_KEY არ არის კონფიგურირებული backend/.env-ში.'], 503);
        }

        // ბევრი ჩანაწერი × 2 TMDB call — დიდხანს შეიძლება გაგრძელდეს
        @set_time_limit(0);
        ignore_user_abort(true);

        $type = $request->input('type');
        $result = [
            'movies' => ['ok' => 0, 'failed' => 0],
            'series' => ['ok' => 0, 'failed' => 0],
        ];

        if ($type === null || $type === 'movie') {
            foreach (Movie::whereNotNull('tmdb_id')->cursor() as $movie) {
                try {
                    $movies->redownloadMedia($movie) ? $result['movies']['ok']++ : $result['movies']['failed']++;
                } catch (Throwable $e) {
                    $result['movies']['failed']++;
                }
            }
        }

        if ($type === null || $type === 'series') {
            foreach (Series::whereNotNull('tmdb_id')->cursor() as $s) {
                try {
                    $series->redownloadMedia($s) ? $result['series']['ok']++ : $result['series']['failed']++;
                } catch (Throwable $e) {
                    $result['series']['failed']++;
                }
            }
        }

        return response()->json([
            'message' => 'მედია ხელახლა ჩამოიტვირთა TMDB-დან.',
            'result' => $result,
        ]);
    }
}
