<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Module;
use App\Services\Calendar\Upcoming;
use Illuminate\Http\Request;

/**
 * **FEAT-10 — „მალე" (`GET /api/upcoming?days=`).**
 *
 * ⚠️ **ერთი რექვესთი ყველა მოდულზე** — დეშბორდის ერთი ბლოკი ოთხ სიას
 * ერთად ხატავს, ოთხი ცალკე მოთხოვნა კი მთავარი გვერდის გახსნას
 * გააძვირებდა.
 *
 * ⚠️ **`module:`/`permission:` middleware განზრახ არ ადევს**: პასუხი
 * რამდენიმე მოდულს ეხება ერთდროულად და ჩაურთველი სიიდან თვითონ ცვივა —
 * `/stats`-ისა და `GlobalSearch`-ის იგივე წესი.
 */
class UpcomingController extends Controller
{
    public function __construct(private readonly Upcoming $upcoming) {}

    public function index(Request $request)
    {
        $data = $request->validate([
            'days' => ['nullable', 'integer', 'min:1', 'max:'.Upcoming::MAX_DAYS],
        ]);

        $user = $request->user();
        $days = (int) ($data['days'] ?? Upcoming::DEFAULT_DAYS);

        $modules = Module::where('is_active', true)
            ->whereIn('key', Upcoming::modules())
            ->get()
            ->filter(fn (Module $m) => $user->hasModule($m->key) && $user->hasPermission($m->key, 'view'))
            ->pluck('key')
            ->all();

        return response()->json([
            'days' => $days,
            'data' => $this->upcoming->events($user, $modules, $days),
        ]);
    }
}
