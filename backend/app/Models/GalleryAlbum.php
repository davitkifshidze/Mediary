<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * გალერეის ალბომი (Tasks §26) — „ჯგუფი უკატეგორიოში".
 *
 * ⚠️ **ეს არ არის მშობელი.** მშობელი ჩანაწერია (ფილმი · მსახიობი · სიმღერა)
 * და ფოტოს ვინაობას განსაზღვრავს; ალბომი კი user-ის თავისი დახარისხებაა.
 * ორივე ერთდროულად შეიძლება იყოს ან არცერთი — ამიტომაა ცალკე სვეტი და
 * არა `imageable_type = 'album'`.
 *
 * ⚠️ **სახელი ერთენოვანია** და განზრახ: ეს user-ის ნაწერია და არა
 * ლექსიკონის რიგი — `name_ka`/`name_en` აქ ერთსა და იმავე ტექსტს ორჯერ
 * ათქმევინებდა (ლექსიკონებს ორი ენა იმიტომ აქვთ, რომ მათი ნაგულისხმევები
 * კოდიდან მოდის).
 */
class GalleryAlbum extends Model
{
    use BelongsToUser;

    protected $guarded = ['id'];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    public function images(): HasMany
    {
        return $this->hasMany(GalleryImage::class, 'album_id');
    }

    /*
     * ⚠️ `booted()` განზრახ არ არსებობს: ალბომის წაშლა **ფოტოებს არ შლის**
     * — `album_id` `nullOnDelete`-ია, ე.ი. ისინი უბრალოდ უკატეგორიოში
     * ბრუნდება. „საქაღალდის" მოშორება ბიბლიოთეკის წაშლა ვერ იქნება.
     */
}
