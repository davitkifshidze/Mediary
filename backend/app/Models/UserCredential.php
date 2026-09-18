<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Log;

/**
 * **ერთი მომხმარებლის ერთი გარე წყაროს გასაღები** (Tasks §21).
 *
 * ⚠️ **`BelongsToUser` განზრახ არ გამოიყენება.** ის გლობალურ სქოუპს დებს,
 * რომელიც `Auth::id()`-ს კითხულობს — `CredentialStore`-ს კი ჩანაწერი ხშირად
 * **ცხადად მითითებულ** მომხმარებელზე სჭირდება (ფონური სამუშაო, რომელიც
 * `Auth::setUser()`-ს აკეთებს, და CLI, სადაც `Auth::id()` საერთოდ არაა).
 * მაგიდა პატარაა და ყოველი წაკითხვა `where('user_id', …)`-ით ხდება, ე.ი.
 * სქოუპი მხოლოდ ჩუმ ცდომილებას დაამატებდა.
 *
 * ⚠️ **`credentials` `encrypted:array`-ია.** ე.ი. ბაზაში გასაღები ღიად არ
 * დევს და §22-ის დამპში, რომელიც ხელიდან ხელში გადადის, არ ჩაჰყვება.
 * ⚠️ APP_KEY-ის შეცვლა ამ სვეტს **წასაკითხად უვარგისს** ხდის —
 * `fields()` გაშიფვრის შეცდომას იჭერს და ცარიელ ნაკრებს აბრუნებს,
 * ე.ი. აპი საერთო გასაღებზე გადადის და არა 500-ზე.
 */
class UserCredential extends Model
{
    protected $fillable = [
        'user_id',
        'provider',
        'credentials',
        'limits',
        'is_active',
        'verified_at',
        'last_error',
    ];

    protected function casts(): array
    {
        return [
            'credentials' => 'encrypted:array',
            'limits' => 'array',
            'is_active' => 'boolean',
            'verified_at' => 'datetime',
        ];
    }

    /**
     * უკვე გავაფრთხილეთ ეს რიგი? (`user_id:provider`)
     *
     * ⚠️ სტატიკურია, რომ ერთი მოთხოვნა (და `queue:work`-ის ერთი პროცესი)
     * ლოგს ერთი და იმავე ხაზით არ აავსოს: `fields()` თითო წყაროზე
     * რამდენჯერმე იძახება (`usesOwnKey` → `source` → `value` → …).
     *
     * @var array<string, true>
     */
    private static array $warned = [];

    /** ტესტებისა და ხანგრძლივი პროცესებისთვის */
    public static function flushWarnings(): void
    {
        self::$warned = [];
    }

    /** `null` — ჯერ არ გვიცდია; იხ. `isReadable()` */
    private ?bool $readable = null;

    /**
     * ⚠️ პასუხში **არასდროს** მიდის — ეს მხოლოდ `CredentialStore`-ის
     * წასაკითხი გზაა. გაშიფვრის ჩავარდნა (შეცვლილი APP_KEY) ცარიელია
     * და არა გამონაკლისი: სხვა შემთხვევაში მთელი აპი დაეცემოდა.
     *
     * ⚠️ **სამაგიეროდ ჩუმი აღარაა (Tasks GAP-11).** ცარიელად წაკითხვა
     * ნიშნავს, რომ აპი საერთო `.env`-ის გასაღებზე გადავარდება (და პირადი
     * ლიმიტი ჩუმად საერთო გახდება), `/credentials` კი „არ არის"-ს აჩვენებს —
     * ე.ი. მანქანის შეცვლა ან `key:generate` ყველა ანგარიშის გასაღებს
     * **უხმოდ** აქრობდა. ახლა მდგომარეობა `isReadable()`-ით იკითხება და
     * ლოგში ერთხელ იწერება.
     *
     * @return array<string, string>
     */
    public function fields(): array
    {
        try {
            $raw = $this->credentials;
            $this->readable = true;
        } catch (\Throwable $e) {
            $this->readable = false;
            $this->warnOnce($e);

            return [];
        }

        return is_array($raw) ? $raw : [];
    }

    /**
     * **ეს რიგი ამ `APP_KEY`-ით იშიფრება? (Tasks GAP-11)**
     *
     * ⚠️ ცარიელი სვეტი **წასაკითხია** და არა გატეხილი: `firstOrNew`-ს ახალ
     * რიგს `credentials` საერთოდ არ აქვს, და მისი „undecryptable"-ად ჩვენება
     * ყველა ჯერ შეუვსებელ წყაროს გააფრთხილებდა.
     */
    public function isReadable(): bool
    {
        if ($this->readable === null) {
            $this->fields();
        }

        return $this->readable ?? true;
    }

    /**
     * **გაუშიფრავი რიგი ჩასაწერად მოამზადე (Tasks GAP-11).**
     *
     * ⚠️ **გარეშე `save()` თვითონ ცდება**: Eloquent-ის „რა შეიცვალა"
     * შემოწმება (`originalIsEquivalent()`) დაშიფრული cast-ის **ორიგინალს**
     * შიფრავს, ე.ი. იმავე `DecryptException`-ზე ვარდება. ე.ი. ახალი
     * გასაღების ჩაწერა — სწორედ ის ერთადერთი გამოსავალი, რაც მომხმარებელს
     * რჩება — 500-ს იძლეოდა. იგივე ხაფანგი SEC-12-ის მიგრაციას დაემართა.
     *
     * ⚠️ ორიგინალის გაბათილება **მონაცემს არ შლის** ბაზაში — ის მხოლოდ
     * მეხსიერებაშია, და მომდევნო `save()` მთელ სვეტს ახლით გადაწერს.
     * წასაკითხად უვარგისი ბლობის შენარჩუნებას ისედაც აზრი არ აქვს.
     */
    public function forgetUnreadable(): void
    {
        if (! $this->exists || $this->isReadable()) {
            return;
        }

        $this->setRawAttributes(array_merge($this->getAttributes(), ['credentials' => null]), true);
        $this->readable = true;
    }

    /**
     * ⚠️ **`warning` და არა `error`**: აპი აგრძელებს მუშაობას (საერთო
     * გასაღებზე ვარდნით), ე.ი. ეს დიაგნოსტიკაა და არა ავარია. ⚠️ ტექსტში
     * გასაღები ვერ ჩავარდება — გაშიფვრა ხომ ვერ მოხდა.
     */
    private function warnOnce(\Throwable $e): void
    {
        $key = $this->user_id.':'.$this->provider;

        if (isset(self::$warned[$key])) {
            return;
        }

        self::$warned[$key] = true;

        Log::warning('user credential cannot be decrypted — APP_KEY has changed?', [
            'user_id' => $this->user_id,
            'provider' => $this->provider,
            'reason' => $e->getMessage(),
        ]);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
