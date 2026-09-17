<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GalleryAlbum;
use App\Services\Gallery\AlbumVault;
use App\Support\AlbumLock;
use App\Support\PublicDomain;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

/**
 * გალერეის ალბომები (Tasks §26) — „ჯგუფი უკატეგორიოში".
 *
 * ⚠️ **ეს ლექსიკონი არ არის და `/dictionaries`-ში არ ჯდება.** ლექსიკონის
 * რიგს ორენოვანი სახელი აქვს, რადგან მისი ნაგულისხმევები კოდიდან მოდის
 * (`ensureDefaults()`); ალბომს კი user თვითონ არქმევს სახელს — `name_ka`/
 * `name_en` აქ ერთსა და იმავე ტექსტს ორჯერ ათქმევინებდა. ამიტომაა
 * პატარა საკუთარი კონტროლერი და არა `DictionaryRecords`-ის რიგი.
 *
 * ⚠️ **ნაგულისხმევი ალბომები არ იქმნება.** დანარჩენი ლექსიკონები ზარმაცად
 * ივსება (ტიპები, ჟანრები, სტატუსები), რადგან მათ გარეშე ფორმა ცარიელია.
 * აქ პირიქითაა: ალბომი მხოლოდ მაშინ არსებობს, როცა user-მა დაახარისხა —
 * გამოგონილი „ჩემი ალბომი" ცარიელ საქაღალდედ იდებოდა.
 *
 * ⚠️ **ლოკი (2026-09-16).** პაროლი ალბომზეა და მისი ფოტოები `AlbumLock`-ის
 * global scope-ით ქრება — იხ. `GalleryImage::booted()`. აქ მხოლოდ სამი
 * კარია: დადება/შეცვლა/მოხსნა (`update`), გახსნა (`unlock`) და ისევ
 * ჩაკეტვა (`lock`).
 */
