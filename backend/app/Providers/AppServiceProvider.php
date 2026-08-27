<?php

namespace App\Providers;

use App\Models\Movie;
use App\Models\Series;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // polymorphic type-ების მოკლე/სტაბილური alias-ები (movie/series/anime).
        // anime დაემატება მისი დომენის შემოღებისას.
        Relation::enforceMorphMap([
            'movie' => Movie::class,
            'series' => Series::class,
        ]);
    }
}
