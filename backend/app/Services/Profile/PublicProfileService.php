<?php

namespace App\Services\Profile;

use App\Models\Module;
use App\Models\Playlist;
use App\Models\User;
use App\Support\PublicDomain;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Facades\DB;
use WeakMap;

/**
 * **Tasks §16.1 — საჯარო პროფილის ერთადერთი წყარო.**
 *
 * ყველა საჯარო query აქ იწერება, რომ „რა ჟონავს გარეთ" ერთ ფაილში იკითხებოდეს.
 *
 * ⚠️ **`withoutGlobalScope('owner')` აქ სავალდებულოა და ორი მიზეზით.**
 * `BelongsToUser`-ის global scope `owner` ჩანაწერებს **მიმდინარე** user-ზე ჭრის:
 *  · ავტორიზაციის გარეშე `Auth::id()` ცარიელია → scope საერთოდ არ მუშაობს და
 *    query **ყველა მომხმარებლის** ჩანაწერს დააბრუნებდა;
 *  · შესული user-ისთვის კი scope **მის საკუთარ** ბიბლიოთეკაზე მოჭრიდა და სხვისი
 *    პროფილი ცარიელი გამოჩნდებოდა.
 * ორივეს ერთი პასუხი აქვს: scope ვხსნით და `user_id`-ს **ცხადად** ვწერთ.
 *
 * **სამი ფენა უნდა დაემთხვეს**, რომ ჩანაწერი გამოჩნდეს:
 *  1. `users.profile_visibility = 'public'` (თვითონ პროფილი);
 *  2. `module_user.is_public = true` **და** მოდული ჩართული (პერ-მოდულური, 16.1);
 *  3. `<record>.visibility = 'public'` (პერ-ჩანაწერული, 16.1).
 */
class PublicProfileService
{
    /** რამდენი ჩანაწერი მოდის ერთ გვერდზე */
    public const PER_PAGE = 24;

    /**
     * `user_id` => მისი საჯარო დომენები (ერთი რექვესთის სიცოცხლე, Tasks PERF-06).
     *
     * ⚠️ **გასაღები მიმდინარე `Request`-ია და არა ეს ინსტანცია** (Tasks §37.7,
     * `PublicGallery::remember()`-ის §32-ის გაკვეთილი). აქამდე docblock ამბობდა
     * „სერვისი რექვესთზე ერთხელ იქმნება, ე.ი. მემო თავისით ცხრება" — ეს
     * სიმართლე არ არის: `Route::getController()` კონტროლერს **მარშრუტზე**
     * იმახსოვრებს, ე.ი. ტესტში (და Octane-ზე) მომდევნო მოთხოვნა იმავე სერვისს და
     * იმავე მემოს იღებდა. ურნაში გადატანილი საჯარო მოდული ამიტომ მეორე
     * მოთხოვნაზე ისევ პროფილზე ჩანდა. ⚠️ სტატიკური კი არასდროს — ის პროცესს
     * მთლიანად გადაყვებოდა (`AlbumLock`-ის ძველი ხაფანგი).
     *
     * @var WeakMap<object, array<int, list<string>>>|null
     */
    private ?WeakMap $domainsMemo = null;

    /** მემოს მიმდინარე ნაწილი — მოთხოვნით (CLI-ზე ინსტანციით) */
    private function domainsScope(): object
    {
        return app()->bound('request') ? app('request') : $this;
    }

