import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { AppNotification, NotificationCounts } from '@/api/notifications'
import i18n from '@/i18n'
import { notificationDetail, notificationTitle } from '@/lib/notifications'

/* ============================================================
   **შეტყობინებების ცენტრი — ზარი და `/notifications` გვერდი**.

   ⚠️ მოწმდება: ზარის რიცხვი უნახავს ითვლის და გახსნისას „ნახულად" ინიშნება
   (წაკითხულად — არა), ნახულ-წაუკითხავზე რიცხვის ნაცვლად წერტილია, „ყველას
   ნახვა" გვერდზე მიდის; გვერდი ფილტრავს წაუკითხავითა და ტიპით, თითო რიგს
   წაკითხულად / წაუკითხავად ნიშნავს და შლის, მონიშნულებზე — ერთად; ახალი ტიპები
   (დღეს გამოდის · ფრანჩაიზს ნაწილი აკლია · ახალი სეზონი) თავის ტექსტს ხატავს.
   ============================================================ */

const extra = vi.hoisted(() => ({ setFranchiseReminder: vi.fn(), enqueue: vi.fn() }))

vi.mock('@/api/media', async (original) => ({
  ...(await original<typeof import('@/api/media')>()),
  setFranchiseReminder: extra.setFranchiseReminder,
}))

const queue = { enqueue: extra.enqueue, isQueued: () => false }
vi.mock('@/components/ui/queue', async (original) => ({
  ...(await original<typeof import('@/components/ui/queue')>()),
  useQueue: () => queue,
}))

const mocks = vi.hoisted(() => ({
  fetchNotifications: vi.fn(),
  fetchNotificationCounts: vi.fn(),
  markNotificationsSeen: vi.fn(),
  markNotificationsRead: vi.fn(),
  markNotificationUnread: vi.fn(),
  bulkNotifications: vi.fn(),
  deleteNotification: vi.fn(),
  clearNotifications: vi.fn(),
}))

vi.mock('@/api/notifications', async (original) => ({
  ...(await original<typeof import('@/api/notifications')>()),
  ...mocks,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

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

function note(id: string, over: Partial<AppNotification> = {}): AppNotification {
  return {
    id,
    type: 'batch_done',
    data: { total: 3, failed: 0 },
    route: null,
    read_at: null,
    seen_at: null,
    created_at: '2026-11-12T08:00:00+04:00',
    ...over,
  }
}

const zero: NotificationCounts = { unseen: 0, unread: 0, total: 0 }

function page(items: AppNotification[], counts: Partial<NotificationCounts> = {}, types: Record<string, number> = {}) {
  return {
    items,
    total: items.length,
    lastPage: 1,
    types,
    unseen: 0,
    unread: items.filter((n) => !n.read_at).length,
    ...counts,
  }
}

beforeEach(() => {
  for (const fn of [mocks.markNotificationsSeen, mocks.markNotificationsRead, mocks.markNotificationUnread]) {
    fn.mockResolvedValue(zero)
  }
  mocks.bulkNotifications.mockResolvedValue(2)
  mocks.deleteNotification.mockResolvedValue(undefined)
  extra.setFranchiseReminder.mockResolvedValue(undefined)
})

async function render(node: ReturnType<typeof h>, path = '/') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(MemoryRouter, { initialEntries: [path] }, h(TooltipProvider, null, h(FeedbackProvider, null, node))),
      ),
    ),
  )
  await flush()
  await flush()

  return container
}

const button = (label: string, within: ParentNode = document) =>
  [...within.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)

