<?php

namespace Tests;

use App\Support\SafeHttp;

/**
 * **`SafeHttp` DNS-ის გარეშე — ტესტებისთვის.**
 *
 * ⚠️ ნამდვილი `SafeHttp` ჰოსტის სახელს მართლა ხსნის (`gethostbynamel`), ე.ი.
 * სახელზე დაწერილი ტესტი ქსელზე გახდებოდა დამოკიდებული: ხაზგარეშე მანქანაზე
 * `media.rawg.io` „არ არსებობს" და ჩამოტვირთვა უარით მთავრდება. აქ სახელი
 * საბუთების დიაპაზონის მისამართად იხსნება (`203.0.113.10`, RFC 5737 — ფილტრი
 * მას საჯაროდ თვლის), ლიტერალური IP კი თავის თავად: `127.0.0.1` ისევ
 * დაბლოკილია, ე.ი. შიდა ქსელის ტესტები ნამდვილ ფილტრს ამოწმებს.
 *
 * ⚠️ `localhost` სახელია, მაგრამ შიდაა — ის ცალკე წერია, რომ ტესტში
 * „საჯაროდ" არ გადაიქცეს.
 */
class OfflineSafeHttp extends SafeHttp
{
    protected function addresses(string $host): array
    {
        if (filter_var(trim($host, '[]'), FILTER_VALIDATE_IP)) {
            return [trim($host, '[]')];
        }

        return strtolower($host) === 'localhost' || str_ends_with(strtolower($host), '.localhost')
            ? ['127.0.0.1']
            : ['203.0.113.10'];
    }
}