    /**
     * პროფილი username-ით — **მხოლოდ საჯარო და აქტიური**.
     * არასაჯარო პროფილი `null`-ია, ე.ი. კონტროლერისთვის 404: „არსებობს, უბრალოდ
     * დამალულია" თვითონაც ინფორმაციაა.
     */
    /**
     * **ჩართულია თუ არა საჯარო პროფილების მექანიზმი** — `PUBLIC_PROFILES`.
     *
     * ⚠️ **გადამრთველს ერთი მკითხველი უნდა ჰყავდეს** (Tasks GAP-07). სანამ
     * ის მხოლოდ `resolve()`-ში იყო, `MatchService::ranking()` მას გვერდს
     * უვლიდა (ის username-ით არავის ეძებს), ე.ი. გამორთულ გადამრთველზეც
     * `/people` ყველა საჯარო პროფილს და მისი ბიბლიოთეკის დომენურ ჭრილს
     * აჩვენებდა — მაშინ, როცა docblock-ი „ერთი გადამრთველი მთელ მექანიზმს
     * თიშავს"-ს ჰპირდებოდა.
     */
    public function enabled(): bool
    {
        return (bool) config('mediary.public_profiles');
    }

    public function resolve(string $username): ?User
    {
        if (! $this->enabled()) {
            return null;
        }

        return User::where('username', $username)
            ->where('profile_visibility', 'public')
            ->where('is_active', true)
            ->first();
    }

    /**
     * პროფილზე გამოსატანი დომენები.
     *
     * მოდული უნდა იყოს აქტიური, user-ისთვის ჩართული (`is_hidden = false`) და
     * ცხადად საჯარო (`is_public = true`). ერთი მოდული რამდენიმე დომენს იძლევა —
     * `song` აჩენს სიმღერებსაც და პლეილისტებსაც.
     *
     * ⚠️ super_admin-ს pivot-ის რიგი შეიძლება საერთოდ არ ჰქონდეს (მოდულები
     * მას იმპლიციტურად აქვს). აქ ეს **სასურველი** ქცევაა: რიგის გარეშე
     * `is_public` არ არსებობს, ე.ი. არაფერი ჩანს, სანამ თვითონ არ ჩართავს.
     *
     * ⚠️ **პასუხი ერთი რექვესთის ფარგლებში ემახსოვრდება (Tasks PERF-06).** ეს
     * ოპტიმიზაცია არაა, არამედ იმ ფორმის გამოსწორება, რომელშიც ის იძახება:
     * `MatchService::ranking()` თითო კანდიდატზე `domains($me, $other)`-ს
     * ეკითხება, ე.ი. `MAX_PROFILES = 50`-ზე **ერთი და იგივე** `module_user`
     * join 50-ჯერ სრულდებოდა. `records()`-ს მემო ჰქონდა, ამას — არა.
     *
     * ⚠️ **გასაღები `user_id`-ია და არა ობიექტი**: ერთი და იმავე ანგარიშის ორი
     * `User` ინსტანცია ბაზაში ერთსა და იმავეს ხედავს. ⚠️ სამაგიეროდ ეს ნიშნავს,
     * რომ **ერთ რექვესთში** მოდულის საჯაროობის შეცვლის შემდეგ პასუხი ძველია —
     * დღეს ეს უსაფრთხოა, რადგან ყველა გამომძახებელი მხოლოდ *კითხულობს*
     * (`PublicProfileController`, `MatchService`, `PublicGallery`); ჩამწერი
     * გამომძახებელი რომ გამოჩნდეს, მას მემოს გასუფთავება მოუწევს.
     *
     * @return list<string> დომენების key-ები `PublicDomain::DOMAINS`-ის რიგით
     */
    public function domains(User $user): array
    {
        $id = (int) $user->id;
        $this->domainsMemo ??= new WeakMap;
        $scope = $this->domainsScope();
        $bag = $this->domainsMemo[$scope] ?? [];

        if (isset($bag[$id])) {
            return $bag[$id];
        }

        // ⚠️ რელაცია `Module`-ის `trash` scope-ს ატარებს — ურნაში მყოფი მოდული (§37.7) აქ არ ჩანს
        $publicModules = $user->modules()
            ->where('modules.is_active', true)
            ->wherePivot('is_public', true)
            ->wherePivot('is_hidden', false)
            ->pluck('modules.key')
            ->all();

        $bag[$id] = $this->domainsOf($publicModules);
        $this->domainsMemo[$scope] = $bag;

        return $bag[$id];
    }

