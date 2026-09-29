<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * **ინსტალაციის ერთი პარამეტრი (Tasks §34.1)** — გასაღები → JSON.
 *
 * ⚠️ **პირდაპირ არსად იკითხება** — ყოველი მკითხველი `App\Support\AppSettings`-ზე
 * გადის: იქაა მოთხოვნის ფარგლებში ქეში და „ცხრილი ჯერ არ არსებობს"-ის დაცვა.
 * მოდელი იმისთვის არსებობს, რომ ჩაწერა **მოვლენებით** მოხდეს — `AuditObserver`
 * ცვლილებას თვითონ წერს (`AuditRegistry::MODELS` → `admin`), სახელად კი
 * `key`-ს იღებს (`LABEL_COLUMNS`).
 */
class AppSetting extends Model
{
    protected $fillable = ['key', 'value', 'updated_by'];

    protected $casts = [
        'value' => 'array',
    ];

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
