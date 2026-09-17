<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
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

    /**
     * როლის გარეშე შექმნილი ანგარიში ჩვეულებრივი მომხმარებელია (Tasks 1.6).
     * ეს ძველი `users.role` enum-ის `default('user')`-ის ჩამნაცვლებელია — FK-ს
     * დინამიური default ვერ მიეცემა, ამიტომ მოდელზეა.
     */
    protected static function booted(): void
    {
        static::creating(function (User $user) {
            $user->role_id ??= Role::where('key', 'user')->value('id');
        });
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

    /** §7.1 — მესამე მედია-დომენი; `StorageMeter::files()` ამ სახელით ეძებს */
    public function animes(): HasMany
    {
        return $this->hasMany(Anime::class);
    }

    public function videos(): HasMany
    {
        return $this->hasMany(Video::class);
    }

    public function songs(): HasMany
    {
        return $this->hasMany(Song::class);
    }

    public function books(): HasMany
    {
        return $this->hasMany(Book::class);
    }

    public function bookmarks(): HasMany
    {
        return $this->hasMany(Bookmark::class);
    }

    public function boardGames(): HasMany
    {
        return $this->hasMany(BoardGame::class);
    }

    public function games(): HasMany
    {
        return $this->hasMany(Game::class);
    }

    /** Tasks §13 — ცხრილი `note_entries`-ია (უნივერსალური `notes` აღარ არსებობს) */
    public function noteEntries(): HasMany
    {
        return $this->hasMany(NoteEntry::class);
    }

    public function modules(): BelongsToMany
    {
        return $this->belongsToMany(Module::class)
            // ⚠️ `is_hidden`/`is_public` და არა `hidden`/`public` — მოკლე სახელები
            // Eloquent-ის protected თვისებებს ეჯახება და pivot-იდან ჩუმად არასწორ
            // მნიშვნელობას აბრუნებდა. `is_public` = ჩანს თუ არა საჯარო პროფილზე (16.1).
            // `storage_limit_bytes` — §17.2 (null = ცალკე ლიმიტი არ აქვს)
            ->withPivot('settings', 'enabled_at', 'is_hidden', 'is_public', 'storage_limit_bytes');
    }

    public function approvalRequests(): HasMany
    {
        return $this->hasMany(ApprovalRequest::class);
    }

    /** როლი (Tasks 1.6) — ადრე `users.role` enum იყო */
    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    /* ---------- helpers ---------- */

    /**
     * როლის `key` — ძველი `$user->role` სტრიქონის ექვივალენტი.
     * ⚠️ `$this->role` **ობიექტია** (relation), ამიტომ სტრიქონული შედარებები
     * ამ მეთოდზე უნდა გადიოდეს.
     */
    public function roleKey(): string
    {
        return $this->role?->key ?? 'user';
    }

    public function isSuperAdmin(): bool
    {
        return $this->roleKey() === 'super_admin';
    }

    /** როლის მინიჭება key-ით (bootstrap, რეგისტრაცია, ტესტები) */
    public function assignRole(string $key): static
    {
        $this->role_id = Role::where('key', $key)->value('id');

        return $this;
    }

    /**
     * **ფაქტობრივად მოქმედი როლი.** როლის გარეშე დარჩენილი (ძველი რიგი)
     * ჩვეულებრივი მომხმარებლის (`user`) უფლებებით ცხოვრობს.
     *
     * ⚠️ ერთ ადგილას, რადგან ეს ფოლბექი სამ მეთოდში იწერებოდა — და SEC-02-ის
     * „აღემატება თუ არა" შედარება **ზუსტად იმავე** როლს უნდა ადარებდეს, რასაც
     * `hasPermission()` ამოწმებს, თორემ ორი პასუხი ერთ კითხვაზე შეიძლება
     * განსხვავდეს.
     */
    public function effectiveRole(): ?Role
    {
        return $this->role ?? Role::where('key', 'user')->first();
    }

    /**
     * მოდულის შიდა უფლება (Tasks 1.6 / 19.8) — `view` · `create` · `update` · `delete`.
     * ⚠️ ეს **მოდულზე წვდომას არ ამოწმებს** — ის `hasModule()`-ია. ორივე სჭირდება:
     * წვდომა → მოდული ჩართულია თუ არა, უფლება → ჩართულის შიგნით რა შეუძლია.
     */
    public function hasPermission(string $module, string $action): bool
    {
        if ($this->isSuperAdmin()) {
            return true;
        }

        return (bool) $this->effectiveRole()?->allows($module, $action);
    }

    /**
     * **ადმინის სექციაზე წვდომა (Tasks 1.6)** — `users` | `roles` | `requests`.
     *
     * ⚠️ `super_admin` ყოველთვის გადის; დანარჩენს **ცხადად ჩაწერილი**
     * `admin:<resource>` სჭირდება (`"*"` აქ არ მოქმედებს — იხ. `Role`).
     */
    public function hasAdminAccess(string $resource, string $action = 'view'): bool
    {
        if ($this->isSuperAdmin()) {
            return true;
        }

        return (bool) $this->effectiveRole()?->allowsAdmin($resource, $action);
    }

    /** რომელ ადმინის სექციებს ხედავს — საიდბარისა და `/auth/me`-სთვის */
    public function adminResources(): array
    {
        if ($this->isSuperAdmin()) {
            return Role::ADMIN_RESOURCES;
        }

        return $this->effectiveRole()?->adminResources() ?? [];
    }

    /**
     * ჩართული აქვს თუ არა მოდული. super_admin-ს ყველა აქტიური მოდული აქვს.
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

        return Module::where('key', $key)->where('is_active', true)->exists();
    }

    /** აქვს თუ არა უფლება (ადმინმა ჩართო), თუნდაც თვითონ გამორთული ჰქონდეს */
    public function isGrantedModule(string $key): bool
    {
        if ($this->modules()->where('key', $key)->exists()) {
            return true;
        }

        return $this->isSuperAdmin()
            && Module::where('key', $key)->where('is_active', true)->exists();
    }

    /** ჩართული მოდულების key-ები (ნავიგაციისთვის) */
    public function moduleKeys(): array
    {
        return $this->enabledModules()->pluck('key')->all();
    }

    /**
     * ჩართული მოდულები დალაგებული — super_admin-ს ყველა აქტიური.
     * თვითონ გამორთული (`is_hidden`) აქ არ ხვდება (K13).
     */
    public function enabledModules()
    {
        $pivots = $this->modules()->get()->keyBy('id');

        if ($this->isSuperAdmin()) {
            return Module::where('is_active', true)
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
