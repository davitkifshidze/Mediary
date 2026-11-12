import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { LockRow } from '@/api/lockBook'
import i18n from '@/i18n'

/* ============================================================
   **„ჩაკეტილები"** — ყველა ლოკი ერთ გვერდზე.

   ⚠️ მოწმდება: ლოკები მოდულებად ჯგუფდება (პირადი გალერეის პიროვნება და ალბომი —
   ერთ ჯგუფში, ტიპის წარწერით), ჩანაწერი თავის გვერდზე მიუთითებს და ამბობს, ღიაა თუ
   არა ამ სესიაში; მონიშვნა მუშაობს ერთზე, მოდულზე და ყველაზე; პაროლის მოხსნა
   დადასტურების ფანჯარაში ანგარიშის პაროლს ითხოვს და მხოლოდ მასთან ერთად იგზავნება;
   „ყველას ისევ ჩაკეტვა" მხოლოდ მაშინ აქტიურია, როცა რამე ღიაა.
   ============================================================ */

const lock = (id: number, extra: Partial<LockRow> = {}): LockRow => ({
  id,
  type: 'movie',
  module: 'movie',
  record_id: id + 100,
  title: `Record ${id}`,
  title_ka: null,
  hint: null,
  unlocked: false,
  locked_at: '2026-11-01T10:00:00+04:00',
  ...extra,
})

const ROWS = [
  lock(1, { hint: 'ზღვა', unlocked: true }),
  lock(2),
  lock(3, { type: 'cast_member', module: 'cast', title: 'Keanu Reeves' }),
  lock(4, { type: 'personal', module: 'personal', title: 'Ana' }),
  lock(5, { type: 'personal_album', module: 'personal', title: 'Summer' }),
]

const mocks = vi.hoisted(() => ({
  fetchLocks: vi.fn(),
  removeLocks: vi.fn(),
  relockAll: vi.fn(),
  // ⚠️ ყოველ გამოძახებაზე იგივე ობიექტი — სხვაგვარად ეფექტები უსასრულოდ ეშვება
  modules: {
    all: [
      { key: 'movie', name_ka: 'ფილმები', name_en: 'Movies', icon: 'Film', color: '#3b6ea5' },
      { key: 'personal', name_ka: 'პირადი გალერეა', name_en: 'Personal gallery', icon: 'Images', color: '#7a5aa5' },
    ],
    enabled: [],
    mediaModules: [],
    pageModules: [],
    customModules: [],
    has: () => true,
    loading: false,
  },
}))

vi.mock('@/api/lockBook', async (original) => ({
  ...(await original<typeof import('@/api/lockBook')>()),
  fetchLocks: mocks.fetchLocks,
  removeLocks: mocks.removeLocks,
  relockAll: mocks.relockAll,
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => mocks.modules,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

let lib: typeof import('@/pages/LocksPage')

beforeAll(async () => {
  lib = await import('@/pages/LocksPage')
}, 60_000)
vi.setConfig({ testTimeout: 15_000 })

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

async function mount(rows: LockRow[] = ROWS) {
  mocks.fetchLocks.mockResolvedValue(rows)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(MemoryRouter, null, h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, h(lib.LocksPage))))),
    ),
  )
  await flush()
  await flush()
}

const all = <T extends Element>(selector: string) => [...document.querySelectorAll<T>(selector)]
const one = <T extends Element>(selector: string) => document.querySelector<T>(selector)!
const click = async (el: Element | null | undefined) => {
  act(() => (el as HTMLElement).click())
  await flush()
  await flush()
}

