<?php

namespace App\Services\Import;

use App\Models\Module;
use App\Models\User;
use App\Support\CustomModules;
use App\Support\ExportDomain;

/**
 * **Tasks §59.6 — ფაილის მოდული → ჩემი მოდული.**
 *
 * საბაზისო მოდული თავისი გასაღებით მოდის. ⚠️ **პირადი მოდულის გასაღები
 * ანგარიშზეა მიბმული** (`c{owner}-{slug}`): სხვა ანგარიშზე (ან სხვა სერვერზე)
 * იგივე გასაღები ან არ არსებობს, ან სხვისია. ამიტომ: ჯერ ზუსტი გასაღები,
 * თუ ჩემია; შემდეგ ჩემი პირადი მოდული **იმავე სახელით**; სხვაგვარად —
 * `custom_module_missing` (ჯერ შექმენი იმავე სახელით). სხვისი პირადი მოდული
 * არასდროს — ჩანაწერი ჩემს ბიბლიოთეკაში ჯდება.
 *
 * ⚠️ **წვდომა და უფლება აქ მოწმდება და არა middleware-ით** — მოდული ფაილის
 * შიგთავსიდან ირკვევა (FEAT-07-ის წესი): ჩართული მოდული + `create`.
 */
class MediaryTargets
{
    /**
     * @param  array<string, mixed>  $envelope  ფაილის კონვერტი (პირადი მოდულის სახელისთვის)
     * @return array{module: ?string, reason: ?string}
     */
    public function resolve(User $user, string $source, array $envelope): array
    {
        if (CustomModules::isKey($source)) {
            $module = CustomModules::owns($user, $source) ? $source : $this->byName($user, $envelope);

            if ($module === null) {
                return ['module' => null, 'reason' => 'custom_module_missing'];
            }
        } elseif (isset(ExportDomain::MODULES[$source])) {
            $module = $source;
        } else {
            return ['module' => null, 'reason' => 'module_unknown'];
        }

        if (! $user->hasModule($module)) {
            return ['module' => $module, 'reason' => 'module_disabled'];
        }

        if (! $user->hasPermission($module, 'create')) {
            return ['module' => $module, 'reason' => 'forbidden'];
        }

        return ['module' => $module, 'reason' => null];
    }

    /** ჩემი პირადი მოდული იმავე სახელით (ქართული ან ინგლისური) */
    private function byName(User $user, array $envelope): ?string
    {
        $names = array_values(array_filter(
            [$envelope['name_ka'] ?? null, $envelope['name_en'] ?? null],
            fn ($name) => is_string($name) && trim($name) !== '',
        ));

        if ($names === []) {
            return null;
        }

        $needles = array_map(fn (string $name) => mb_strtolower(trim($name)), $names);

        return CustomModules::of($user)
            ->first(fn (Module $m) => in_array(mb_strtolower(trim((string) $m->name_ka)), $needles, true)
                || in_array(mb_strtolower(trim((string) $m->name_en)), $needles, true))
            ?->key;
    }
}
