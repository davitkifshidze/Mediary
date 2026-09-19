<?php

namespace App\Models;

use App\Support\Totp;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'first_name', 'last_name', 'username', 'email', 'password'])]
#[Hidden(['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes'])]
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
            // FEAT-16 — ორივე `APP_KEY`-ით იშიფრება (იხ. მიგრაციის შენიშვნა)
            'two_factor_secret' => 'encrypted',
            'two_factor_recovery_codes' => 'encrypted:array',
            'two_factor_confirmed_at' => 'datetime',
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

    /**
     * **„ჯერ არცერთი ანგარიში არ არსებობს?" — ჩაკეტილი წაკითხვა (Tasks SEC-15).**
     *
     * ⚠️ **მხოლოდ ტრანზაქციის შიგნით აქვს აზრი.** ღია რეგისტრაციაზე პირველი
     * ანგარიში super_admin-ია, ე.ი. „დათვალე და შექმენი" ორი ერთდროული
     * მოთხოვნისას **ორ** სუპერ-ადმინს იძლევა — ინსტალაციის დაპატრონება.
     * `lockForUpdate()` ცარიელ ცხრილზე InnoDB-ს ხარვეზის (gap) ლოკს ატანინებს,
     * ე.ი. მეორე მოთხოვნა პირველის დასრულებამდე ელოდება და უკვე 1-ს ხედავს.
     *
     * ⚠️ **ბილდერს აბრუნებს და არა `bool`-ს განზრახ**: sqlite-ის გრამატიკა
     * `for update`-ს უბრალოდ აგდებს, ე.ი. SQL-ზე დაწერილი ტესტი ტესტურ ბაზაზე
     * ვერაფერს დაიჭერდა — `getQuery()->lock` კი ორივე დრაივერზე ერთნაირად
     * ჩანს (`SecurityHeadersTest`-ის მეზობელი `AuthTest`).
     *
     * @return Builder<static>
     */
    public static function accountsLocked(): Builder
    {
        return static::query()->lockForUpdate();
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
     * აქტიური მოდულების key-ები — **მხოლოდ super_admin-ის შტოსთვის** (იხ. `hasModule()`).
     *
     * ⚠️ ის ერთადერთი კითხვაა, რომელზეც pivot-ი ვერ პასუხობს: super_admin-ს
     * მოდული შეიძლება საერთოდ არ ჰქონდეს მინიჭებული და მაინც ჰქონდეს. მემოც
     * სწორედ ამიტომ ცალკეა — ჩვეულებრივი მომხმარებელი მას არასდროს ეკითხება.
     */
    private ?array $activeModuleKeys = null;

    private function activeModuleKeys(): array
    {
        return $this->activeModuleKeys ??= Module::where('is_active', true)->pluck('key')->all();
    }

    /**
     * ჩართული აქვს თუ არა მოდული. super_admin-ს ყველა აქტიური მოდული აქვს.
     *
     * K13: pivot-ის `is_hidden` ნიშნავს „მე თვითონ გამოვრთე" — უფლება რჩება,
     * მაგრამ მოდული ჩემთვის ჩაკეტილია (UI-შიც და API-შიც).
     *
     * ⚠️ **პასუხი მეხსიერებიდან მოდის** (Tasks PERF-01). `$this->modules()`
     * query-builder-ია, ე.ი. **eager-loaded რელაციას იგნორირებდა** და ყოველ
     * გამოძახებაზე ბაზას ეკითხებოდა — ეს კი `foreach ($modules as $m) { if (!
     * $user->hasModule($m->key)) … }` შაბლონშია Dashboard-ში, `GalleryController`-ში,
     * `ModuleImages`-ში, `GlobalSearch`-სა და `MediaDomain`-ში. გაზომილი:
     * `/api/dashboard` 11 `module_user`-query, `/api/gallery` 14 — ერთისთვის,
     * რომელიც უკვე მეხსიერებაშია.
     *
     * ⚠️ **`loadMissing()` და არა საკუთარი მემო**: ეს Eloquent-ის საკუთარი
     * რელაციის ქეშია, ე.ი. `with('modules')`-ით წამოღებული სია ავტომატურად
     * იკითხება (PERF-04), და გაუქმებაც ჩვეულებრივი `refresh()`/`unsetRelation()`-ია.
     * ⚠️ თუ იმავე ინსტანციაზე წევრობას ან `is_hidden`-ს შეცვლი და მერე
     * ხელახლა ეკითხები — `unsetRelation('modules')` საჭიროა. დღეს ასეთი გზა
     * არ არსებობს: `setEnabled()`/`syncModules()` ჯერ ამოწმებენ და მერე წერენ,
     * ხოლო `enabledModules()`/`moduleKeys()` ისედაც ყოველ ჯერზე ბაზას კითხულობენ.
     */
    public function hasModule(string $key): bool
    {
        $this->loadMissing('modules');

        // ⚠️ არააქტიური მოდულის pivot-ი `null`-ია და არა `false` — ქვემოთ
        // super_admin-ის შტო მასაც ისევე უარყოფს, როგორც ადრე
        $row = $this->modules->first(fn (Module $m) => $m->key === $key && $m->is_active);

        if ($row) {
            return ! $row->pivot->is_hidden;
        }

        return $this->isSuperAdmin() && in_array($key, $this->activeModuleKeys(), true);
    }

    /**
     * აქვს თუ არა უფლება (ადმინმა ჩართო), თუნდაც თვითონ გამორთული ჰქონდეს.
     * ⚠️ `is_active`-ს **განზრახ არ ამოწმებს** — კითხვა წევრობაზეა და არა ხილვადობაზე.
     */
    public function isGrantedModule(string $key): bool
    {
        $this->loadMissing('modules');

        if ($this->modules->contains(fn (Module $m) => $m->key === $key)) {
            return true;
        }

        return $this->isSuperAdmin() && in_array($key, $this->activeModuleKeys(), true);
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

    /* ---------- ორფაქტორიანი შესვლა (FEAT-16) ---------- */

    /**
     * მოქმედებს თუ არა მეორე ფაქტორი.
     *
     * ⚠️ **საიდუმლოს არსებობა საკმარისი არ არის** — სანამ მომხმარებელს
     * კოდი არ შეუყვანია, ჩვენ არ ვიცით, ავთენტიფიკატორში საერთოდ ჩაიწერა
     * თუ არა; მაშინ ჩართვა ანგარიშის სამუდამო დაკეტვას ნიშნავდა.
     */
    public function hasTwoFactor(): bool
    {
        return $this->two_factor_confirmed_at !== null && (bool) $this->two_factor_secret;
    }

    /**
     * მეორე ფაქტორის შემოწმება — TOTP **ან** აღდგენის კოდი.
     *
     * ⚠️ **გამოყენებული აღდგენის კოდი აქვე იშლება** (`save()`-ით), ე.ი.
     * ერთი კოდი ერთხელ მუშაობს. სწორედ ამიტომ ეს მოდელზეა და არა
     * კონტროლერში: წაშლა და შემოწმება ერთი ქმედებაა და მათი დაშორება
     * იმას ნიშნავდა, რომ ერთ გზაზე კოდი მარადიული დარჩებოდა.
     */
    public function verifySecondFactor(string $code): bool
    {
        if (! $this->hasTwoFactor()) {
            return true;
        }

        if (Totp::verify((string) $this->two_factor_secret, $code)) {
            return true;
        }

        return $this->consumeRecoveryCode($code);
    }

    /** ახალი აღდგენის კოდები — აბრუნებს **ნედლ** სიას (ერთხელ საჩვენებლად) */
    public function regenerateRecoveryCodes(int $count = 8): array
    {
        $codes = collect(range(1, $count))->map(fn () => Totp::recoveryCode())->all();

        $this->two_factor_recovery_codes = $codes;

        return $codes;
    }

    private function consumeRecoveryCode(string $code): bool
    {
        $code = strtoupper(trim($code));
        $codes = $this->two_factor_recovery_codes ?? [];

        foreach ($codes as $i => $stored) {
            if (hash_equals((string) $stored, $code)) {
                unset($codes[$i]);
                $this->two_factor_recovery_codes = array_values($codes);
                $this->save();

                return true;
            }
        }

        return false;
    }

    /** სრული სახელი — first+last, ან `name`, ან username */
    public function displayName(): string
    {
        $full = trim(($this->first_name ?? '').' '.($this->last_name ?? ''));

        return $full ?: ($this->name ?: (string) $this->username);
    }
}
