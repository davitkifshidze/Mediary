<?php

namespace App\Services\Notes;

use App\Support\SourceLog;

/**
 * ტელეგრამის მიწოდება (Tasks §13.3) — Telegram Bot API, **სრულიად უფასო**
 * და worker-ის გარეშე: ერთი HTTPS რექვესთი.
 *
 * user თავად ქმნის ბოტს (@BotFather) და პარამეტრებში წერს token-სა და
 * chat id-ს — ე.ი. `.env`-ში არაფერი ემატება და ორ ანგარიშს ორი სხვადასხვა
 * ბოტი შეიძლება ჰქონდეს.
 */
class TelegramNotifier
{
    private const ENDPOINT = 'https://api.telegram.org/bot%s/sendMessage';

    private const TIMEOUT = 10;

    /**
     * აბრუნებს `null`-ს წარმატებაზე, ან შეცდომის ტექსტს.
     * ⚠️ არასდროს აგდებს გამონაკლისს: ერთი ჩავარდნილი შეტყობინება მთელ
     * რიგს არ უნდა აჩერებდეს.
     */
    public function send(string $token, string $chatId, string $text): ?string
    {
        try {
            $response = SourceLog::request(self::TIMEOUT)
                ->asJson()
                ->post(sprintf(self::ENDPOINT, $token), [
                    'chat_id' => $chatId,
                    'text' => $text,
                    'disable_web_page_preview' => true,
                ]);

            if ($response->successful()) {
                return null;
            }

            // ტელეგრამი მიზეზს `description`-ში წერს („chat not found"…)
            $reason = (string) ($response->json('description') ?? "http_{$response->status()}");
            /* ⚠️ მიზეზი **ორივეგან** ინახება: `note_notifications.error`-ში
               (მომხმარებელი ხედავს) და წყაროების ლოგში (დიაგნოსტიკა). */
            SourceLog::failed('telegram', $reason, ['status' => $response->status()]);

            return $reason;
        } catch (\Throwable $e) {
            SourceLog::threw('telegram', $e);

            return $e->getMessage();
        }
    }
}
