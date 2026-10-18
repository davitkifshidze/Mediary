<?php

namespace App\Http\Resources;

use App\Support\CustomModules;
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
            // გვერდის ჰედერის ფონი (`null` = ნეიტრალური)
            'color' => $this->color,
            'route_base' => $this->route_base,
            'api_base' => $this->api_base,
            'morph_alias' => $this->morph_alias,
            'is_active' => $this->is_active,
            'enabled_by_default' => $this->enabled_by_default,
            'sort_order' => $this->sort_order,
            /* ინტერფეისიდან შექმნილი (პირადი) მოდული. ⚠️ ეს რესურსი
               სხვის პირად მოდულს **არასდროს** აჩვენებს — `GET /modules` მხოლოდ
               საკუთარს აბრუნებს, ადმინის ზედამხედველობა კი ცალკე ფორმითაა. */
            'is_custom' => $this->owner_id !== null,
            'definition' => $this->when($this->owner_id !== null, fn () => CustomModules::definition($this->resource)),
            // ადმინმა გამორთო: მფლობელი თვითონ ვეღარ ჩართავს, მონაცემები ხელუხლებელია
            'disabled_by_admin' => $this->when($this->owner_id !== null, fn () => ! $this->is_active),
            'users_count' => $this->when(isset($this->users_count), fn () => (int) $this->users_count),
            // ვის აქვს ჩართული (ადმინის ტაბი)
            'users' => $this->when(isset($this->users_list), fn () => $this->users_list),
            // კონტექსტიდან: ჩართულია თუ არა ჩემთვის / აქვს თუ არა მოთხოვნა რიგში
            'enabled' => $this->when(isset($this->enabled), fn () => (bool) $this->enabled),
            // უფლება აქვს (ადმინმა ჩართო), თუნდაც თვითონ გამორთული ჰქონდეს
            'granted' => $this->when(isset($this->granted), fn () => (bool) $this->granted),
            'request_status' => $this->when(isset($this->request_status), fn () => $this->request_status),
            // per-user per-module პარამეტრები (`module_user.settings`)
            'user_settings' => $this->when(isset($this->user_settings), fn () => $this->user_settings),
            // ჩანს თუ არა მოდული ჩემს საჯარო პროფილზე
            'is_public' => $this->when(isset($this->is_public), fn () => (bool) $this->is_public),
            // შეიძლება თუ არა საერთოდ გასაჯაროება (`note` — არასდროს)
            'shareable' => $this->when(isset($this->shareable), fn () => (bool) $this->shareable),
        ];
    }
}
