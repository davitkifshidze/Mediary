<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\CustomRecordNoteResource;
use App\Models\CustomRecord;
use App\Models\CustomRecordNote;
use Illuminate\Http\Request;

/**
 * **პირადი მოდულის ჩანაწერის ჩანიშვნები (Tasks §37.5)** — თამაშის ჩანიშვნის
 * ფორმა; SPA-ის `RecordNotes` ერთი კომპონენტია ყველა მოდულზე.
 *
 * ⚠️ ჩანაწერიც და ჩანიშვნაც **მოდულით** მოწმდება — ერთი ცხრილი ყველა პირად
 * მოდულზე (იხ. `CustomRecordFileController`).
 */
class CustomRecordNoteController extends Controller
{
    public function index(string $type, CustomRecord $record)
    {
        abort_unless($record->module === $type, 404);

        return CustomRecordNoteResource::collection($record->notes()->get());
    }

    public function store(Request $request, string $type, CustomRecord $record)
    {
        abort_unless($record->module === $type, 404);

        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);

        $note = $record->notes()->create([
            'user_id' => $request->user()->id,
            'module' => $type,
            'body' => $data['body'],
        ]);

        return (new CustomRecordNoteResource($note))->response()->setStatusCode(201);
    }

    public function update(Request $request, string $type, CustomRecordNote $note)
    {
        abort_unless($note->module === $type, 404);

        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);

        $note->update($data);

        return new CustomRecordNoteResource($note);
    }

    public function destroy(string $type, CustomRecordNote $note)
    {
        abort_unless($note->module === $type, 404);

        // ⚠️ ურნა (Tasks §29, ეტაპი 2) — რიგი ადგილზე რჩება და ურნიდან ბრუნდება
        $note->moveToTrash();

        return response()->noContent();
    }
}
