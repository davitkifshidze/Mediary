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
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
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

        $this->rateLimiters();
    }

    /**
     * **მოთხოვნების ჭერი (აუდიტი 2026-09-14, §A1).**
     *
     * აქამდე `throttle` პროექტში **საერთოდ არ იყო**: არც ავტორიზაციაზე და
     * არც ძვირად ღირებულ endpoint-ებზე. ორივე პრობლემაა და ისინი სხვადასხვაა.
     *
     * ⚠️ **ჭერი იქ არის მკაცრი, სადაც ხარჯი ნამდვილია.** SerpApi-ს 250
     * ძებნა თვეში, Gemini-ის 1500 გამოძახება დღეში და TMDB-ის ლიმიტი
     * **ინსტალაციისაა და არა მომხმარებლისა** (იხ. `TranslationUsage`-ის
     * კომენტარი), ე.ი. ერთი ანგარიში ყველა დანარჩენს ტოვებს უკვოტოდ.
     * გლობალური ჭერი კი შეგნებულად ფართოა — იხ. `api` ქვემოთ.
     *
     * ⚠️ **გასაღები `user_id`-ია და არა IP** ყველგან, სადაც სესია არსებობს:
     * ერთი ბრაუზერიდან ორი ანგარიში ერთმანეთს ჭერს არ უნდა ჭამდეს, და
     * პირიქით — NAT-ის უკან მჯდომი ორი მომხმარებელი ერთმანეთს არ უნდა
     * ბლოკავდეს. ავტორიზაციამდე კი `user_id` არ არსებობს, ე.ი. იქ IP-ია.
     */
    private function rateLimiters(): void
    {
        /*
         * **ავტორიზაცია — 5 მცდელობა წუთში.**
         *
         * ⚠️ გასაღები **IP + login** ერთად არის და არა მხოლოდ ერთი:
         * მარტო IP-ზე NAT-ის უკან მჯდომ ოფისს ერთი ადამიანი დაბლოკავდა,
         * მარტო login-ზე კი ერთი პაროლის ათას ანგარიშზე მორგება
         * (credential stuffing) ჭერს საერთოდ ვერ შეხვდებოდა.
         */
        RateLimiter::for('login', fn (Request $r) => [
            Limit::perMinute(5)->by('login-ip:'.$r->ip()),
            Limit::perMinute(5)->by('login-id:'.mb_strtolower((string) $r->input('login', ''))),
        ]);

        /*
         * **გლობალური ჭერი — 600 მოთხოვნა წუთში ანგარიშზე.**
         *
         * ⚠️ **განზრახ ფართოა.** SPA-ს რიგი (`ui/queue.tsx`) ჩანაწერს
         * ჩანაწერზე აგზავნის `syncDelayMs`-ის პაუზით, რომლის ნაგულისხმევი
         * **200 ms**-ია — ე.ი. სინქრონის/გალერეის ნორმალური გაშვება
         * წუთში ~300 მოთხოვნაა. მკაცრი ჭერი აქ ბოროტად გამოყენებას კი
         * არა, **ჩვეულებრივ სამუშაოს** გატეხდა. 600 ორმაგი მარაგია და
         * მაინც აჩერებს გაქცეულ სკრიპტს.
         */
        RateLimiter::for('api', fn (Request $r) => $r->user()
            ? Limit::perMinute(600)->by('u:'.$r->user()->getAuthIdentifier())
            : Limit::perMinute(60)->by('ip:'.$r->ip()));

        /*
         * **ვებ-ძებნა — 20 წუთში.** ყოველი გამოძახება ან SerpApi-ს
         * კრედიტს ხარჯავს, ან Serper-ის გვერდს (თითო გვერდი = კრედიტი).
         * ძებნა ყოველთვის ცხადი ღილაკია და არასდროს ფონური — ე.ი. 20
         * ადამიანისთვის მიუწვდომელი ჭერია და სკრიპტისთვის — ნამდვილი.
         */
        RateLimiter::for('web-search', fn (Request $r) => Limit::perMinute(20)
            ->by('u:'.($r->user()?->getAuthIdentifier() ?? $r->ip())));

        /*
         * **თარგმანი — 30 წუთში.** Gemini-ის უფასო დონე ~15 RPM-ს უშვებს
         * და `translateDelayMs`-ის ნაგულისხმევი (4000 ms) ზუსტად ამას
         * ეხმიანება. ორმაგი მარაგი იმისთვის, რომ ორმა ტაბმა ერთმანეთს
         * ცრუ 429 არ დააყენოს — ნამდვილ ლიმიტს `TranslationUsage` იცავს.
         */
        RateLimiter::for('translate', fn (Request $r) => Limit::perMinute(30)
            ->by('u:'.($r->user()?->getAuthIdentifier() ?? $r->ip())));

        /*
         * **ვიდეოს ჩამოწერის დაწყება — 10 წუთში.** ერთი გაშვება წუთებია
         * და გიგაბაიტები; ათი უკვე ბევრად მეტია, ვიდრე ადამიანს დასჭირდება.
         */
        RateLimiter::for('download', fn (Request $r) => Limit::perMinute(10)
            ->by('u:'.($r->user()?->getAuthIdentifier() ?? $r->ip())));

        /*
         * **ალბომის პაროლი — 10 მცდელობა წუთში ალბომზე (2026-09-16).**
         *
         * ⚠️ ეს ერთადერთი ადგილია, სადაც *პაროლი* მოწმდება `login`-ის გარდა,
         * ე.ი. ჭერის გარეშე ოთხნიშნა კოდს სკრიპტი წუთებში გატეხდა.
         *
         * ⚠️ გასაღები **user + ალბომი** ერთად: ერთ ალბომზე შეცდომა მეორეს
         * არ კეტავს, თორემ ერთი დავიწყებული პაროლი მთელ გალერეას გაყინავდა.
         */
        RateLimiter::for('album-unlock', function (Request $r) {
            /* ⚠️ `route()` აქ **მოდელია და არა id**: route-middleware
               `SubstituteBindings`-ის შემდეგ მუშაობს, ე.ი. პირდაპირი
               კონკატენაცია ობიექტის სტრიქონად ქცევას ცდილობდა. */
            /* ⚠️ საჯარო როუტზე პარამეტრი **`album`-ია და არა `galleryAlbum`**
               (Tasks §7.13): იქ მოდელი განზრახ არ იბმება, თორემ
               `EnsureRecordOwnership` უცხოს ყოველთვის 404-ს დაუბრუნებდა. */
            $album = $r->route('galleryAlbum') ?? $r->route('album');
            $id = is_object($album) ? ($album->id ?? '') : $album;

            return Limit::perMinute(10)
                ->by('album-unlock:'.($r->user()?->getAuthIdentifier() ?? $r->ip()).':'.$id);
        });
    }
}
