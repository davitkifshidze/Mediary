import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { DutyShift } from '@/api/duty'

/* ============================================================
   **მორიგეობის შეხსენება ბრაუზერში (Tasks §34.7).**

   სერვერი ხვალინდელ შეხსენებულებს მთელი საღამო აბრუნებს — ⚠️ ერთი და იგივე
   მორიგეობა მეორე poll-ზე, გადატვირთვაზე ან მეორე ტაბში ხელახლა არ უნდა
   გამოჩნდეს („ნანახი“ ბრაუზერის საცავშია), ახალი კი — უნდა.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchDueDutyReminders: vi.fn(),
}))

vi.mock('@/api/duty', async (original) => ({
  ...(await original<typeof import('@/api/duty')>()),
  ...mocks,
}))

/** jsdom-ს `Notification` არ აქვს; service worker-იც არაა, ე.ი. ჩვენება პირდაპირ აქ მოდის */
class FakeNotification {
  static permission = 'granted'
  static shown: { title: string; body: string }[] = []

  constructor(title: string, options?: NotificationOptions) {
    FakeNotification.shown.push({ title, body: String(options?.body ?? '') })
  }
}

;(globalThis as unknown as { Notification: unknown }).Notification = FakeNotification
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const shift = (id: number, workplace: string): DutyShift => ({
  id,
  date: '2026-10-05',
  start_time: '08:00',
  hours: 24,
  pay: null,
  note: null,
  is_favorite: false,
  workplace_id: id,
  type_id: null,
  workplace: { id, name: workplace, short: null, color: null },
  type: null,
  created_at: null,
})

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  window.localStorage.clear()
  FakeNotification.permission = 'granted'
  FakeNotification.shown = []
})

/** გადატვირთვა / ტაბის დახურვა */
function unmount() {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
}

afterEach(() => {
  unmount()
  vi.clearAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount() {
  const { useDutyReminderWatcher } = await import('@/lib/dutyReminders')

  function Host() {
    useDutyReminderWatcher(true)

    return null
  }

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root!.render(h(QueryClientProvider, { client: qc }, h(Host, null)))
  })
  await flush()

  return qc
}

describe('useDutyReminderWatcher — §34.7', () => {
  it('shows tomorrow’s shifts in one notification', async () => {
    mocks.fetchDueDutyReminders.mockResolvedValue([shift(1, 'კლინიკა'), shift(2, 'საავადმყოფო')])

    await mount()

    expect(FakeNotification.shown).toHaveLength(1)
    expect(FakeNotification.shown[0].body).toContain('კლინიკა')
    expect(FakeNotification.shown[0].body).toContain('საავადმყოფო')
    expect(FakeNotification.shown[0].body).toContain('08:00')
  })

  it('never shows the same shift twice — not on the next poll and not after a reload', async () => {
    mocks.fetchDueDutyReminders.mockResolvedValue([shift(1, 'კლინიკა')])

    const qc = await mount()

    // შემდეგი poll — იგივე id, სხვა რეფერენცია (structural sharing ეფექტს არ გამოტოვებს)
    await act(async () => {
      qc.setQueryData(['duty', 'due'], [{ ...shift(1, 'კლინიკა'), note: 'სხვა' }])
    })
    await flush()

    // გადატვირთვა / მეორე ტაბი — „ნანახი“ საცავშია
    unmount()
    await mount()

    expect(FakeNotification.shown).toHaveLength(1)
  })

  it('shows only the shift that was not shown yet', async () => {
    mocks.fetchDueDutyReminders.mockResolvedValue([shift(1, 'კლინიკა')])

    const qc = await mount()

    await act(async () => {
      qc.setQueryData(['duty', 'due'], [shift(1, 'კლინიკა'), shift(2, 'საავადმყოფო')])
    })
    await flush()

    expect(FakeNotification.shown).toHaveLength(2)
    expect(FakeNotification.shown[1].body).toContain('საავადმყოფო')
    expect(FakeNotification.shown[1].body).not.toContain('კლინიკა')
  })

  /* ⚠️ ნებართვის გარეშე „ნანახად“ არ ინიშნება — ნებართვის მიცემის შემდეგ უნდა გამოჩნდეს */
  it('waits for the browser permission without marking anything shown', async () => {
    FakeNotification.permission = 'default'
    mocks.fetchDueDutyReminders.mockResolvedValue([shift(1, 'კლინიკა')])

    await mount()
    expect(FakeNotification.shown).toHaveLength(0)

    unmount()
    FakeNotification.permission = 'granted'
    await mount()

    expect(FakeNotification.shown).toHaveLength(1)
  })
})
