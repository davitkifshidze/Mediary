import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Status } from '@/api/types'
import type { PickRecord, PickSource } from '@/lib/pick'
import i18n from '@/i18n'

/* ============================================================
   **„რა ვნახო დღეს" — N ბარათი, სტატუსები, გამორიცხვა** (Tasks §17.4–17.6).

   ⚠️ მოწმდება: ნაგულისხმევი ფარგლები `todo` როლის ყველა სტატუსია; რაოდენობა
   `module_user.settings.pick`-იდან მოდის; ჩიპის გადართვა ფარგლებს ცვლის და
   **ჩუმად** ინახება (`saveModuleSettings`), ბოლო ჩიპი არ იხსნება; „სხვა N"
   ნაჩვენებს `exclude`-ით გამორიცხავს, ამოწურვაზე „თავიდან" ჩანს; „დავიწყოთ"
   `doing` როლის სტატუსს წერს და ბარათი ადგილზე რჩება.
   ============================================================ */

const statuses: Status[] = [
  { id: 1, key: 'to_watch', module: 'movie', name_ka: 'სანახავი', name_en: 'To watch', role: 'todo', icon: 'Clock', color: null, is_default: true, sort_order: 0 },
  { id: 2, key: 'wishlist', module: 'movie', name_ka: 'სურვილები', name_en: 'Wishlist', role: 'todo', icon: null, color: null, is_default: false, sort_order: 1 },
  { id: 3, key: 'watching', module: 'movie', name_ka: 'ვუყურებ', name_en: 'Watching', role: 'doing', icon: null, color: null, is_default: false, sort_order: 2 },
  { id: 4, key: 'watched', module: 'movie', name_ka: 'ნანახი', name_en: 'Watched', role: 'done', icon: null, color: null, is_default: false, sort_order: 3 },
]

const record = (id: number, title: string): PickRecord => ({
  id,
  title,
  poster: null,
  shape: 'poster',
  year: 2001,
  rating: '7.4',
  meta: ['დრამა'],
  description: null,
  statusKey: 'to_watch',
})

const mocks = vi.hoisted(() => ({
  statuses: { data: [] as unknown[], isSuccess: true },
  modules: { all: [] as unknown[] },
  save: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/lib/statuses', async (original) => ({
  ...(await original<typeof import('@/lib/statuses')>()),
  useStatuses: () => mocks.statuses,
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => mocks.modules,
}))

vi.mock('@/api/videos', async (original) => ({
  ...(await original<typeof import('@/api/videos')>()),
  saveModuleSettings: mocks.save,
}))

vi.mock('@/components/ui/feedback', async (original) => ({
  ...(await original<typeof import('@/components/ui/feedback')>()),
  useToast: () => ({ toast: mocks.toast, dismiss: () => {} }),
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

async function mount(overrides: Partial<PickSource> = {}, userSettings: Record<string, unknown> = {}) {
  mocks.statuses.data = statuses
  mocks.modules.all = [{ key: 'movie', user_settings: userSettings }]
  mocks.save.mockResolvedValue(undefined)

  const source: PickSource = {
    domain: 'movie',
    currentStatus: null,
    filterKey: '{}',
    fetch: vi.fn(async () => [record(1, 'Amélie')]),
    setStatus: vi.fn(async () => ({})),
    open: vi.fn(),
    invalidate: [['movie']],
    ...overrides,
  }

  const { RandomPickDialog } = await import('@/components/RandomPickDialog')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(RandomPickDialog, { source, onClose: () => {} })))),
  )
  await flush()
  await flush()

  return source
}

const chip = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((b) => b.textContent?.trim() === label)

const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)

describe('RandomPickDialog', () => {
  it('asks for one record from every todo status by default and excludes what it has shown on "another"', async () => {
    const source = await mount()

    expect(source.fetch).toHaveBeenCalledWith({ count: 1, status: ['to_watch', 'wishlist'], exclude: [] })
    expect(document.body.textContent).toContain('Amélie')
    expect(document.body.textContent).toContain('2001 · ★ 7.4')

    // ფარგლების ჩიპები: ორი `todo` ჩართული, დანარჩენი — არა
    expect(chip('სანახავი')?.getAttribute('aria-pressed')).toBe('true')
    expect(chip('ვუყურებ')?.getAttribute('aria-pressed')).toBe('false')

    ;(source.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])
    await act(async () => button(i18n.t('pick.againN', { count: 1 }))!.click())
    await flush()
    await flush()

    expect(source.fetch).toHaveBeenLastCalledWith({ count: 1, status: ['to_watch', 'wishlist'], exclude: [1] })
    // ამოიწურა — ცარიელი ფილტრისგან განსხვავებული მდგომარეობა, „თავიდან"-ით
    expect(document.body.textContent).toContain(i18n.t('pick.exhaustedTitle'))

    await act(async () => button(i18n.t('pick.restart'))!.click())
    await flush()
    expect(source.fetch).toHaveBeenLastCalledWith({ count: 1, status: ['to_watch', 'wishlist'], exclude: [] })
  })

  it('reads the saved count, toggles statuses, saves silently and keeps at least one status', async () => {
    const source = await mount({ fetch: vi.fn(async () => [record(1, 'A'), record(2, 'B'), record(3, 'C')]) }, { pick: { count: 3, statuses: ['wishlist'] } })

    expect(source.fetch).toHaveBeenCalledWith({ count: 3, status: ['wishlist'], exclude: [] })
    expect(document.body.textContent).toContain(i18n.t('pick.againN', { count: 3 }))

    await act(async () => chip('ვუყურებ')!.click())
    await flush()
    expect(source.fetch).toHaveBeenLastCalledWith({ count: 3, status: ['wishlist', 'watching'], exclude: [] })
    expect(mocks.save).toHaveBeenCalledWith('movie', { pick: { count: 3, statuses: ['wishlist', 'watching'] } })

    // ბოლო ჩიპი არ იხსნება
    await act(async () => chip('ვუყურებ')!.click())
    await flush()
    const calls = (source.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    await act(async () => chip('სურვილები')!.click())
    await flush()
    expect(chip('სურვილები')?.getAttribute('aria-pressed')).toBe('true')
    expect((source.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls)
  })

  it('"start it" writes the doing status and the card stays with the new status', async () => {
    const source = await mount()

    await act(async () => button(i18n.t('pick.start'))!.click())
    await flush()

    expect(source.setStatus).toHaveBeenCalledWith(1, 'watching')
    expect(mocks.toast).toHaveBeenCalled()
    expect(document.body.textContent).toContain('Amélie')
    expect(document.body.textContent).toContain('ვუყურებ')
    expect(button(i18n.t('pick.start'))).toBeUndefined()

    await act(async () => button(i18n.t('actions.open'))!.click())
    expect(source.open).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })
})
