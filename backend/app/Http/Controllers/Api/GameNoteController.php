<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\GameNoteResource;
use App\Models\Game;
use App\Models\GameNote;
use Illuminate\Http\Request;

/** თამაშის ჩანიშვნები (Tasks §11.1) — საკუთარი ცხრილი `game_notes` */
class GameNoteController extends Controller
{
    public function index(Game $game)
    {
        return GameNoteResource::collection($game->notes()->get());
    }

    public function store(Request $request, Game $game)
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);

        $note = $game->notes()->create([
            'user_id' => $request->user()->id,
            'body' => $data['body'],
        ]);

        return (new GameNoteResource($note))->response()->setStatusCode(201);
    }

    public function update(Request $request, GameNote $gameNote)
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);

        $gameNote->update($data);

        return new GameNoteResource($gameNote);
    }

    public function destroy(GameNote $gameNote)
    {
        $gameNote->delete();

        return response()->noContent();
    }
}
