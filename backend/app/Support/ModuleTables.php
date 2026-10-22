<?php

namespace App\Support;

/**
 * **მოდულის ცხრილების რუკა**.
 *
 * შენი სიტყვები: „ბაზაში რა თეიბლებიცაა — იმ თეიბლებს, ოღონდ ფილმებს სხვა რამე
 * თეიბლი თუ ჭირდება, ბმა იყოს მოცემული". ცხრილების კავშირი აქამდე მხოლოდ
 * `RestoreScope::children()`-ში იყო (FK-ები `information_schema`-დან) და
 * **პოლიმორფულს ვერ ხედავდა** (ჟანრები, მსახიობები, გალერეა — `genreables`,
 * `castables`, `gallery_images`); „მოდული → მისი ყველა ცხრილი" არსად ეწერა.
 *
 * ⚠️ **რეესტრი ხელით წერია** და `ModuleTablesTest` მას სქემას ადარებს: **ყოველი
 * ცხრილი** ან მოდულისაა (`MODULES`), ან რამდენიმე მოდულის საერთოა (`SHARED`),
 * ან სისტემისაა (`SYSTEM`) — ახალი მიგრაციის ცხრილი რომ არსად ჩაიწეროს, ტესტი
 * ჩავარდება. FK-ებიც ამ რუკაშია (`movie_translations` → `movies`), ოღონდ ცხადად —
 * sqlite-ზე (ტესტები) `information_schema` არ არსებობს.
 *
 * ⚠️ **საჭიროება მოდულის დონეზეა** (`requires()`): მოდულის რომელიმე ცხრილი →
 * მოდულის ყველა ცხრილი + ის საერთო ჯგუფები, რომლებსაც მოდული იყენებს (`USES`);
 * საერთო ცხრილი → მისი ჯგუფი; სისტემის ცხრილი → მხოლოდ თვითონ. `users`-ზე FK
 * ყველა ცხრილს აქვს, მაგრამ „ფილმებთან ერთად ანგარიშებიც" არავის უნდა —
 * ის სისტემაა და ცალკე ინიშნება.
 */
final class ModuleTables
{
    /** მოდული → მისი ცხრილები (პირველი — მთავარი) */
    public const MODULES = [
        'movie' => ['movies', 'movie_translations', 'movie_field_values'],
        'series' => ['series', 'series_translations', 'series_field_values'],
        'anime' => ['animes', 'anime_translations', 'anime_field_values'],
        'video' => ['videos', 'video_types', 'video_field_values', 'video_files', 'video_notes'],
        'song' => ['songs', 'song_genres', 'song_genre_song', 'song_field_values', 'playlists', 'playlist_song'],
        'book' => ['books', 'book_genres', 'book_field_values', 'book_files', 'book_notes'],
        'board_game' => ['board_games', 'board_game_genres', 'board_game_field_values', 'board_game_files', 'board_game_notes'],
        'game' => ['games', 'game_genres', 'game_genre_game', 'game_field_values', 'game_files', 'game_videos'],
        'note' => ['note_entries', 'note_categories', 'note_field_values', 'note_entry_files', 'note_reminders', 'note_notifications'],
        'bookmark' => ['bookmarks', 'bookmark_categories', 'bookmark_field_values', 'bookmark_files'],
        'course' => ['courses', 'course_categories', 'course_field_values', 'course_files'],
        'place' => ['places', 'place_categories', 'place_field_values', 'place_files', 'place_routes'],
        'gallery' => ['gallery_albums', 'gallery_videos'],
        'personal' => ['persons', 'personal_albums', 'personal_media', 'personal_field_values'],
        'duty' => ['duty_shifts', 'duty_shift_types', 'duty_workplaces', 'duty_rates', 'duty_patterns', 'duty_field_values'],
        // პირადი მოდულები (`c{owner}-{slug}`) — ერთი ცხრილების ნაკრები ყველასთვის
        'custom' => ['custom_records', 'custom_categories', 'custom_record_field_values', 'custom_record_files', 'custom_record_notes'],
    ];

    /** რამდენიმე მოდულის საერთო ცხრილები — ჯგუფად (პოლიმორფული და ლექსიკონები) */
    public const SHARED = [
        'genres' => ['genres', 'genre_translations', 'genreables'],
        'cast' => ['cast_members', 'cast_member_translations', 'castables', 'cast_member_tags', 'cast_member_sync_prefs'],
        'episodes' => ['tv_episodes', 'episode_watches'],
        'watches' => ['media_watches'],
        'gallery_images' => ['gallery_images'],
        'statuses' => ['statuses'],
        'locks' => ['record_locks'],
    ];