describe('NotificationBell', () => {
  async function bell(counts: NotificationCounts, items: AppNotification[]) {
    mocks.fetchNotificationCounts.mockResolvedValue(counts)
    // „ნახულად" მონიშვნის შემდეგ რიცხვი ქრება, დანარჩენი რჩება
    mocks.markNotificationsSeen.mockResolvedValue({ ...counts, unseen: 0 })
    mocks.fetchNotifications.mockResolvedValue(page(items))
    const { NotificationBell } = await import('@/components/NotificationBell')

    return render(h(NotificationBell))
  }

  it('counts the unseen, marks them seen on opening and leaves them unread', async () => {
    const box = await bell({ unseen: 2, unread: 3, total: 5 }, [note('a'), note('b', { read_at: '2026-11-11T08:00:00+04:00' })])

    expect(box.querySelector('[data-testid="bell-count"]')?.textContent).toBe('2')
    expect(mocks.fetchNotifications).not.toHaveBeenCalled()

    await act(async () => box.querySelector<HTMLButtonElement>('button')!.click())
    await flush()
    await flush()

    // გახსნა = „დავინახე" — არაფერი წაკითხულა
    expect(mocks.markNotificationsSeen).toHaveBeenCalledTimes(1)
    expect(mocks.markNotificationsRead).not.toHaveBeenCalled()
    expect(mocks.fetchNotifications).toHaveBeenCalledWith({ per_page: 20 })

    // რიცხვი გაქრა, წერტილი დარჩა — ჯერ ყველაფერი წაკითხული არ არის
    expect(box.querySelector('[data-testid="bell-count"]')).toBeNull()
    expect(box.querySelector('[data-testid="bell-dot"]')).not.toBeNull()

    // წაუკითხავს წერტილი აქვს, წაკითხულს — არა
    expect(document.querySelectorAll('[data-testid="unread-dot"]')).toHaveLength(1)
    // „ყველას ნახვა" გვერდზე მიდის
    const all = [...document.querySelectorAll('a')].find((a) => a.textContent?.includes(i18n.t('notifications.seeAll')))
    expect(all?.getAttribute('href')).toBe('/notifications')
  })

  it('shows a dot instead of a number when everything is seen but something is unread', async () => {
    const box = await bell({ unseen: 0, unread: 1, total: 4 }, [])

    expect(box.querySelector('[data-testid="bell-count"]')).toBeNull()
    expect(box.querySelector('[data-testid="bell-dot"]')).not.toBeNull()
  })

  it('is not drawn when there is nothing at all', async () => {
    const box = await bell(zero, [])

    expect(box.querySelector('button')).toBeNull()
  })
})

describe('NotificationsPage', () => {
  const items = [
    note('a', { type: 'release_today', data: { title_ka: 'დიუნა', title_en: 'Dune', kind: 'premiere' }, route: '/movies/14' }),
    note('b', { read_at: '2026-11-11T08:00:00+04:00' }),
    note('c'),
  ]

  async function mount(path = '/notifications') {
    mocks.fetchNotifications.mockResolvedValue(page(items, { total: 3, unread: 2 }, { release_today: 1, batch_done: 2 }))
    const { NotificationsPage } = await import('@/pages/NotificationsPage')

    return render(
      h(
        Routes,
        null,
        h(Route, { path: '/notifications', element: h(NotificationsPage) }),
        h(Route, { path: '/movies/:id', element: h('p', { 'data-testid': 'record' }, 'record') }),
      ),
      path,
    )
  }

  const rows = () => [...document.querySelectorAll<HTMLElement>('[data-testid="notification-row"]')]

  it('lists a page of notifications and reads the filters from the address', async () => {
    await mount('/notifications?show=unread&type=batch_done')

    expect(mocks.fetchNotifications).toHaveBeenCalledWith({ unread: true, type: 'batch_done', page: 1, per_page: 10 })
    expect(rows()).toHaveLength(3)
    expect(rows()[0].textContent).toContain(i18n.t('notifications.kind.release_today'))
    expect(rows()[0].textContent).toContain('დიუნა')
    expect(document.body.textContent).toContain(i18n.t('notifications.summary', { total: 3, unread: 2 }))
  })

  it('marks one row read or unread and deletes it', async () => {
    await mount()

    await act(async () => button(i18n.t('notifications.markRead'), rows()[0])!.click())
    expect(mocks.markNotificationsRead).toHaveBeenCalledWith('a')

    await act(async () => button(i18n.t('notifications.markUnread'), rows()[1])!.click())
    expect(mocks.markNotificationUnread).toHaveBeenCalledWith('b')

    await act(async () => button(i18n.t('actions.delete'), rows()[2])!.click())
    expect(mocks.deleteNotification).toHaveBeenCalledWith('c')
  })

  it('opens the record and marks the notification read on press', async () => {
    const box = await mount()

    await act(async () => rows()[0].querySelector<HTMLButtonElement>('button[data-kind="row"]')!.click())
    await flush()

    expect(mocks.markNotificationsRead).toHaveBeenCalledWith('a')
    expect(box.querySelector('[data-testid="record"]')).not.toBeNull()
  })

  it('acts on the selected rows together', async () => {
    await mount()
    const bar = document.querySelector<HTMLElement>('[data-testid="bulk-bar"]')!

    // მონიშვნამდე მასობრივი ღილაკები არ ჩანს
    expect(button(i18n.t('notifications.markRead'), bar)).toBeUndefined()

    await act(async () => rows()[0].querySelector<HTMLButtonElement>('[role="checkbox"]')!.click())
    await act(async () => rows()[2].querySelector<HTMLButtonElement>('[role="checkbox"]')!.click())
    expect(bar.textContent).toContain(i18n.t('notifications.selected', { count: 2 }))

    await act(async () => button(i18n.t('notifications.markRead'), bar)!.click())
    await flush()
    expect(mocks.bulkNotifications).toHaveBeenCalledWith('read', ['a', 'c'])
    // მოქმედების შემდეგ მონიშვნა იხსნება
    expect(bar.textContent).toContain(i18n.t('notifications.selectPage'))

    // „ამ გვერდის მონიშვნა" ყველას ნიშნავს
    await act(async () => bar.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click())
    await act(async () => button(i18n.t('notifications.markUnread'), bar)!.click())
    expect(mocks.bulkNotifications).toHaveBeenLastCalledWith('unread', ['a', 'b', 'c'])
  })
})

