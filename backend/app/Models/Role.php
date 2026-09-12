<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * როლი (Tasks 1.6) — **გლობალური** ლექსიკონი, არა per-user.
 *
 * უფლება მოდულის შიდა CRUD-ია (19.8): `permissions` = `{"<module>": ["view", …]}`,
 * `"*"` კი ყველა მოდულს ნიშნავს. `null` = შეზღუდვის გარეშე (`super_admin`).
 */
class Role extends Model
{
    /** უფლების ოთხი მოქმედება — ინტერფეისის მატრიცის სვეტები */
    public const ACTIONS = ['view', 'create', 'update', 'delete'];

    /** ყველა მოდულის „ნიღაბი" */
    public const ANY_MODULE = '*';

    /**
     * **ადმინის სექციები (Tasks 1.6)** — მოდულები არ არიან, მაგრამ იმავე
     * მატრიცაში ცხოვრობენ: `permissions` JSON-ს ეს თავისუფლად იტევს.
     *
     * ⚠️ **გასაღები `admin:`-ით იწყება განზრახ.** უპრეფიქსოდ ხვალინდელი
     * მოდული სახელად `users` ჩუმად გახსნიდა მომხმარებლების სექციას.
     */
    public const ADMIN_RESOURCES = ['users', 'roles', 'requests', 'audit'];

    public const ADMIN_PREFIX = 'admin:';

    protected $guarded = ['id'];

    protected $casts = [
        'permissions' => 'array',
        'is_system' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function isSuperAdmin(): bool
    {
        return $this->key === 'super_admin';
    }

    /** აქვს თუ არა ამ როლს კონკრეტული მოქმედების უფლება მოდულზე */
    public function allows(string $module, string $action): bool
    {
        if ($this->isSuperAdmin() || $this->permissions === null) {
            return true;
        }

        $granted = $this->permissions[$module] ?? $this->permissions[self::ANY_MODULE] ?? [];

        return in_array($action, (array) $granted, true);
    }

    /**
     * **ადმინის სექციაზე წვდომა (Tasks 1.6)** — `/users`, `/roles`, `/requests`.
     *
     * ⚠️ **`"*"` აქ განზრახ არ მოქმედებს.** „ყველა მოდული" ზუსტად მოდულებს
     * ნიშნავს; მისი აქ გავრცელება ჩვეულებრივ როლს ადმინის პანელს ჩუმად
     * გაუხსნიდა — ეს უფლების გაფართოებაა და არა მოხერხებულობა. წვდომა
     * მხოლოდ ცხადად ჩაწერილი `admin:<resource>`-ით მიიღება.
     */
    public function allowsAdmin(string $resource, string $action): bool
    {
        if ($this->isSuperAdmin() || $this->permissions === null) {
            return true;
        }

        $granted = $this->permissions[self::ADMIN_PREFIX.$resource] ?? [];

        return in_array($action, (array) $granted, true);
    }

    /** აქვს თუ არა როლს რომელიმე ადმინის სექცია — საიდბარის ბმულებისთვის */
    public function adminResources(): array
    {
        return array_values(array_filter(
            self::ADMIN_RESOURCES,
            fn (string $resource) => $this->allowsAdmin($resource, 'view'),
        ));
    }

    /** სახელიდან უნიკალური key — ქართულ სახელზეც მუშაობს (slug ცარიელი გამოდის) */
    public static function makeKey(string $name): string
    {
        $base = Str::slug($name) ?: 'role';
        $key = $base;
        $n = 2;

        while (static::where('key', $key)->exists()) {
            $key = "{$base}-{$n}";
            $n++;
        }

        return mb_substr($key, 0, 60);
    }
}
