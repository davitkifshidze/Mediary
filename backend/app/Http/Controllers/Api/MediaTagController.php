<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Video;
use App\Support\MediaDomain;
use Illuminate\Http\Request;

/**
 * **ბიბლიოთეკაში უკვე გამოყენებული ტეგები (FEAT-18).**
 *
 * ⚠️ **ლექსიკონის ცხრილი არ არსებობს და არც უნდა არსებობდეს** — ტეგი
 * `tags` JSON სვეტია (ექვსი სხვა მოდულის იგივე ფორმა). შემოთავაზების სია
 * ამიტომ **სვეტიდან გროვდება**, ზუსტად ისე, როგორც თამაშის ფრანჩაიზი
 * (`GET /games/franchises`) — და სწორედ იმიტომ, რომ ორი წყარო ერთი
 * ცნებისთვის აქ არავის სჭირდება.
 *
 * ⚠️ **ცალკე endpoint-ია და არა სიის პასუხის ნაწილი**: ფორმა ცალკე
 * მარშრუტია და სიას საერთოდ არ ტვირთავს, ხოლო `all=1`-ის გამოყენება
 * მხოლოდ შემოთავაზებისთვის სწორედ ის იქნებოდა, რის წინააღმდეგაც
 * პაგინაცია დაიწერა (მთელი ბიბლიოთეკა ერთ პასუხში).
 *
 * ⚠️ **მხოლოდ `tags` სვეტი იკითხება** (`pluck`), ე.ი. 350-ჩანაწერიან
 * ბიბლიოთეკაზეც ეს ერთი მსუბუქი query-ა; დათვლა და დალაგება PHP-შია,
 * რადგან JSON-ის შიგნით დათვლა დრაივერზეა დამოკიდებული (`jsonLike()`-ის
 * იგივე მიზეზი).
 *
 * ⚠️ **`GET`**: ეს კითხვაა, ე.ი. POST-ს `EnsureModulePermission`
 * `create`-ად წაიკითხავდა და მხოლოდ-რედაქტორი ცრუ 403-ს მიიღებდა.
 */
class MediaTagController extends Controller
{
    /** რამდენი ტეგი დაბრუნდეს — შემოთავაზების სია და არა ლექსიკონი */
    private const LIMIT = 200;

    public function index(Request $request)
    {
        $request->validate(['type' => ['required', MediaDomain::rule()]]);

        $model = MediaDomain::model($request->string('type')->toString());

        $counts = [];

        foreach ($model::query()->pluck('tags') as $tags) {
            foreach ((array) $tags as $tag) {
                $tag = (string) $tag;
                $key = Video::tagKey($tag);

                if ($key === '') {
                    continue;
                }

                // ⚠️ გასაღებზე ვაჯგუფებთ, ვაჩვენებთ კი **პირველ ნახულ წერილობას** —
                // „კომედია" და „კომედია " ერთი ტეგია (`Video::tagKey()`-ის წესი)
                $counts[$key] ??= ['tag' => $tag, 'count' => 0];
                $counts[$key]['count']++;
            }
        }

        usort($counts, fn ($a, $b) => $b['count'] <=> $a['count'] ?: strcmp($a['tag'], $b['tag']));

        return response()->json(['data' => array_slice(array_values($counts), 0, self::LIMIT)]);
    }
}
