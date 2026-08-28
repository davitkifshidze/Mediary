<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ApprovalRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'status' => $this->status,
            'message' => $this->message,
            'payload' => $this->payload,
            'created_at' => $this->created_at?->toIso8601String(),
            'reviewed_at' => $this->reviewed_at?->toIso8601String(),
            'review_note' => $this->review_note,

            'user' => $this->whenLoaded('user', fn () => [
                'id' => $this->user->id,
                'display_name' => $this->user->displayName(),
                'email' => $this->user->email,
            ]),
            'reviewer' => $this->whenLoaded('reviewer', fn () => $this->reviewer ? [
                'id' => $this->reviewer->id,
                'display_name' => $this->reviewer->displayName(),
            ] : null),
            'module' => $this->whenLoaded('module', fn () => $this->module ? [
                'id' => $this->module->id,
                'key' => $this->module->key,
                'name_ka' => $this->module->name_ka,
                'name_en' => $this->module->name_en,
                'icon' => $this->module->icon,
            ] : null),
            'genre' => $this->whenLoaded('genre', fn () => $this->genre ? [
                'id' => $this->genre->id,
                'slug' => $this->genre->slug,
                'name_ka' => $this->genre->name_ka,
                'name_en' => $this->genre->name_en,
            ] : null),
        ];
    }
}
