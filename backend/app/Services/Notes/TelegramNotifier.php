<?php

namespace App\Services\Notes;

use Illuminate\Support\Facades\Http;

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
            $response = Http::asJson()
                // ⚠️ Windows-ის PHP cURL-ს CA bundle არ აქვს — პროექტის საერთო წესი
                ->withOptions(['verify' => storage_path('cacert.pem')])
                ->timeout(self::TIMEOUT)
                ->post(sprintf(self::ENDPOINT, $token), [
                    'chat_id' => $chatId,
                    'text' => $text,
                    'disable_web_page_preview' => true,
                ]);

            if ($response->successful()) {
                return null;
            }

            // ტელეგრამი მიზეზს `description`-ში წერს („chat not found"…)
            return (string) ($response->json('description') ?? "http_{$response->status()}");
        } catch (\Throwable $e) {
            return $e->getMessage();
        }
    }
}
