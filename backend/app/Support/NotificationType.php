<?php

namespace App\Support;

use App\Models\ApprovalRequest;

/**
 * **შეტყობინების სახეები — ერთი რეესტრი.**
 *
 * ⚠️ **ტექსტი აქ არ წერია და ვერც დაიწერება.** სახე მანქანური კოდია,
 * წინადადება კი i18n-შია (`notifications.kind.<type>`) — ენა ბრაუზერში
 * ირჩევა, ე.ი. ბაზაში ჩაწერილი ქართული წინადადება ინგლისურ ინტერფეისზე
 * ქართულად დარჩებოდა. იგივე წესი, რის გამოც `status.*` გასაღებები
 * წაიშალა.
 *
 * ⚠️ **ახალი სახე = ერთი კონსტანტა აქ + ორი თარგმანი**; UI-ს ცალკე
 * შესწორება არ სჭირდება, რადგან ის `type`-ს ხატავს და არა `switch`-ს.
 * `NotificationTest` ამოწმებს, რომ ორივე ლოკალს გასაღები ჰქონდეს — ე.ი.
 * დავიწყებული თარგმანი ჩუმად ნედლ კოდს არ დახატავს.
 */
final class NotificationType
{
    /** მოდულის/კვოტის/ატვირთვის ლიმიტის მოთხოვნა დაამტკიცეს */
    public const REQUEST_APPROVED = 'request_approved';

    /** მოთხოვნა უარყვეს */
    public const REQUEST_REJECTED = 'request_rejected';

    /** საცავი ივსება — `StorageMeter::WARN_AT` / `CRITICAL_AT` გადაილახა */
    public const STORAGE_WARNING = 'storage_warning';

    /** ბაზის ასლი ჩავარდა */
    public const BACKUP_FAILED = 'backup_failed';

    /** ფონური პარტია დასრულდა (სინქრონი · გალერეა · თარგმანი) */
    public const BATCH_DONE = 'batch_done';

    /** მომხმარებელმა ახალი მოდული შექმნა (ყველა სუპერადმინს, გარდა საკუთარი თავისა) */
    public const MODULE_CREATED = 'module_created';

    /** მომხმარებელმა თავისი მოდული წაშალა (ურნაში) */
    public const MODULE_DELETED = 'module_deleted';

    /** სუპერადმინმა პირადი მოდული გამორთო (მფლობელს) */
    public const MODULE_DISABLED = 'module_disabled';

    /** ვიღაცამ ჩემი გაზიარების ბმულიდან ჩანაწერები დაიმატა (ერთი მიმღებზე დღეში) */
    public const SHARE_IMPORTED = 'share_imported';

    /** დღეს გამოდის: ფილმის პრემიერა, სერიალის / ანიმეს პირველი ეთერი ან შემდეგი სერია */
    public const RELEASE_TODAY = 'release_today';

    /** ფრანჩაიზს ნაწილი აკლია — ბიბლიოთეკაში მისი სხვა ნაწილი მაქვს, ეს კი არა */
    public const FRANCHISE_PART = 'franchise_part';

    /** ფრანჩაიზს რამდენიმე ნაწილი აკლია — ფრანჩაიზის პირველ შემოწმებაზე ერთი შეტყობინება ყველა ნაკლულზე */
    public const FRANCHISE_GAPS = 'franchise_gaps';

    /** სერიალს ან ანიმეს ახალი სეზონი გამოუცხადეს */
    public const NEW_SEASON = 'new_season';

    /** @var list<string> */
    public const ALL = [
        self::REQUEST_APPROVED,
        self::REQUEST_REJECTED,
        self::STORAGE_WARNING,
        self::BACKUP_FAILED,
        self::BATCH_DONE,
        self::MODULE_CREATED,
        self::MODULE_DELETED,
        self::MODULE_DISABLED,
        self::SHARE_IMPORTED,
        self::RELEASE_TODAY,
        self::FRANCHISE_PART,
        self::FRANCHISE_GAPS,
        self::NEW_SEASON,
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
    public static function route(string $type, array $data = []): ?string
    {
        /* ⚠️ მოთხოვნის შედეგი **თავისი სახლის** გვერდზე მიდის:
           ატვირთვის ლიმიტი `/settings`-ზე ჩანს, საცავი — `/profile`-ზე, ჟანრი —
           `/genres`-ზე; ყველა
           მოთხოვნის `/modules`-ზე გაგზავნა ადამიანს იქ მიიყვანდა, სადაც ეს
           ფაქტი საერთოდ არ წერია. */
        if ($type === self::REQUEST_APPROVED || $type === self::REQUEST_REJECTED) {
            return match ($data['request_type'] ?? null) {
                ApprovalRequest::TYPE_UPLOAD => '/settings',
                ApprovalRequest::TYPE_STORAGE => '/profile',
                ApprovalRequest::TYPE_GENRE_DELETE => '/genres',
                default => '/modules',
            };
        }

        return match ($type) {
            self::STORAGE_WARNING => '/profile',
            self::BACKUP_FAILED => '/backups',
            /* ⚠️ სუპერადმინი **სიას** ხედავს და არა მოდულს: სხვისი
               პირადი მოდულის გვერდი მისთვისაც 404-ია, ზედამხედველობის
               ჯგუფი კი `/modules`-ზეა. მფლობელი კი თავის მოდულზე მიდის. */
            self::MODULE_CREATED, self::MODULE_DELETED => '/modules',
            self::MODULE_DISABLED => isset($data['module_key']) ? '/modules/'.$data['module_key'] : '/modules',
            // ბმულების სია — „ვინ დაიმატა" იქ ჩანს
            self::SHARE_IMPORTED => '/transfer?tab=share',
            /* ჩანაწერზე გადასვლა: მისამართი შეტყობინებასთან ერთად იწერება (`path`) —
               მოდულის `route_base` ბაზაშია და აქედან არ გამოითვლება */
            self::RELEASE_TODAY, self::FRANCHISE_PART, self::FRANCHISE_GAPS, self::NEW_SEASON => isset($data['path']) && is_string($data['path']) ? $data['path'] : null,
            default => null,
        };
    }
}
