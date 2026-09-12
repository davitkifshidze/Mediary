<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Profile\MatchService;
use App\Services\Profile\PublicProfileService;
use App\Support\PublicDomain;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * **Tasks §16.2 — დამთხვევები ორ საჯარო პროფილს შორის.**
 *
 * ⚠️ **ეს endpoint-ები `auth:sanctum`-ის შიგნითაა**, განსხვავებით საჯარო
 * პროფილისგან (16.1): შედარებას „მეორე მხარე" სჭირდება და ის მიმდინარე
 * user-ია. ანონიმური სტუმარი პროფილს ხედავს, დამთხვევებს — ვერა.
 *
 * ⚠️ **ორივე პროფილი საჯარო უნდა იყოს** — §16.2 პირდაპირ წერს „ორ **საჯარო**
 * პროფილს შორის". ეს არა მხოლოდ ფორმალობაა: ჩემი პრივატული ჩანაწერებით
 * გამოთვლილი რიცხვი მეორე მხარესაც იმავე რიცხვს დაანახებდა (შედარება
 * სიმეტრიულია), ე.ი. ჩემი პირადი ბიბლიოთეკის ზომა აგრეგატულად გაჟონავდა.
 * თუ ჩემი პროფილი დახურულია, ვაბრუნებთ **409 `profile_not_public`**-ს —
 * ცალსახად გასარჩევი მდგომარეობაა და არა „ვერაფერი მოიძებნა".
 */
class MatchController extends Controller
{
    public function __construct(
        private PublicProfileService $profiles,
        private MatchService $matches,
    ) {}

    /**
     * **„ვისთან ჰგავს ჩემი გემოვნება"** (§16.2) — საჯარო პროფილების კატალოგი
     * მსგავსების რეიტინგით + ძებნა.
     *
     * ⚠️ იგივე წესი, რაც წყვილურ შედარებას: **ჩემი პროფილი საჯარო უნდა იყოს**
     * (409 `profile_not_public`). სხვაგვარად ჩემი პირადი ბიბლიოთეკიდან
     * გამოთვლილ რიცხვს ათეული სხვა პროფილი მიიღებდა.
     */
    public function index(Request $request)
    {
        $me = $request->user();

        if ($me->profile_visibility !== 'public') {
            return response()->json(['message' => 'profile_not_public'], 409);
        }

        $data = $request->validate(['q' => ['nullable', 'string', 'max:80']]);

        $result = $this->matches->ranking($me, $data['q'] ?? null);

        return response()->json($result + [
            // ბარათზე დომენის სახელი/ხატულა რომ ჩანდეს
            'modules' => $this->profiles->moduleMeta(PublicDomain::matchable()),
            'max_profiles' => MatchService::MAX_PROFILES,
        ]);
    }

    /** ჯამური სურათი — დომენებად და ერთი საერთო პროცენტი */
    public function show(Request $request, string $username)
    {
        [$me, $other, $error] = $this->pair($request, $username);

        if ($error) {
            return $error;
        }

        return response()->json([
            'profile' => $this->profiles->header($other),
        ] + $this->matches->summary($me, $other) + [
            'modules' => $this->profiles->moduleMeta($this->matches->domains($me, $other)),
        ]);
    }

    /** ერთი დომენის საერთო ჩანაწერები, ორივე მხარის სტატუსით/ქულით */
    public function items(Request $request, string $username, string $domain)
    {
        [$me, $other, $error] = $this->pair($request, $username);

        if ($error) {
            return $error;
        }

        abort_unless(PublicDomain::isMatchable($domain), 404);

        return response()->json(['data' => $this->matches->items($me, $other, $domain)]);
    }

    /**
     * ორივე მხარის გარკვევა ერთ ადგილას — თორემ ორ მეთოდს შორის ერთი
     * შემოწმება ადრე თუ გვიან დაიკარგებოდა.
     *
     * @return array{0: ?User, 1: ?User, 2: ?JsonResponse}
     */
    private function pair(Request $request, string $username): array
    {
        $me = $request->user();
        $other = $this->profiles->resolve($username);

        // არასაჯარო/არარსებული პროფილი — 404 (16.1-ის იგივე წესი)
        abort_unless($other, 404);

        if ($other->id === $me->id) {
            return [null, null, response()->json(['message' => 'cannot_match_self'], 422)];
        }

        if ($me->profile_visibility !== 'public') {
            return [null, null, response()->json(['message' => 'profile_not_public'], 409)];
        }

        return [$me, $other, null];
    }
}
