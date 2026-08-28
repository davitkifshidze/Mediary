<?php

namespace App\Models\Concerns;

use App\Models\Attachment;
use App\Models\Note;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * ფაილები + ჩანიშვნები ნებისმიერ მოდელზე (K3).
 *
 * ⚠️ `morphs()` FK-cascade-ს არ ქმნის, ამიტომ მშობლის წაშლისას
 * ბავშვები ხელით უნდა მოიხსნას — გამოიძახე `deleteAttachmentsAndNotes()`
 * მოდელის `deleting` ივენთში (იხ. Video::booted()).
 */
trait HasAttachments
{
    public function attachments(): MorphMany
    {
        return $this->morphMany(Attachment::class, 'attachable')->orderBy('sort_order')->orderBy('id');
    }

    public function images(): MorphMany
    {
        return $this->attachments()->where('kind', 'image');
    }

    public function documents(): MorphMany
    {
        return $this->attachments()->where('kind', 'doc');
    }

    public function notes(): MorphMany
    {
        return $this->morphMany(Note::class, 'notable')->orderByDesc('id');
    }

    public function deleteAttachmentsAndNotes(): void
    {
        // თითოეული ცალკე იშლება — Attachment::deleting ფაილსაც შლის დისკიდან
        foreach ($this->attachments()->withoutGlobalScope('owner')->cursor() as $attachment) {
            $attachment->delete();
        }
        $this->notes()->withoutGlobalScope('owner')->delete();
    }
}
