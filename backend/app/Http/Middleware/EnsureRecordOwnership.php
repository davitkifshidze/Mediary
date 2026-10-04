<?php

namespace App\Http\Middleware;

use App\Models\Concerns\BelongsToUser;
use App\Support\RecordLocks;
use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

/**
 * **მფლობელობის მეორე ფენა (აუდიტი 2026-09-14, §A5).**
 *
 * ⚠️ **ჩვიდმეტი policy კლასი დაწერილი იყო და არასდროს გამოიძახებოდა.**
 * `grep -rn "authorize(\|Gate::\|->can(" app/Http/Controllers` **0 შედეგს**
 * აბრუნებდა, ე.ი. `CLAUDE.md`-ის დაპირებული „მეორე ფენა" არ არსებობდა:
 * მფლობელობას მხოლოდ `BelongsToUser`-ის global scope იცავდა. ის 94 ადგილას
 * ცხადად ითიშება (`withoutGlobalScope('owner')`) და დღეს ყველა 94 სწორია —
 * მაგრამ 95-ე დავიწყებას ვერაფერი დაიჭერდა.
 *
 * ⚠️ **რატომ middleware და არა `$this->authorize()` ასეულ კონტროლერში.**
 * ცხადი გამოძახება იმას ნიშნავს, რომ **ერთ ახალ endpoint-ზე დავიწყება
 * ხვრელია** — ზუსტად ის პრობლემა, რომლის გამოც აუდიტ-ლოგი observer-ის ერთი
 * ციკლით ებმევა და არა კონტროლერებში ხელით. აქ კარიბჭე მარშრუტების მთელ
 * ჯგუფზე დგას: მოდელი route-ს მიება — ე.ი. შემოწმდა.
 *
 * ⚠️ **`SubstituteBindings`-ის შემდეგ უნდა გაეშვას** — მანამდე პარამეტრები
 * ჯერ კიდევ სტრიქონებია და ციკლს შესამოწმებელი არაფერი ექნებოდა. ამიტომ
 * `bootstrap/app.php`-ში `api(append: …)`-ით ემატება და არა `prepend`-ით.
 *
 * ⚠️ **პასუხი 404-ია და არა 403** — პროექტის არსებული წესი („ეს ჩანაწერი
 * არსებობს" თვითონაც ინფორმაციაა). ზუსტად ისე, როგორც
 * `VideoDownloadController::show()` და `NoteEntryFileController::show()`
 * აკეთებენ ხელით.
 *
 * ⚠️ **ორი შესამოწმებელი ჯგუფია და ორივე საჭიროა:**
 *  · **policy-იანი მოდელი** — პასუხს Gate აძლევს, ე.ი. დომენს მომავალში
 *    საკუთარი წესის დაწერა შეუძლია;
 *  · **`BelongsToUser`-იანი მოდელი policy-ის გარეშე** — სექციების ფაილები,
 *    ჩანიშვნები, გალერეის ფოტოები, შეხსენებები (40-ზე მეტი მოდელი).
 *    მათთვის ცალკე policy-ების დაწერა ორმოცი თითქმის ცარიელი ფაილი იქნებოდა,
 *    შემოწმების გამოტოვება კი — ხვრელი სწორედ იქ, სადაც ის ყველაზე ნაკლებად
 *    ჩანს.
 *
 * ⚠️ **დანარჩენი მოდელები განზრახ გამოტოვებულია** და ეს არ არის დაუდევრობა:
 * `Genre`/`CastMember`/`Module`/`Role` **გლობალური ლექსიკონებია** (მფლობელი
 * არ ჰყავთ), `Conversation`/`Message` კი **მონაწილეობაზე** მოწმდება და არა
 * მფლობელობაზე — საუბარი განსაზღვრებით ორისაა (`ChatController`-ის ცხადი
 * `abort_unless`). `User` ადმინის მარშრუტებზე იბმევა და იქ `admin_access`
 * წყვეტს წვდომას.
 */
