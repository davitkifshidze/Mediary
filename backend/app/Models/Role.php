<?php

namespace App\Models;

use App\Support\DictionaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * როლი (Tasks 1.6) — **გლობალური** ლექსიკონი, არა per-user.
 *
 * უფლება მოდულის შიდა CRUD-ია (19.8): `permissions` = `{"<module>": ["view", …]}`.
 * `null` = შეზღუდვის გარეშე (`super_admin`).
 *
 * ⚠️ **„ყველა მოდულის" ნიღაბი (`"*"`) აღარ არსებობს (2026-09-15, შენი
 * მითითება).** ის ერთადერთი მექანიზმი იყო, რომლითაც *ხვალ დამატებული*
 * მოდული ავტომატურად იხსნებოდა; მისი მოხსნის ფასი ზუსტად ესაა — **ახალი
 * მოდული ყველა როლზე ცხადად უნდა მოინიშნოს**. სანაცვლოდ უფლება იმას
 * ნიშნავს, რაც წერია: ფარული, მატრიცაში უხილავი წყარო აღარ დგას.
 * ძველი `"*"` ჩანაწერები მიგრაციამ თითოეულ მოდულად გაშალა, ე.ი.
 * არსებულ როლს წვდომა არ დაუკარგავს.
 */
class Role extends Model
{
    /** უფლების ოთხი მოქმედება — ინტერფეისის მატრიცის სვეტები */
    public const ACTIONS = ['view', 'create', 'update', 'delete'];

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

        $granted = $this->permissions[$module] ?? [];

        return in_array($action, (array) $granted, true);
    }

    /**
     * **ადმინის სექციაზე წვდომა (Tasks 1.6)** — `/users`, `/roles`, `/requests`.
     *
     * ⚠️ **წვდომა მხოლოდ ცხადად ჩაწერილი `admin:<resource>`-ით მიიღება.**
     * არც ერთი მოდულის უფლება — რამდენიც უნდა იყოს — აქ არ ვრცელდება:
     * ეს უფლების გაფართოებაა და არა მოხერხებულობა.
     */
    public function allowsAdmin(string $resource, string $action): bool
    {
        if ($this->isSuperAdmin() || $this->permissions === null) {
            return true;
        }

        $granted = $this->permissions[self::ADMIN_PREFIX.$resource] ?? [];

        return in_array($action, (array) $granted, true);
    }

    /**
     * **SEC-02 — აძლევს თუ არა ეს როლი ისეთ ადმინ-ძალაუფლებას, რაც `$other`-ს არ აქვს?**
     *
     * „`admin:users`-ის მქონე" სხვის — და საკუთარ — ანგარიშს როლს უცვლის;
     * თუ ეს კითხვა არ ჰკითხოს, ერთ `PATCH`-ით `super_admin` ხდება, ე.ი.
     * `/admin/purge`-ს, `/admin/backups`-ს (მთელი ბაზა ჰეშებით) და
     * `admin/modules`-ს იღებს — ზუსტად ის, რაც `admin_access`-ის სექციებიდან
     * განზრახ გარეთ დარჩა.
     *
     * ⚠️ **მოდულების CRUD-ი აქ განზრახ არ ითვლება.** მოდულის უფლება მხოლოდ
     * **საკუთარ** ბიბლიოთეკაზე მოქმედებს (`owner` scope), ე.ი. ვინმესთვის
     * `movie.delete`-ის მიცემა მიმცემს ახალ ძალაუფლებას არ აძლევს. თუ ის
     * ითვლებოდა, `admin:users`-ის მქონე (მოდულების უფლებების გარეშე) ვეღარ
     * მიანიჭებდა ჩვეულებრივ `user` როლს — რომელსაც ყველა მოდულზე CRUD
     * აქვს — და ვეღარ მართავდა ჩვეულებრივ მომხმარებლებს: ფიქსი სექციას
     * გამოუსადეგარს გახდიდა. ესკალაცია = `super_admin` და `admin:<resource>`.
     *
     * ⚠️ **შედარება `allowsAdmin()`-ითაა**, და არა JSON-ების პირდაპირ
     * შედარებით — ზუსტად იმ ფუნქციით, რომლითაც `EnsureAdminAccess`
     * უფლებას ამოწმებს; ცალკე ლოგიკა ერთ დღეს სხვა პასუხს მისცემდა.
     * `permissions = null` (`allowsAdmin` → true) ამიტომ თავისთავად
     * „ყველა სექციას" ნიშნავს.
     */
    public function exceedsAdmin(Role $other): bool
    {
        if ($other->isSuperAdmin()) {
            return false;
        }

        // `super_admin` middleware მხოლოდ `key`-ს ცნობს — `null`-როლიც მას ჩამორჩება
        if ($this->isSuperAdmin()) {
            return true;
        }

        foreach (self::ADMIN_RESOURCES as $resource) {
            foreach (self::ACTIONS as $action) {
                if ($this->allowsAdmin($resource, $action) && ! $other->allowsAdmin($resource, $action)) {
                    return true;
                }
            }
        }

        return false;
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
        // ⚠️ იგივე ალგორითმი, რაც ლექსიკონებს (`DictionaryKey`, §B3) — ოღონდ
        // როლი **გლობალურია**, ე.ი. `user_id`-ის ფილტრი აქ არ არსებობს
        return DictionaryKey::make(
            $name,
            fn (string $key) => static::where('key', $key)->exists(),
            'role',
        );
    }
}
