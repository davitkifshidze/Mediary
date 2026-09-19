<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Module;
use App\Services\Audit\AuditLogger;
use App\Services\Export\RecordExporter;
use App\Support\ExportDomain;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * **FEAT-06 — „ჩემი მონაცემები": მოდულის ჩანაწერები ფაილად.**
 *
 * აქამდე ბიბლიოთეკის წაღების ორი გზა იყო და ორივე გვერდით: ატვირთული
 * **ფაილების** zip (`POST /storage/files/download`) და ბაზის სრული ასლი
 * (`/admin/backups`, **`super_admin`** და **ყველა ანგარიში ერთად**). ე.ი.
 * ჩვეულებრივ მომხმარებელს საკუთარი **ჩანაწერების** წაღება საერთოდ არ
 * შეეძლო — მრავალმომხმარებლიან აპში ეს ხარვეზია და არა ფუნქციის ნაკლებობა.
 *
 * ⚠️ **`module:`/`permission:` middleware აქ განზრახ არ ეწერება.**
 * `EnsureModulePermission` მოდულს **route-ის `type` პარამეტრიდან** იღებს
 * (`@type`), აქ კი პარამეტრი `module`-ია; გარდა ამისა ექსპორტის სია
 * `modules`-ის სრული სია არ არის (გალერეა განზრახ გარეთაა —
 * `ExportDomain::NOT_EXPORTED`). ორივე შემოწმება ამიტომ აქვე, ცხადად
 * კეთდება — ზუსტად ისე, როგორც `VisibilityController::guard()`-ში.
 *
 * ⚠️ **ჩაურთველი მოდული არ გადის.** ექსპორტი იმავე წესს ემორჩილება, რასაც
 * მთელი აპი: გამორთული მოდული არც საიდბარშია, არც ძებნაში და არც
 * დეშბორდზე. ორმაგი წესი („ჩანს — არა, გადის — კი") სწორედ ის ადგილია,
 * სადაც უფლების შემოწმება ერთ დღეს გამოგვრჩება.
 */
class ExportController extends Controller
{
    public function __construct(
        private readonly RecordExporter $exporter,
        private readonly AuditLogger $audit,
    ) {}

    /**
     * რა შეიძლება ჩამოვტვირთო — მოდული, სახელი, ჩანაწერების რაოდენობა.
     *
     * ⚠️ **რიცხვი აქვეა და არა `/dashboard`-იდან.** დეშბორდი `gallery`-საც
     * ითვლის და ჩაურთველ მოდულსაც ტოვებს სიიდან სხვა წესით; ორი წყარო
     * იმას ნიშნავდა, რომ ღილაკი „342 ჩანაწერი"-ს დაწერდა და ფაილში სხვა
     * რიცხვი იქნებოდა. აქ ორივეს **ერთი და იგივე** `RecordExporter::query()`
     * პასუხობს.
     */
    public function index(Request $request)
    {
        $user = $request->user();

        $modules = Module::where('is_active', true)
            ->whereIn('key', ExportDomain::keys())
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->filter(fn (Module $m) => $user->hasModule($m->key) && $user->hasPermission($m->key, 'view'))
            ->map(fn (Module $m) => [
                'key' => $m->key,
                'name_ka' => $m->name_ka,
                'name_en' => $m->name_en,
                'icon' => $m->icon,
                'color' => $m->color,
                'count' => $this->exporter->count($user, $m->key),
                'fields' => count(ExportDomain::fields($m->key)),
            ])
            ->values();

        return response()->json([
            'data' => $modules,
            'formats' => ExportDomain::FORMATS,
        ]);
    }

    /**
     * ერთი მოდულის ჩამოტვირთვა.
     *
     * ⚠️ **ლოგი პასუხის დაწყებამდე იწერება.** `StreamedResponse`-ის შიგნით
     * ჩაწერა უკვე გაგზავნილ ჰედერებზე მოხდებოდა — ე.ი. ჩავარდნა ვერსად
     * გამოჩნდებოდა, და პირიქით: გატეხილი ჩამოტვირთვა ლოგში მაინც
     * „შესრულებულად" დარჩებოდა. „ვინ, როდის, რომელი მოდული, რამდენი
     * ჩანაწერი" ისედაც **მოთხოვნის** ფაქტია და არა ბაიტების.
     */
    public function show(Request $request, string $module): StreamedResponse
    {
        $user = $request->user();

        abort_unless(ExportDomain::has($module), 404);
        abort_unless($user->hasModule($module), 403, 'module_disabled');
        abort_unless($user->hasPermission($module, 'view'), 403, 'forbidden');

        $data = $request->validate([
            'format' => ['nullable', Rule::in(ExportDomain::FORMATS)],
        ]);

        $format = $data['format'] ?? 'json';
        $count = $this->exporter->count($user, $module);

        $this->audit->log(AuditLog::ACTION_EXPORT, [
            'module' => $module,
            'subject_label' => $module,
            'new_values' => ['format' => $format, 'records' => $count],
        ]);

        $name = 'mediary-'.str_replace('_', '-', $module).'-'.now()->format('Y-m-d').'.'.$format;
        $chunks = $format === 'csv'
            ? $this->exporter->csv($user, $module)
            : $this->exporter->json($user, $module);

        return response()->streamDownload(function () use ($chunks) {
            foreach ($chunks as $chunk) {
                echo $chunk;
                /* ⚠️ ბუფერი ცხადად იცლება — თორემ PHP მთელ ფაილს მაინც
                   მეხსიერებაში აგროვებს და ნაკადი მხოლოდ სახელად რჩება. */
                flush();
            }
        }, $name, [
            'Content-Type' => $format === 'csv'
                ? 'text/csv; charset=UTF-8'
                : 'application/json; charset=UTF-8',
            // ბრაუზერს ტიპის გამოცნობა ეკრძალება (`SetSecurityHeaders`-ის იგივე წესი)
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
