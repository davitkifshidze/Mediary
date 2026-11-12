<?php

namespace App\Services\Share;

use App\Models\CastMember;
use App\Models\GalleryImage;
use App\Models\Module;
use App\Models\ShareLink;
use App\Models\User;
use App\Support\AlbumLock;
use App\Support\MediaDomain;
use App\Support\PublicDomain;
use App\Support\RecordLocks;
use App\Support\ShareDomain;
use App\Support\StorageFolder;
use App\Support\VideoUrl;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * **სტუმრის შიდა გვერდი — ერთი ჩანაწერი უცხო თვალისთვის.**
 *
 * ორივე გზა ერთ პასუხს აწყობს: გაზიარების ბმული (`/share/{token}/{domain}/{id}`) და
 * საჯარო პროფილი (`/u/{username}/{domain}/{id}`). ყოველთვის: ვიწრო ბარათი
 * (`PublicDomain::card()`), აღწერა და კლასიფიკატორი; დანარჩენი — მხოლოდ ის **ბლოკი**,
 * რომელიც მფლობელმა ჩართო: გალერეა · მსახიობები · თრეილერი · ჩემი ქულა · სტატუსი.
 * ბმულზე ბლოკები ბმულის სვეტებია, პროფილზე — მოდულის პარამეტრები (`public_blocks`).
 *
 * ⚠️ **არასდროს გადის**: ჩაკეტილი ფოტო (პირად დისკზეა — `StorageFolder::isPrivate()`),
 * ჩაკეტილი ან დამალული მსახიობი, პირადი შენიშვნები, ფაილები, მორგებული ველები და
 * ყურების ჟურნალი. ჩაკეტილ ჩანაწერს აქამდე არც მოუღწევია — ორივე გზის სია მას
 * `withoutLocked()`-ით ჭრის.
 *
 * ⚠️ პასუხი ხელით იწყობა და არა რესურსით — ხვალ დამატებული ველი ჩუმად არ გაჟონავს
 * (`PublicShareController`-ის ბარათის იგივე წესი).
 */
final class RecordPage
{
    /** შიდა გვერდის ჩართვადი ბლოკები */
    public const BLOCKS = ['gallery', 'cast', 'trailer', 'rating', 'status'];

    /** `module_user.settings`-ის გასაღები — საჯარო პროფილის ბლოკები */
    public const SETTING = 'public_blocks';

    /** საჯარო პროფილის ნაგულისხმევი: ქულა და სტატუსი ბარათზე ისედაც ჩანს, დანარჩენი ჩასართავია */
    private const PROFILE_DEFAULTS = ['gallery' => false, 'cast' => false, 'trailer' => false, 'rating' => true, 'status' => true];

    private const MAX_PHOTOS = 60;

    private const MAX_CAST = 40;

    /**
     * ბმულის ბლოკები.
     *
     * @return array<string, bool>
     */
    public static function linkBlocks(ShareLink $link): array
    {
        return [
            'gallery' => (bool) $link->show_gallery,
            'cast' => (bool) $link->show_cast,
            'trailer' => (bool) $link->show_trailer,
            'rating' => (bool) $link->show_rating,
            'status' => (bool) $link->show_status,
        ];
    }

    /**
     * საჯარო პროფილის ბლოკები ამ მოდულზე — მფლობელის პარამეტრებიდან.
     *
     * @return array<string, bool>
     */
    public static function profileBlocks(User $owner, string $module): array
    {
        $moduleId = Module::where('key', $module)->value('id');

        // ⚠️ `DB::table` განზრახ: pivot-ის JSON-ს Eloquent არ cast-ავს
        $json = $moduleId
            ? DB::table('module_user')->where('user_id', $owner->getKey())->where('module_id', $moduleId)->value('settings')
            : null;

        $saved = (array) ((json_decode((string) $json, true) ?: [])[self::SETTING] ?? []);
        $blocks = self::PROFILE_DEFAULTS;

        foreach (self::BLOCKS as $block) {
            if (array_key_exists($block, $saved)) {
                $blocks[$block] = (bool) $saved[$block];
            }
        }

        return $blocks;
    }

