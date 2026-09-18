<?php

namespace App\Http\Resources;

use App\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RoleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'key' => $this->key,
            'name_ka' => $this->name_ka,
            'name_en' => $this->name_en,
            /* ⚠️ **`null` აქ „შეზღუდვის გარეშეს" ნიშნავს, მაგრამ სვეტი აღარ
               ამბობს ამას** (Tasks SEC-10). შეუზღუდაობის ერთადერთი წყარო
               `isSuperAdmin()`-ია, სვეტი კი `{}`-ია მასზეც; API-ს ფორმა
               განზრახ უცვლელი რჩება, რადგან `roleScope()` სწორედ `null`-ს
               კითხულობს როგორც „მატრიცა ჩაკეტილია". */
            'permissions' => $this->isSuperAdmin() ? null : ($this->permissions ?? []),
            'is_system' => $this->is_system,
            'is_super_admin' => $this->isSuperAdmin(),
            'sort_order' => $this->sort_order,
            'users_count' => $this->whenCounted('users'),
            'actions' => Role::ACTIONS,
        ];
    }
}
