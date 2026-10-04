<?php

namespace App\Services\Web;

use App\Services\Credentials\CredentialStore;
use App\Support\CredentialProviders;
use App\Support\SourceLog;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * **Serper.dev — Google Maps-ის ადგილები** (`/places`, Tasks §57.2).
 *
 * SerpApi-ის `google_maps`-ის იაფი ტყუპი: სახელი, მისამართი, კოორდინატები,
 * კატეგორია, რეიტინგი, ტელეფონი, ვებგვერდი. ⚠️ **ერთი ძებნა = ერთი კრედიტი** —
 * მხოლოდ ცხადი ძებნიდან, არასდროს წერისას. ⚠️ ჩავარდნა არ ქეშირდება
 * (`SerperImages`-ის წესი); `null` = წყარო არ პასუხობს, `[]` = არაფერი მოიძებნა.
 */
class SerperPlaces
{
    private const URL = 'https://google.serper.dev/places';

    private const CACHE_HOURS = 24;

    public function configured(): bool
    {
        return (string) CredentialStore::value(CredentialProviders::SERPER) !== '';
    }

    /** @return list<array<string, mixed>>|null */
    public function search(string $query): ?array
    {
        $query = trim($query);
        if ($query === '' || ! $this->configured()) {
            return $query === '' ? [] : null;
        }

        $key = 'serper:places:'.sha1($query);
        if (is_array($cached = Cache::get($key))) {
            return $cached;
        }

        try {
            $res = SourceLog::request(20)
                ->withHeaders(['X-API-KEY' => (string) CredentialStore::value(CredentialProviders::SERPER)])
                ->post(self::URL, ['q' => $query, 'gl' => 'ge', 'hl' => 'ka']);
        } catch (Throwable $e) {
            return SourceLog::threw('serper', $e, ['step' => 'places']);
        }

        if (! $res->successful()) {
            return SourceLog::status('serper', $res->status(), $res->body(), ['step' => 'places']);
        }

        $rows = $res->json('places');
        $rows = is_array($rows) ? array_values(array_filter($rows, 'is_array')) : [];
        Cache::put($key, $rows, now()->addHours(self::CACHE_HOURS));

        return $rows;
    }
}
