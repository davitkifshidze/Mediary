<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SongNoteResource;
use App\Models\Song;
use App\Models\SongNote;
use Illuminate\Http\Request;

/** სიმღერის ჩანიშვნები (Tasks §7.4) — საკუთარი ცხრილი `song_notes` */
class SongNoteController extends Controller
{
    public function index(Song $song)
    {
        return SongNoteResource::collection($song->notes()->get());
    }

    public function store(Request $request, Song $song)
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);

        $note = $song->notes()->create([
            'user_id' => $request->user()->id,
            'body' => $data['body'],
        ]);

        return (new SongNoteResource($note))->response()->setStatusCode(201);
    }

    public function update(Request $request, SongNote $songNote)
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);

        $songNote->update($data);

        return new SongNoteResource($songNote);
    }

    public function destroy(SongNote $songNote)
    {
        $songNote->delete();

        return response()->noContent();
    }
}
