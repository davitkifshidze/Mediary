<?php

namespace App\Providers;

use App\Models\Movie;
use App\Models\Series;
use App\Models\User;
use App\Models\Video;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Facades\Gate;
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
            'video' => Video::class,
        ]);

        // სუპერ-ადმინი ყველა policy-ს გაივლის. ⚠️ `owner` global scope მასზეც
        // მოქმედებს — სხვისი ბიბლიოთეკა ავტომატურად არ უჩანს (განზრახ):
        // ადმინისეული წვდომა მხოლოდ /api/admin/* endpoint-ებზეა.
        Gate::before(fn (User $user) => $user->isSuperAdmin() ? true : null);

        // მოდულზე წვდომა — controller-ებში `Gate::allows('use-module', $type)`
        Gate::define('use-module', fn (User $user, string $key) => $user->hasModule($key));
    }
}
