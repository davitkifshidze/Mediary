<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VideoNoteResource;
use App\Models\Video;
use App\Models\VideoNote;
use Illuminate\Http\Request;

/** ვიდეოს ჩანიშვნები (K3) — საკუთარი ცხრილი `video_notes` */
class VideoNoteController extends Controller
{
    public function index(Video $video)
    {
        return VideoNoteResource::collection($video->notes()->get());
    }

    public function store(Request $request, Video $video)
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);

        $note = $video->notes()->create([
            'user_id' => $request->user()->id,
            'body' => $data['body'],
        ]);

        return (new VideoNoteResource($note))->response()->setStatusCode(201);
    }

    public function update(Request $request, VideoNote $videoNote)
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);

        $videoNote->update($data);

        return new VideoNoteResource($videoNote);
    }

    public function destroy(VideoNote $videoNote)
    {
        $videoNote->delete();

        return response()->noContent();
    }
}
