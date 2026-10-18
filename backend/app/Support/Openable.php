<?php

namespace App\Support;

use App\Models\CustomRecord;
use App\Models\Playlist;
use Illuminate\Database\Eloquent\Model;

/**
 * **რომელი ჩანაწერის გახსნა იწერება ჟურნალში**.
 *
 * ტიპი URL-ის სეგმენტია (`/audit/open/{type}/{id}`) და იგივე morph-ალიასი,
 * რაც `Relation::enforceMorphMap()`-შია — ე.ი. `audit_logs.subject_type`-ში
 * ზუსტად ის სიტყვა წერია, რასაც SPA აგზავნის. სია `TrashDomain::MODELS`-ის
 * ჩანაწერიანი მოდულებია + ფლეილისტი + პირადი მოდულის ჩანაწერი (ერთი ალიასი
 * ყველა პირად მოდულზე — `module` სვეტი ამბობს, რომელია).
 *
 * ⚠️ ადრე `Visitable` (ხილული „შევედი N-ჯერ", `record_visits`); მთვლელი
 * წაიშალა და გახსნა ახლა მხოლოდ ჟურნალშია (`AuditLog::ACTION_OPEN`).
 *
 * ⚠️ **მოდულის შემოწმება აქედან იკითხება და არა `module:@type`-ით**: ტიპი
 * მოდულის გასაღები ყოველთვის არაა (`playlist` → `song`, `custom_record` →
 * ჩანაწერის `module`).
 */
final class Openable
{
    /** @var array<string, class-string<Model>> */
    public const TYPES = [
        ...TrashDomain::MODELS,
        'playlist' => Playlist::class,
        'custom_record' => CustomRecord::class,
    ];

    /**
     * **ჩანაწერიანი მოდული გახსნის ჩაწერის გარეშე**.
     *
     * ⚠️ პირადი გალერეა და მორიგეობა ფანჯრის „გახსნას" არ იცნობს (ფოტო/დღე
     * ბადეში იხსნება) — `TYPES` კი `TrashDomain::MODELS`-ს იმეორებს და მათ
     * თავისით შემოიყვანდა.
     */
    public const NOT_OPENED = ['personal', 'duty'];

    /** @return array<string, class-string<Model>> */
    public static function types(): array
    {
        return array_diff_key(self::TYPES, array_flip(self::NOT_OPENED));
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
