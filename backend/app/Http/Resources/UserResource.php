<?php

namespace App\Http\Resources;

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
            'role' => $this->role,
            'is_super_admin' => $this->isSuperAdmin(),
            'is_active' => (bool) $this->is_active,
            'settings' => $this->settings,
            'created_at' => $this->created_at?->toIso8601String(),
            // ჩართული მოდულების key-ები — ნავიგაციისა და gate-ებისთვის
            'modules' => $this->whenLoaded('modules', fn () => $this->modules->pluck('key')),
            'movies_count' => $this->whenCounted('movies'),
            'series_count' => $this->whenCounted('series'),
            'videos_count' => $this->whenCounted('videos'),
        ];
    }
}
