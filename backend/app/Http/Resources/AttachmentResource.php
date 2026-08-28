<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AttachmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            // public → storage-ის გზა (ფრონტი `storageUrl()`-ით აწყობს);
            // private (18+) → policy-ით დაცული route
            'url' => $this->isPrivate() ? route('attachments.file', $this->id) : $this->path,
            'is_private' => $this->isPrivate(),
            'original_name' => $this->original_name,
            'mime' => $this->mime,
            'size' => $this->size,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
