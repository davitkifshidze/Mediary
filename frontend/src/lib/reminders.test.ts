import { describe, expect, it } from 'vitest'
import { activeCount, reminderState, sortReminders } from '@/lib/reminders'
import type { NoteReminder } from '@/api/notes'

/* ============================================================
   შეხსენების მდგომარეობა და რიგი (ეტაპი 11 · ვიზუალი).

   ⚠️ ორივე წესი **უხილავია ტიპებისთვისაც და lint-ისთვისაც**: „შეჩერებული"
   და „აღარ გაისვრის" ერთი და იგივე `is_active === false`-სავით გამოიყურება
   სანამ ვინმე არ იკითხავს *რატომ*, ხოლო არასწორი რიგი უბრალოდ ცუდ სიას
   ხატავს და არაფერს ტეხს.
   ============================================================ */

function make(over: Partial<NoteReminder>): NoteReminder {
  return {
    id: 1,
    note_entry_id: 1,
    mode: 'daily',
    remind_at: null,
    interval_minutes: null,
    times_of_day: ['09:00'],
    weekdays: [],
    days_of_month: [],
    month: null,
    repeat_count: null,
    starts_at: null,
    ends_at: null,
    timezone: 'Asia/Tbilisi',
    channels: ['browser'],
    is_active: true,
    next_at: '2026-09-20T09:00:00Z',
    last_sent_at: null,
    sent_count: 0,
    ...over,
  }
}

describe('reminderState', () => {
  it('ჩართული + ცნობილი შემდეგი = აქტიური', () => {
    expect(reminderState(make({}))).toBe('active')
  })

  it('გამორთული = შეჩერებული, `next_at`-ის მიუხედავად', () => {
    expect(reminderState(make({ is_active: false }))).toBe('paused')
    expect(reminderState(make({ is_active: false, next_at: null }))).toBe('paused')
  })

  /** ⚠️ ფანჯარა დასრულდა / `repeat_count` ამოიწურა / `once` გაისროლა */
  it('ჩართული, მაგრამ შემდეგი არ აქვს = დასრულებული', () => {
    expect(reminderState(make({ next_at: null }))).toBe('done')
  })
})

describe('sortReminders', () => {
  it('ჯერ აქტიურები უახლოესით, მერე შეჩერებული, ბოლოს დასრულებული', () => {
    const list = [
      make({ id: 1, next_at: null }), // done
      make({ id: 2, is_active: false }), // paused
      make({ id: 3, next_at: '2026-09-25T09:00:00Z' }), // active, შორს
      make({ id: 4, next_at: '2026-09-20T09:00:00Z' }), // active, ახლოს
    ]

    expect(sortReminders(list).map((r) => r.id)).toEqual([4, 3, 2, 1])
  })

  it('ასლს აბრუნებს — ქეშის მასივს ადგილზე არ ალაგებს', () => {
    const list = [make({ id: 2, next_at: '2026-09-25T09:00:00Z' }), make({ id: 1 })]
    const sorted = sortReminders(list)

    expect(sorted).not.toBe(list)
    expect(list.map((r) => r.id)).toEqual([2, 1])
  })

  /** ⚠️ `next_at: null` აქტიურ რიგში ვერ მოხვდება, მაგრამ თანაბარზე id წყვეტს */
  it('თანაბარ დროზე რიგი id-ს მიჰყვება', () => {
    const list = [make({ id: 9 }), make({ id: 4 })]

    expect(sortReminders(list).map((r) => r.id)).toEqual([4, 9])
  })
})

describe('activeCount', () => {
  it('მხოლოდ აქტიურებს თვლის', () => {
    expect(
      activeCount([make({ id: 1 }), make({ id: 2, is_active: false }), make({ id: 3, next_at: null })]),
    ).toBe(1)
  })
})
