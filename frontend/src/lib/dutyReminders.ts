import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DUTY_KEY, fetchDueDutyReminders, type DutyShift } from '@/api/duty'
import { formatHours, typeName } from '@/lib/duty'
import { notificationPermission, showBrowserNotification } from '@/lib/noteReminders'
import { safeGet, safeSet } from '@/lib/storage'
import i18n from '@/i18n'

/* ============================================================
   **მორიგეობის შეხსენება ბრაუზერში (Tasks §34.7).**

   ჩანაწერების შეხსენების (`lib/noteReminders.ts`) ტყუპი: polling ყოველ წუთს
   (`GET /duty/reminders/due` — სერვერი იმავე დროს ტელეგრამსაც აგზავნის, cron-ის
   გარეშეც), და ჩვენება იმავე გზით (service worker → გვერდი).

   ⚠️ **„უკვე ვაჩვენე“ ბრაუზერში ინახება** (`lib/storage.ts`): სერვერი ხვალინდელ
   შეხსენებულებს მთელი საღამო აბრუნებს — მეორე ტაბმა ან გადატვირთვამ ისინი
   ხელახლა არ უნდა აჩვენოს. სია ბოლო 200 id-ზე იჭრება.
   ============================================================ */

const POLL_MS = 60_000
const SHOWN_KEY = 'mediary.duty.reminded'
const SHOWN_LIMIT = 200

function shownIds(): number[] {
  try {
    const parsed = JSON.parse(safeGet(SHOWN_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((x): x is number => typeof x === 'number') : []
  } catch {
    return []
  }
}

function body(shift: DutyShift): string {
  return [
    shift.workplace?.name,
    shift.type ? typeName(shift.type, i18n.language) : i18n.t('duty.hoursValue', { hours: formatHours(shift.hours) }),
    shift.start_time,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** `enabled` = მოდული ჩართულია — გამორთულზე polling არ არის */
export function useDutyReminderWatcher(enabled: boolean) {
  const { data } = useQuery({
    queryKey: [DUTY_KEY, 'due'],
    queryFn: fetchDueDutyReminders,
    enabled,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  useEffect(() => {
    if (!enabled || !data?.length) return
    if (notificationPermission() !== 'granted') return

    const shown = shownIds()
    const fresh = data.filter((shift) => !shown.includes(shift.id))
    if (!fresh.length) return

    safeSet(SHOWN_KEY, JSON.stringify([...shown, ...fresh.map((s) => s.id)].slice(-SHOWN_LIMIT)))

    void showBrowserNotification(i18n.t('duty.reminder.title'), {
      body: fresh.map(body).join('\n'),
      // ერთი საღამოს შეხსენებები ერთმანეთს ჩაანაცვლებს და არ დააგროვებს
      tag: `duty-${fresh[0].date}`,
      icon: '/favicon.svg',
      data: { url: `/duty?date=${fresh[0].date}` },
    }).catch(() => {})
  }, [data, enabled])
}
