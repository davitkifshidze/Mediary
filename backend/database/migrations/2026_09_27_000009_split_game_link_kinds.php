<?php

use App\Models\Game;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * **თამაშის ბმულის ტიპი — ორ ღერძად** (Tasks §22.3).
 *
 * აქამდე `links[].kind` მაღაზიების სია იყო (`official · steam · epic · gog ·
 * psn · xbox · other`); ახლა `kind` ამბობს „რა არის" (ტრეილერი, DLC, პატჩი,
 * მაღაზია…), ხოლო `store` — „სად" (მხოლოდ მაღაზიისთვის). გადათარგმნა
 * `Game::normalizeLink()`-ითაა — იმავე ფუნქციით, რასაც ფორმა და RAWG/IGDB-ის
 * დრაფტი ხმარობს, ე.ი. ძველი და ახალი რიგი ერთნაირად ჩაიწერება:
 * `official` → `official`, `steam`…`xbox` → `store` + მაღაზია, `other` → `other`.
 *
 * ⚠️ **`DB::table()` და არა მოდელი** — ეს მიგრაციაა და არა მომხმარებლის
 * რედაქტირება: მოდელი `AuditObserver`-ს თითო თამაშზე `update`-ს დააწერინებდა.
 * ⚠️ **`lazyById()` და არა `chunk()`** — ოფსეტით სიარული ჩაწერისას გვერდებს
 * ტოვებს (BUG-23-ის გაკვეთილი).
 * ⚠️ **ვიდეოდ აქ არაფერი იქცევა** (§22.4): ტიპი „ტრეილერი" ამ მიგრაციამდე არ
 * არსებობდა, ე.ი. არსებულ ბმულებში ტრეილერი ვერ იქნება.
 *
 * ცოცხალ ბაზაზე (2026-09-27): ხუთი თამაშიდან სამს ჰქონდა ბმული, სამივე `official`.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->rewrite(fn (array $link) => Game::normalizeLink($link));
    }

    /**
     * ⚠️ **საუკეთესო მცდელობაა, სრული უკუქცევა არა**: ახალ ტიპებს (ტრეილერი,
     * DLC, პატჩი…) ძველ სიაში ადგილი არ ჰქონდა და `other`-ად ბრუნდება;
     * მაღაზია — თავის ძველ ერთღერძიან მნიშვნელობად.
     */
    public function down(): void
    {
        $this->rewrite(function (array $link) {
            $kind = $link['kind'] ?? 'other';

            $old = match (true) {
                $kind === 'store' && in_array($link['store'] ?? null, Game::LEGACY_LINK_KINDS, true) => $link['store'],
                $kind === 'official' => 'official',
                default => 'other',
            };

            return ['label' => $link['label'] ?? null, 'url' => $link['url'], 'kind' => $old];
        });
    }

    private function rewrite(callable $map): void
    {
        DB::table('games')
            ->whereNotNull('links')
            ->select(['id', 'links'])
            ->lazyById()
            ->each(function (object $row) use ($map) {
                $links = json_decode((string) $row->links, true);

                if (! is_array($links) || ! $links) {
                    return;
                }

                $next = array_values(array_map(
                    fn ($link) => is_array($link) && isset($link['url']) ? $map($link) : $link,
                    $links,
                ));

                if ($next !== $links) {
                    DB::table('games')->where('id', $row->id)->update(['links' => json_encode($next)]);
                }
            });
    }
};
