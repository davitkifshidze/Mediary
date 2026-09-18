<?php

namespace App\Console\Commands;

use App\Models\Movie;
use App\Services\Tmdb\TmdbClient;
use Illuminate\Console\Command;
use Throwable;

class BackfillCollections extends Command
{
    protected $signature = 'movies:backfill-collections {--force : ხელახლა ყველა, უკვე შევსებულებზეც}';

    protected $description = 'არსებული ფილმებისთვის TMDB კოლექციის (ფრანჩაიზის) id/სახელის შევსება';

    public function handle(TmdbClient $tmdb): int
    {
        if (! $tmdb->configured()) {
            $this->error('TMDB-ის გასაღები არ არის — ჩაწერე `backend/.env`-ში ან `/credentials`-ზე.');

            return self::FAILURE;
        }

        $query = Movie::whereNotNull('tmdb_id');
        if (! $this->option('force')) {
            $query->whereNull('tmdb_collection_id');
        }
        $movies = $query->get();

        $this->info("დასამუშავებელი: {$movies->count()} ფილმი");
        $set = 0;

        foreach ($movies as $movie) {
            try {
                $d = $tmdb->details($movie->tmdb_id);
                $col = $d['belongs_to_collection'] ?? null;
                if ($col) {
                    $movie->tmdb_collection_id = $col['id'] ?? null;
                    $movie->collection_name = $col['name'] ?? null;
                    $movie->save();
                    $set++;
                }
            } catch (Throwable $e) {
                $this->warn("#{$movie->id}: {$e->getMessage()}");
            }
        }

        $this->info("დასრულდა. კოლექცია მიენიჭა: {$set} ფილმს.");

        return self::SUCCESS;
    }
}