    /**
     * **ბევრი პროფილის დომენები ერთ query-ში (Tasks PERF-06).**
     *
     * ⚠️ მარტო მემო არ კმაროდა: `ranking()` 50 კანდიდატზე მაინც 50-ჯერ
     * ეკითხებოდა `module_user`-ს — თითო კანდიდატზე ერთხელ. აქ სიას ერთი
     * `whereIn` კითხულობს, ე.ი. query-ების რიცხვი კანდიდატთა რაოდენობაზე
     * აღარ არის დამოკიდებული.
     *
     * ⚠️ **რიგის გარეშე დარჩენილ user-ს ცარიელი სია ეწერება** და არა „არაფერი":
     * თორემ `domains()` მასზე ისევ ცალკე query-ს გააკეთებდა და ჭერი
     * დაბრუნდებოდა — უარყოფითი პასუხიც პასუხია.
     *
     * @param  iterable<int, User>  $users
     */
    public function warmDomains(iterable $users): void
    {
        $this->domainsMemo ??= new WeakMap;
        $scope = $this->domainsScope();
        $bag = $this->domainsMemo[$scope] ?? [];

        $ids = [];
        foreach ($users as $user) {
            $id = (int) $user->id;
            if (! isset($bag[$id])) {
                $ids[$id] = $id;
            }
        }

        if ($ids === []) {
            return;
        }

        $byUser = [];

        /* ⚠️ **§37.7 — `DB::table()` global scope-ს არ ატარებს**, ე.ი. ურნაში
           მყოფი საჯარო მოდული აქ ცხადად იჭრება: სხვაგვარად `/people`-ის რეიტინგი
           მას ისევ ითვლიდა, მაშინ როცა პროფილი (`domains()`) უკვე აღარ. */
        DB::table('module_user')
            ->join('modules', 'modules.id', '=', 'module_user.module_id')
            ->whereNull('modules.trashed_at')
            ->where('modules.is_active', true)
            ->where('module_user.is_public', true)
            ->where('module_user.is_hidden', false)
            ->whereIn('module_user.user_id', array_values($ids))
            ->get(['module_user.user_id', 'modules.key'])
            ->each(function ($row) use (&$byUser) {
                $byUser[(int) $row->user_id][] = $row->key;
            });

        foreach ($ids as $id) {
            $bag[$id] = $this->domainsOf($byUser[$id] ?? []);
        }

        $this->domainsMemo[$scope] = $bag;
    }

    /**
     * საჯარო მოდულების სია → დომენების სია.
     *
     * ⚠️ ერთი ფუნქცია ორივე გზისთვის (`domains()` და `warmDomains()`): ორი ასლი
     * იმ დღეს დაშორდებოდა, როცა ერთი მოდული მეორე დომენს გააჩენს.
     *
     * @param  list<string>  $publicModules
     * @return list<string>
     */
    private function domainsOf(array $publicModules): array
    {
        return [
            ...array_values(array_filter(
                PublicDomain::keys(),
                fn (string $d) => in_array(PublicDomain::module($d), $publicModules, true),
            )),
            /* §37.4 — პირადი მოდული თავისი დომენია (გასაღებით), საბაზისოების
               შემდეგ. ⚠️ ფორმით და არა რუკით: მფლობელის `module_user`-ის რიგი
               უკვე ამბობს, რომ მოდული მისია და საჯაროა. */
            ...array_values(array_filter($publicModules, PublicDomain::isCustom(...))),
        ];
    }

