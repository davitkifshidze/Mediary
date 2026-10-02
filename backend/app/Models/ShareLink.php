<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * **გაზიარების ბმული (Tasks §40).**
 *
 * ⚠️ **ხილვადობის ერთადერთი გამონაკლისია.** ყველგან სხვაგან უცხო თვალი მხოლოდ
 * სამივე ფენით საჯაროს ხედავს (პროფილი → მოდული → ჩანაწერი); ბმული კი თვითონაა
 * მფლობელის ცხადი თანხმობა, ე.ი. ფარგლებში მოხვედრილი **პირადი** ჩანაწერიც ჩანს
 * (შექმნის ფანჯარა ამას წითლად ამბობს). დაცვა: გრძელი შემთხვევითი ტოკენი, ვადა
 * და ნებისმიერ დროს გაუქმება.
 *
 * ⚠️ **ტოკენი ორჯერ ინახება** (`token_hash` ძებნისთვის, `token` დაშიფრული —
 * ხელახლა საჩვენებლად). ძებნა **მხოლოდ ჰეშით** ხდება (`findByToken()`).
 */
class ShareLink extends Model
{
    use BelongsToUser;

    /** ტოკენის სიგრძე — `ResetLink`-ის 48 სიმბოლო (~285 ბიტი) */
    public const TOKEN_LENGTH = 48;

    /** ვადის არჩევანი დღეებით; `null` — უვადო */
    public const EXPIRY_DAYS = [7, 30, 365];

    public const DEFAULT_EXPIRY_DAYS = 30;

    protected $fillable = ['name', 'domains', 'show_status', 'show_rating', 'expires_at'];

    /** ⚠️ ტოკენი არც ერთ მასივად გადაქცევაში არ უნდა გავიდეს (აუდიტი, JSON) */
    protected $hidden = ['token', 'token_hash'];

    protected function casts(): array
    {
        return [
            'domains' => 'array',
            'show_status' => 'boolean',
            'show_rating' => 'boolean',
            'token' => 'encrypted',
            'expires_at' => 'datetime',
            'revoked_at' => 'datetime',
            'last_opened_at' => 'datetime',
            'views' => 'integer',
            'imports' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * ახალი ტოკენი — ძველი ამ წამიდან **აღარ იძებნება** (ჰეში იცვლება).
     * აბრუნებს ნედლ მნიშვნელობას.
     */
    public function assignNewToken(): string
    {
        $token = Str::random(self::TOKEN_LENGTH);

        $this->token = $token;
        $this->token_hash = self::hash($token);

        return $token;
    }

    /**
     * ღია ტოკენი მფლობელის ეკრანისთვის — წაუკითხავზე `null`.
     *
     * ⚠️ **`APP_KEY` შეიცვალა** (GAP-11 — ეს უკვე მოხდა ერთხელ): დაშიფრული
     * ასლი აღარ იხსნება, ბმული კი **მაინც მუშაობს** (ძებნა ჰეშითაა). ეკრანი
     * მაშინ „ბმული ვეღარ იკითხება · ახალი ბმული"-ს ამბობს —
     * `UserCredential::isReadable()`-ის ყალიბი.
     */
    public function plainToken(): ?string
    {
        try {
            return $this->token;
        } catch (DecryptException) {
            return null;
        }
    }

    /** აბსოლუტური ბმული (აპის გარეთ მიდის — `ResetLink`-ის წესი) */
    public function url(): ?string
    {
        $token = $this->plainToken();

        return $token === null
            ? null
            : rtrim((string) config('mediary.frontend_url'), '/').'/share/'.$token;
    }

    public function isRevoked(): bool
    {
        return $this->revoked_at !== null;
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    /** `active` · `expired` · `revoked` — გაუქმება ვადაზე წინ დგას */
    public function state(): string
    {
        return $this->isRevoked() ? 'revoked' : ($this->isExpired() ? 'expired' : 'active');
    }

    /**
     * ბმული ტოკენით — **ჰეშით** და `owner` scope-ის გარეშე: მნახველი
     * მფლობელი არაა (ანონიმს scope არ აქვს, შესულ უცხოს კი საკუთარ რიგებზე
     * მოჭრიდა — `PublicProfileService::query()`-ის ორმხრივი გაკვეთილი).
     */
    public static function findByToken(string $token): ?self
    {
        return static::withoutGlobalScopes()->where('token_hash', self::hash($token))->first();
    }

    public static function hash(string $token): string
    {
        return hash('sha256', $token);
    }
}
