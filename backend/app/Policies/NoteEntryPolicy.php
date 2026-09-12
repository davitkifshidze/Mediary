<?php

namespace App\Policies;

use App\Models\NoteEntry;
use App\Models\User;

class NoteEntryPolicy
{
    public function view(User $user, NoteEntry $entry): bool
    {
        return $entry->user_id === $user->id;
    }

    public function update(User $user, NoteEntry $entry): bool
    {
        return $this->view($user, $entry);
    }

    public function delete(User $user, NoteEntry $entry): bool
    {
        return $this->view($user, $entry);
    }
}
