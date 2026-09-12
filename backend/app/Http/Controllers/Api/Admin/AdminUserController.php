<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\ApprovalRequestResource;
use App\Http\Resources\UserResource;
use App\Models\ApprovalRequest;
use App\Models\Module;
use App\Models\Role;
use App\Models\User;
use App\Services\Storage\StorageMeter;
use App\Support\PublicDomain;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * სუპერ-ადმინის პანელი — მომხმარებლები, როლები, მოდულების ჩართვა/გამორთვა (I4).
 * ⚠️ მთვლელები `owner` scope-ის გარეშე ითვლება — თორემ ადმინის სესია სხვისი
 * ჩანაწერების დათვლას ხელს შეუშლიდა.
 */
class AdminUserController extends Controller
{
    public function __construct(private StorageMeter $meter) {}

    /**
     * L4: სია იმავე ინფოს იძლევა, რასაც შიდა გვერდი — შიგთავსის სტატისტიკა,
     * ბოლო აქტივობა და დაკავებული ადგილი — რომ ყოველი წვრილმანისთვის
     * `/admin/users/:id`-ზე შესვლა არ დასჭირდეს.
     */
    public function index()
    {
        $users = User::query()
            ->withCount([
                'movies' => fn ($q) => $q->withoutGlobalScope('owner'),
                'series' => fn ($q) => $q->withoutGlobalScope('owner'),
                'videos' => fn ($q) => $q->withoutGlobalScope('owner'),
                'movies as favorite_movies_count' => fn ($q) => $q->withoutGlobalScope('owner')->where('is_favorite', true),
                'series as favorite_series_count' => fn ($q) => $q->withoutGlobalScope('owner')->where('is_favorite', true),
            ])
            ->with('modules', 'role')
            ->orderBy('id')
            ->get();

        // ბოლო აქტივობა ერთი grouped query-ით (და არა თითო user-ზე)
        $activity = DB::table('sessions')
            ->whereNotNull('user_id')
            ->groupBy('user_id')
            ->pluck(DB::raw('max(last_activity)'), 'user_id');

        foreach ($users as $user) {
            $user->favorites_count = $user->favorite_movies_count + $user->favorite_series_count;
            $user->storage_usage = $this->storageUsage($user);
            $user->last_activity = ($ts = $activity->get($user->id))
                ? Carbon::createFromTimestamp($ts)->toIso8601String()
                : null;
        }

        return UserResource::collection($users);
    }

    /**
     * მომხმარებლის შიდა გვერდი (K14) — უფლებები, მოდულები, შიგთავსი,
     * დაკავებული ადგილი და მოთხოვნების ისტორია.
     */
    public function show(User $user)
    {
        $user->loadCount([
            'movies' => fn ($q) => $q->withoutGlobalScope('owner'),
            'series' => fn ($q) => $q->withoutGlobalScope('owner'),
            'videos' => fn ($q) => $q->withoutGlobalScope('owner'),
        ]);

        $pivots = $user->modules()->get()->keyBy('id');
        $enabled = $user->enabledModules()->pluck('id')->flip();

        $modules = Module::orderBy('sort_order')->orderBy('id')->get()->map(fn (Module $m) => [
            'id' => $m->id,
            'key' => $m->key,
            'name_ka' => $m->name_ka,
            'name_en' => $m->name_en,
            'icon' => $m->icon,
            'is_active' => $m->is_active,
            'granted' => $user->isGrantedModule($m->key),
            'enabled' => isset($enabled[$m->id]),
            // მომხმარებელმა თვითონ დამალა (K13)
            'hidden_by_user' => (bool) $pivots->get($m->id)?->pivot?->is_hidden,
            'enabled_at' => $pivots->get($m->id)?->pivot?->enabled_at,
        ]);

        $lastActivity = DB::table('sessions')->where('user_id', $user->id)->max('last_activity');

        return response()->json([
            'user' => new UserResource($user->load('modules', 'role')),
            'content' => [
                'movies' => $user->movies_count,
                'series' => $user->series_count,
                'videos' => $user->videos_count,
                'favorites' => $user->movies()->withoutGlobalScope('owner')->where('is_favorite', true)->count()
                    + $user->series()->withoutGlobalScope('owner')->where('is_favorite', true)->count(),
            ],
            'storage' => $this->storageUsage($user),
            // 1.3 — ატვირთული ფაილების სია (ნახვა/გადმოწერა ადმინიდან).
            // ყველაზე მძიმეები თავში, რომ „რა ჭამს ადგილს" მაშინვე ჩანდეს.
            'files' => $this->meter->files($user)
                ->sortByDesc('size')
                ->take(200)
                ->values()
                ->all(),
            'last_activity' => $lastActivity ? Carbon::createFromTimestamp($lastActivity)->toIso8601String() : null,
            'modules' => $modules,
            'requests' => ApprovalRequestResource::collection(
                ApprovalRequest::where('user_id', $user->id)
                    ->with(['module', 'genre', 'reviewer'])
                    ->orderByDesc('id')
                    ->limit(20)
                    ->get()
            ),
        ]);
    }