    /**
     * შიდა გვერდი ჩანაწერს აქვს და არა სიას: პლეილისტსა და ალბომს თავისი გვერდი აქვს,
     * `custom` კი ფსევდო-დომენია (დამთხვევა) და არა მოდული.
     */
    public static function supports(string $domain): bool
    {
        return ! in_array($domain, ['playlist', 'gallery_album', 'personal_album', PublicDomain::CUSTOM], true);
    }

    /**
     * @param  array<string, bool>  $blocks
     * @param  list<string>  $hidden  ველები, რომლებიც მფლობელმა საჯარო ბარათზე დამალა
     * @return array<string, mixed>
     */
    public static function build(User $owner, string $domain, Model $record, array $blocks, array $hidden): array
    {
        $card = PublicDomain::card($domain, $record, $hidden);

        $photo = ShareDomain::has($domain) ? ShareDomain::photoField($domain) : null;
        if ($photo !== null && in_array($photo, $hidden, true)) {
            unset($card['image']);
        }

        if (! ($blocks['status'] ?? false)) {
            unset($card['status']);
        }

        /* გადამრთველი **მფლობელის** ქულას მალავს: მედიაზე ეს `my_rating`-ია, ბარათის `rating`
           კი TMDB-ის საშუალოა და საჯარო ფაქტად რჩება */
        if (! ($blocks['rating'] ?? false) && ShareDomain::has($domain) && ShareDomain::hasPersonalRating($domain)) {
            unset($card[ShareDomain::personalRatingKey($domain)]);
        }

        $media = MediaDomain::has($domain);
        // თრეილერის ველი საჯარო ბარათზე დამალულია — ბლოკიც არ გადის
        $trailer = ($blocks['trailer'] ?? false) && $media && ! in_array('trailer_url', $hidden, true);

        return [
            'record' => $card,
            'description' => in_array('description', $hidden, true) ? null : self::description($record),
            'genres' => self::genres($domain, $record, $hidden),
            // რა ბლოკი მოვიდა — გვერდი ცარიელ ბლოკს „არ არის"-ად ხატავს, გამორთულს კი საერთოდ არა
            'blocks' => [
                'gallery' => ($blocks['gallery'] ?? false) && method_exists($record, 'galleryImages'),
                'cast' => ($blocks['cast'] ?? false) && $media,
                'trailer' => $trailer,
            ],
            'gallery' => ($blocks['gallery'] ?? false) && method_exists($record, 'galleryImages') ? self::gallery($owner, $record) : [],
            'cast' => ($blocks['cast'] ?? false) && $media ? self::cast($owner, $record) : [],
            'trailer' => $trailer ? self::trailer($record) : null,
        ];
    }

    /** @return array{ka: ?string, en: ?string}|null */
    private static function description(Model $record): ?array
    {
        $ka = $record->getAttribute('description_ka');
        $en = $record->getAttribute('description_en') ?? $record->getAttribute('description');

        return $ka || $en ? ['ka' => $ka ?: null, 'en' => $en ?: null] : null;
    }

    /**
     * კლასიფიკატორი (ჟანრი · კატეგორია · ტიპი) — ერთი ფორმით ყველა დომენზე.
     *
     * @param  list<string>  $hidden
     * @return list<array{value: string, name_ka: ?string, name_en: ?string}>
     */
    private static function genres(string $domain, Model $record, array $hidden): array
    {
        if (! ShareDomain::has($domain)) {
            return [];
        }

        $field = ShareDomain::classifierField($domain);

        if ($field === null || in_array($field, $hidden, true)) {
            return [];
        }

        return ShareDomain::classifierEntries($record, $domain)
            ->map(fn (Model $entry) => [
                'value' => ShareDomain::classifierValue($domain, $entry),
                'name_ka' => $entry->getAttribute('name_ka'),
                'name_en' => $entry->getAttribute('name_en'),
            ])
            ->values()
            ->all();
    }

