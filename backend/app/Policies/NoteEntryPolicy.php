<?php

namespace App\Policies;

/**
 * NoteEntry-ის მფლობელობა — წესი `OwnedRecordPolicy`-შია (აუდიტი §A5).
 *
 * ⚠️ **კლასი ცარიელია და ეს განზრახაა.** ის Laravel-ის ავტომატური
 * აღმოჩენისთვის არსებობს (`App\Models\NoteEntry` → `App\Policies\NoteEntryPolicy`)
 * და იმისთვის, რომ ამ დომენს მომავალში საკუთარი წესის დამატება
 * შეეძლოს — ლოგიკის ასლი კი აღარსად წერია.
 */
class NoteEntryPolicy extends OwnedRecordPolicy {}
