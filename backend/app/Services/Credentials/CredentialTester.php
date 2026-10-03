<?php

namespace App\Services\Credentials;

use App\Support\CredentialProviders;
use App\Support\SourceLog;
use Illuminate\Http\Client\Response;
use Throwable;

/**
 * **„ეს გასაღები მართლა მუშაობს?"** (Tasks §21.6).
 *
 * ⚠️ **„ჩავწერე" და „მუშაობს" ორი სხვადასხვა ფაქტია.** გასაღების შენახვა
 * მხოლოდ იმას ნიშნავს, რომ ველი ცარიელი აღარაა — შეცდომით ჩასმული ან ვადა
 * გასული გასაღები ზუსტად ისევე გამოიყურება, და მისი აღმოჩენა მერე ხდებოდა,
 * ერთი კონკრეტული ღილაკის ჩავარდნისას, სადაც მიზეზი უკვე „წყარო
 * მიუწვდომელია" იყო. ამიტომ შემოწმება ცხადი ღილაკია.
 *
 * ⚠️ **თითო წყაროსთვის ყველაზე იაფი გამოძახება ირჩევა და არა „რომელიმე".**
 * SerpApi-ს `GET /account` აქვს, რომელიც კვოტას **არ ხარჯავს** (გადამოწმებული
 * 2026-09-14); Gemini-ს `GET /models` — მოდელების სია, რომელიც დღიურ ლიმიტს
 * არ ეხება; TMDB-ს `/configuration`. თარგმანის გამოძახებით შემოწმება
 * „შევამოწმე, რომ ლიმიტი მაქვს" და „ლიმიტი დავხარჯე"-ს ერთ ღილაკად აქცევდა.
 *
 * ⚠️ **Serper-ს უფასო შესამოწმებელი endpoint არ აქვს** — ყოველი გამოძახება
 * კრედიტია. ამიტომ ის `costsCredit` დროშით არის მონიშნული და ინტერფეისი
 * ამას ღილაკზევე წერს; ჩუმად ხარჯვა აქ ყველაზე ცუდი ვარიანტია, რადგან
 * ბიუჯეტი მომხმარებლის ფულია.
 */
class CredentialTester
{
    /** Telegram-ის სატესტო შეტყობინება — ქართულად, რადგან მომხმარებელი ჩატში ამას ხედავს (§27.3) */
    public const TELEGRAM_TEST_TEXT = 'სატესტო შეტყობინება Mediary-დან';

    /** რომელი წყაროს შემოწმება ხარჯავს კვოტას */
    public static function costsCredit(string $provider): bool
    {
        return $provider === CredentialProviders::SERPER;
    }

