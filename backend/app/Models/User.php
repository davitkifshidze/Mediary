<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'first_name', 'last_name', 'username', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'settings' => 'array',
        ];
    }

    /* ---------- relations ---------- */

    public function movies(): HasMany
    {
        return $this->hasMany(Movie::class);
    }

    public function series(): HasMany
    {
        return $this->hasMany(Series::class);
    }

    public function videos(): HasMany
    {
        return $this->hasMany(Video::class);
    }

    public function modules(): BelongsToMany
    {
        return $this->belongsToMany(Module::class)
            // ⚠️ `is_hidden` და არა `hidden` — `hidden` Eloquent-ის protected თვისებაა
            ->withPivot('settings', 'enabled_at', 'is_hidden');
    }

    public function approvalRequests(): HasMany
    {
        return $this->hasMany(ApprovalRequest::class);
    }

    /* ---------- helpers ---------- */

    public function isSuperAdmin(): bool
    {
        return $this->role === 'super_admin';
    }

    /**
     * ჩართული აქვს თუ არა მოდული.
     *
     * super_admin-ს ყველა ჩვეულებრივი მოდული ავტომატურად აქვს, **გარდა
     * sensitive-ისა** (`is_sensitive`, მაგ. 18+): ისინი „default off"-ია ყველასთვის
     * და აშკარა ჩართვას მოითხოვს (I5).
     *
     * K13: pivot-ის `is_hidden` ნიშნავს „მე თვითონ გამოვრთე" — უფლება რჩება,
     * მაგრამ მოდული ჩემთვის ჩაკეტილია (UI-შიც და API-შიც).
     */
    public function hasModule(string $key): bool
    {
        $row = $this->modules()
            ->where('key', $key)
            ->where('modules.is_active', true)
            ->first();

        if ($row) {
            return ! $row->pivot->is_hidden;
        }

        if (! $this->isSuperAdmin()) {
            return false;
        }

        return Module::where('key', $key)
            ->where('is_active', true)
            ->where('is_sensitive', false)
            ->exists();
    }

    /** აქვს თუ არა უფლება (ადმინმა ჩართო), თუნდაც თვითონ გამორთული ჰქონდეს */
    public function isGrantedModule(string $key): bool
    {
        if ($this->modules()->where('key', $key)->exists()) {
            return true;
        }

        return $this->isSuperAdmin()
            && Module::where('key', $key)->where('is_active', true)->where('is_sensitive', false)->exists();
    }

    /** ჩართული მოდულების key-ები (ნავიგაციისთვის) */
    public function moduleKeys(): array
    {
        return $this->enabledModules()->pluck('key')->all();
    }

    /**
     * ჩართული მოდულები დალაგებული — super_admin-ს ყველა აქტიური, sensitive-ის გარდა.
     * თვითონ გამორთული (`is_hidden`) აქ არ ხვდება (K13).
     */
    public function enabledModules()
    {
        $pivots = $this->modules()->get()->keyBy('id');

        if ($this->isSuperAdmin()) {
            return Module::where('is_active', true)
                ->where(fn ($q) => $q->where('is_sensitive', false)->orWhereIn('id', $pivots->keys()))
                ->orderBy('sort_order')->orderBy('id')
                ->get()
                ->reject(fn (Module $m) => (bool) $pivots->get($m->id)?->pivot?->is_hidden)
                ->values();
        }

        return $pivots
            ->filter(fn (Module $m) => $m->is_active && ! $m->pivot->is_hidden)
            ->sortBy([['sort_order', 'asc'], ['id', 'asc']])
            ->values();
    }

    /** სრული სახელი — first+last, ან `name`, ან username */
    public function displayName(): string
    {
        $full = trim(($this->first_name ?? '').' '.($this->last_name ?? ''));

        return $full ?: ($this->name ?: (string) $this->username);
    }
}
