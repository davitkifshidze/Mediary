<?php

namespace App\Notifications;

use Illuminate\Notifications\Notification;

/**
 * **ერთადერთი შეტყობინების კლასი (FEAT-19).**
 *
 * ⚠️ **თითო მოვლენაზე ცალკე კლასი განზრახ არ დაიწერა.** ხუთივე
 * შეტყობინება ერთსა და იმავეს აკეთებს — `type` + `data` ბაზაში — ე.ი.
 * ხუთი კლასი ხუთი ასლი იქნებოდა ერთი `toDatabase()`-ისა. ტექსტი
 * ფრონტზეა (i18n), ე.ი. კლასს სათქმელიც არაფერი აქვს.
 *
 * ⚠️ **`databaseType()` სახეს წერს კლასის სახელის ნაცვლად.** ერთი
 * გენერიკული კლასის პირობებში Laravel-ის ნაგულისხმევი ქცევა (`type` =
 * FQCN) სვეტს ყველა რიგზე ერთნაირს გახდიდა და ფილტრი უაზრო იქნებოდა.
 *
 * ⚠️ **არხი მხოლოდ `database`-ია.** ელფოსტა ამ აპში არ არსებობს (§8.2),
 * ხოლო Telegram ცალკე გადაწყვეტილებაა: `NoteChannelSettings` მას მხოლოდ
 * შეხსენებებისთვის ინახავს და მეორე არხის ჩართვა ცალკე მოთხოვნაა.
 */
class AppNotification extends Notification
{
    public function __construct(
        private string $type,
        /** @var array<string, mixed> */
        private array $data = [],
    ) {}

    /** @return list<string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function databaseType(object $notifiable): string
    {
        return $this->type;
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        return $this->data;
    }
}
