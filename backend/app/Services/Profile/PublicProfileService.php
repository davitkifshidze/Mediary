<?php

namespace App\Services\Profile;

use App\Models\Module;
use App\Models\User;
use App\Support\PublicDomain;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

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
     * პროფილი username-ით — **მხოლოდ საჯარო და აქტიური**.
     * არასაჯარო პროფილი `null`-ია, ე.ი. კონტროლერისთვის 404: „არსებობს, უბრალოდ
     * დამალულია" თვითონაც ინფორმაციაა.
     */
    public function resolve(string $username): ?User
    {
        if (! config('mediary.public_profiles')) {
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
     * @return list<string> დომენების key-ები `PublicDomain::DOMAINS`-ის რიგით
     */
    public function domains(User $user): array
    {
        $publicModules = $user->modules()
            ->where('modules.is_active', true)
            ->wherePivot('is_public', true)
            ->wherePivot('is_hidden', false)
            ->pluck('modules.key')
            ->all();

        return array_values(array_filter(
            PublicDomain::keys(),
            fn (string $d) => in_array(PublicDomain::module($d), $publicModules, true),
        ));
    }

    /**
     * ერთი დომენის საჯარო ჩანაწერების query.
     * ⚠️ ერთადერთი ადგილი, სადაც სამივე ფენა ერთდება — იხ. კლასის docblock.
     */
    public function query(User $user, string $domain): Builder
    {
        /** @var class-string<Model> $model */
        $model = PublicDomain::model($domain);

        $q = $model::query()->withoutGlobalScope('owner');

        // ცხრილის პრეფიქსი განზრახ: `series`-ს სხვა ცხრილი აქვს, ვიდრე კლასის სახელი,
        // და join-ის დამატება მოგვიანებით ორაზროვან `user_id`-ს გააჩენდა
        $q->where($q->getModel()->getTable().'.user_id', $user->id)
            ->where('visibility', 'public');

        // პლეილისტის ბარათი სიმღერების რაოდენობით ცოცხლობს
        if ($domain === 'playlist') {
            $q->withCount('songs');
        }

        return $q->orderByDesc('id');
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
