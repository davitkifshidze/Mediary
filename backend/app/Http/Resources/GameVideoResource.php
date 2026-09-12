<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * თამაშზე მიბმული ვიდეო (`game_videos`, Tasks §11.2).
 *
 * `embed_url` **სერვერზე აიგება** `VideoUrl`-ის allowlist-ით — ნედლი
 * HTML/iframe არასდროს მოდის ბაზიდან.
 */
class GameVideoResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'title' => $this->title,
            'url' => $this->url,
            'platform' => $this->platform,
            'embed_url' => $this->embed_url,
            'thumbnail_url' => $this->thumbnail_url,
            'duration' => $this->duration,
            'sort_order' => $this->sort_order,
        ];
    }
}
