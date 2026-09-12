<?php

namespace App\Http\Controllers\Api;

use App\Http\Resources\SeriesResource;
use App\Models\Series;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SeriesStatusController extends RecordStatusController
{
    protected function domain(): string
    {
        return 'series';
    }

    protected function resource(): string
    {
        return SeriesResource::class;
    }

    public function update(Request $request, Series $series): JsonResource
    {
        return $this->change($request, $series);
    }
}
