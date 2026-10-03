<?php

namespace App\Support;

use App\Models\CustomRecord;
use App\Models\Playlist;
use Illuminate\Database\Eloquent\Model;

/**
 * **რომელ ჩანაწერს აქვს შესვლების ჟურნალი** (Tasks §10.3).
 *
 * ტიპი URL-ის სეგმენტია (`/visits/{type}/{id}`) და იგივე morph-ალიასი, რაც
 * `Relation::enforceMorphMap()`-შია — ე.ი. `visitable_type` სვეტში ზუსტად ის
 * სიტყვა წერია, რასაც SPA აგზავნის. სია `TrashDomain::MODELS`-ის თორმეტი
 * ჩანაწერიანი მოდულია + ფლეილისტი + პირადი მოდულის ჩანაწერი (ერთი ალიასი
 * ყველა პირად მოდულზე — `module` სვეტი ამბობს, რომელია).
 *
 * ⚠️ **მოდულის შემოწმება აქედან იკითხება და არა `module:@type`-ით**: ტიპი
 * მოდულის გასაღები ყოველთვის არაა (`playlist` → `song`, `custom_record` →
 * ჩანაწერის `module`).
 */
final class Visitable
{
    /** @var array<string, class-string<Model>> */
    public const TYPES = [
        ...TrashDomain::MODELS,
        'playlist' => Playlist::class,
        'custom_record' => CustomRecord::class,
    ];

    /**
     * **ჩანაწერიანი მოდული მთვლელის გარეშე** (Tasks §33 ← §43).
     *
     * ⚠️ §43 ხილულ მთვლელს ყველგან აუქმებს (ჟურნალი სუპერადმინს რჩება), ე.ი.
     * ახალ მოდულს ის აღარ უკეთდება — `TYPES` კი `TrashDomain::MODELS`-ს
     * იმეორებს და ახალ ჩანაწერს თავისით შემოიყვანდა.
     */
    public const NOT_VISITED = ['personal'];

    /** @return array<string, class-string<Model>> */
    public static function types(): array
    {
        return array_diff_key(self::TYPES, array_flip(self::NOT_VISITED));
    }

    public static function has(string $type): bool
    {
        return isset(self::types()[$type]);
    }

    /** @return list<string> */
    public static function keys(): array
    {
        return array_keys(self::types());
    }

    /** @return class-string<Model> */
    public static function model(string $type): string
    {
        return self::types()[$type];
    }

    /** რომელი მოდულის უფლება სჭირდება ამ ჩანაწერს */
    public static function module(string $type, Model $record): string
    {
        return match ($type) {
            'playlist' => 'song',
            'custom_record' => (string) $record->getAttribute('module'),
            default => $type,
        };
    }
}
