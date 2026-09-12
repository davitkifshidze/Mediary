<?php

namespace App\Policies;

use App\Models\User;
use App\Models\VideoType;

class VideoTypePolicy
{
    public function view(User $user, VideoType $type): bool
    {
        return $type->user_id === $user->id;
    }

    public function update(User $user, VideoType $type): bool
    {
        return $this->view($user, $type);
    }

    public function delete(User $user, VideoType $type): bool
    {
        return $this->view($user, $type);
    }
}
