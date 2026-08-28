<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\NoteResource;
use App\Models\Note;
use App\Models\Video;
use Illuminate\Http\Request;

/** ჩანიშვნები (K3) — polymorphic, დღეს ვიდეოებზე */
class NoteController extends Controller
{
    public function index(Request $request, Video $video)
    {
        $this->assertVisible($request, $video);

        return NoteResource::collection($video->notes()->get());
    }

    public function store(Request $request, Video $video)
    {
        $this->assertVisible($request, $video);

        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);

        $note = $video->notes()->create([
            'user_id' => $request->user()->id,
            'body' => $data['body'],
        ]);

        return (new NoteResource($note))->response()->setStatusCode(201);
    }

    public function update(Request $request, Note $note)
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);

        $note->update($data);

        return new NoteResource($note);
    }

    public function destroy(Note $note)
    {
        $note->delete();

        return response()->noContent();
    }

    private function assertVisible(Request $request, Video $video): void
    {
        abort_if($video->is_adult && ! $request->user()->hasModule('video_adult'), 404);
    }
}
