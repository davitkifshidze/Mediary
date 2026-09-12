<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** ერთი მიწოდება (`note_notifications`) — ბრაუზერის რიგი და არხების ჟურნალი */
class NoteNotificationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'note_entry_id' => $this->note_entry_id,
            'note_reminder_id' => $this->note_reminder_id,
            'channel' => $this->channel,
            'title' => $this->title,
            'body' => $this->body,
            'status' => $this->status,
            'error' => $this->error,
            'scheduled_for' => $this->scheduled_for?->toIso8601String(),
            'sent_at' => $this->sent_at?->toIso8601String(),
            'read_at' => $this->read_at?->toIso8601String(),
        ];
    }
}
