<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BookNoteResource;
use App\Models\Book;
use App\Models\BookNote;
use Illuminate\Http\Request;

/**
 * წიგნის ჩანიშვნები **და ციტატები** (Tasks §12) — საკუთარი ცხრილი `book_notes`.
 * ციტატა იგივე რიგია `is_quote = true`-თი და (სურვილისამებრ) გვერდით.
 */
class BookNoteController extends Controller
{
    public function index(Request $request, Book $book)
    {
        $notes = $book->notes()
            ->when($request->boolean('quotes'), fn ($q) => $q->where('is_quote', true))
            ->get();

        return BookNoteResource::collection($notes);
    }

    public function store(Request $request, Book $book)
    {
        $data = $this->validated($request);

        $note = $book->notes()->create($data + ['user_id' => $request->user()->id]);

        return (new BookNoteResource($note))->response()->setStatusCode(201);
    }

    public function update(Request $request, BookNote $bookNote)
    {
        $bookNote->update($this->validated($request));

        return new BookNoteResource($bookNote);
    }

    public function destroy(BookNote $bookNote)
    {
        $bookNote->delete();

        return response()->noContent();
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'body' => ['required', 'string', 'max:5000'],
            'is_quote' => ['nullable', 'boolean'],
            'page' => ['nullable', 'integer', 'min:1', 'max:100000'],
        ]);

        return [
            'body' => $data['body'],
            'is_quote' => $request->boolean('is_quote'),
            'page' => $data['page'] ?? null,
        ];
    }
}
