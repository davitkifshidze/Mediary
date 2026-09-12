<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use App\Support\VideoUrl;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * თამაშზე მიბმული ვიდეო (Tasks §11.2) — თითო თამაშს რამდენიმე აქვს.
 *
 * ⚠️ **`videos` ცხრილს განზრახ არ ვიყენებთ.** ის ვიდეოს მოდულის ბიბლიოთეკაა
 * (თავისი ტიპების ლექსიკონით, ძებნით, სტატისტიკით); თამაშის walkthrough კი
 * ჩანაწერის ნაწილია და ვიდეოების სიაში არ უნდა გამოჩნდეს. ეს იგივე წესია,
 * რაც სექციის ცხრილებზე (2026-09-03).
 *
 * ⚠️ **HTML/embed მარკაპი არასდროს ინახება** — მხოლოდ URL, `VideoUrl`-ის
 * allowlist კი embed-ს თვითონ აწყობს (იგივე დაცვა, რაც ვიდეოსა და სიმღერაზე).
 */
class GameVideo extends Model
{
    use BelongsToUser;

    /** 11.2 — „სრული დახურვა/გეიმფლეი" მთავარია, ამიტომ ის არის default */
    public const KINDS = ['walkthrough', 'trailer', 'review', 'guide', 'other'];

    protected $guarded = ['id'];

    protected $casts = [
        'duration' => 'integer',
        'sort_order' => 'integer',
    ];

    public function game(): BelongsTo
    {
        return $this->belongsTo(Game::class);
    }

    /**
     * ბმულის გარჩევა და წარმოებული ველების შევსება — ერთი წყარო შექმნისთვისაც
     * და რედაქტირებისთვისაც, რომ `platform`/`embed_url` ვერ დაშორდეს `url`-ს.
     */
    public function applyUrl(string $url): void
    {
        $meta = VideoUrl::parse($url);

        $this->url = $url;
        $this->platform = $meta['platform'];
        $this->external_id = $meta['external_id'];
        $this->embed_url = $meta['embed_url'];
        $this->thumbnail_url = $this->thumbnail_url ?: $meta['thumbnail_url'];
    }
}
