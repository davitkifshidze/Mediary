<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * მოდული = ერთი დომენი („plug-in"): ფილმები, სერიალები, მომავალში ანიმე/ვიდეო…
 * frontend-ის ნავიგაცია და მარშრუტები ამ ცხრილიდან იგება (იხ. lib/modules.tsx).
 */
class Module extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'is_sensitive' => 'boolean',
        'enabled_by_default' => 'boolean',
        'is_active' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class)->withPivot('settings', 'enabled_at');
    }

    public function approvalRequests(): HasMany
    {
        return $this->hasMany(ApprovalRequest::class);
    }

    /** მედია-დომენია? (movie/series-ის ტიპის, საერთო generic UI-თი) */
    public function isMediaDomain(): bool
    {
        return (bool) $this->morph_alias;
    }
}
