<?php

namespace App\Policies;

/**
 * VideoType-ის მფლობელობა — წესი `OwnedRecordPolicy`-შია (აუდიტი §A5).
 *
 * ⚠️ **კლასი ცარიელია და ეს განზრახაა.** ის Laravel-ის ავტომატური
 * აღმოჩენისთვის არსებობს (`App\Models\VideoType` → `App\Policies\VideoTypePolicy`)
 * და იმისთვის, რომ ამ დომენს მომავალში საკუთარი წესის დამატება
 * შეეძლოს — ლოგიკის ასლი კი აღარსად წერია.
 */
class VideoTypePolicy extends OwnedRecordPolicy {}
