<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * მოდული = ერთი დომენი („plug-in"): ფილმები, სერიალები, მომავალში ანიმე/ვიდეო…
 * frontend-ის ნავიგაცია და მარშრუტები ამ ცხრილიდან იგება (იხ. lib/modules.tsx).
 *
 * **Tasks §37 — მოდული შეიძლება იყოს პირადი** (`owner_id`): მომხმარებელმა
 * ინტერფეისიდან შექმნა და მის გარდა არავის უჩანს. ყველა ასეთი მოდულის
 * წესი `App\Support\CustomModules`-შია.
 *
 * ⚠️ **ურნაში მყოფი მოდული ყველგან ქრება — global scope `trash`-ით** (37.7):
 * საიდბარი, `/modules`, მარშრუტი, ძებნა და ყველა რეესტრი `Module::`-ით
 * კითხულობს, ე.ი. ცალ-ცალკე `whereNull()` ოცდაათ ადგილას ერთ დღეს
 * დაავიწყდებოდა. ⚠️ **ათი ძველი მიგრაცია ამიტომ `withoutGlobalScope('trash')`-ს
 * იძახებს**: scope მოდელზეა, სვეტი კი მხოლოდ §37-ის მიგრაციაში ჩნდება —
 * ახალ ბაზაზე `migrate:fresh` სხვაგვარად არარსებულ სვეტს დაეძებდა.
 */
class Module extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'enabled_by_default' => 'boolean',
        'is_active' => 'boolean',
        'sort_order' => 'integer',
        'definition' => 'array',
        'trashed_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::addGlobalScope('trash', function (Builder $q) {
            $q->whereNull($q->getModel()->getTable().'.trashed_at');
        });
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class)->withPivot('settings', 'enabled_at');
    }

    public function approvalRequests(): HasMany
    {
        return $this->hasMany(ApprovalRequest::class);
    }

    /** §37 — პირადი მოდულის მფლობელი (`null` — საბაზისო, ყველასი) */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    /** მედია-დომენია? (movie/series-ის ტიპის, საერთო generic UI-თი) */
    public function isMediaDomain(): bool
    {
        return (bool) $this->morph_alias;
    }

    /** §37 — ინტერფეისიდან შექმნილი (პირადი) მოდულია? */
    public function isCustom(): bool
    {
        return $this->owner_id !== null;
    }

    /**
     * **რომელ მოდულს ხედავს ეს ანგარიში** — საბაზისოებს და **საკუთარ** პირადებს.
     *
     * ⚠️ `Module::where('key', …)->firstOrFail()` სხვის პირად მოდულს იპოვიდა
     * და მერე `hasModule()` 403-ს დააბრუნებდა — ე.ი. 403/404-ის სხვაობა
     * გაამხელდა, რომ ასეთი გასაღები არსებობს. ყველა კარი ამიტომ ამ scope-ით
     * ეძებს და სხვისი 404-ია.
     */
    public function scopeVisibleTo(Builder $query, ?User $user): Builder
    {
        return $query->where(function (Builder $q) use ($user) {
            $q->whereNull('owner_id');

            if ($user) {
                $q->orWhere('owner_id', $user->getKey());
            }
        });
    }

    /** მხოლოდ საბაზისო (კოდში აღწერილი) მოდულები */
    public function scopeBase(Builder $query): Builder
    {
        return $query->whereNull('owner_id');
    }

    /**
     * აუდიტის მოდული — პირადი მოდულის შექმნა/გადარქმევა მისი მფლობელის
     * **ანგარიშის** ფაქტია, საბაზისოს ცვლილება კი ადმინისტრაციის.
     */
    public function auditModule(): string
    {
        return $this->isCustom() ? 'account' : 'admin';
    }
}
