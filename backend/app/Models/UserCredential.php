<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

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
     * ⚠️ პასუხში **არასდროს** მიდის — ეს მხოლოდ `CredentialStore`-ის
     * წასაკითხი გზაა. გაშიფვრის ჩავარდნა (შეცვლილი APP_KEY) ცარიელია
     * და არა გამონაკლისი: სხვა შემთხვევაში მთელი აპი დაეცემოდა.
     *
     * @return array<string, string>
     */
    public function fields(): array
    {
        try {
            $raw = $this->credentials;
        } catch (\Throwable) {
            return [];
        }

        return is_array($raw) ? $raw : [];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
