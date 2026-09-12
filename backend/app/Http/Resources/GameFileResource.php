<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** თამაშზე მიმაგრებული ფაილი (`game_files`) — ატვირთული სქრინშოტი ან დოკუმენტი */
class GameFileResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            // storage-ის გზა — ფრონტი `storageUrl()`-ით აწყობს სრულ URL-ს
            'url' => $this->path,
            'original_name' => $this->original_name,
            'mime' => $this->mime,
            'size' => $this->size,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
