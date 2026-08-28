<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\ApprovalRequestResource;
use App\Http\Resources\UserResource;
use App\Models\ApprovalRequest;
use App\Models\Module;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * სუპერ-ადმინის პანელი — მომხმარებლები, როლები, მოდულების ჩართვა/გამორთვა (I4).
 * ⚠️ მთვლელები `owner` scope-ის გარეშე ითვლება — თორემ ადმინის სესია სხვისი
 * ჩანაწერების დათვლას ხელს შეუშლიდა.
 */
class AdminUserController extends Controller
{
    public function index()
    {
        $users = User::query()
            ->withCount([
                'movies' => fn ($q) => $q->withoutGlobalScope('owner'),
                'series' => fn ($q) => $q->withoutGlobalScope('owner'),
                'videos' => fn ($q) => $q->withoutGlobalScope('owner'),
            ])
            ->with('modules')
            ->orderBy('id')
            ->get();

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
            'is_sensitive' => $m->is_sensitive,
            'is_active' => $m->is_active,
            'granted' => $user->isGrantedModule($m->key),
            'enabled' => isset($enabled[$m->id]),
            // მომხმარებელმა თვითონ დამალა (K13)
            'hidden_by_user' => (bool) $pivots->get($m->id)?->pivot?->is_hidden,
            'enabled_at' => $pivots->get($m->id)?->pivot?->enabled_at,
        ]);

        $lastActivity = DB::table('sessions')->where('user_id', $user->id)->max('last_activity');

        return response()->json([
            'user' => new UserResource($user->load('modules')),
            'content' => [
                'movies' => $user->movies_count,
                'series' => $user->series_count,
                'videos' => $user->videos_count,
                'videos_adult' => $user->videos()->withoutGlobalScope('owner')->where('is_adult', true)->count(),
                'favorites' => $user->movies()->withoutGlobalScope('owner')->where('is_favorite', true)->count()
                    + $user->series()->withoutGlobalScope('owner')->where('is_favorite', true)->count(),
            ],
            'storage' => $this->storageUsage($user),
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
     * ამ user-ის ატვირთული ფაილები (ავატარი, ხელით ატვირთული პოსტერები,
     * ვიდეოს thumbnail-ები). TMDB-დან ჩამოტვირთული მედია გაზიარებულია
     * (`posters/<slug>.jpg`), ამიტომ კონკრეტულ user-ს არ ეთვლება.
     */
    private function storageUsage(User $user): array
    {
        $files = [];

        if ($user->avatar_path) {
            $files[] = ['public', $user->avatar_path];
        }

        foreach (['movies', 'series'] as $relation) {
            $paths = $user->{$relation}()
                ->withoutGlobalScope('owner')
                ->where('poster_source', 'upload')
                ->whereNotNull('poster_path')
                ->pluck('poster_path');

            foreach ($paths as $path) {
                $files[] = ['public', $path];
            }
        }

        foreach ($user->videos()->withoutGlobalScope('owner')->whereNotNull('thumbnail_path')->get() as $video) {
            $files[] = [$video->thumbnailDisk(), $video->thumbnail_path];
        }

        $bytes = 0;
        foreach ($files as [$disk, $path]) {
            try {
                $bytes += Storage::disk($disk)->size($path);
            } catch (\Throwable) {
                // ფაილი აღარ არსებობს — ჯამში არ ითვლება
            }
        }

        return ['files' => count($files), 'bytes' => $bytes];
    }

    public function update(Request $request, User $user)
    {
        $data = $request->validate([
            'role' => ['sometimes', Rule::in(['super_admin', 'user'])],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        // ბოლო super_admin-ის ჩამოქვეითება/გათიშვა აკრძალულია
        if ($this->wouldOrphanAdmins($user, $data)) {
            return response()->json(['message' => 'last_super_admin'], 422);
        }

        if ($user->id === $request->user()->id && array_key_exists('is_active', $data) && ! $data['is_active']) {
            return response()->json(['message' => 'cannot_disable_self'], 422);
        }

        $user->forceFill($data)->save();

        return new UserResource($user->load('modules'));
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

        return new UserResource($user->load('modules'));
    }

    public function destroy(Request $request, User $user)
    {
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'cannot_delete_self'], 422);
        }

        if ($this->wouldOrphanAdmins($user, ['role' => 'user'])) {
            return response()->json(['message' => 'last_super_admin'], 422);
        }

        if ($user->avatar_path) {
            Storage::disk('public')->delete($user->avatar_path);
        }

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

    /** დარჩება თუ არა სისტემა სუპერ-ადმინის გარეშე */
    private function wouldOrphanAdmins(User $user, array $data): bool
    {
        if (! $user->isSuperAdmin()) {
            return false;
        }

        $losesAdmin = (array_key_exists('role', $data) && $data['role'] !== 'super_admin')
            || (array_key_exists('is_active', $data) && ! $data['is_active']);

        if (! $losesAdmin) {
            return false;
        }

        return User::where('role', 'super_admin')->where('is_active', true)->count() <= 1;
    }
}