describe('franchise part notification', () => {
  const part = note('f', {
    type: 'franchise_part',
    data: { tmdb_id: 604, title_en: 'Reloaded', collection_id: 2344, collection_name: 'The Matrix Collection' },
    route: '/movies/7',
  })

  async function mount() {
    mocks.fetchNotifications.mockResolvedValue(page([part, note('g')], { total: 2, unread: 2 }))
    const { NotificationsPage } = await import('@/pages/NotificationsPage')

    return render(h(Routes, null, h(Route, { path: '/notifications', element: h(NotificationsPage) })), '/notifications')
  }

  const rows = () => [...document.querySelectorAll<HTMLElement>('[data-testid="notification-row"]')]

  it('adds the missing part with one press — only on its own kind of row', async () => {
    await mount()

    expect(rows()[0].textContent).toContain('Reloaded · The Matrix Collection')
    expect(button(i18n.t('actor.add'), rows()[1])).toBeUndefined()

    await act(async () => button(i18n.t('actor.add'), rows()[0])!.click())
    expect(extra.enqueue).toHaveBeenCalledWith([{ tmdbId: 604, title: 'Reloaded' }], 'movie')
  })

  it('stops the reminders for the part or for the whole franchise', async () => {
    await mount()
    const menu = () => button(i18n.t('franchise.remindOff'), rows()[0])!

    await act(async () => menu().click())
    await act(async () => button(i18n.t('franchise.mutePart'))!.click())
    await flush()
    expect(extra.setFranchiseReminder).toHaveBeenCalledWith(2344, true, 604)

    await act(async () => menu().click())
    await act(async () => button(i18n.t('franchise.muteAll'))!.click())
    await flush()
    expect(extra.setFranchiseReminder).toHaveBeenLastCalledWith(2344, true, undefined)
    // სერვერი შეტყობინებებსაც აშორებს — სია თავიდან იკითხება
    expect(mocks.fetchNotifications.mock.calls.length).toBeGreaterThan(1)
  })
})

describe('notification text', () => {
  it('names the new kinds and what they are about', () => {
    expect(notificationTitle(i18n.t, 'franchise_part')).toBe(i18n.t('notifications.kind.franchise_part'))
    expect(notificationTitle(i18n.t, 'made_up_later')).toBe(i18n.t('notifications.title'))

    expect(
      notificationDetail({ type: 'release_today', data: { title_ka: 'სერიალი', title_en: 'Show', kind: 'season', season: 4, episode: 1 } }, i18n.t, 'ka'),
    ).toBe(`სერიალი · ${i18n.t('soon.kind.season', { season: 4 })}`)
    expect(
      notificationDetail({ type: 'franchise_part', data: { title_ka: null, title_en: 'Part 3', collection_name: 'Saga' } }, i18n.t, 'ka'),
    ).toBe('Part 3 · Saga')
    expect(notificationDetail({ type: 'new_season', data: { title_en: 'Show', season: 5 } }, i18n.t, 'en')).toBe(
      `Show · ${i18n.t('soon.kind.season', { season: 5 })}`,
    )
  })
})
