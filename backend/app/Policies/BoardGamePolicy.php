<?php

namespace App\Policies;

/**
 * BoardGame-ის მფლობელობა — წესი `OwnedRecordPolicy`-შია (აუდიტი §A5).
 *
 * ⚠️ **კლასი ცარიელია და ეს განზრახაა.** ის Laravel-ის ავტომატური
 * აღმოჩენისთვის არსებობს (`App\Models\BoardGame` → `App\Policies\BoardGamePolicy`)
 * და იმისთვის, რომ ამ დომენს მომავალში საკუთარი წესის დამატება
 * შეეძლოს — ლოგიკის ასლი კი აღარსად წერია.
 */
class BoardGamePolicy extends OwnedRecordPolicy {}
