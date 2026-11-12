<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Module;
use App\Models\User;
use App\Support\AuditRegistry;
use App\Support\AuditRules;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * **„ჟურნალის წესები" — რა იწერება, ვისზე და სად.**
 *
 * ⚠️ **`super_admin` და არა `admin_access:audit`**: წესი ყველა ანგარიშის
 * ჩაწერას ცვლის (ინსტალაციის პარამეტრია — `AdminInstallationController`-ის
 * წესი), ჟურნალის ნახვის უფლება კი ერთი სექციისაა.
 *
 * ⚠️ შენახვა **მხოლოდ შეცვლილ უჯრებს** იღებს (`state`: `on` · `off` ·
 * `inherit`) და `AuditRules::apply()`-ზე გადის — თვითონ ცვლილება ჟურნალში
 * ყოველთვის ჩანს, წესების მიუხედავად. დაცული სახეობა (ჩატის წაშლა), მოდულის
 * უჯრა მოდულის არმქონე სახეობაზე და ვადა ჩართულ უჯრაზე — 422 და არა ჩუმი
 * გამოტოვება.
 */
class AdminAuditRulesController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => $this->payload()]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'rules' => ['present', 'array', 'max:'.AuditRules::BATCH_MAX],
            'rules.*.kind' => ['required', 'string', Rule::in(array_keys(AuditRules::KINDS)), Rule::notIn(AuditRules::PROTECTED)],
            'rules.*.module' => ['nullable', 'string', Rule::in(AuditRules::moduleKeys()), $this->sibling($request, 'kind',
                fn (mixed $kind) => ! in_array($kind, AuditRules::MODULELESS, true))],
            'rules.*.user_id' => ['nullable', 'integer', Rule::in(User::query()->pluck('id')->all())],
            'rules.*.state' => ['required', 'string', Rule::in(AuditRules::STATES)],
            'rules.*.until' => ['nullable', 'string', Rule::in(AuditRules::UNTIL), $this->sibling($request, 'state',
                fn (mixed $state) => $state === 'off')],
        ]);

        AuditRules::apply($data['rules'], $request->user());

        return response()->json(['data' => $this->payload()]);
    }

    /** ველი დასაშვებია მხოლოდ მაშინ, როცა იმავე უჯრის მეორე ველი პირობას აკმაყოფილებს */
    private function sibling(Request $request, string $field, Closure $allows): Closure
    {
        return function (string $attribute, mixed $value, Closure $fail) use ($request, $field, $allows) {
            $index = explode('.', $attribute)[1] ?? '';

            if (! $allows($request->input("rules.{$index}.{$field}"))) {
                $fail('validation.prohibited')->translate();
            }
        };
    }

    /**
     * გვერდის ერთი პასუხი: სახეობები, მოდულები, მომხმარებლები და მოქმედი წესები.
     *
     * ⚠️ პირადი მოდული მფლობელის სახელით მოდის (`owner`) — ორ ადამიანს ერთი
     * სახელის მოდული შეიძლება ჰქონდეს; SPA მას მხოლოდ მფლობელის ჩანართში ხატავს.
     *
     * @return array<string, mixed>
     */
    private function payload(): array
    {
        return [
            'kinds' => array_map(fn (string $kind) => [
                'key' => $kind,
                'protected' => in_array($kind, AuditRules::PROTECTED, true),
                'moduleless' => in_array($kind, AuditRules::MODULELESS, true),
            ], array_keys(AuditRules::KINDS)),
            'until' => AuditRules::UNTIL,
            'modules' => [
                ...Module::query()
                    ->with('owner:id,username')
                    ->orderBy('sort_order')
                    ->orderBy('id')
                    ->get(['id', 'key', 'name_ka', 'name_en', 'owner_id'])
                    ->map(fn (Module $m) => [
                        'key' => $m->key,
                        'name_ka' => $m->name_ka,
                        'name_en' => $m->name_en,
                        'owner_id' => $m->owner_id,
                        'owner' => $m->owner?->username,
                    ])->all(),
                ...array_map(fn (string $key) => [
                    'key' => $key,
                    'name_ka' => null,
                    'name_en' => null,
                    'owner_id' => null,
                    'owner' => null,
                ], AuditRegistry::PSEUDO_MODULES),
            ],
            'users' => User::query()->orderBy('name')->get(['id', 'name', 'username'])->all(),
            'rules' => AuditRules::rows(),
        ];
    }
}