    /**
     * დაკავებული ადგილი. „რა ითვლება" **`StorageMeter`-ის განმარტებაა** (19.4/B),
     * რომ ადმინის ხედი და user-ის მრიცხველი ერთი და იმავე რიცხვს აჩვენებდეს.
     */
    private function storageUsage(User $user): array
    {
        $files = $this->meter->files($user);

        return [
            // `used` = **დაქეშილი** მრიცხველი, `bytes` = დისკიდან გადათვლილი.
            // ორის განსხვავება ნიშნავს, რომ `mediary:storage-recalc` სჭირდება.
            ...$this->meter->usage($user),
            'files' => $files->count(),
            'bytes' => (int) $files->sum('size'),
            'modules' => $files->groupBy('module')
                ->map(fn (Collection $group) => (int) $group->sum('size'))
                ->all(),
        ];
    }

    public function update(Request $request, User $user)
    {
        $data = $request->validate([
            // Tasks 1.6 — როლი ცხრილიდან აირჩევა და არა enum-იდან
            'role_id' => ['sometimes', 'integer', Rule::exists('roles', 'id')],
            'is_active' => ['sometimes', 'boolean'],
            // 17.1 — კვოტა ადმინის მიერ ცვლადია (min 10 MB, max 1 TB)
            'storage_quota_bytes' => ['sometimes', 'integer', 'min:10485760', 'max:1099511627776'],
            /*
             * Tasks 1.3 (🔗 16) — **იძულებითი დაპრივატება abuse-ის შემთხვევაში.**
             * ⚠️ ეს განზრახ ორმხრივი გადამრთველია და არა მხოლოდ „ჩაკეტვა":
             * შემთხვევით დაპრივატებულის უკან დაბრუნება ადმინს უნდა შეეძლოს,
             * თორემ user-ის მხრიდან ჩართვა ერთადერთი გზა იქნებოდა.
             * მოდულების და ჩანაწერების არჩევანს ეს არ ეხება — ისინი ხელუხლებელი
             * რჩება, ე.ი. პროფილის უკან ჩართვა ძველ სურათს აღადგენს.
             */
            'profile_visibility' => ['sometimes', Rule::in(PublicDomain::VALUES)],
        ]);

        // ბოლო super_admin-ის ჩამოქვეითება/გათიშვა აკრძალულია
        if ($this->wouldOrphanAdmins($user, $data)) {
            return response()->json(['message' => 'last_super_admin'], 422);
        }

        if ($user->id === $request->user()->id && array_key_exists('is_active', $data) && ! $data['is_active']) {
            return response()->json(['message' => 'cannot_disable_self'], 422);
        }

        $user->forceFill($data)->save();

        return new UserResource($user->load('modules', 'role'));
    }

    /** მოდულების ჩართვა/გამორთვა კონკრეტულ user-ზე */
    public function syncModules(Request $request, User $user)
    {
        $data = $request->validate([
            'module_keys' => ['present', 'array'],
            'module_keys.*' => ['string', 'exists:modules,key'],
        ]);

        $ids = Module::whereIn('key', $data['module_keys'])
            ->pluck('id')
            ->mapWithKeys(fn ($id) => [$id => ['enabled_at' => now()]])
            ->all();

        $user->modules()->sync($ids);

        return new UserResource($user->load('modules', 'role'));
    }

    public function destroy(Request $request, User $user)
    {
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'cannot_delete_self'], 422);
        }

        // წაშლა = ადმინის დაკარგვა; 0 = „აღარაა super_admin"
        if ($this->wouldOrphanAdmins($user, ['role_id' => 0])) {
            return response()->json(['message' => 'last_super_admin'], 422);
        }

        $this->meter->deleteUpload($user->id, $user->avatar_path);

        // movies/series — cascadeOnDelete (მათი genreables/castables პივოტები
        // Movie::booted()-ს არ გაივლის, ამიტომ ხელით ვასუფთავებთ)
        foreach ($user->movies()->withoutGlobalScope('owner')->cursor() as $movie) {
            $movie->delete();
        }
        foreach ($user->series()->withoutGlobalScope('owner')->cursor() as $series) {
            $series->delete();
        }
        // ვიდეოს thumbnail-ები დისკზე რჩებოდა (რიგს cascade შლის)
        foreach ($user->videos()->withoutGlobalScope('owner')->cursor() as $video) {
            $video->deleteThumbnail();
        }

        $user->delete();

        return response()->noContent();
    }

    /** დარჩება თუ არა სისტემა სუპერ-ადმინის გარეშე (1.6 — როლი ცხრილშია) */
    private function wouldOrphanAdmins(User $user, array $data): bool
    {
        if (! $user->isSuperAdmin()) {
            return false;
        }

        $adminRoleId = Role::where('key', 'super_admin')->value('id');

        $losesAdmin = (array_key_exists('role_id', $data) && (int) $data['role_id'] !== (int) $adminRoleId)
            || (array_key_exists('is_active', $data) && ! $data['is_active']);

        if (! $losesAdmin) {
            return false;
        }

        return User::where('role_id', $adminRoleId)->where('is_active', true)->count() <= 1;
    }
}
