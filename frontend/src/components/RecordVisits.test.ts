import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'

/* ============================================================
   **„შევედი N-ჯერ"** (Tasks §10).

   ⚠️ მოწმდება: ბეჯი გახსნაზე ერთხელ აგზავნის „შევედი"-ს და სესიაში იმავე
   ჩანაწერზე მეორედ არა (სხვა ჩანაწერზე — კი); რიცხვი სერვერის პასუხიდან
   ჩანს; დაჭერით ჟურნალი იხსნება „ვინ · საიდან"-ით; სტრიქონის მრიცხველი
   ნულზე არაფერს ხატავს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock('@/api/visits', async (original) => ({
  ...(await original<typeof import('@/api/visits')>()),
  recordRecordVisit: mocks.record,
  fetchRecordVisits: mocks.fetch,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

const summary = (count: number) => ({
  count,
  mine: count,
  last_at: count ? '2026-10-02T14:20:00.000Z' : null,
  entries: count
    ? [
        { id: 2, viewer: { id: 1, name: 'Vera', username: 'vera' }, viewer_name: 'Vera', is_me: true, source: 'library' as const, visited_at: '2026-10-02T14:20:00.000Z' },
        { id: 1, viewer: null, viewer_name: null, is_me: false, source: 'public' as const, visited_at: '2026-10-01T10:00:00.000Z' },
      ]
    : [],
})

beforeEach(() => {
  window.sessionStorage.clear()
  mocks.record.mockReset().mockResolvedValue(summary(7))
  mocks.fetch.mockReset().mockResolvedValue(summary(7))
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(node: ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root!.render(h(QueryClientProvider, { client: qc }, node)))
  await flush()
  return container
}

describe('VisitBadge', () => {
  it('records the visit once per session per record and shows the count', async () => {
    const { VisitBadge } = await import('@/components/RecordVisits')
    const el = await mount(h(VisitBadge, { type: 'book', id: 5 }))

    expect(mocks.record).toHaveBeenCalledTimes(1)
    expect(mocks.record).toHaveBeenCalledWith('book', 5)
    expect(el.querySelector('[data-testid="visit-badge"]')?.textContent).toContain(i18n.t('visits.count', { count: 7 }))

    // იგივე ჩანაწერი ხელახლა — სესიაში უკვე დათვლილია
    act(() => root?.unmount())
    container?.remove()
    await mount(h(VisitBadge, { type: 'book', id: 5 }))
    expect(mocks.record).toHaveBeenCalledTimes(1)

    // სხვა ჩანაწერი — ითვლება
    act(() => root?.unmount())
    container?.remove()
    await mount(h(VisitBadge, { type: 'book', id: 6 }))
    expect(mocks.record).toHaveBeenCalledTimes(2)
    expect(mocks.record).toHaveBeenLastCalledWith('book', 6)
  })

  it('opens the log with who and where', async () => {
    const { VisitBadge } = await import('@/components/RecordVisits')
    const el = await mount(h(VisitBadge, { type: 'movie', id: 1 }))

    await act(async () => el.querySelector<HTMLButtonElement>('[data-testid="visit-badge"]')!.click())
    await flush()

    const text = document.body.textContent ?? ''
    expect(text).toContain(i18n.t('visits.title'))
    expect(text).toContain(i18n.t('visits.me'))
    expect(text).toContain(i18n.t('visits.anonymous'))
    expect(text).toContain(i18n.t('visits.source.public'))
  })
})

describe('VisitCount', () => {
  it('draws nothing for zero and the number otherwise', async () => {
    const { VisitCount } = await import('@/components/RecordVisits')
    const el = await mount(h('div', null, h(VisitCount, { value: 0 }), h(VisitCount, { value: 3 })))

    const counts = el.querySelectorAll('[data-testid="visit-count"]')
    expect(counts).toHaveLength(1)
    expect(counts[0].textContent).toBe('3')
  })
})