    /**
     * ერთი დომენის საჯარო ჩანაწერების query.
     * ⚠️ ერთადერთი ადგილი, სადაც სამივე ფენა ერთდება — იხ. კლასის docblock.
     */
    public function query(User $user, string $domain): Builder
    {
        // §37.4 — `PublicDomain::query()`: პირადი მოდულის ჩანაწერი მოდულითაც იჭრება
        $q = PublicDomain::query($domain)->withoutGlobalScope('owner');

        // ცხრილის პრეფიქსი განზრახ: `series`-ს სხვა ცხრილი აქვს, ვიდრე კლასის სახელი,
        // და join-ის დამატება მოგვიანებით ორაზროვან `user_id`-ს გააჩენდა
        $q->where($q->getModel()->getTable().'.user_id', $user->id)
            ->where('visibility', 'public');

        /* §37.4 — `custom` ფსევდო-დომენი (დამთხვევა): ყველა **საჯარო** პირადი
           მოდული ერთად. ⚠️ მოდულის ფენა (`module_user.is_public`) აქ ამ სიით
           მოწმდება — საჯარო ჩანაწერი დამალულ მოდულში ისევ არ ჩანს. */
        if ($domain === PublicDomain::CUSTOM) {
            $q->whereIn(
                $q->getModel()->getTable().'.module',
                array_values(array_filter($this->domains($user), PublicDomain::isCustom(...))),
            );
        }

        /* პლეილისტის ბარათი სიმღერების რაოდენობით ცოცხლობს.

           ⚠️ **რიცხვი `owner`-ის გარეშე და მფლობელის ცხადი id-ით იზომება**
           (Tasks §33.3) — ალბომის რიცხვის (§1.2) ზუსტი ტყუპი: `Song`-ის `owner`
           scope შესულ უცხოს `user_id = <მისი id>`-ით ჭრიდა და ბარათი „0
           სიმღერას" წერდა, ანონიმს კი — სწორ რიცხვს. ⚠️ რიცხვიც და სიაც
           (`playlistSongs()`) ერთი განსაზღვრიდან დგება (`ownSongs()`), ე.ი.
           ბარათზე რაც წერია, შიგნითაც ის არის. */
        if ($domain === 'playlist') {
            $this->withSongCount($q, $user);
        }

        /* ⚠️ **ალბომის რიცხვი ლოკის მიღმა იზომება** (Tasks §7.5): scope-ს
           რომ დამორჩილებოდა, ჩაკეტილი ალბომი „0 ფოტოს" იტყოდა და ბარათი
           იტყუებოდა. რიცხვი ფოტოს არ ამხელს — ამხელს გზა ფაილამდე,
           რომელიც `PublicGallery::row()`-ში საერთოდ არ იწერება.

           ⚠️ **`owner`-იც აქ იხსნება და მფლობელი ცხადად იწერება** (Tasks §1.2) —
           კლასის docblock-ის იგივე ორმხრივი მიზეზი, ოღონდ ქვე-query-ში:
           `GalleryImage`-ის `owner` scope **შესულ** უცხოს `user_id = <მისი id>`-ით
           ჭრიდა და ბარათი „0 ფოტოს" წერდა, ანონიმს კი — სწორ რიცხვს. */
        if ($domain === 'gallery_album') {
            $q->withCount(['images' => fn ($i) => $i
                ->withoutGlobalScope('album_lock')
                ->withoutGlobalScope('owner')
                ->where('gallery_images.user_id', $user->id)]);
        }

        return $q->orderByDesc('id');
    }

    /**
     * ერთი საჯარო ფლეილისტი (Tasks §33.1) — იგივე სამი ფენა, რაც ბარათების
     * სიას (`query()`), სიმღერების რიცხვიანად. ურნაში მყოფი `null`-ია.
     */
    public function playlist(User $user, int $id): ?Playlist
    {
        /** @var ?Playlist */
        return $this->query($user, 'playlist')->find($id);
    }

