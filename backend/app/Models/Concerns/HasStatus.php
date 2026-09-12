<?php

namespace App\Models\Concerns;

use App\Models\Status;
use App\Support\StatusDomain;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;

/**
 * **მართვადი სტატუსი ჩანაწერზე (Tasks §6.4).**
 *
 * ექვსივე დომენს ერთი და იგივე ქცევა აქვს, ამიტომ ის ერთ trait-შია და არა
 * ექვს მოდელში გადაწერილი: `status_id` → `statuses` რიგზე, საიდანაც
 * იკითხება **გასაღები** (`status_key`) და **მნიშვნელობა** (`status_role`).
 *
 * ⚠️ **`status` სვეტი აღარ არსებობს.** ერთი ფაქტი ორ ადგილას (enum + FK)
 * გარდაუვლად დაშორდებოდა — ზუსტად ის ხაფანგი, რომელსაც `Book::syncProgress()`
 * ებრძვის. ამიტომ `$record->status` აღარ არის სტრიქონი; ვინც სტრიქონს
 * ელოდება, `status_key`-ს კითხულობს.
 *
 * ⚠️ **სტატუსის გარეშე ჩანაწერი კანონიერია** (`status_id = null`): ლექსიკონში
 * ყველაფერი იშლება, ე.ი. სტატუსის წაშლისას ჩანაწერი ან სხვაზე გადადის, ან
 * ცარიელი რჩება — იგივე წესი, რაც ჟანრებსა და კატეგორიებზეა.
 */
trait HasStatus
{
    protected static function bootHasStatus(): void
    {
        /* ახალ ჩანაწერს ნაგულისხმევი სტატუსი თავისით ერგება — ძველი enum-ის
           `default 'undecided'`-ის ზუსტი შემცვლელი. ⚠️ `user_id` აქამდე უკვე
           შევსებულია (`BelongsToUser::creating`), ე.ი. რიგი სწორი ანგარიშის
           ლექსიკონიდან მოდის. */
        static::creating(function ($model) {
            if ($model->status_id || ! $model->user_id) {
                return;
            }

            $model->status_id = Status::defaultFor((int) $model->user_id, $model->statusDomain())?->id;
        });
    }

    /** ამ მოდელის დომენი `StatusDomain`-ის რუკაში */
    public function statusDomain(): string
    {
        return StatusDomain::TABLES[$this->getTable()];
    }

    /**
     * ⚠️ **`owner` scope-ის გარეშე.** `Status`-ს `BelongsToUser` აქვს, ე.ი.
     * სხვისი პროფილის ან დამთხვევების კითხვისას (`PublicProfileService`,
     * `MatchService`) მისი სტატუსი **ცარიელი დაბრუნდებოდა** — ბარათი
     * სტატუსის გარეშე დაიხატებოდა და „ორივემ ნანახი" ყოველთვის ნული იქნებოდა.
     * რიგი ისედაც მხოლოდ `status_id`-ით მიიღწევა, ჩანაწერი კი უკვე გაფილტრულია.
     */
    public function status(): BelongsTo
    {
        return $this->belongsTo(Status::class)->withoutGlobalScope('owner');
    }

    /** სტატუსის გასაღები — სწორედ ის, რასაც API აბრუნებს და `?view=` კითხულობს */
    public function getStatusKeyAttribute(): ?string
    {
        return $this->status?->key;
    }

    /** `todo` · `doing` · `done`; `null` — სტატუსი არ აქვს */
    public function getStatusRoleAttribute(): ?string
    {
        return $this->status?->role;
    }

    /** „გაკეთებულია" — `MatchService`-ის და `watched_at`-ის ერთადერთი კრიტერიუმი */
    public function isStatusDone(): bool
    {
        return $this->status_role === 'done';
    }

    /**
     * „როდის დასრულდა" სვეტი — `done` როლზე ივსება და სხვაგვარად იწმინდება.
     *
     * ⚠️ ვიდეო, ჩანაწერი და ბუკმარკი `null`-ს აბრუნებენ: ვიდეოს `watched_at`
     * **დაკვრის** დროშტამპია (`POST /videos/{id}/watched`) და არა „მე
     * მოვნიშნე ნანახად" — ერთ სვეტში ორი ფაქტი ზუსტად ის ხაფანგია,
     * რომელსაც `Book::syncProgress()` ებრძვის.
     */
    protected function statusDoneColumn(): ?string
    {
        return 'watched_at';
    }

    /**
     * სტატუსის მინიჭება **გასაღებით** — ერთადერთი გზა, რომლითაც კონტროლერი
     * `status_id`-ს ცვლის (`watched_at`-იც აქვე მოწესრიგდება).
     *
     * @return bool იპოვა თუ არა ლექსიკონში (`false` — უცნობი გასაღები)
     */
    public function applyStatusKey(?string $key): bool
    {
        $status = null;

        if ($key !== null && $key !== '') {
            $status = Status::withoutGlobalScope('owner')
                ->where('user_id', $this->user_id ?: Auth::id())
                ->where('module', $this->statusDomain())
                ->where('key', $key)
                ->first();

            if (! $status) {
                return false;
            }
        }

        $this->applyStatus($status);

        return true;
    }

    /** იგივე, უკვე წაკითხულ რიგზე — მასობრივი ცვლილება ერთ რიგს ერთხელ კითხულობს */
    public function applyStatus(?Status $status): void
    {
        $this->status_id = $status?->id;
        $this->setRelation('status', $status);

        if ($column = $this->statusDoneColumn()) {
            $this->{$column} = $status?->role === 'done'
                ? ($this->{$column} ?? now())
                : null;
        }
    }

    /* ---------- სკოუპები ---------- */

    /**
     * გაფილტვრა **გასაღებით** (`?view=watched`, `/sync`-ის ფილტრი, purge).
     *
     * ⚠️ `whereHas` და არა `where('status', …)`: გასაღები ლექსიკონშია და არა
     * ჩანაწერზე. სია `[]` ნიშნავს „ფილტრი არ არის" და არა „არაფერი" —
     * ცარიელი `whereIn` ყველაფერს ჩუმად ჭრიდა.
     *
     * @param  string|list<string>  $keys
     */
    public function scopeStatusKey(Builder $query, string|array $keys): Builder
    {
        $keys = array_values(array_filter((array) $keys, fn ($k) => $k !== '' && $k !== null));

        if (! $keys) {
            return $query;
        }

        return $query->whereHas('status', fn (Builder $q) => $q->whereIn('key', $keys));
    }

    /**
     * გაფილტვრა **მნიშვნელობით**. ფრანჩაიზის ბეჯსა და „ორივემ ნანახი"-ს
     * სახელი ვერ უპასუხებს — მხოლოდ როლი.
     *
     * @param  string|list<string>  $roles
     */
    public function scopeStatusRole(Builder $query, string|array $roles): Builder
    {
        $roles = array_values((array) $roles);

        if (! $roles) {
            return $query;
        }

        return $query->whereHas('status', fn (Builder $q) => $q->whereIn('role', $roles));
    }
}