    /**
     * ჩანაწერის გალერეა — მხოლოდ საჯარო დისკზე მდებარე ფოტოები.
     *
     * ⚠️ ჩაკეტილი ფოტო სისტემურ ჩაკეტილ ალბომშია და პირად დისკზე დევს — მისი გზა
     * `isPrivate()`-ია და აქ არ ხვდება, არც სესიაში გახსნილი (`album_lock` scope-ს აქ
     * სესია არ აინტერესებს: სტუმარს ის არ აქვს, მფლობელს კი „მიმღების თვალით" უნდა ჩანდეს).
     *
     * @return list<array{id: int, path: string, category: ?string, width: ?int, height: ?int}>
     */
    private static function gallery(User $owner, Model $record): array
    {
        // მფლობელის **ყველა** ჩაკეტილი ალბომი — სესიაში გახსნილიც
        $locked = RecordLocks::lockedIdsFor(AlbumLock::TYPE, (int) $owner->getKey());

        return GalleryImage::withoutGlobalScopes(['owner', 'album_lock'])
            ->where('user_id', $owner->getKey())
            ->where('imageable_type', $record->getMorphClass())
            ->where('imageable_id', $record->getKey())
            ->when($locked !== [], fn ($q) => $q->where(fn ($w) => $w->whereNull('album_id')->orWhereNotIn('album_id', $locked)))
            ->orderBy('sort_order')
            ->orderBy('id')
            ->limit(self::MAX_PHOTOS * 2)
            ->get()
            ->reject(fn (GalleryImage $image) => ! $image->path || StorageFolder::isPrivate((string) $image->path))
            ->take(self::MAX_PHOTOS)
            ->map(fn (GalleryImage $image) => [
                'id' => (int) $image->id,
                'path' => (string) $image->path,
                'category' => $image->category,
                'width' => $image->width !== null ? (int) $image->width : null,
                'height' => $image->height !== null ? (int) $image->height : null,
            ])
            ->values()
            ->all();
    }

    /**
     * მსახიობები — ჩანაწერის რიგით; დამალული (`is_hidden`) და მფლობელის მიერ ჩაკეტილი
     * მსახიობი არ გადის.
     *
     * @return list<array{name: string, name_ka: ?string, character: ?string, photo: ?string}>
     */
    private static function cast(User $owner, Model $record): array
    {
        /* ⚠️ `creator` და `record_lock` scope-ები **მნახველს** კითხულობს (`Auth::id()`):
           შესულ უცხოს მფლობელის ხელით შექმნილი მსახიობი დაეკარგებოდა, მფლობელის ლოკი კი
           არ ემოქმედებოდა. ორივე მფლობელის ცხადი id-ით იწერება; `trash` რჩება. */
        return $record->cast()
            ->visibleToOwner((int) $owner->getKey())
            ->withoutLockedBy((int) $owner->getKey())
            ->get()
            ->reject(fn (CastMember $member) => (bool) $member->pivot->is_hidden)
            ->take(self::MAX_CAST)
            ->map(fn (CastMember $member) => [
                'name' => (string) $member->name,
                'name_ka' => $member->name_ka,
                'character' => $member->pivot->character ?: null,
                'photo' => $member->photo_path,
            ])
            ->values()
            ->all();
    }

    /** @return array{url: string, embed_url: ?string, platform: ?string}|null */
    private static function trailer(Model $record): ?array
    {
        $url = (string) $record->getAttribute('trailer_url');

        if ($url === '') {
            return null;
        }

        $parsed = VideoUrl::parse($url);

        return ['url' => $url, 'embed_url' => $parsed['embed_url'] ?? null, 'platform' => $parsed['platform'] ?? null];
    }
}
