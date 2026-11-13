<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * **აღწერის ვექტორი** — სათაურის სიუჟეტი რიცხვების მწკრივად (Gemini-ის embedding).
 *
 * ⚠️ გლობალურია და TMDB-ის id-ით ინახება: ვექტორი ერთხელ ითვლება და ლიმიტს მეორედ
 * აღარ ხარჯავს — არც ჩემს შემდეგ გახსნაზე, არც სხვა ანგარიშზე.
 * ⚠️ `vector` float32-ების მწკრივია base64-ით და არა JSON: 768 რიცხვი JSON-ად
 * ~15 KB-ია, ასე — 4 KB.
 */
class SuggestionVector extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'tmdb_id' => 'integer',
    ];

    /** @param  list<float>  $values */
    public static function encode(array $values): string
    {
        return base64_encode(pack('g*', ...$values));
    }

    /** @return list<float> */
    public function values(): array
    {
        $raw = base64_decode((string) $this->vector, true);

        return $raw === false || $raw === '' ? [] : array_values(unpack('g*', $raw) ?: []);
    }
}
