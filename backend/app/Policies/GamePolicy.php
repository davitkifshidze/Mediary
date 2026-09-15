<?php

namespace App\Policies;

/**
 * Game-ის მფლობელობა — წესი `OwnedRecordPolicy`-შია (აუდიტი §A5).
 *
 * ⚠️ **კლასი ცარიელია და ეს განზრახაა.** ის Laravel-ის ავტომატური
 * აღმოჩენისთვის არსებობს (`App\Models\Game` → `App\Policies\GamePolicy`)
 * და იმისთვის, რომ ამ დომენს მომავალში საკუთარი წესის დამატება
 * შეეძლოს — ლოგიკის ასლი კი აღარსად წერია.
 */
class GamePolicy extends OwnedRecordPolicy {}
