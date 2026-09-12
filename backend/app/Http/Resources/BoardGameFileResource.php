<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** ბორდგეიმზე მიმაგრებული ფაილი (`board_game_files`) — წესები, ფოტო, დოკუმენტი */
class BoardGameFileResource extends JsonResource
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
