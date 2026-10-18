<?php

namespace App\Services\Duty;

use App\Models\DutyShift;
use App\Models\Module;
use App\Models\User;
use App\Services\Notes\NoteChannelSettings;
use App\Services\Notes\TelegramNotifier;
use App\Support\AppTime;
use App\Support\DutySettings;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * **„ხვალ მორიგეობა გაქვს“ — შეხსენება წინა დღეს.**
 *
 * მოდულის პარამეტრი `remind_at` („20:00“) ამბობს, **დღის რომელ დროს** შეგახსენოს
 * ხვალინდელი მორიგეობები; `remind_telegram` — ტელეგრამითაც (ბოტი და chat id
 * `/credentials`-შია, ჩანაწერების შეხსენების იგივე წყარო — `NoteChannelSettings`).
 *
 * ⚠️ **ორი გამომძახებელი, ერთი კოდი** (ჩანაწერების `ReminderDispatcher`-ის წესი):
 * scheduler (`duty:remind` ყოველ წუთს — ყველა ანგარიში) და ღია აპის polling
 * (`GET /duty/reminders/due` — მიმდინარე ანგარიში); dev-მანქანაზე cron ხშირად
 * არ დგას, ე.ი. ტაბი თვითონ ასრულებს იმას, რაც cron-ს უნდა გაეკეთებინა.
 *
 * ⚠️ **ერთი მორიგეობა ორჯერ არ შეხსენდება**: `reminded_at` პირობითი UPDATE-ით
 * იჭერს (`whereNull`) — მეორე გამომძახებელს 0 რიგი ხვდება და ის გამოტოვებს.
 * ბრაუზერი თავის ჩვენებას ცალკე იმახსოვრებს (`lib/dutyReminders.ts`).
 */
class DutyReminder
{
    public function __construct(
        private NoteChannelSettings $channels,
        private TelegramNotifier $telegram,
    ) {}

    /**
     * ვადამოსული შეხსენებები.
     *
     * @param  User|null  $user  მხოლოდ ამ ანგარიშისა (polling); `null` = ყველა (cron)
     * @return Collection<int, DutyShift> ამ გაშვებამ დაჭერილი მორიგეობები
     */
    public function run(?User $user = null, ?CarbonInterface $now = null): Collection
    {
        $now = AppTime::at($now ?: now());
        $tomorrow = $now->copy()->addDay()->toDateString();
        $moduleId = Module::query()->where('key', 'duty')->value('id');

        if (! $moduleId) {
            return collect();
        }

        $rows = DB::table('module_user')
            ->where('module_id', $moduleId)
            ->when($user, fn ($q) => $q->where('user_id', $user->getKey()))
            ->get(['user_id', 'settings']);

        $claimed = collect();

        foreach ($rows as $row) {
            $stored = json_decode((string) $row->settings, true);
            $settings = DutySettings::parse(is_array($stored) ? (array) ($stored[DutySettings::KEY] ?? []) : []);

            // ⚠️ დრო სტრიქონებად შედარდება („09:30“ < „20:00“) — ორივე `H:i`-ა
            if ($settings['remind_at'] === null || $now->format('H:i') < $settings['remind_at']) {
                continue;
            }

            $shifts = $this->claim((int) $row->user_id, $tomorrow, $now);

            if ($shifts->isEmpty()) {
                continue;
            }

            if ($settings['remind_telegram']) {
                $this->sendTelegram((int) $row->user_id, $shifts);
            }

            $claimed = $claimed->merge($shifts);
        }

        return $claimed;
    }

    /**
     * ხვალინდელი, ჯერ შეუხსენებელი მორიგეობების დაჭერა.
     *
     * ⚠️ `owner` scope იხსნება და მფლობელი ცხადად იწერება — cron-ს `Auth::id()`
     * არ აქვს; ურნაში მყოფი არ შეხსენდება (`trash` რჩება).
     *
     * @return Collection<int, DutyShift>
     */
    private function claim(int $userId, string $date, CarbonInterface $now): Collection
    {
        $ids = DutyShift::withoutGlobalScope('owner')
            ->where('user_id', $userId)
            ->where('date', $date)
            ->whereNull('reminded_at')
            ->pluck('id')
            ->all();

        if ($ids === []) {
            return collect();
        }

        $mine = [];

        foreach ($ids as $id) {
            // ⚠️ თითოეული ცალკე და პირობით — პარალელური გამომძახებლის დაჭერილი გამოტოვდება
            if (DutyShift::withoutGlobalScope('owner')->whereKey($id)->whereNull('reminded_at')->update(['reminded_at' => $now]) === 1) {
                $mine[] = $id;
            }
        }

        return DutyShift::withoutGlobalScope('owner')
            ->with(['workplace' => fn ($q) => $q->withoutGlobalScope('owner'), 'type' => fn ($q) => $q->withoutGlobalScope('owner')])
            ->whereIn('id', $mine)
            ->orderBy('start_time')
            ->orderBy('id')
            ->get();
    }

    /** @param Collection<int, DutyShift> $shifts */
    private function sendTelegram(int $userId, Collection $shifts): void
    {
        $owner = User::query()->find($userId);
        $settings = $owner ? $this->channels->for($owner) : null;

        if (! $settings || ! $settings['telegram_bot_token'] || ! $settings['telegram_chat_id']) {
            return;
        }

        $lines = $shifts->map(fn (DutyShift $shift) => '• '.implode(' · ', array_filter([
            $shift->workplace?->name,
            $shift->type?->name_ka ?? rtrim(rtrim(number_format((float) $shift->hours, 1, '.', ''), '0'), '.').' სთ',
            $shift->start_time ? substr((string) $shift->start_time, 0, 5) : null,
        ])));

        $this->telegram->send(
            $settings['telegram_bot_token'],
            $settings['telegram_chat_id'],
            "🩺 ხვალ მორიგეობა გაქვს:\n".$lines->implode("\n"),
        );
    }
}
