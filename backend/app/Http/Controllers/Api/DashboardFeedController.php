<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Dashboard\DashboardFeed;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * მთავარი გვერდის ორი არჩევითი ბლოკი — „ვაგრძელებ" და „ბოლოს დამატებული".
 *
 * ⚠️ ცალკე მარშრუტებია და არა `GET /dashboard`-ის ნაწილი: მთავარი გვერდის ჯამი
 * ოთხ query-ზეა დაჭერილი, ბლოკი კი მოთხოვნას მხოლოდ ჩართული აგზავნის.
 */
class DashboardFeedController extends Controller
{
    private const LIMIT = 8;

    public function __construct(private readonly DashboardFeed $feed) {}

    public function continuing(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->feed->continuing($request->user(), self::LIMIT)]);
    }

    public function recent(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->feed->recent($request->user(), self::LIMIT)]);
    }
}
