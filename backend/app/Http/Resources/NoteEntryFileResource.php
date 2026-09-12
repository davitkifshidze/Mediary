<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** ჩანაწერზე მიმაგრებული ფაილი (`note_entry_files`) — სქრინშოტი/ვიდეო/დოკუმენტი */
class NoteEntryFileResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            /*
             * ⚠️ **`url` აღარ არის storage-ის გზა** (Tasks §17.5): ფაილი
             * პრივატულ დისკზეა და `/storage/*`-ით არ იხსნება. აქ API-ს
             * მისამართია, რომელიც მფლობელობას ამოწმებს — ფრონტი მას
             * blob-ად კითხულობს (`noteFileUrl()` / `fetchNoteFileBlob()`).
             */
            'url' => "/note-files/{$this->id}",
            'original_name' => $this->original_name,
            'mime' => $this->mime,
            'size' => $this->size,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
