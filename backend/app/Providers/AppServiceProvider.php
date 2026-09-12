<?php

namespace App\Providers;

use App\Models\Anime;
use App\Models\BoardGame;
use App\Models\Book;
use App\Models\Bookmark;
use App\Models\CastMember;
use App\Models\Game;
use App\Models\Movie;
use App\Models\NoteEntry;
use App\Models\Series;
use App\Models\Song;
use App\Models\User;
use App\Models\Video;
use App\Observers\AuditObserver;
use App\Services\Audit\AuditLogger;
use App\Support\AuditRegistry;
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
        /* ⚠️ **singleton განზრახ**: `AuditLogger::suppress()` და მისი
           ქეშები (ცხრილის არსებობა, `route_base`-ების რუკა) მხოლოდ მაშინ
           მუშაობს, თუ მთელ რექვესთზე ერთი და იგივე ეგზემპლარია. */
        $this->app->singleton(AuditLogger::class);
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
            // §7.1 — მესამე მედია-დომენი; ჟანრები/მსახიობები გლობალურ
            // ცხრილებზე morph alias-ით ეკიდება, ისევე როგორც სერიალს
            'anime' => Anime::class,
            'video' => Video::class,
            // სიმღერები ცალკე მოდულია (2026-09-03) — გალერეა მასაც ეკიდება
            'song' => Song::class,
            // წიგნები (Tasks §12), ბორდგეიმები (§14) და თამაშები (§11)
            'book' => Book::class,
            'board_game' => BoardGame::class,
            // §11.3 — RAWG-ის სქრინშოტები `gallery_images`-ში ხვდება
            'game' => Game::class,
            // §13 — ჩანაწერები; ცხრილი `note_entries`-ია, alias კი მოდულის key
            'note' => NoteEntry::class,
            // §18 — ბუკმარკები (გალერეა არ ეკიდება, მაგრამ alias `modules`-შია)
            'bookmark' => Bookmark::class,
            // Tasks 10 — გალერეის ფოტოები მსახიობზეც ეკიდება
            'cast_member' => CastMember::class,
        ]);

        // სუპერ-ადმინი ყველა policy-ს გაივლის. ⚠️ `owner` global scope მასზეც
        // მოქმედებს — სხვისი ბიბლიოთეკა ავტომატურად არ უჩანს (განზრახ):
        // ადმინისეული წვდომა მხოლოდ /api/admin/* endpoint-ებზეა.
        Gate::before(fn (User $user) => $user->isSuperAdmin() ? true : null);

        // მოდულზე წვდომა — controller-ებში `Gate::allows('use-module', $type)`
        Gate::define('use-module', fn (User $user, string $key) => $user->hasModule($key));

        /* **აუდიტ-ლოგი (Tasks §4.3)** — ერთი ციკლი ყველა მოდელზე.
           ⚠️ სწორედ ეს ერთი ადგილია ის, რასაც §4.3 ითხოვს: კონტროლერებში
           ლოგირება არ წერია, ე.ი. ერთი მოდულის დავიწყება შეუძლებელია.
           ახალი მოდელის ლოგირება = ერთი რიგი `AuditRegistry::MODELS`-ში. */
        foreach (array_keys(AuditRegistry::MODELS) as $model) {
            $model::observe(AuditObserver::class);
        }
    }
}
