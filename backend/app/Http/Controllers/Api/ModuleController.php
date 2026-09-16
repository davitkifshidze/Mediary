<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ModuleResource;
use App\Models\ApprovalRequest;
use App\Models\Module;
use App\Services\Modules\FieldSettings;
use App\Support\ModuleSettings;
use App\Support\PublicDomain;
use Illuminate\Http\Request;

/**
 * მოდულების სია მიმდინარე მომხმარებლისთვის (I3).
 * ფრონტი ამით აგებს ნავიგაციასა და მარშრუტებს (lib/modules.tsx).
 */
class ModuleController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        // pivot-ის settings ყველა შემთხვევაში (super_admin-საც შეიძლება ჰქონდეს)
        $pivots = $user->modules()->get()->keyBy('id');

        // super_admin-ს ყველა აქტიური მოდული ავტომატურად აქვს (იხ. User::enabledModules)
        $enabledIds = $user->enabledModules()->pluck('id')->flip();

        $requests = ApprovalRequest::where('user_id', $user->id)
            ->where('type', ApprovalRequest::TYPE_MODULE)
            ->whereNotNull('module_id')
            ->orderByDesc('id')
            ->get()
            ->groupBy('module_id');

        $modules = Module::where('is_active', true)
            ->orderBy('sort_order')->orderBy('id')
            ->get()
            ->each(function (Module $m) use ($enabledIds, $requests, $pivots, $user) {
                $m->enabled = isset($enabledIds[$m->id]);
                // `granted` — ადმინმა ჩართო (ან super_admin-ია); `enabled` — ამჟამად ჩანს.
                // ორის სხვაობა = მომხმარებელმა თვითონ გამორთო (K13).
                $m->granted = $user->isGrantedModule($m->key);
                $m->request_status = $requests->get($m->id)?->first()?->status;
                $m->user_settings = json_decode($pivots->get($m->id)?->pivot?->settings ?? '', true) ?: [];
                // Tasks 16.1 — საჯარო პროფილი. `shareable = false` ნიშნავს, რომ
                // გადამრთველიც არ უნდა დაიხატოს (`note` — 16.5-ის მკაცრი წესი).
                $m->shareable = (bool) PublicDomain::forModule($m->key);
                $m->is_public = (bool) ($pivots->get($m->id)?->pivot?->is_public);
            });

        return ModuleResource::collection($modules);
    }

    /**
     * მოდულის ჩართვა/გამორთვა **საკუთარი თავისთვის** (K13).
     * ჩართვა მხოლოდ მაშინ, თუ უფლება უკვე აქვს — თორემ მოთხოვნა ადმინთან მიდის.
     */
    public function setEnabled(Request $request, string $key)
    {
        $module = Module::where('key', $key)->where('is_active', true)->firstOrFail();
        $user = $request->user();

        abort_unless($user->isGrantedModule($key), 403, 'module_not_granted');

        $data = $request->validate(['enabled' => ['required', 'boolean']]);

        $attrs = ['is_hidden' => ! $data['enabled']];
        // `enabled_at` მხოლოდ პირველად — გადართვა თარიღს არ ცვლის
        if (! $user->modules()->where('modules.id', $module->id)->exists()) {
            $attrs['enabled_at'] = now();
        }

        $user->modules()->syncWithoutDetaching([$module->id => $attrs]);

        return response()->json(['key' => $key, 'enabled' => $data['enabled']]);
    }

    /**
     * **Tasks 16.1 — პერ-მოდულური ხილვადობა საჯარო პროფილზე.**
     *
     * ⚠️ `PUT` და არა `POST` — `EnsureModulePermission` POST-იდან `create`-ს
     * გამოიყვანდა (იგივე მიზეზი, რაც პლეილისტების pivot-endpoint-ებზე).
     *
     * ⚠️ **მოდულის ჩამონათვალში ყოფნა აუცილებელია** (`PublicDomain`): `note`
     * იქ განზრახ არაა (16.5), ე.ი. მისი გასაჯაროება საერთოდ არ მოითხოვება —
     * და `422` სჯობს ჩუმად უეფექტო `true`-ს.
     */
    public function setPublic(Request $request, string $key)
    {
        $module = Module::where('key', $key)->where('is_active', true)->firstOrFail();
        $user = $request->user();

        abort_unless($user->hasModule($key), 403, 'module_disabled');

        if (! PublicDomain::forModule($key)) {
            return response()->json([
                'message' => 'module_not_shareable',
                'errors' => ['module' => ['ეს მოდული საჯარო პროფილზე არ გამოდის.']],
            ], 422);
        }

        $data = $request->validate(['is_public' => ['required', 'boolean']]);

        $attrs = ['is_public' => $data['is_public']];
        // `enabled_at` მხოლოდ პირველად — super_admin-ს pivot-ი შეიძლება არ ჰქონდეს
        if (! $user->modules()->where('modules.id', $module->id)->exists()) {
            $attrs['enabled_at'] = now();
        }

        $user->modules()->syncWithoutDetaching([$module->id => $attrs]);

        return response()->json(['key' => $key, 'is_public' => $data['is_public']]);
    }

    /**
     * per-user per-module პარამეტრები (`module_user.settings`).
     *
     * ⚠️ **ჩაწერა შერწყმაა და არა ჩანაცვლება.** ერთ JSON-ბლობში რამდენიმე
     * სხვადასხვა ფენა ცხოვრობს: გალერეის ჩამოტვირთვის არჩევანი, ჩანაწერების
     * შეხსენების არხები (`NoteChannelSettings`), ველების კონსტრუქტორის
     * გადახრები (`fields`) და მორგებული ველების აღწერები (`custom_fields`).
     * `json_encode($data['settings'])` მთელ ბლობს გადააწერდა, ე.ი. „შეინახე
     * შეხსენების არხი" **ჩუმად შლიდა** ამ მოდულის ველების კონფიგს (და
     * პირიქით). `FieldSettings::save()` სწორედ ამიტომ კითხულობს ბლობს,
     * მხოლოდ `fields`-ს ცვლის და მთელს უკან წერს — ეს endpoint იმავე წესს
     * მიჰყვება ახლა.
     *
     * ⚠️ **გასაღების წაშლა ამ გზით არ ხდება** და არც სჭირდება: ყოველი
     * გამომძახებელი თავისი ფენის **სრულ** ნაკრებს აგზავნის (გალერეა ცხრა
     * ველს, არხები ოთხს), ე.ი. მოძველებული მნიშვნელობა ისედაც გადაიწერება.
     */
    public function updateSettings(Request $request, string $key)
    {
        $module = Module::where('key', $key)->where('is_active', true)->firstOrFail();

        abort_unless($request->user()->hasModule($key), 403);

        $data = $request->validate(['settings' => ['required', 'array']]);

        // შერწყმა — საიდბარის განლაგებაც (ეტაპი 8) იმავე ბლოკში წერს
        $merged = ModuleSettings::merge($request->user(), $module, $data['settings']);

        // ⚠️ პასუხი **შერწყმულს** აბრუნებს და არა მოსულს — კლიენტმა უნდა
        // დაინახოს, რა ჩაიწერა მართლა
        return response()->json(['settings' => $merged]);
    }

    /**
     * **ველების კონფიგი (Tasks §6, ფაზა 1)** — რომელი არჩევითი ველი ჩანს
     * ამ მოდულის ფორმაზე. დეტალები: `docs/6-field-builder.md`.
     */
    public function fields(Request $request, string $key, FieldSettings $fields)
    {
        Module::where('key', $key)->where('is_active', true)->firstOrFail();
        abort_unless($request->user()->hasModule($key), 403);

        return response()->json(['fields' => $fields->for($request->user(), $key)]);
    }

    /**
     * ⚠️ **`PUT` და არა `POST`** — `permission:` middleware POST-იდან
     * `create`-ს გამოიყვანდა და მხოლოდ რედაქტირების უფლების მქონე user-ს
     * ცრუ 403 დაუბრუნდებოდა (იგივე წესი, რაც `/modules/{key}/settings`-ს).
     */
    public function updateFields(Request $request, string $key, FieldSettings $fields)
    {
        Module::where('key', $key)->where('is_active', true)->firstOrFail();
        abort_unless($request->user()->hasModule($key), 403);

        $data = $request->validate([
            'fields' => ['present', 'array'],
            'fields.*.enabled' => ['nullable', 'boolean'],
            // ⚠️ `required` **ფორმის დისციპლინაა და არა სქემის შეზღუდვა** —
            // ველი კატალოგში სწორედ იმიტომ არის, რომ ბაზაზე არჩევითია.
            // ამიტომ მას ფორმა იცავს და არა backend-ის ვალიდაცია.
            'fields.*.required' => ['nullable', 'boolean'],
            // §6 ფაზა 4 → §16 — ჩანს თუ არა ველი საჯარო ბარათზე.
            // ⚠️ ყოველი ახალი ატრიბუტი **აქაც** უნდა ჩაიწეროს: `validate()`
            // მხოლოდ დადასტურებულ გასაღებებს აბრუნებს და ჩაუწერელი ატრიბუტი
            // მთელ `fields`-ს პასუხიდან აგდებს.
            'fields.*.public' => ['nullable', 'boolean'],
            /* §4.3 — ჩაკეტვის მოხსნა (მხოლოდ `super_admin`; `FieldSettings`
               თვითონ ამოწმებს). ⚠️ აქ ჩაწერა **სავალდებულოა** ზუსტად იმავე
               მიზეზით, რაც ზემოთ `public`-ზე წერია: დაუსახელებელი ატრიბუტი
               მთელ `fields` მასივს აგდებს და `PUT` 500-ით ვარდება. */
            'fields.*.unlocked' => ['nullable', 'boolean'],
            /* ⚠️ §6.5 — `sort_order` **აღარ არის** დაშვებული ატრიბუტი: რიგის
               UI მოიხსნა და თანმიმდევრობა კატალოგისაა. `validate()` მას
               ისედაც ჩამოაგდებდა, ე.ი. ძველი ფრონტის რექვესთი არ ტყდება —
               მხოლოდ რიგი აღარ იცვლება. */
            'fields.*.label_ka' => ['nullable', 'string', 'max:120'],
            'fields.*.label_en' => ['nullable', 'string', 'max:120'],
            'fields.*.placeholder_ka' => ['nullable', 'string', 'max:120'],
            'fields.*.placeholder_en' => ['nullable', 'string', 'max:120'],
        ]);

        return response()->json([
            'fields' => $fields->save($request->user(), $key, $data['fields'] ?? []),
        ]);
    }

    /**
     * **ველების კონფიგის ნაგულისხმევზე დაბრუნება** (Tasks §4, შენი პასუხი).
     *
     * ⚠️ ეს საგარანტიო გასასვლელია: ველის გამორთვა ფორმას **გატეხილად**
     * ტოვებს (შენახვა 422-ით ვარდება ეკრანზე აღარმყოფ ველზე), და თუმცა
     * უკან ჩართვა იმავე გვერდზეა, ერთი ღილაკი, რომელიც ყველაფერს აბრუნებს,
     * ბევრად ნაკლებ ძებნას ითხოვს.
     *
     * ⚠️ **მხოლოდ `fields` იშლება.** `module_user.settings` ერთი JSON
     * ბლოკია, სადაც გალერეის ნაგულისხმევები, ჩანაწერების არხები და
     * სტატუსების განლაგებაც ზის — მთელი ბლოკის წაშლა ოთხ სხვა ფუნქციას
     * წაშლიდა (იგივე წესი, რაც `FieldSettings::save()`-ს აქვს).
     *
     * ⚠️ **`DELETE` და არა `POST`** — `EnsureModulePermission` POST-იდან
     * `create`-ს გამოიყვანდა; `delete` კი ზუსტად ის უფლებაა, რასაც ეს
     * მოქმედება ითხოვს.
     */
    public function resetFields(Request $request, string $key, FieldSettings $fields)
    {
        Module::where('key', $key)->where('is_active', true)->firstOrFail();
        abort_unless($request->user()->hasModule($key), 403);

        return response()->json(['fields' => $fields->reset($request->user(), $key)]);
    }
}
