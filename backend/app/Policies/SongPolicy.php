<?php

namespace App\Policies;

/**
 * Song-ის მფლობელობა — წესი `OwnedRecordPolicy`-შია (აუდიტი §A5).
 *
 * ⚠️ **კლასი ცარიელია და ეს განზრახაა.** ის Laravel-ის ავტომატური
 * აღმოჩენისთვის არსებობს (`App\Models\Song` → `App\Policies\SongPolicy`)
 * და იმისთვის, რომ ამ დომენს მომავალში საკუთარი წესის დამატება
 * შეეძლოს — ლოგიკის ასლი კი აღარსად წერია.
 */
class SongPolicy extends OwnedRecordPolicy {}