    /**
     * **საჯარო ფლეილისტის სიმღერები, მისივე რიგით (Tasks §33.1).**
     *
     * ⚠️ **პირადი სიმღერაც ჩანს** (Q24): ფლეილისტის შიგნით სიმღერა მშობლის
     * ხილვადობას იღებს — გალერეის ფოტოს იგივე წესი. „სიმღერების" ჩანართი კი
     * (`query($user, 'song')`) ისევ მხოლოდ თავად საჯაროს აჩვენებს, ე.ი. ერთი
     * ფლეილისტის გაზიარება მთელ მუსიკალურ ბიბლიოთეკას არ ხსნის.
     *
     * ⚠️ **დამთხვევებში (§16.2) ეს სია არ მონაწილეობს**: `MatchService`
     * `query()`-ს კითხულობს, ე.ი. ფლეილისტით გამჟღავნებული პირადი სიმღერა
     * „ორივეს გვაქვს"-ში არ ითვლება.
     *
     * რიგი `Playlist::songs()`-ისაა (pivot-ის `sort_order`) — ერთი და იგივე
     * სიმღერა სხვადასხვა ფლეილისტში სხვა ადგილზე დგას.
     */
    public function playlistSongs(User $user, Playlist $playlist): BelongsToMany
    {
        return $this->ownSongs($playlist->songs(), $user);
    }

    /**
     * პლეილისტების query-ს სიმღერების რიცხვი (`songs_count`) — საჯარო პროფილიც
     * და გაზიარების ბმულიც (§40.13) ამ ერთ განსაზღვრას კითხულობს.
     */
    public function withSongCount(Builder $playlists, User $user): Builder
    {
        return $playlists->withCount(['songs' => fn (Builder $songs) => $this->ownSongs($songs, $user)]);
    }

    /**
     * მფლობელის სიმღერები — **რიცხვისა და სიის ერთი განსაზღვრა**.
     *
     * ⚠️ `owner` იხსნება (კლასის docblock-ის ორმხრივი მიზეზი) და მფლობელი
     * ცხადად იწერება; `trash` კი რჩება — ურნაში გადატანილი სიმღერა არც ჩანს და
     * არც ითვლება. ⚠️ `songs.user_id` თავდაცვის მეორე ფენაა: pivot-ში სხვისი
     * სიმღერა `PlaylistController::orderedPivot()`-ის გამო ვერ ხვდება, მაგრამ
     * ავტორიზაციის გარეშე მდგომი პასუხი ამ დაშვებაზე არ უნდა იდგეს.
     *
     * @template T of Builder|BelongsToMany
     *
     * @param  T  $songs
     * @return T
     */
    private function ownSongs(Builder|BelongsToMany $songs, User $user): Builder|BelongsToMany
    {
        return $songs->withoutGlobalScope('owner')->where('songs.user_id', $user->id);
    }

    /**
     * რაოდენობები დომენებზე — პროფილის თავის სტატისტიკა.
     *
     * @return array<string, int>
     */
    public function stats(User $user, ?array $domains = null): array
    {
        $out = [];

        foreach ($domains ?? $this->domains($user) as $domain) {
            $out[$domain] = $this->query($user, $domain)->count();
        }

        return $out;
    }

    /** მოდულების მეტამონაცემი (სახელი/ხატულა) იმ დომენებისთვის, რაც ჩანს */
    public function moduleMeta(array $domains): array
    {
        $keys = array_unique(array_map(PublicDomain::module(...), $domains));

        return Module::whereIn('key', $keys)
            ->get(['key', 'name_ka', 'name_en', 'icon', 'color'])
            ->keyBy('key')
            ->map(fn (Module $m) => [
                'name_ka' => $m->name_ka,
                'name_en' => $m->name_en,
                'icon' => $m->icon,
                // ⚠️ ფერი საჯარო პროფილის ჭრილის ბარათს სჭირდება (Tasks §2):
                // მოდულის იდენტობა ისედაც გამოჩნდება — ხატულა უკვე აქაა
                'color' => $m->color,
            ])
            ->all();
    }

    /** პროფილის თავი — მხოლოდ ის, რაც უცხო თვალს შეიძლება დაენახოს */
    public function header(User $user): array
    {
        return [
            'username' => $user->username,
            'display_name' => $user->displayName(),
            'avatar_path' => $user->avatar_path,
            'bio' => $user->bio,
            'joined_at' => $user->created_at?->toIso8601String(),
        ];
    }
}
