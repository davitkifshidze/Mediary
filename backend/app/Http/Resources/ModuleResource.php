<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ModuleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'key' => $this->key,
            'name_ka' => $this->name_ka,
            'name_en' => $this->name_en,
            'description_ka' => $this->description_ka,
            'description_en' => $this->description_en,
            'icon' => $this->icon,
            'route_base' => $this->route_base,
            'api_base' => $this->api_base,
            'morph_alias' => $this->morph_alias,
            'is_sensitive' => $this->is_sensitive,
            'is_active' => $this->is_active,
            'enabled_by_default' => $this->enabled_by_default,
            'sort_order' => $this->sort_order,
            'users_count' => $this->when(isset($this->users_count), fn () => (int) $this->users_count),
            // ვის აქვს ჩართული (ადმინის ტაბი, K14)
            'users' => $this->when(isset($this->users_list), fn () => $this->users_list),
            // კონტექსტიდან: ჩართულია თუ არა ჩემთვის / აქვს თუ არა მოთხოვნა რიგში
            'enabled' => $this->when(isset($this->enabled), fn () => (bool) $this->enabled),
            // უფლება აქვს (ადმინმა ჩართო), თუნდაც თვითონ გამორთული ჰქონდეს — K13
            'granted' => $this->when(isset($this->granted), fn () => (bool) $this->granted),
            'request_status' => $this->when(isset($this->request_status), fn () => $this->request_status),
            // per-user per-module პარამეტრები (მაგ. 18+ consent)
            'user_settings' => $this->when(isset($this->user_settings), fn () => $this->user_settings),
        ];
    }
}
