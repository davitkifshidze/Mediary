import type { NoteReminder, NoteReminderInput } from '@/api/notes'

/* ============================================================
   შეხსენების **მდგომარეობა და რიგი** — სუფთა ფუნქციები (ეტაპი 11 · ვიზუალი).

   ⚠️ **`next_at` აქ არ ითვლება და არასდროს უნდა ითვლებოდეს.** ის backend-ის
   `NoteReminder::computeNextAt()`-ის ერთადერთი პასუხია (§13.2-ის მზიდი წესი:
   „ერთი ფორმულა, თორემ ორმაგი გასროლა"). აქ მხოლოდ **მზა მნიშვნელობას
   ვკითხულობთ** — ე.ი. ფრონტზე „შემდეგი გასროლების წინასწარი ჩვენება"
   განზრახ არ კეთდება: ის მეორე ფორმულა იქნებოდა და პირველივე დღეს
   გაშორდებოდა (ზონები, ფანჯარა, `repeat_count`, თვის ბოლო დღე).
   ============================================================ */

/**
 * სამი მდგომარეობა, სამი სხვადასხვა ფაქტი — და ვიზუალიც სამია:
 * · `active` — ჩართულია და შემდეგი გასროლა ცნობილია;
 * · `paused` — მომხმარებელმა გამორთო (გადამრთველი), ე.ი. **დროებითია**;
 * · `done` — ჩართულია, მაგრამ აღარ გაისვრის (ფანჯარა დასრულდა,
 *   `repeat_count` ამოიწურა, ან `once` უკვე გაისროლა).
 *
 * ⚠️ `paused`-სა და `done`-ს ერთ „არააქტიურად" გაერთიანება ზუსტად ის იყო,
 * რაც ეკრანს უაზროდ ხდიდა: პირველი ერთი დაჭერით ბრუნდება, მეორეს კი
 * რედაქტირება სჭირდება.
 */
export type ReminderState = 'active' | 'paused' | 'done'

export function reminderState(reminder: NoteReminder): ReminderState {
  if (!reminder.is_active) return 'paused'

  return reminder.next_at ? 'active' : 'done'
}

const ORDER: Record<ReminderState, number> = { active: 0, paused: 1, done: 2 }

/**
 * რიგი: ჯერ აქტიურები **უახლოესი გასროლით**, მერე შეჩერებულები, ბოლოს
 * დასრულებულები.
 *
 * ⚠️ სერვერის რიგი აქ არ გამოდგება — ის `id`-ს მიჰყვება, ე.ი. „რა მელის
 * შემდეგ" სიის შუაში აღმოჩნდებოდა. ⚠️ ფუნქცია **ასლს აბრუნებს**:
 * react-query-ის ქეშის მასივის ადგილზე დახარისხება მას გააფუჭებდა.
 */
export function sortReminders(reminders: NoteReminder[]): NoteReminder[] {
  return [...reminders].sort((a, b) => {
    const byState = ORDER[reminderState(a)] - ORDER[reminderState(b)]
    if (byState !== 0) return byState

    // ⚠️ `next_at: null` ბოლოში — „უცნობი" ყველაზე შორია და არა ყველაზე ახლო
    const at = a.next_at ? Date.parse(a.next_at) : Number.POSITIVE_INFINITY
    const bt = b.next_at ? Date.parse(b.next_at) : Number.POSITIVE_INFINITY
    if (at !== bt) return at - bt

    return a.id - b.id
  })
}

/** რამდენი აქტიურია — სათაურის შეჯამებისთვის */
export function activeCount(reminders: NoteReminder[]): number {
  return reminders.filter((r) => reminderState(r) === 'active').length
}

/**
 * არსებული შეხსენება → მოთხოვნა.
 *
 * ⚠️ „აქტიურობის" გადამრთველი **მთელ შეხსენებას** აგზავნის უკან (PATCH-ს
 * ნაწილობრივი განახლება არ აქვს), ე.ი. ახალი ველი აქ რომ დაგვავიწყდეს,
 * ერთი გადართვა ფანჯარასა და დროების სიას ჩუმად წაშლიდა.
 */
export function reminderInput(reminder: NoteReminder): NoteReminderInput {
  return {
    mode: reminder.mode,
    remind_at: reminder.remind_at,
    interval_minutes: reminder.interval_minutes,
    times_of_day: reminder.times_of_day,
    weekdays: reminder.weekdays,
    days_of_month: reminder.days_of_month,
    month: reminder.month,
    repeat_count: reminder.repeat_count,
    starts_at: reminder.starts_at,
    ends_at: reminder.ends_at,
    timezone: reminder.timezone,
    channels: reminder.channels,
  }
}
