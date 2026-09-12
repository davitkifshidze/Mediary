<?php

namespace App\Http\Controllers\Api;

use App\Http\Resources\MovieResource;
use App\Models\Movie;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MovieStatusController extends RecordStatusController
{
    protected function domain(): string
    {
        return 'movie';
    }

    protected function resource(): string
    {
        return MovieResource::class;
    }

    /**
     * ფრანჩაიზის გავრცელება: მხოლოდ **ჯერ არ დაწყებულში** გადასვლისას —
     * მიმდინარე/ნანახ ნაწილებს არ ეხება.
     *
     * ⚠️ **კრიტერიუმი `role`-ია და არა სახელი** (§6.4): სტატუსი per-user
     * ლექსიკონია, ე.ი. `'to_watch'`-ზე დაყრდნობა მხოლოდ ნაგულისხმევ
     * ნაკრებზე იმუშავებდა და გადარქმეულზე **ჩუმად ჩავარდებოდა**.
     */
    protected function afterUpdate(Model $record): void
    {
        if ($record->status_role !== 'todo' || ! $record->tmdb_collection_id) {
            return;
        }

        Movie::where('tmdb_collection_id', $record->tmdb_collection_id)
            ->where('id', '!=', $record->id)
            ->whereDoesntHave('status', fn ($q) => $q->whereIn('role', ['doing', 'done']))
            ->update(['status_id' => $record->status_id, 'watched_at' => null]);
    }

    protected function loaded(Model $record): Model
    {
        $record->load(['genres', 'cast']);
        Movie::annotateFranchise([$record]);

        return $record;
    }

    public function update(Request $request, Movie $movie): JsonResource
    {
        return $this->change($request, $movie);
    }
}
