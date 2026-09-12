<?php

namespace App\Http\Controllers\Api;

use App\Http\Resources\VideoResource;
use App\Models\Video;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * ვიდეოს სტატუსი (Tasks §6.4) — **ახალი ველი**: ამ მოდულს სტატუსი
 * აქამდე საერთოდ არ ჰქონდა.
 */
class VideoStatusController extends RecordStatusController
{
    protected function domain(): string
    {
        return 'video';
    }

    protected function resource(): string
    {
        return VideoResource::class;
    }

    /** ვიდეოს ჟანრი/შემადგენლობა არ აქვს — ტიპი ისედაც `$with`-შია */
    protected function loaded(Model $record): Model
    {
        return $record->load('type');
    }

    public function update(Request $request, Video $video): JsonResource
    {
        return $this->change($request, $video);
    }
}