    /** მოდული → რომელ საერთო ჯგუფებს იყენებს (ეს ექსპორტში „ამასთან ერთად საჭიროა") */
    public const USES = [
        'movie' => ['genres', 'cast', 'watches', 'gallery_images', 'statuses', 'locks'],
        'series' => ['genres', 'cast', 'episodes', 'watches', 'gallery_images', 'statuses', 'locks'],
        'anime' => ['genres', 'cast', 'episodes', 'watches', 'gallery_images', 'statuses', 'locks'],
        'video' => ['gallery_images', 'statuses'],
        'song' => ['gallery_images'],
        'book' => ['gallery_images'],
        'board_game' => ['gallery_images'],
        'game' => ['gallery_images'],
        'note' => ['statuses'],
        'bookmark' => ['gallery_images', 'statuses'],
        'course' => ['gallery_images'],
        'place' => ['gallery_images'],
        'gallery' => ['gallery_images', 'locks'],
        'personal' => [],
        'duty' => [],
        'custom' => ['gallery_images', 'statuses'],
    ];

    /** სისტემის ცხრილები — ანგარიშები, უფლებები, ჟურნალი, რიგები, ჩატი, ურნა… */
    public const SYSTEM = [
        'users', 'roles', 'modules', 'module_user', 'app_settings', 'user_credentials', 'user_blocks',
        'audit_logs', 'approval_requests', 'notifications', 'serp_searches', 'translation_usages',
        'trash_entries', 'trashed_files', 'trashed_messages', 'share_links', 'share_link_imports',
        'conversations', 'conversation_user', 'conversation_nicknames', 'messages', 'message_hides', 'message_reactions',
        'batch_items', 'database_backups',
        'migrations', 'cache', 'cache_locks', 'jobs', 'job_batches', 'failed_jobs', 'sessions',
        'password_reset_tokens',
    ];

    /**
     * ძველი ცხრილები, რომლებიც ზოგ ბაზაში ჯერ კიდევ შეიძლება იყოს: `record_visits` —
     * მისი წამშლელი მიგრაციის გაშვებამდე; `gallery_themes` — მისი წაშლა მხოლოდ MySQL-ზე
     * ხდება (sqlite-ის ტესტებში რჩება); `personal_access_tokens` — Sanctum-ის ძველი
     * ცხრილი ცოცხალ ბაზაში (აპი SPA-ს ქუქიებს იყენებს, ტოკენებს — არა).
     */
    public const LEGACY = ['record_visits', 'gallery_themes', 'personal_access_tokens'];

    /** საიდუმლოს შემცველი — ექსპორტის ფანჯარა მათ ცხადად აღნიშნავს */
    public const SENSITIVE = ['users', 'user_credentials', 'sessions', 'personal_access_tokens', 'password_reset_tokens'];

    /** რომელ ჯგუფს ეკუთვნის ცხრილი: მოდულის გასაღები · `shared:<ჯგუფი>` · `system` · `null` (უცნობი) */
    public static function owner(string $table): ?string
    {
        foreach (self::MODULES as $module => $tables) {
            if (in_array($table, $tables, true)) {
                return $module;
            }
        }
        foreach (self::SHARED as $group => $tables) {
            if (in_array($table, $tables, true)) {
                return 'shared:'.$group;
            }
        }

        return in_array($table, self::SYSTEM, true) || in_array($table, self::LEGACY, true) ? 'system' : null;
    }

    /**
     * ცხრილი → ის, რაც მასთან ერთად საჭიროა (თავისი თავის ჩათვლით), დალაგებული.
     *
     * @return list<string>
     */
    public static function requires(string $table): array
    {
        $owner = self::owner($table);

        if ($owner === null || $owner === 'system') {
            return [$table];
        }

        if (str_starts_with($owner, 'shared:')) {
            return self::SHARED[substr($owner, 7)];
        }

        $tables = self::MODULES[$owner];
        foreach (self::USES[$owner] ?? [] as $group) {
            $tables = [...$tables, ...self::SHARED[$group]];
        }

        return array_values(array_unique($tables));
    }

    /**
     * არჩეული ცხრილები + მათი საჭიროებები (`requires()`-ის გაერთიანება).
     *
     * @param  list<string>  $tables
     * @return list<string>
     */
    public static function closure(array $tables): array
    {
        $out = [];
        foreach ($tables as $table) {
            foreach (self::requires($table) as $needed) {
                $out[$needed] = true;
            }
        }

        return array_keys($out);
    }

    /** @return list<string> რეესტრის ყველა ცხრილი */
    public static function all(): array
    {
        return array_values(array_unique([
            ...array_merge(...array_values(self::MODULES)),
            ...array_merge(...array_values(self::SHARED)),
            ...self::SYSTEM,
        ]));
    }
}
