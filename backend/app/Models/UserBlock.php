<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * დაბლოკვა.
 *
 * ⚠️ **ცალკე ცხრილია და არა საუბრის pivot-ის დროშა**: ის ორ **ადამიანს**
 * შორისაა. სხვაგვარად დაბლოკილს ახალი საუბრის დაწყება მაინც შეეძლებოდა.
 *
 * ⚠️ **ცალმხრივია**: A-მ B დაბლოკა ≠ B-მ A. წერას ორივე მიმართულებით
 * ვკრძალავთ (იხ. `ChatService::blockedBetween()`) — თორემ დაბლოკილი
 * განაგრძობდა წერას იმას, ვინც სწორედ ამიტომ დაბლოკა.
 */
class UserBlock extends Model
{
    protected $guarded = ['id'];
}
