<?php

namespace App\Services\Users;

use App\Models\Conversation;
use App\Models\GalleryAlbum;
use App\Models\GalleryImage;
use App\Models\GalleryVideo;
use App\Models\User;
use App\Services\Purge\PurgeService;
use App\Services\Storage\StorageMeter;

/**
 * **ანგარიშის წაშლა ისე, რომ დისკზე არაფერი დარჩეს** (Tasks BUG-21).
 *
 * ⚠️ **`$user->delete()` ფაილებს არ შლის და არასდროს შლიდა.** ჩანაწერები
 * SQL-კასკადით ქრება, კასკადი კი მოდელის ივენთს **არ ისვრის** — ე.ი.
 * `StoredFile`, `HasGallery` და `HasCustomFields` საერთოდ არ გაეშვება.
 * აქამდე `AdminUserController::destroy()` მხოლოდ ფილმებსა და სერიალებს
 * შლიდა მოდელით (პლუს ვიდეოს ესკიზს), ე.ი. ანიმეს, ვიდეოს ფაილები და
 * ჩამოწერილი ასლები, სიმღერები, წიგნები, ბორდგეიმები, თამაშები,
 * ჩანაწერები, ბუკმარკები, გალერეა, ჩატის მიმაგრებები, ბაზის ასლები და
 * custom-field-ების ფაილები **დისკზე ობლად რჩებოდა** — კვოტის მრიცხველი კი
 * ანგარიშთან ერთად ქრებოდა, ე.ი. ადგილი სამუდამოდ იკარგებოდა (ობოლების
 * სკანერს მხოლოდ super_admin უშვებს ხელით).
 *
 * ⚠️ **ორი ფენა, და ორივე საჭიროა.** (1) მოდულები `PurgeService`-ით იშლება —
 * ის სწორედ იმიტომ შლის **მოდელით**, რომ ივენთები გაეშვას; ორი პარალელური
 * „წაშალე ყველაფერი" იმპლემენტაცია იმავე დღეს დაშორდებოდა. (2) ბოლოს
 * `StorageMeter::files()` **ერთხელ** იკითხება და რაც იქ დარჩა — ჩატი,
 * ბაზის ასლი, ავატარი — `deleteOwnFiles()`-ით იშლება. ეს მეორე ფენა
 * მექანიკურად ხურავს ყველაფერს, რასაც purge-ის სამიზნეები არ ფარავენ,
 * და `files()` ისედაც **ერთადერთი განმარტებაა** იმისა, „რა ეკუთვნის ამ
 * ანგარიშს".
 */
class AccountEraser
{
    public function __construct(
        private PurgeService $purge,
        private StorageMeter $meter,
    ) {}

    public function erase(User $user): void
    {
        $this->purgeModules($user);
        $this->purgeGallery($user);
        $this->sweepRemainingFiles($user);
        $this->dropEmptyConversations($user);

        $user->delete();
    }

    /**
     * ყველა მოდული, `mode = all`.
     *
     * ⚠️ **`gallery` სამიზნე გამოტოვებულია და ეს გამორჩენა არ არის**: ის
     * ჩანაწერს არ შლის — მხოლოდ **მედია-ჩანაწერის ფოტოებს** —, ხოლო ის
     * ფოტოები თავიანთი ჩანაწერის წაშლისას ისედაც ქრება (`HasGallery`).
     * მშობლის გარეშე დარჩენილი ფოტოები (§26-ის ალბომები) ქვემოთ იშლება.
     */
    private function purgeModules(User $user): void
    {
        foreach (array_keys(PurgeService::TARGET_MODES) as $target) {
            if ($target === 'gallery') {
                continue;
            }

            $this->purge->run($user, ['target' => $target, 'mode' => 'all']);
        }
    }

    /**
     * მშობლის გარეშე დარჩენილი ფოტოები, ვიდეო-ბმულები და ალბომები.
     *
     * ⚠️ **`album_lock` scope-ი ცხადად ითიშება**: ჩაკეტილი ალბომის ფოტოს
     * დამალვა იმას არ ნიშნავს, რომ ის ხელშეუხებელია (§7.9-ის წესი) —
     * გამოტოვებული რიგი დისკზე ობლად დარჩებოდა.
     */
    private function purgeGallery(User $user): void
    {
        $images = GalleryImage::withoutGlobalScope('owner')
            ->withoutGlobalScope('album_lock')
            ->where('user_id', $user->getKey());

        foreach ($images->cursor() as $image) {
            $image->delete();
        }

        foreach (GalleryVideo::withoutGlobalScope('owner')->where('user_id', $user->getKey())->cursor() as $video) {
            $video->delete();
        }

        foreach (GalleryAlbum::withoutGlobalScope('owner')->where('user_id', $user->getKey())->cursor() as $album) {
            $album->delete();
        }
    }

    /** ავატარი, ჩატის მიმაგრებები, ბაზის ასლები — რაც purge-ის სამიზნე არაა */
    private function sweepRemainingFiles(User $user): void
    {
        $paths = $this->meter->files($user)->pluck('path')->filter()->all();

        if ($paths) {
            $this->meter->deleteOwnFiles($user, $paths);
        }
    }

    /**
     * საუბრები, სადაც მეორე მონაწილე აღარ რჩება.
     *
     * ⚠️ **ორივე მონაწილიანი საუბარი ხელუხლებელი რჩება** — მეორე მხარის
     * წერილები მისი ისტორიაა და წაშლილი ანგარიშის გამო არ უნდა გაქრეს;
     * `ChatController::index()` ასეთ საუბარს უბრალოდ აღარ ხატავს (მონაწილე
     * აღარაა, ე.ი. სათაურიც არ არსებობს). ხოლო საუბარი, სადაც **არავინ**
     * რჩება, სუფთა ნაგავია.
     */
    private function dropEmptyConversations(User $user): void
    {
        $conversations = Conversation::whereHas(
            'participants',
            fn ($q) => $q->whereKey($user->getKey())
        )->get();

        foreach ($conversations as $conversation) {
            $others = $conversation->participants()
                ->where('users.id', '!=', $user->getKey())
                ->count();

            if ($others === 0) {
                $conversation->delete();
            }
        }
    }
}
