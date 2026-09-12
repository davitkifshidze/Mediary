<?php

namespace App\Http\Controllers\Api;

use App\Http\Resources\AnimeResource;
use App\Models\Anime;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AnimeStatusController extends RecordStatusController
{
    protected function domain(): string
    {
        return 'anime';
    }

    protected function resource(): string
    {
        return AnimeResource::class;
    }

    public function update(Request $request, Anime $anime): JsonResource
    {
        return $this->change($request, $anime);
    }
}
