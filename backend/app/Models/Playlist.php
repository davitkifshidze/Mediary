<?php

namespace App\Models;

use App\Models\Concerns\BelongsToUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * პლეილისტი — **სიმღერების** დალაგებული ნაკრები.
 *
 * ⚠️ 2026-09-03-მდე პლეილისტი ვიდეოებს იკრებდა (Tasks §15); სიმღერების
 * ცალკე მოდულად გამოყოფის შემდეგ ის მუსიკის ერთეულია და `song`
 * მოდულში ცხოვრობს.
 *
 * ისეთივე პირადია, როგორც სიმღერა, ამიტომ `BelongsToUser`-ის `owner`
 * scope-ზე გადის — სხვისი პლეილისტი **404**-ია.
 *
 * `visibility` აქვე არის და არა მარტო სიმღერაზე: Tasks 16-ში პლეილისტი
 * დამოუკიდებელი გაზიარებადი ერთეულია.
 */
class Playlist extends Model
{
    use BelongsToUser;

    protected $guarded = ['id'];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    /**
     * პლეილისტის სიმღერები, pivot-ის რიგით.
     *
     * ⚠️ სორტირება **pivot-ზეა** და არა `songs.sort_order`-ზე: ერთი და იგივე
     * სიმღერა რამდენიმე პლეილისტში სხვადასხვა პოზიციაზე დგას.
     */
    public function songs(): BelongsToMany
    {
        return $this->belongsToMany(Song::class)
            ->withPivot('sort_order')
            ->withTimestamps()
            ->orderBy('playlist_song.sort_order')
            ->orderBy('playlist_song.id');
    }

    /** ბოლოში მიდგმის პოზიცია — ახალი პლეილისტისთვისაც და ახალი სიმღერისთვისაც */
    public static function nextOrderFor(int $userId): int
    {
        return (int) static::withoutGlobalScope('owner')
            ->where('user_id', $userId)
            ->max('sort_order') + 1;
    }
}
