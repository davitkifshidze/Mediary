<?php

namespace App\Policies;

use App\Models\User;
use App\Models\Video;

class VideoPolicy
{
    public function view(User $user, Video $video): bool
    {
        return $video->user_id === $user->id;
    }

    public function update(User $user, Video $video): bool
    {
        return $this->view($user, $video);
    }

    public function delete(User $user, Video $video): bool
    {
        return $this->view($user, $video);
    }
}
