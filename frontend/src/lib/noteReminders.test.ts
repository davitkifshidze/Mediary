import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/* ============================================================
   რეგრესია: **ყოველი poll მთელ `['notes']` ქეშს ინვალიდირებდა** (Tasks PERF-12).

   `qc.invalidateQueries({ queryKey: ['notes'] })` ციკლის გარეთ, უპირობოდ
   იდგა — ე.ი. სანამ `due` არაცარიელია, ყოველ წუთს ყველა `['notes']*`
   query თავიდან იტვირთებოდა, მაშინაც, როცა ყველა შეხსენება უკვე
   ნაჩვენებია და **არაფერი შეცვლილა**.

   ⚠️ მეორე poll განზრახ **იმავე id-ს სხვა სხეულით** აბრუნებს: react-query-ის
   structural sharing ღრმად ტოლ მონაცემზე ძველ რეფერენციას ინახავს, ე.ი.
   ზუსტად იგივე მასივი ეფექტს საერთოდ არ გაუშვებდა და ტესტი უაზრო იქნებოდა.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchDueNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
}))

vi.mock('@/api/notes', async (original) => ({
  ...(await original<typeof import('@/api/notes')>()),
  ...mocks,
}))

/** jsdom-ს `Notification` არ აქვს — უამისოდ hook „unsupported"-ზე გაჩერდებოდა */
class FakeNotification {
  static permission = 'granted'

  // ⚠️ ცხადი ველი და არა კონსტრუქტორის პარამეტრ-თვისება: `erasableSyntaxOnly`
  // ამ უკანასკნელს კრძალავს (vitest-ის esbuild გაატარებდა, `tsc -b` — არა)
  title: string

  constructor(title: string) {
    this.title = title
  }
}

;(globalThis as unknown as { Notification: unknown }).Notification = FakeNotification
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const due = (id: number, body: string) => ({
  id,
  note_entry_id: 7,
  note_reminder_id: 1,
  channel: 'browser' as const,
  title: 'პასპორტი',
  body,
  status: 'pending' as const,
  error: null,
  scheduled_for: null,
  sent_at: null,
  read_at: null,
  created_at: null,
  note: null,
})

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount() {
  const { useNoteReminderWatcher } = await import('@/lib/noteReminders')

  function Host() {
    useNoteReminderWatcher(true)

    return null
  }

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(qc, 'invalidateQueries')

  await act(async () => {
    root!.render(h(QueryClientProvider, { client: qc }, h(Host, null)))
  })
  await flush()

  const notes = () => invalidate.mock.calls.filter(([arg]) => (arg as { queryKey?: string[] })?.queryKey?.[0] === 'notes')

  return { qc, notes }
}

describe('useNoteReminderWatcher — PERF-12', () => {
  it('reloads the notes cache once a reminder has actually been shown', async () => {
    mocks.fetchDueNotifications.mockResolvedValue([due(1, 'პირველი')])
    mocks.markNotificationRead.mockResolvedValue(undefined)

    const { notes } = await mount()

    expect(notes().length).toBeGreaterThanOrEqual(1)
  })

  it('never reloads it again while the same reminder is already shown', async () => {
    mocks.fetchDueNotifications.mockResolvedValue([due(1, 'პირველი')])
    mocks.markNotificationRead.mockResolvedValue(undefined)

    const { qc, notes } = await mount()
    const before = notes().length

    // იმავე შეხსენების ახალი poll — სხვა სხეული, იგივე id
    await act(async () => {
      qc.setQueryData(['note-due'], [due(1, 'იგივე, ოღონდ სხვა ტექსტი')])
    })
    await flush()

    expect(notes().length).toBe(before)
    // ⚠️ და მონიშვნაც მხოლოდ ერთხელ — თორემ „უკვე ნაჩვენები" წესი გატეხილია
    expect(mocks.markNotificationRead).toHaveBeenCalledTimes(1)
  })

  /* ⚠️ მონიშვნის ჩავარდნაზე მრიცხველები უცვლელია, ე.ი. გადატვირთვა უაზროა —
     და `shown`-იდანაც უნდა მოიხსნას, რომ შემდეგმა poll-მა თავიდან სცადოს. */
  it('does not reload when marking the reminder read failed', async () => {
    mocks.fetchDueNotifications.mockResolvedValue([due(1, 'პირველი')])
    mocks.markNotificationRead.mockRejectedValue(new Error('offline'))

    const { notes } = await mount()

    expect(notes()).toEqual([])
  })
})
