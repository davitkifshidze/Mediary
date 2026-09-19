<?php

namespace App\Services\Notify;

use App\Models\User;
use App\Notifications\AppNotification;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * **შეტყობინების ერთადერთი ჩაწერის წერტილი (FEAT-19).**
 *
 * ⚠️ **`AuditLogger`-ის ზუსტი ფორმა და იმავე მიზეზით**: გამომძახებელს
 * არაფერი უნდა იცოდეს ცხრილზე, არხზე და ჩავარდნის დამუშავებაზე — თორემ
 * ხუთივე ადგილი თავის ვარიანტს დაწერდა.
 *
 * ⚠️ **არასდროს აგდებს გამონაკლისს.** შეტყობინება **მეორეული** ფაქტია:
 * მოთხოვნის დამტკიცება, ატვირთვა ან ასლი მის გამო არ უნდა ჩავარდეს.
 * ჩავარდნა `report()`-ში მიდის, ე.ი. ჩუმადაც არ იკარგება.
 *
 * ⚠️ **`$tableExists` მხოლოდ `true`-ს იმახსოვრებს** — `AuditLogger`-ის
 * ცოცხალი გაკვეთილი: `false`-ის დამახსოვრება მთელი პროცესისთვის თიშავდა
 * მექანიზმს, თუ ვინმე მიგრაციამდე იკითხავდა (`migrate:fresh`, ტესტის
 * bootstrap, დეპლოის პირველი მოთხოვნა).
 */
class Notifier
{
    private bool $tableExists = false;

    /** @param array<string, mixed> $data */
    public function send(?User $user, string $type, array $data = []): void
    {
        if (! $user || ! $this->tableExists()) {
            return;
        }

        try {
            $user->notify(new AppNotification($type, $data));
        } catch (Throwable $e) {
            report($e);
        }
    }

    /**
     * ყველა სუპერ-ადმინს — ინსტალაციის მოვლენებისთვის (ჩავარდნილი ასლი).
     *
     * ⚠️ **„პირველ სუპერ-ადმინს" არ ეგზავნება** (FEAT-12-ის ასლის მფლობელის
     * წესი აქ არ მუშაობს): ჩავარდნილი ასლი ყველა პასუხისმგებელს ეხება, და
     * თუ სწორედ ის ერთი ადამიანი არაა შესული, შეტყობინება არავის მისდის.
     */
    public function toAdmins(string $type, array $data = []): void
    {
        if (! $this->tableExists()) {
            return;
        }

        User::query()
            ->where('is_active', true)
            ->with('role')
            ->get()
            ->filter(fn (User $u) => $u->isSuperAdmin())
            ->each(fn (User $u) => $this->send($u, $type, $data));
    }

    private function tableExists(): bool
    {
        if ($this->tableExists) {
            return true;
        }

        return $this->tableExists = Schema::hasTable('notifications');
    }
}
