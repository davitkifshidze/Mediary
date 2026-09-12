<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\GameVideoResource;
use App\Models\Game;
use App\Models\GameVideo;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * თამაშზე მიბმული ვიდეოები (Tasks §11.2) — walkthrough, თრეილერი,
 * მიმოხილვა, გაიდი.
 *
 * ⚠️ **ბმული `VideoUrl`-ის allowlist-ს გადის** და embed სერვერზე იგება;
 * ნედლი HTML/iframe არასდროს ინახება (ვიდეოსა და სიმღერის იგივე დაცვა).
 */
class GameVideoController extends Controller
{
    public function index(Game $game)
    {
        return GameVideoResource::collection($game->videos()->get());
    }

    public function store(Request $request, Game $game)
    {
        $data = $this->validated($request);

        $video = new GameVideo([
            'user_id' => $request->user()->id,
            'game_id' => $game->id,
            'kind' => $data['kind'] ?? 'walkthrough',
            'title' => $data['title'] ?? null,
            'duration' => $data['duration'] ?? null,
            'sort_order' => (int) $game->videos()->max('sort_order') + 1,
        ]);
        $video->applyUrl($data['url']);
        $video->save();

        return (new GameVideoResource($video))->response()->setStatusCode(201);
    }

    public function update(Request $request, GameVideo $gameVideo)
    {
        $data = $this->validated($request, $gameVideo);

        $gameVideo->fill([
            'kind' => $data['kind'] ?? $gameVideo->kind,
            'title' => $data['title'] ?? $gameVideo->title,
            'duration' => $data['duration'] ?? $gameVideo->duration,
        ]);

        if (! empty($data['url']) && $data['url'] !== $gameVideo->url) {
            // ⚠️ ბმულის შეცვლაზე წარმოებულებიც უნდა გადაითვალოს, თორემ
            // `embed_url` ძველ ვიდეოს დაუკრავდა
            $gameVideo->applyUrl($data['url']);
        }

        $gameVideo->save();

        return new GameVideoResource($gameVideo);
    }

    public function destroy(GameVideo $gameVideo)
    {
        $gameVideo->delete();

        return response()->noContent();
    }

    /** გადალაგება — მოწოდებული id-ების რიგი ხდება `sort_order` */
    public function reorder(Request $request, Game $game)
    {
        $data = $request->validate([
            'ids' => ['present', 'array'],
            'ids.*' => ['integer'],
        ]);

        foreach ($data['ids'] as $i => $id) {
            $game->videos()->whereKey($id)->update(['sort_order' => $i + 1]);
        }

        return GameVideoResource::collection($game->videos()->get());
    }

    private function validated(Request $request, ?GameVideo $video = null): array
    {
        return $request->validate([
            'url' => [$video ? 'sometimes' : 'required', 'string', 'max:1000', 'url'],
            'kind' => ['nullable', Rule::in(GameVideo::KINDS)],
            'title' => ['nullable', 'string', 'max:255'],
            'duration' => ['nullable', 'integer', 'min:0', 'max:360000'],
        ]);
    }
}