describe('LocksPage', () => {
  it('groups the locks by module and says what each one is', async () => {
    await mount()

    const groups = all<HTMLElement>('[data-testid="lock-group"]')
    expect(groups.map((group) => group.dataset.module)).toEqual(['movie', 'cast', 'personal'])
    expect(groups[0].textContent).toContain('ფილმები')
    // მსახიობს მოდულის რიგი არ აქვს — ჯგუფს თავისი სახელი აქვს
    expect(groups[1].textContent).toContain(i18n.t('locks.cast'))

    const links = all<HTMLAnchorElement>('[data-testid="lock-link"]').map((a) => a.getAttribute('href'))
    expect(links).toEqual(['/movies/101', '/movies/102', '/actors/103', '/personal/people/104', '/personal/albums/105'])

    const rows = all<HTMLElement>('[data-testid="lock-row"]')
    expect(rows[0].textContent).toContain(i18n.t('locks.hintLine', { hint: 'ზღვა' }))
    expect(rows[0].textContent).toContain(i18n.t('locks.open'))
    expect(rows[1].textContent).toContain(i18n.t('locks.closed'))
    // შერეულ ჯგუფში (პიროვნება + ალბომი) ტიპი წერია, ერთგვაროვანში — არა
    expect(rows[3].textContent).toContain(i18n.t('locks.type.personal'))
    expect(rows[4].textContent).toContain(i18n.t('locks.type.personal_album'))
    expect(rows[0].textContent).not.toContain(i18n.t('locks.type.movie'))
  })

  it('selects one, a module or everything and asks for the account password before removing', async () => {
    mocks.removeLocks.mockResolvedValue(2)
    await mount()

    const remove = one<HTMLButtonElement>('[data-testid="locks-remove"]')
    const count = () => remove.querySelector('[data-testid="count-badge"]')!.textContent
    expect(remove.disabled).toBe(true)

    // მოდულის ყველა → ორი ფილმი; ერთი ცალკე → სამი; ყველა → ხუთი; ისევ მოხსნა
    await click(all('[data-testid="lock-group-pick"]')[0])
    expect(count()).toBe('2')
    await click(all('[data-testid="lock-row"]')[2].querySelector('[role="checkbox"]'))
    expect(count()).toBe('3')
    await click(one('[data-testid="locks-pick-all"]'))
    expect(count()).toBe('5')
    await click(one('[data-testid="locks-pick-all"]'))
    expect(count()).toBe('0')

    await click(all('[data-testid="lock-group-pick"]')[0])
    await click(remove)

    // პაროლის გარეშე დადასტურება გათიშულია და არაფერი იგზავნება
    const confirm = one<HTMLButtonElement>('[data-testid="locks-confirm"]')
    expect(confirm.disabled).toBe(true)
    expect(mocks.removeLocks).not.toHaveBeenCalled()

    const input = one<HTMLInputElement>('#locks-account-password')
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setValue.call(input, 'my-account-password')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flush()

    expect(one<HTMLButtonElement>('[data-testid="locks-confirm"]').disabled).toBe(false)
    await click(one('[data-testid="locks-confirm"]'))

    expect(mocks.removeLocks).toHaveBeenCalledTimes(1)
    expect(mocks.removeLocks.mock.calls[0]).toEqual([[1, 2], 'my-account-password'])
    // ფანჯარა იხურება, მონიშვნა იხსნება, სია თავიდან იკითხება
    expect(document.querySelector('[data-testid="locks-confirm"]')).toBeNull()
    expect(count()).toBe('0')
    expect(mocks.fetchLocks.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('locks everything again only when something is open', async () => {
    mocks.relockAll.mockResolvedValue(undefined)
    await mount()

    const relock = one<HTMLButtonElement>('[data-testid="locks-relock"]')
    expect(relock.disabled).toBe(false)
    await click(relock)
    expect(mocks.relockAll).toHaveBeenCalledTimes(1)
    expect(mocks.fetchLocks.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('has nothing to lock again when every record is closed, and says so when there are no locks', async () => {
    await mount([lock(2)])
    expect(one<HTMLButtonElement>('[data-testid="locks-relock"]').disabled).toBe(true)

    act(() => root?.unmount())
    container?.remove()

    await mount([])
    expect(all('[data-testid="lock-group"]')).toHaveLength(0)
    expect(document.body.textContent).toContain(i18n.t('locks.none'))
  })
})
