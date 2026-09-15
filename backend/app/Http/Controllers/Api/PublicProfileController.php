<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Modules\FieldSettings;
use App\Services\Profile\PublicProfileService;
use App\Support\PublicDomain;
use Illuminate\Http\Request;

/**
 * **Tasks §16.1 — საჯარო პროფილი `/u/{username}`.**
 *
 * ⚠️ **ეს ერთადერთი დომენური endpoint-ებია, რომლებიც `auth:sanctum`-ის გარეთ დგას.**
 * გადაწყვეტილება ცხადია და უკან იხსნება: „საჯარო პროფილი" ბმულს ნიშნავს, რომელიც
 * გაზიარებადია — თუ შესვლა სჭირდება, ის უკვე „მომხმარებლებისთვის ხილვადი
 * პროფილია". სამაგიეროდ სამი დაცვის ფენა ერთდროულად უნდა იყოს ღია
 * (პროფილი → მოდული → ჩანაწერი), ყველა default-ით `private`, და მთელი მექანიზმი
 * ერთი გადამრთველით ითიშება: `PUBLIC_PROFILES=false` (`config/mediary.php`).
 *
 * ჩაწერა აქ **არაფერი ხდება** — მხოლოდ ორი GET.
 */
class PublicProfileController extends Controller
{
    public function __construct(
        private PublicProfileService $profiles,
        private FieldSettings $fields,
    ) {}

    /** პროფილის თავი: ავატარი/სახელი/ბიო + ხილვადი დომენები რაოდენობებით */
    public function show(string $username)
    {
        $user = $this->profiles->resolve($username);

        // ⚠️ არასაჯარო პროფილიც 404-ია და არა 403: „ასეთი user არსებობს,
        // უბრალოდ დამალულია" თვითონაც ინფორმაციაა.
        abort_unless($user, 404);

        $domains = $this->profiles->domains($user);

        return response()->json([
            'profile' => $this->profiles->header($user),
            'domains' => $domains,
            'counts' => $this->profiles->stats($user, $domains),
            'modules' => $this->profiles->moduleMeta($domains),
            // რომელი მოდულს ეკუთვნის დომენი — ფრონტს ტაბის სახელისთვის სჭირდება
            'domain_modules' => array_combine(
                $domains,
                array_map(PublicDomain::module(...), $domains),
            ),
        ]);
    }

    /** ერთი დომენის საჯარო ჩანაწერები, გვერდებად */
    public function items(Request $request, string $username, string $domain)
    {
        $user = $this->profiles->resolve($username);
        abort_unless($user, 404);

        abort_unless(PublicDomain::has($domain), 404);
        // მოდული საჯარო არაა → დომენი არ არსებობს ამ პროფილისთვის
        abort_unless(in_array($domain, $this->profiles->domains($user), true), 404);

        /* ⚠️ **ქვედა ზღვარიც აუცილებელია და არა მარტო ჭერი** (აუდიტი
           2026-09-14, §B4). `Builder::limit()` **უარყოფით** მნიშვნელობას
           ჩუმად უგულებელყოფს, ე.ი. `?per_page=-1` `LIMIT`-ს საერთოდ
           აშორებდა და ეს endpoint — **ავტორიზაციის გარეშე ერთადერთი
           დომენური** — მთელ საჯარო ბიბლიოთეკას ერთ პასუხში აბრუნებდა. */
        $perPage = min(max((int) $request->integer('per_page', PublicProfileService::PER_PAGE), 1), 100);

        $page = $this->profiles->query($user, $domain)->paginate($perPage);

        /* §6 ფაზა 4 — რომელი ველი დამალა **მფლობელმა** საჯარო ბარათზე.
           ერთხელ ითვლება რექვესთზე და არა თითო ჩანაწერზე. */
        $hidden = $this->fields->hiddenOnPublic($user, PublicDomain::module($domain));

        return response()->json([
            'data' => $page->getCollection()
                ->map(fn ($record) => PublicDomain::card($domain, $record, $hidden))
                ->all(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }
}
