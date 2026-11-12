<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Cast\CastPool;
use App\Support\LockBook;
use App\Support\RecordLocks;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;

/**
 * **„ჩაკეტილები"** — ყველა ჩანაწერი, რომელზეც ჩემი პაროლი დევს, ერთ სიაში; პაროლის
 * ერთად მოხსნა და „ისევ ჩაკეტვა" ყველაზე.
 *
 * ⚠️ **ერთად მოხსნას ყოველთვის ანგარიშის პაროლი ადასტურებს** — ერთხელ მთელ
 * მონიშვნაზე, იმ ჩანაწერებზეც, რომლებიც ამ სესიაში უკვე გახსნილია. ერთი ჩანაწერის
 * კარი (`ManagesRecordLock::putLock()`) გახსნილზე პაროლს არ ითხოვს; აქ კი ერთი დაჭერა
 * ყველაფერს აშიშვლებს, ამიტომ ღია ბრაუზერთან მისულს ის არ უნდა ეყოს.
 * ⚠️ მისამართი მოდულის ჯგუფის გარეთაა (ლოკები ყველა მოდულისაა) — უფლებას თითო
 * მოდულზე აქ ვამოწმებთ: პაროლის მოხსნა ჩანაწერის რედაქტირებაა (`update`).
 * ⚠️ არასწორი პაროლი და უფლების არქონა **არაფერს** ხსნის — შემოწმება მოხსნამდეა.
 */
class LockController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => LockBook::rows()]);
    }

    public function remove(Request $request): JsonResponse
    {
        $data = $request->validate([
            'account_password' => ['required', 'string', 'max:255'],
            'ids' => ['required', 'array', 'min:1', 'max:'.LockBook::MAX],
            'ids.*' => ['integer', 'min:1'],
        ]);

        $user = $request->user();

        abort_unless(Hash::check($data['account_password'], $user->password), 422, 'account_password_wrong');

        foreach (LockBook::modulesOf($data['ids']) as $module) {
            $allowed = $module === LockBook::CAST
                ? CastPool::typesFor($user) !== []
                : $user->hasModule($module) && $user->hasPermission($module, 'update');

            if (! $allowed) {
                return response()->json(['message' => 'forbidden_permission', 'permission' => "{$module}.update"], 403);
            }
        }

        return response()->json(['removed' => LockBook::remove($data['ids'])]);
    }

    /** „ისევ ჩაკეტვა" ყველაზე — ამ სესიაში გახსნილი ყველა ჩანაწერი ისევ იმალება; პაროლები ადგილზეა */
    public function relock(): Response
    {
        RecordLocks::lockEverything();

        return response()->noContent();
    }
}