class GalleryAlbumController extends Controller
{
    public function index()
    {
        return response()->json(
            GalleryAlbum::query()
                ->withCount($this->imagesCount())
                ->orderBy('sort_order')
                ->orderBy('id')
                ->get()
                ->map(fn (GalleryAlbum $album) => $this->row($album))
                ->all(),
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'min:4', 'max:100'],
            // §7.5 — ალბომი ერთადერთია გალერეაში, რასაც საკუთარი ჩამრთველი აქვს
            'visibility' => ['nullable', 'in:'.implode(',', PublicDomain::VALUES)],
        ]);

        $password = $data['password'] ?? null;
        unset($data['password']);

        $album = GalleryAlbum::create([
            ...$data,
            'password_hash' => $password ? Hash::make($password) : null,
            // ბოლოში ჩნდება — ახალი ალბომი არსებულ რიგს არ არევს
            'sort_order' => (int) GalleryAlbum::query()->max('sort_order') + 1,
        ]);

        // პაროლით შექმნილი ალბომი მაშინვე ღიაა — შენ ახლა დაადე
        if ($password) {
            AlbumLock::unlock($album);
        }

        return response()->json($this->row($album->loadCount($this->imagesCount())), 201);
    }

    /**
     * სახელი, აღწერა და პაროლი.
     *
     * ⚠️ **პაროლის შეცვლა/მოხსნა ანგარიშის პაროლს ითხოვს** (Tasks §7.8, შენი
     * გადაწყვეტილება). უამისოდ ლოკს აზრი არ ექნებოდა: ბრაუზერთან მისული კაცი
     * უბრალოდ „მოხსნას" დააჭერდა. საკმარისია ისიც, რომ ალბომი **ამ სესიაში
     * უკვე გახსნილია** — ე.ი. პაროლი ერთხელ ისედაც შეიყვანე.
     *
     * ⚠️ **ანგარიშის პაროლი და აღარ ალბომისა.** ძველი წესი („აღდგენა არ
     * არსებობს") ამით უქმდება და ეს კარგია: „დამავიწყდა ალბომის პაროლი"
     * აღარაა ჩიხი, მფლობელობა კი მაინც მტკიცდება — ანგარიშის პაროლი
     * ისედაც უფრო ძლიერი საიდუმლოა.
     *
     * ⚠️ **პაროლი ახალ ლოკზე არასდროს იკითხება**: პაროლის გარეშე ალბომს
     * დასაცავი არაფერი აქვს.
     */
    public function update(Request $request, GalleryAlbum $galleryAlbum)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'min:4', 'max:100'],
            'remove_password' => ['nullable', 'boolean'],
            /* ⚠️ **ანგარიშის პაროლია და აღარ ალბომისა** (Tasks §7.8, შენი
               გადაწყვეტილება). ეს აუქმებს ძველ წესს „აღდგენა არ არსებობს":
               „ალბომის პაროლი დამავიწყდა" აღარაა ჩიხი, მფლობელობა კი მაინც
               მტკიცდება — და ის ისედაც უფრო ძლიერი საიდუმლოა. */
            'account_password' => ['nullable', 'string', 'max:255'],
            'visibility' => ['nullable', 'in:'.implode(',', PublicDomain::VALUES)],
        ]);

        /* ⚠️ **`array_key_exists` აქ არ გამოდგება**: `ConvertEmptyStringsToNull`
           ცარიელ ველს `null`-ად აქცევს, ე.ი. ფორმა, რომელიც ცარიელ პაროლს
           მაინც აგზავნის, „ლოკის შეცვლად" ჩაითვლებოდა და მოქმედ პაროლს
           უმიზეზოდ მოითხოვდა. ლოკს მხოლოდ ორი რამ ცვლის: ახალი პაროლი ან
           ცხადი მოხსნა. */
        $wantsLockChange = ($data['password'] ?? null) !== null || ($data['remove_password'] ?? false);

        if ($wantsLockChange && $galleryAlbum->isLocked() && ! AlbumLock::isUnlocked($galleryAlbum)) {
            abort_unless(
                ($data['account_password'] ?? null) !== null
                    && Hash::check($data['account_password'], $request->user()->password),
                422,
                'account_password_wrong',
            );
        }

        $changes = array_intersect_key($data, array_flip(['name', 'description', 'visibility']));

        if ($data['remove_password'] ?? false) {
            $changes['password_hash'] = null;
        } elseif (($data['password'] ?? null) !== null) {
            $changes['password_hash'] = Hash::make($data['password']);
        }

        $wasLocked = $galleryAlbum->isLocked();
        $galleryAlbum->update($changes);

        // ახლად დადებული/შეცვლილი პაროლი ამ სესიაში ღიად რჩება, თორემ
        // „შევინახე" მაშინვე საკუთარ ალბომს დამიმალავდა
        if (array_key_exists('password_hash', $changes)) {
            $changes['password_hash'] === null
                ? AlbumLock::lock($galleryAlbum)
                : AlbumLock::unlock($galleryAlbum);

            /* ⚠️ **ფაილები ფიზიკურად გადადის** (§7.9): პასუხიდან ამოღება
               საკმარისი არ არის, სანამ `/storage/gallery/images/…` ბმული
               იხსნება. `AlbumVault` პოსტერსაც წმენდს (§7.14). */
            if ($changes['password_hash'] === null && $wasLocked) {
                AlbumVault::reveal($galleryAlbum);
            } elseif ($changes['password_hash'] !== null && ! $wasLocked) {
                AlbumVault::seal($galleryAlbum);
            }
        }

        return response()->json($this->row($galleryAlbum->loadCount($this->imagesCount())));
    }

    /**
     * პაროლის შემოწმება — `POST /gallery/albums/{album}/unlock`.
     *
     * ⚠️ **პასუხი არ ამბობს, რამდენად ახლოს იყავი** და არც ცალკე კოდი აქვს
     * „ალბომს პაროლი არ აქვს"-ისთვის: ორივე უბრალოდ 422-ია.
     *
     * ⚠️ **throttle როუტზეა** (`throttle:album-unlock`) — უამისოდ ოთხნიშნა
     * პაროლს სკრიპტი წუთებში გატეხდა.
     *
     * ⚠️ **სესიის გარეშე 409 `session_required`** (Tasks BUG-02) — ტოკენით
     * მოსულ კლიენტს `/api`-ზე სესია არ აქვს, `AlbumLock::unlock()` კი მას
     * უხმაუროდ იგდებდა: სწორი პაროლი 200-ს აბრუნებდა და ალბომი ჩაკეტილი
     * რჩებოდა. აქ ორაკულის საკითხი არ დგას (მფლობელობა უკვე შემოწმებულია),
     * ჩუმი ჩავარდნა კი იგივეა — და ერთი წესი ორივე კარზე უფრო იოლი
     * დასამახსოვრებელია, ვიდრე ორი სხვადასხვა ქცევა.
     */
    public function unlock(Request $request, GalleryAlbum $galleryAlbum)
    {
        abort_unless(AlbumLock::hasSession(), 409, 'session_required');

        $data = $request->validate([
            'password' => ['required', 'string', 'max:100'],
        ]);

        abort_unless(
            $galleryAlbum->isLocked() && Hash::check($data['password'], $galleryAlbum->password_hash),
            422,
            'album_password_wrong',
        );

        AlbumLock::unlock($galleryAlbum);

        return response()->json($this->row($galleryAlbum->loadCount($this->imagesCount())));
    }

    /** „ისევ ჩაკეტე" — სესიიდან ამოვარდნა, პაროლი ხელუხლებელია */
    public function lock(GalleryAlbum $galleryAlbum)
    {
        AlbumLock::lock($galleryAlbum);

        return response()->json($this->row($galleryAlbum->loadCount($this->imagesCount())));
    }

    /**
     * ალბომის წაშლა.
     *
     * ⚠️ **ფოტოები არასდროს იშლება აქედან.** `album_id` `nullOnDelete`-ია,
     * ე.ი. ისინი უკატეგორიოში ბრუნდება; სურვილისამებრ `move_to`-თი სხვა
     * ალბომში გადადიან. ფოტოს წაშლა ცალკე მოქმედებაა (`DELETE
     * /gallery/images/{id}`) და „საქაღალდის" მოშორებას ვერ დაემალება.
     *
     * ⚠️ **ჩაკეტილი ალბომი ჯერ უნდა გაიხსნას და ეს ლოკის მთავარი კარია.**
     * წაშლა ფოტოებს `album_id = null`-ზე აბრუნებს, ე.ი. უპაროლოდ
     * დაშვებული „წაშალე ალბომი" ერთი კლიკით გააშიშვლებდა ყველაფერს,
     * რაც ეს-ესაა დამალე — ლოკის სრული შემოვლა.
     */
    public function destroy(Request $request, GalleryAlbum $galleryAlbum)
    {
        abort_if(! AlbumLock::isUnlocked($galleryAlbum), 423, 'album_locked');

        $data = $request->validate([
            'move_to' => [
                'nullable',
                'integer',
                Rule::exists('gallery_albums', 'id')->where('user_id', $request->user()->id),
            ],
        ]);

        abort_if(
            ($data['move_to'] ?? null) === $galleryAlbum->id,
            422,
            'cannot_move_into_itself',
        );

        /* ⚠️ **ფაილები ჯერ ბრუნდება საჯარო საქაღალდეში** (§7.9), მერე
           ჩანაწერები გადადიან: სხვა შემთხვევაში ამ ალბომის ფოტოები
           `gallery/locked`-ში დარჩებოდა — მშობლის გარეშე, პირად დისკზე,
           ე.ი. აპლიკაციაში ხილულად და `/storage/*`-ით მიუწვდომლად. */
        $target = ($data['move_to'] ?? null)
            ? GalleryAlbum::find((int) $data['move_to'])
            : null;

        $target && $target->isLocked()
            ? AlbumVault::seal($galleryAlbum)
            : AlbumVault::reveal($galleryAlbum);

        $moved = $galleryAlbum->images()->withoutGlobalScope('album_lock')
            ->update(['album_id' => $data['move_to'] ?? null]);
        $galleryAlbum->delete();

        return response()->json(['moved' => $moved]);
    }

    /**
     * რიგი — `POST /gallery/albums/reorder`.
     *
     * ⚠️ **მთელი რიგი მოდის და არა „გადაიტანე N-დან M-ზე"**: ერთი
     * ოპერაცია, ე.ი. `sort_order` ვერ აცდება (იგივე წესი, რაც
     * `PUT /playlists/{playlist}/songs`-ს აქვს).
     */
    public function reorder(Request $request)
    {
        $data = $request->validate([
            'ids' => ['required', 'array'],
            'ids.*' => ['integer'],
        ]);

        foreach ($data['ids'] as $index => $id) {
            GalleryAlbum::where('id', (int) $id)->update(['sort_order' => $index]);
        }

        return $this->index();
    }

    /**
     * ფოტოების რიცხვი **ლოკის მიღმა** იწერება.
     *
     * ⚠️ global scope-ს რომ დაემორჩილა, ჩაკეტილი ალბომი „0 ფოტოს" აჩვენებდა
     * — ე.ი. ბარათი იტყუებოდა. რიცხვი ფოტოს არ ამხელს; ამხელს გზა ფაილამდე,
     * რომელიც არსად გამოდის.
     *
     * @return array<string, \Closure>
     */
    private function imagesCount(): array
    {
        return ['images' => fn ($q) => $q->withoutGlobalScope('album_lock')];
    }

    /** @return array<string, mixed> */
    private function row(GalleryAlbum $album): array
    {
        return [
            'id' => $album->id,
            'name' => $album->name,
            'description' => $album->description,
            'sort_order' => $album->sort_order,
            'visibility' => $album->visibility,
            'photos' => (int) ($album->images_count ?? 0),
            // ⚠️ hash არასდროს — მხოლოდ ორი ფაქტი: „პაროლი ადევს" და
            // „ამ სესიაში ღიაა". სწორედ ეს ორი წყვეტს, რას ხატავს ბარათი.
            'locked' => $album->isLocked(),
            'unlocked' => AlbumLock::isUnlocked($album),
        ];
    }
}
