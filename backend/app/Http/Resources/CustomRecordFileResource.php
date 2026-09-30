<?php

namespace App\Http\Resources;

use App\Support\StorageFolder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

/** პირადი მოდულის ჩანაწერის ფაილი (Tasks §37.5) — `image` (ჩემი ფოტო) · `doc` */
class CustomRecordFileResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'path' => $this->path,
            // ⚠️ დისკს **საქაღალდე** წყვეტს და არა გამომძახებელი (§17.5)
            'url' => Storage::disk(StorageFolder::diskFor($this->path))->url($this->path),
            'original_name' => $this->original_name,
            'mime' => $this->mime,
            'size' => $this->size,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