    /**
     * @return array{ok: bool, error: ?string}
     */
    public function test(string $provider, ?int $userId = null): array
    {
        if (! CredentialStore::configured($provider, $userId)) {
            return ['ok' => false, 'error' => 'not_configured'];
        }

        $value = fn (string $field) => (string) CredentialStore::value($provider, $field, $userId);

        try {
            return match ($provider) {
                CredentialProviders::TMDB => $this->check(
                    SourceLog::request(15)->get('https://api.themoviedb.org/3/configuration', ['api_key' => $value('key')])
                ),

                // ⚠️ მოდელების სია და არა თარგმანი: დღიურ ლიმიტს არ ეხება
                CredentialProviders::GEMINI => $this->check(
                    SourceLog::request(15)
                        ->withHeaders(['X-goog-api-key' => $value('key')])
                        ->get('https://generativelanguage.googleapis.com/v1beta/models')
                ),

                CredentialProviders::RAWG => $this->check(
                    SourceLog::request(15)->get('https://api.rawg.io/api/platforms', ['key' => $value('key'), 'page_size' => 1])
                ),

                // Twitch-ის ტოკენი — უფასოა და სწორედ ისაა, რაც IGDB-ს სჭირდება
                CredentialProviders::IGDB => $this->check(
                    SourceLog::request(20)->asForm()->post('https://id.twitch.tv/oauth2/token', [
                        'client_id' => $value('client_id'),
                        'client_secret' => $value('client_secret'),
                        'grant_type' => 'client_credentials',
                    ])
                ),

                // ⚠️ კვოტას **არ ხარჯავს** — ესაა ერთადერთი მიზეზი, რატომაც
                // ეს endpoint არჩეულია და არა რომელიმე ძებნა
                CredentialProviders::SERPAPI => $this->check(
                    SourceLog::request(15)->get('https://serpapi.com/account', ['api_key' => $value('key')])
                ),

                // ⚠️ ერთი კრედიტი — `costsCredit()` და ინტერფეისი ამას წერენ
                CredentialProviders::SERPER => $this->check(
                    SourceLog::request(20)
                        ->withHeaders(['X-API-KEY' => $value('key'), 'Content-Type' => 'application/json'])
                        ->post('https://google.serper.dev/images', ['q' => 'test', 'num' => 1])
                ),

                CredentialProviders::YOUTUBE => $this->check(
                    SourceLog::request(15)->get('https://www.googleapis.com/youtube/v3/videos', [
                        'part' => 'id',
                        'id' => 'dQw4w9WgXcQ',
                        'key' => $value('key'),
                    ])
                ),

                /* Tasks §27.3 — `getMe` მხოლოდ ტოკენს ამოწმებს, chat id-ს კი მხოლოდ
                   ნამდვილი `sendMessage`: ამიტომ შემოწმება ჩატში სატესტო
                   შეტყობინებას აგზავნის და „შემოწმდა" ორივეს ნიშნავს (აქამდე
                   მხოლოდ `getMe` იყო — არასწორი id „მუშაობს"-ად ითვლებოდა).
                   ⚠️ ტოკენი მისამართშია (Telegram-ის ფორმატი), ამიტომ
                   გამონაკლისის ტექსტი პასუხში არ მიდის — `Redact` მას ლოგშიც
                   ნიღბავს (`/bot<id>:<secret>`). */
                CredentialProviders::TELEGRAM => $this->telegram($value('bot_token'), $value('chat_id')),

                default => ['ok' => false, 'error' => 'unknown_provider'],
            };
        } catch (Throwable $e) {
            SourceLog::threw($provider, $e, ['step' => 'credential-test']);

            // ⚠️ გამონაკლისის ტექსტი პასუხში არ მიდის: მასში URL-ით
            // გაყოლილი გასაღები შეიძლება იდოს
            return ['ok' => false, 'error' => 'unreachable'];
        }
    }

    /**
     * ტოკენი `getMe`-ით, chat id — სატესტო შეტყობინებით.
     *
     * ⚠️ ტოკენი უკვე გავლილია, ე.ი. `sendMessage`-ის 400 („chat not found") და
     * 403 („bot was blocked", „can't initiate conversation") **id-ის ბრალია** —
     * ცალკე კოდი, რომ მომხმარებელმა ტოკენი არ გადაწეროს. ⚠️ იგივე payload,
     * რასაც `TelegramNotifier` აგზავნის — ტესტი ნამდვილ გზას ამოწმებს.
     *
     * @return array{ok: bool, error: ?string}
     */
    private function telegram(string $token, string $chatId): array
    {
        $me = $this->check(SourceLog::request(15)->get("https://api.telegram.org/bot{$token}/getMe"));

        if (! $me['ok']) {
            return $me;
        }

        $sent = SourceLog::request(15)
            ->asJson()
            ->post("https://api.telegram.org/bot{$token}/sendMessage", [
                'chat_id' => $chatId,
                'text' => self::TELEGRAM_TEST_TEXT,
                'disable_web_page_preview' => true,
            ]);

        if (! $sent->successful() && in_array($sent->status(), [400, 403], true)) {
            SourceLog::status('credentials', $sent->status(), $sent->body(), ['step' => 'test']);

            return ['ok' => false, 'error' => 'chat_rejected'];
        }

        return $this->check($sent);
    }

    /**
     * ⚠️ **სტატუსი დამოუკიდებლად აღწერს მიზეზს.** „401" და „ვერ მივწვდი"
     * სხვადასხვა ქმედებას მოითხოვს მომხმარებლისგან (გასაღები შეასწორე /
     * ინტერნეტი შეამოწმე), ამიტომ ორად იყოფა და არა ერთ „არ მუშაობს"-ად.
     *
     * @param  Response  $res
     * @return array{ok: bool, error: ?string}
     */
    private function check($res): array
    {
        if ($res->successful()) {
            return ['ok' => true, 'error' => null];
        }

        SourceLog::status('credentials', $res->status(), $res->body(), ['step' => 'test']);

        return [
            'ok' => false,
            'error' => match ($res->status()) {
                401, 403 => 'rejected',
                429 => 'rate_limited',
                default => 'http_'.$res->status(),
            },
        ];
    }
}
