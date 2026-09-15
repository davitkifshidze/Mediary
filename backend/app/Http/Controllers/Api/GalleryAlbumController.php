<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GalleryAlbum;
use Illuminate\Http\Request;
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
 */
class GalleryAlbumController extends Controller
{
    public function index()
    {
        return response()->json(
            GalleryAlbum::query()
                ->withCount('images')
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
        ]);

        $album = GalleryAlbum::create([
            ...$data,
            // ბოლოში ჩნდება — ახალი ალბომი არსებულ რიგს არ არევს
            'sort_order' => (int) GalleryAlbum::query()->max('sort_order') + 1,
        ]);

        return response()->json($this->row($album->loadCount('images')), 201);
    }

    public function update(Request $request, GalleryAlbum $galleryAlbum)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);

        $galleryAlbum->update($data);

        return response()->json($this->row($galleryAlbum->loadCount('images')));
    }

    /**
     * ალბომის წაშლა.
     *
     * ⚠️ **ფოტოები არასდროს იშლება აქედან.** `album_id` `nullOnDelete`-ია,
     * ე.ი. ისინი უკატეგორიოში ბრუნდება; სურვილისამებრ `move_to`-თი სხვა
     * ალბომში გადადიან. ფოტოს წაშლა ცალკე მოქმედებაა (`DELETE
     * /gallery/images/{id}`) და „საქაღალდის" მოშორებას ვერ დაემალება.
     */
    public function destroy(Request $request, GalleryAlbum $galleryAlbum)
    {
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

        $moved = $galleryAlbum->images()->update(['album_id' => $data['move_to'] ?? null]);
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

    /** @return array<string, mixed> */
    private function row(GalleryAlbum $album): array
    {
        return [
            'id' => $album->id,
            'name' => $album->name,
            'description' => $album->description,
            'sort_order' => $album->sort_order,
            'photos' => (int) ($album->images_count ?? 0),
        ];
    }
}
