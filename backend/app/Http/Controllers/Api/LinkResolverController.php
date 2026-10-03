<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Links\LinkResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * **`POST /links/metadata`** (Tasks §15.1) — ბმულის მეტა-მონაცემი ნებისმიერი
 * ფორმისთვის: წიგნის წყარო, თამაშის/სამაგიდოს/ჩანაწერის ბმულები, ფილმის
 * ტრეილერი, თამაშისა და გალერეის ვიდეო.
 *
 * ⚠️ **მოდულის middleware-ის გარეთაა** (`/audit/visit`-ის, `/search`-ის იგივე
 * მიზეზი): ბმული ყველა მოდულს ეხება და არა ერთს, ხოლო POST-ს
 * `EnsureModulePermission` „შექმნად" წაიკითხავდა — აქ კი არაფერი იქმნება.
 * ⚠️ URL გარედან მოდის და მხოლოდ `SafeHttp`-ით იკითხება (`LinkMetadata`).
 */
class LinkResolverController extends Controller
{
    public function resolve(Request $request, LinkResolver $resolver): JsonResponse
    {
        $data = $request->validate(['url' => ['required', 'string', 'max:1000', 'url']]);

        return response()->json($resolver->resolve($data['url']));
    }
}
