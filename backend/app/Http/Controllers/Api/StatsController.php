<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Module;
use App\Services\Stats\LibraryStats;
use Illuminate\Http\Request;

/**
 * **FEAT-08 — სტატისტიკა.**
 *
 * `GET /api/stats?year=` — ყველა ჩართული მოდულის ჭრილები ერთ პასუხში.
 *
 * ⚠️ **ეს დეშბორდს არ ცვლის და არც მისი გაფართოებაა.** დეშბორდი
 * „რა მაქვს და სად შევდივარ"-ს პასუხობს (თითო ბარათი — ერთი რიცხვი და
 * ბმული), ეს კი „რა გავაკეთე"-ს. 19.10-ის გადაწყვეტილება („ჯერ მხოლოდ
 * რაოდენობა") სწორედ ამიტომ რჩება ძალაში: ბარათზე ექვსი რიცხვი
 * ნავიგაციას გააფუჭებდა.
 *
 * ⚠️ **ერთი რექვესთი და არა თითო მოდულზე ერთი.** გვერდი ისედაც ყველა
 * ჭრილს ერთად ხატავს, ათი ცალკე მოთხოვნა კი `throttle:api`-ს ერთ
 * გახსნაზე ათით ხარჯავდა.
 *
 * ⚠️ **`module:`/`permission:` middleware განზრახ არ ადევს** — პასუხი
 * **ყველა** ჩართულ მოდულს ეხება და არა ერთს; ჩაურთველი მოდული სიიდან
 * თვითონ ცვივა, ზუსტად ისე, როგორც `GlobalSearch`-სა და დეშბორდზე.
 */
class StatsController extends Controller
{
    public function __construct(private readonly LibraryStats $stats) {}

    public function index(Request $request)
    {
        $data = $request->validate([
            'year' => ['nullable', 'integer', 'min:1900', 'max:2200'],
        ]);

        $user = $request->user();

        $modules = Module::where('is_active', true)
            ->whereIn('key', LibraryStats::modules())
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->filter(fn (Module $m) => $user->hasModule($m->key) && $user->hasPermission($m->key, 'view'))
            ->values();

        $keys = $modules->pluck('key')->all();
        $years = $this->stats->activeYears($user, $keys);

        /* ⚠️ არჩეული წელი **სიიდან** უნდა იყოს, თორემ გვერდი ცარიელ
           თვეებს დახატავდა და მიზეზს ვერ ახსნიდა. ცარიელ ბიბლიოთეკაზე
           მიმდინარე წელია — უბრალოდ ყველა თვე ნულია. */
        $year = $data['year'] ?? ($years[0] ?? (int) now()->format('Y'));

        return response()->json([
            'year' => $year,
            'years' => $years,
            'data' => $modules->map(fn (Module $m) => [
                'key' => $m->key,
                'name_ka' => $m->name_ka,
                'name_en' => $m->name_en,
                'icon' => $m->icon,
                'color' => $m->color,
                ...$this->stats->forModule($user, $m->key, $year),
            ])->all(),
        ]);
    }
}