class EnsureRecordOwnership
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return $next($request);
        }

        foreach ($request->route()?->parameters() ?? [] as $parameter) {
            if (! $parameter instanceof Model) {
                continue;
            }

            if (! $this->allowed($parameter, $request)) {
                abort(404);
            }

            /* **Tasks §35.4 — დამალული ჩანაწერი (Q9).** მისამართი მას პოულობს
               (`HidesLockedRecords::resolveRouteBindingQuery()`), რომ გვერდმა
               ბოქლომი დახატოს; დანარჩენი კარი — რედაქტირება, წაშლა, სტატუსი,
               გალერეა, კოლექცია — 423-ია, ჯერ გახსნა. ⚠️ ერთ ადგილას და არა თითო
               კონტროლერში: ახალ endpoint-ზე დავიწყება ხვრელი იქნებოდა. */
            if (RecordLocks::hiddenRecord($parameter) && ! $this->openWhenHidden($request)) {
                abort(423, 'record_locked');
            }
        }

        return $next($request);
    }

    /**
     * დამალულზე მხოლოდ თვითონ ჩანაწერის გვერდია ღია — `GET …/{record}`, ბოლო
     * სეგმენტი პარამეტრია (`GET /movies/{movie}/collection` კი აღარ). პასუხი
     * ბოქლომიანი ბარათია (`lockedCard()`). ლოკის კარები `{type}/{id}`-ზეა და
     * მიბმას საერთოდ არ იყენებს.
     */
    private function openWhenHidden(Request $request): bool
    {
        if (! $request->isMethod('GET')) {
            return false;
        }

        $segments = explode('/', (string) $request->route()?->uri());

        return str_starts_with((string) end($segments), '{');
    }

    private function allowed(Model $model, Request $request): bool
    {
        $ability = $this->abilityFor($request);

        /* ⚠️ **`Gate::forUser()` და არა `Gate::allows()`.** უპარამეტრო
           `allows()` მომხმარებელს **guard-იდან** იღებს და არა რექვესთიდან;
           ისინი ჩვეულებრივ ერთი და იგივეა, მაგრამ ეს დამთხვევაზე დაყრდნობაა
           და არა კონტრაქტი — `setUserResolver()`-ით მოწოდებულ მფლობელსაც კი
           უარს ეუბნებოდა. ცხადი მითითება იმასაც ნიშნავს, რომ middleware
           ტესტირებადია HTTP-ის მთელი სტეკის გარეშე. */
        $gate = Gate::forUser($request->user());

        // policy არსებობს → პასუხი მისია (`Gate::before` სუპერ-ადმინს ატარებს)
        if (Gate::getPolicyFor($model)) {
            return $gate->allows($ability, $model);
        }

        /* policy არ არის, მაგრამ ჩანაწერს მფლობელი ჰყავს → იგივე წესი პირდაპირ.
           ⚠️ Gate აქაც პირველია, რადგან სწორედ ის ატარებს სუპერ-ადმინს
           (`Gate::before`) — მისი ცალკე შემოწმება წესს ორ ადგილას ჩაწერდა. */
        if ($this->isOwned($model)) {
            return $gate->allows($ability, $model)
                || (int) $model->getAttribute('user_id') === (int) $request->user()->getKey();
        }

        // გლობალური ლექსიკონი ან მონაწილეობაზე შემოწმებადი — იხ. კლასის შენიშვნა
        return true;
    }

    /**
     * ⚠️ მოქმედება HTTP მეთოდიდან იგება, `EnsureModulePermission`-ის იმავე
     * წესით — `_method` spoofing-საც `getMethod()` თვითონ ითვალისწინებს.
     * POST აქ `update`-ია: ქვე-რესურსის შექმნა (`/videos/{video}/files`)
     * **მშობლის რედაქტირებაა**, და ისედაც მფლობელობაზეა საკითხი და არა
     * უფლებაზე — უფლებას `permission:` middleware ცალკე წყვეტს.
     */
    private function abilityFor(Request $request): string
    {
        return match ($request->method()) {
            'GET', 'HEAD' => 'view',
            'DELETE' => 'delete',
            default => 'update',
        };
    }

    /**
     * ჩანაწერს მფლობელი აქვს? (`BelongsToUser`-ის trait)
     *
     * ⚠️ პასუხი კლასზე იმახსოვრება: ერთ რექვესთზე რამდენიმე მოდელი შეიძლება
     * მოვიდეს და trait-ების ხე ყოველ ჯერზე ხელახლა აიგებოდა.
     */
    private function isOwned(Model $model): bool
    {
        static $cache = [];

        return $cache[$model::class] ??= in_array(
            BelongsToUser::class,
            class_uses_recursive($model),
            true,
        );
    }
}
