<?php

namespace App\Support;

/**
 * **შეტყობინების სახეები (FEAT-19) — ერთი რეესტრი.**
 *
 * ⚠️ **ტექსტი აქ არ წერია და ვერც დაიწერება.** სახე მანქანური კოდია,
 * წინადადება კი i18n-შია (`notifications.kind.<type>`) — ენა ბრაუზერში
 * ირჩევა, ე.ი. ბაზაში ჩაწერილი ქართული წინადადება ინგლისურ ინტერფეისზე
 * ქართულად დარჩებოდა. იგივე წესი, რის გამოც `status.*` გასაღებები
 * წაიშალა (§6.4).
 *
 * ⚠️ **ახალი სახე = ერთი კონსტანტა აქ + ორი თარგმანი**; UI-ს ცალკე
 * შესწორება არ სჭირდება, რადგან ის `type`-ს ხატავს და არა `switch`-ს.
 * `NotificationTest` ამოწმებს, რომ ორივე ლოკალს გასაღები ჰქონდეს — ე.ი.
 * დავიწყებული თარგმანი ჩუმად ნედლ კოდს არ დახატავს.
 */
final class NotificationType
{
    /** მოდულის/კვოტის მოთხოვნა დაამტკიცეს */
    public const REQUEST_APPROVED = 'request_approved';

    /** მოთხოვნა უარყვეს */
    public const REQUEST_REJECTED = 'request_rejected';

    /** საცავი ივსება — `StorageMeter::WARN_AT` / `CRITICAL_AT` გადაილახა */
    public const STORAGE_WARNING = 'storage_warning';

    /** ბაზის ასლი ჩავარდა (§22) */
    public const BACKUP_FAILED = 'backup_failed';

    /** ფონური პარტია დასრულდა (სინქრონი · გალერეა · თარგმანი) */
    public const BATCH_DONE = 'batch_done';

    /** @var list<string> */
    public const ALL = [
        self::REQUEST_APPROVED,
        self::REQUEST_REJECTED,
        self::STORAGE_WARNING,
        self::BACKUP_FAILED,
        self::BATCH_DONE,
    ];

    /**
     * სად მიდის დაჭერისას — **SPA-ს მარშრუტი**.
     *
     * ⚠️ **სერვერზე წერია და არა ფრონტზე**: სახეც და მისი ადგილიც ერთი
     * გადაწყვეტილებაა, ხოლო ორ ფაილში გაყოფილი რუკა პირველივე ახალ სახეზე
     * ერთ ნახევარს დაივიწყებდა (`resultPath()`-ის იგივე მსჯელობა, მხოლოდ
     * საპირისპირო მიმართულებით: იქ მარშრუტი `modules.route_base`-იდან
     * გამოითვლება, აქ გამოსათვლელი არაფერია).
     */
    public static function route(string $type): ?string
    {
        return match ($type) {
            self::REQUEST_APPROVED, self::REQUEST_REJECTED => '/modules',
            self::STORAGE_WARNING => '/profile',
            self::BACKUP_FAILED => '/backups',
            default => null,
        };
    }
}
