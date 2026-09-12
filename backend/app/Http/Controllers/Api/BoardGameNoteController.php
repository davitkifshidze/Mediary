<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BoardGameNoteResource;
use App\Models\BoardGame;
use App\Models\BoardGameNote;
use Illuminate\Http\Request;

/** ბორდგეიმის ჩანიშვნები (Tasks §14) — საკუთარი ცხრილი `board_game_notes` */
class BoardGameNoteController extends Controller
{
    public function index(BoardGame $boardGame)
    {
        return BoardGameNoteResource::collection($boardGame->notes()->get());
    }

    public function store(Request $request, BoardGame $boardGame)
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);

        $note = $boardGame->notes()->create([
            'user_id' => $request->user()->id,
            'body' => $data['body'],
        ]);

        return (new BoardGameNoteResource($note))->response()->setStatusCode(201);
    }

    public function update(Request $request, BoardGameNote $boardGameNote)
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);

        $boardGameNote->update($data);

        return new BoardGameNoteResource($boardGameNote);
    }

    public function destroy(BoardGameNote $boardGameNote)
    {
        $boardGameNote->delete();

        return response()->noContent();
    }
}
