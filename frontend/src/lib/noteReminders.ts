import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchDueNotifications,
  markNotificationRead,
  type NoteNotification,
} from '@/api/notes'

/* ============================================================
   ბრაუზერის შეტყობინებები (Tasks §13.3).

   ⚠️ **მთავარი არხი და დამოკიდებულების გარეშე**: არც push-სერვისი, არც
   worker — მარტივი polling. `GET /note-reminders/due` backend-ზე იმავე
   დისპეტჩერს იძახებს, რასაც cron, ე.ი. გახსნილ აპლიკაციაში შეხსენება
   `schedule:work`-ის გარეშეც მუშაობს.

   ⚠️ **„ნანახად" მონიშვნა ერთადერთი დაცვაა დუბლისგან**: სანამ ჩანაწერი
   `read_at`-ს არ მიიღებს, `due` მას ისევ დააბრუნებს. ამიტომ ჯერ ვნიშნავთ
   და მერე ვაჩვენებთ — შებრუნებული რიგი ერთსა და იმავე შეხსენებას წუთში
   ერთხელ გაიმეორებდა, თუ მონიშვნა ჩავარდებოდა.
   ============================================================ */

/** რამდენ ხანში ერთხელ ვეკითხებით. 60 წმ „ყოველ 10 წუთში"-სთვისაც კმარა */
const POLL_MS = 60_000

export type NotificationPermissionState = 'unsupported' | NotificationPermission

export function notificationPermission(): NotificationPermissionState {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

/** ნებართვის თხოვნა — **მხოლოდ user-ის ქმედებიდან** (ბრაუზერები სხვას ბლოკავენ) */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

/** SW-ის რეგისტრაცია — ჩაკეცილ ტაბზე ჩვენებისთვის */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

async function show(item: NoteNotification) {
  const options: NotificationOptions = {
    body: item.body ?? undefined,
    // ერთი და იმავე შეხსენების გამეორება ერთმანეთს ჩაანაცვლებს და არ დააგროვებს
    tag: `note-${item.note_entry_id}-${item.id}`,
    icon: '/favicon.svg',
    data: { url: '/notes' },
  }

  const reg = await registration()

  if (reg?.showNotification) {
    await reg.showNotification(item.title, options)
    return
  }

  // fallback — desktop-ზე გვერდიდანაც მუშაობს
  new Notification(item.title, options)
}

/**
 * რიგის მოსმენა. `enabled` = მოდული ჩართულია თუ არა — გამორთულზე
 * არც polling უნდა იყოს და არც ნებართვის თხოვნა.
 */
export function useNoteReminderWatcher(enabled: boolean) {
  const qc = useQueryClient()
  const shown = useRef(new Set<number>())

  const { data } = useQuery({
    queryKey: ['note-due'],
    queryFn: fetchDueNotifications,
    enabled,
    refetchInterval: POLL_MS,
    // ტაბზე დაბრუნებისას მაშინვე შემოწმდეს
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  useEffect(() => {
    if (!enabled || !data?.length) return
    if (notificationPermission() !== 'granted') return

    for (const item of data) {
      // ერთ სესიაში ორჯერ ჩვენება (ორი მაუნთი/refetch) გამორიცხულია
      if (shown.current.has(item.id)) continue
      shown.current.add(item.id)

      markNotificationRead(item.id)
        .then(() => show(item))
        .catch(() => shown.current.delete(item.id))
    }

    // ჩანაწერის მრიცხველები შეხსენების შემდეგ შეიძლება შეიცვალოს
    qc.invalidateQueries({ queryKey: ['notes'] })
  }, [data, enabled, qc])

  return data ?? []
}
