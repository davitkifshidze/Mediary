<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VideoNoteResource;
use App\Models\Video;
use App\Models\VideoNote;
use App\Support\RichText;
use Illuminate\Http\Request;

/** ვიდეოს ჩანიშვნები — საკუთარი ცხრილი `video_notes` */
class VideoNoteController extends Controller
{
    public function index(Video $video)
    {
        return VideoNoteResource::collection($video->notes()->get());
    }

    public function store(Request $request, Video $video)
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:'.RichText::NOTE_MAX]]);

        $note = $video->notes()->create([
            'user_id' => $request->user()->id,
            'body' => $data['body'],
        ]);

        return (new VideoNoteResource($note))->response()->setStatusCode(201);
    }

    public function update(Request $request, VideoNote $videoNote)
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:'.RichText::NOTE_MAX]]);

        $videoNote->update($data);

        return new VideoNoteResource($videoNote);
    }

    public function destroy(VideoNote $videoNote)
    {
        // ⚠️ ურნა — რიგი ადგილზე რჩება და ურნიდან ბრუნდება
        $videoNote->moveToTrash();

        return response()->noContent();
    }
}
