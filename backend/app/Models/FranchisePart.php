<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * **ფრანჩაიზის ერთი ნაწილი** — TMDB-ის ფაქტი, გლობალური ლექსიკონი.
 *
 * ⚠️ `BelongsToUser` აქ განზრახ არ არის: ერთი ფრანჩაიზი ყველა ანგარიშზე ერთი და
 * იგივეა; რა მაქვს და რა მაკლია, ბიბლიოთეკასთან შედარებით ითვლება (`FranchiseTracker`).
 */
class FranchisePart extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'tmdb_collection_id' => 'integer',
        'tmdb_id' => 'integer',
        'release_date' => 'date',
        'rating' => 'decimal:1',
        'checked_at' => 'datetime',
    ];

    /** პოსტერი TMDB-ის CDN-იდან; გამოუსვლელ ნაწილს ხშირად არ აქვს */
    public function posterUrl(): ?string
    {
        return $this->tmdb_poster ? 'https://image.tmdb.org/t/p/w342'.$this->tmdb_poster : null;
    }

    public function year(): ?int
    {
        return $this->release_date ? (int) $this->release_date->format('Y') : null;
    }
}
