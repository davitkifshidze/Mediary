<?php

namespace App\Http\Resources;

use App\Services\Storage\StorageMeter;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'username' => $this->username,
            'email' => $this->email,
            'display_name' => $this->displayName(),
            'avatar_path' => $this->avatar_path,
            // Tasks 16.1 — საჯარო პროფილი (`private` default). ⚠️ ეს რესურსი
            // **მხოლოდ საკუთარ თავს და ადმინს** უბრუნდება; უცხოსთვის განკუთვნილი
            // ვიწრო ფორმა `PublicProfileService::header()`-შია.
            'profile_visibility' => $this->profile_visibility,
            'bio' => $this->bio,
            // Tasks 1.6 — `role` ისევ key-ია (ძველი მომხმარებლები არ გატყდეს),
            // სახელი კი ცხრილიდან მოდის, რომ საკუთარი როლებიც ითარგმნებოდეს
            'role' => $this->roleKey(),
            'role_id' => $this->role_id,
            'role_name_ka' => $this->role?->name_ka,
            'role_name_en' => $this->role?->name_en,
            'is_super_admin' => $this->isSuperAdmin(),
            // მოდულის შიდა უფლებები (19.8) — ფრონტი ღილაკებს ამით მალავს
            'permissions' => $this->when(
                (bool) $this->relationLoaded('role'),
                fn () => $this->isSuperAdmin() ? null : ($this->role?->permissions ?? []),
            ),
            /*
             * Tasks 1.6 — რომელ ადმინის სექციას ხედავს (`users`/`roles`/`requests`).
             * ⚠️ ფრონტი ბმულებს **ამით** მალავს და აღარ `is_super_admin`-ით:
             * წვდომა როლიდანაც შეიძლება მოვიდეს.
             */
            'admin_resources' => $this->adminResources(),
            'is_active' => (bool) $this->is_active,
            /* FEAT-16 — მხოლოდ **ფაქტი**: არც საიდუმლო, არც აღდგენის კოდები.
               ⚠️ `hasTwoFactor()` და არა „საიდუმლო არსებობს": ჩართვის
               შუალედურ მდგომარეობაში (QR ნაჩვენებია, კოდი ჯერ არ დადასტურდა)
               მეორე ფაქტორი ჯერ არ მოქმედებს — და გვერდი სწორედ ამას ხატავს. */
            'two_factor_enabled' => $this->hasTwoFactor(),
            'two_factor_pending' => ! $this->hasTwoFactor() && (bool) $this->two_factor_secret,
            'settings' => $this->settings,
            'created_at' => $this->created_at?->toIso8601String(),
            // მინიჭებული მოდულების key-ები — ნავიგაციისა და gate-ებისთვის
            'modules' => $this->whenLoaded('modules', fn () => $this->modules->pluck('key')),
            // რომელი გამორთო თვითონ (K13) — ადმინის სიაში ცალკე აღინიშნება
            'hidden_modules' => $this->whenLoaded(
                'modules',
                fn () => $this->modules->filter(fn ($m) => $m->pivot->is_hidden)->pluck('key')->values()
            ),
            'movies_count' => $this->whenCounted('movies'),
            'series_count' => $this->whenCounted('series'),
            'videos_count' => $this->whenCounted('videos'),
            // L4 — სიაშივე სრული ინფო (ადმინის პანელი)
            'favorites_count' => $this->when(isset($this->favorites_count), fn () => (int) $this->favorites_count),
            'last_activity' => $this->when(array_key_exists('last_activity', $this->getAttributes()), fn () => $this->last_activity),
            // ადმინის ხედი (1.3) — ფაილების რაოდენობა/ჯამი დისკიდან;
            // მას გარეშე კი 17.3-ის **იაფი** ჯამი დაქეშილი მრიცხველიდან
            'storage' => $this->storage_usage
                ?? app(StorageMeter::class)->usage($this->resource),
        ];
    }
}
