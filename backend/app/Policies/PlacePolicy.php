<?php

namespace App\Policies;

/**
 * Place-ის მფლობელობა — წესი `OwnedRecordPolicy`-შია (აუდიტი §A5).
 *
 * ⚠️ **კლასი ცარიელია და ეს განზრახაა.** ის Laravel-ის ავტომატური
 * აღმოჩენისთვის არსებობს და იმისთვის, რომ ამ დომენს მომავალში საკუთარი
 * წესის დამატება შეეძლოს — ლოგიკის ასლი კი აღარსად წერია.
 */
class PlacePolicy extends OwnedRecordPolicy {}
