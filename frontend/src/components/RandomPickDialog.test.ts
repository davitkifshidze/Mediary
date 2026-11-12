import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Status } from '@/api/types'
import type { PickRecord, PickSource } from '@/lib/pick'
import i18n from '@/i18n'

/* ============================================================
   **„რა ვნახო დღეს?" — N ბარათი, სტატუსები, ფილტრი, დამატება**.

   ⚠️ მოწმდება: ნაგულისხმევი ფარგლები `todo` როლის ყველა სტატუსია, რაოდენობა
   8-ია (4-ის ჯერადი) ან `module_user.settings.pick`-იდან მოდის; ჩიპის გადართვა
   ფარგლებს ცვლის და **ჩუმად** ინახება, ბოლო ჩიპი არ იხსნება; „კიდევ N"
   ნაჩვენებს `exclude`-ით გამორიცხავს და ბარათებს **ამატებს**, ამოწურვაზე
   ითიშება; „თავიდან" ახლიდან აგორებს; სიიდან მოყოლილი ფილტრი ჩიპებად ჩანს,
   ✕-ით იხსნება, იცვლება და „ფილტრის გარეშე" ყველას ხსნის; „დავიწყოთ" `doing`
   როლის სტატუსს წერს, ღილაკი „დაწყებულია ✓" ხდება და ხელახალი დაჭერა ძველ
   სტატუსს აბრუნებს; გაგორებისას ბარათების ადგილას იმდენივე ჩონჩხია.
   ============================================================ */

const statuses: Status[] = [
  { id: 1, key: 'to_watch', module: 'movie', name_ka: 'სანახავი', name_en: 'To watch', role: 'todo', icon: 'Clock', color: null, is_default: true, sort_order: 0 },
  { id: 2, key: 'wishlist', module: 'movie', name_ka: 'სურვილები', name_en: 'Wishlist', role: 'todo', icon: null, color: null, is_default: false, sort_order: 1 },
  { id: 3, key: 'watching', module: 'movie', name_ka: 'ვუყურებ', name_en: 'Watching', role: 'doing', icon: null, color: null, is_default: false, sort_order: 2 },
  { id: 4, key: 'watched', module: 'movie', name_ka: 'ნანახი', name_en: 'Watched', role: 'done', icon: null, color: null, is_default: false, sort_order: 3 },
]

const record = (id: number, title: string, statusKey = 'to_watch'): PickRecord => ({
  id,
  title,
  poster: null,
  shape: 'poster',
  year: 2001,
  rating: '7.4',
  meta: ['დრამა'],
  description: null,
  statusKey,
})

const films = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => record(from + i, `Film ${from + i}`))

/** ტესტის ფილტრი — ჟანრების სია */
interface TestFilter {
  genres: string[]
}

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

async function mount(
  overrides: Partial<PickSource<TestFilter>> = {},
  userSettings: Record<string, unknown> = {},
  initial: TestFilter = { genres: [] },
) {
  mocks.statuses.data = statuses
  mocks.modules.all = [{ key: 'movie', user_settings: userSettings }]
  mocks.save.mockResolvedValue(undefined)

  const source: PickSource<TestFilter> = {
    domain: 'movie',
    currentStatus: null,
    shape: 'poster',
    filter: {
      initial,
      empty: { genres: [] },
      chips: (filter) =>
        filter.genres.map((g) => ({ key: g, label: g, without: { genres: filter.genres.filter((x) => x !== g) } })),
      fields: (filter, change) =>
        h(
          'button',
          { type: 'button', 'data-testid': 'add-horror', onClick: () => change((f) => ({ genres: [...f.genres, 'horror'] })) },
          `fields:${filter.genres.join(',')}`,
        ),
    },
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
    root!.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(TooltipProvider, null, h(RandomPickDialog<TestFilter>, { source, onClose: () => {} })),
      ),
    ),
  )
  await flush()
  await flush()

  return source
}

const calls = (source: PickSource<TestFilter>) => (source.fetch as ReturnType<typeof vi.fn>).mock.calls

const chip = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((b) => b.textContent?.trim() === label)

const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)

const todo = ['to_watch', 'wishlist']

describe('RandomPickDialog', () => {
  it('asks for eight from every todo status, appends on "more" and stops when nothing is left', async () => {
    const source = await mount({ fetch: vi.fn(async () => films(1, 8)) })

    // არაფერი შენახულა → 8 (ორი სავსე რიგი)
    expect(source.fetch).toHaveBeenCalledWith({ count: 8, status: todo, exclude: [] }, { genres: [] })
    expect(document.body.textContent).toContain('Film 1')
    expect(document.body.textContent).toContain('2001 · ★ 7.4')

    // ფარგლების ჩიპები: ორი `todo` ჩართული, დანარჩენი — არა
    expect(chip('სანახავი')?.getAttribute('aria-pressed')).toBe('true')
    expect(chip('ვუყურებ')?.getAttribute('aria-pressed')).toBe('false')

    // „კიდევ 8" ქვემოთ ამატებს — ძველი ბარათები ადგილზეა
    ;(source.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(films(9, 3))
    await act(async () => button(i18n.t('pick.moreN', { count: 8 }))!.click())
    await flush()

    expect(source.fetch).toHaveBeenLastCalledWith(
      { count: 8, status: todo, exclude: [1, 2, 3, 4, 5, 6, 7, 8] },
      { genres: [] },
    )
    expect(document.body.textContent).toContain('Film 1')
    expect(document.body.textContent).toContain('Film 11')

    // სამი მოვიდა რვის ნაცვლად — ამოიწურა: ღილაკი ითიშება და ქვედა ზოლი ამას ამბობს
    expect(button(i18n.t('pick.moreN', { count: 8 }))!.disabled).toBe(true)
    expect(document.querySelector('[data-testid="pick-exhausted"]')?.textContent).toBe(i18n.t('pick.exhaustedTitle'))

    // „თავიდან" — ახალი გაგორება, გამორიცხვის გარეშე
    await act(async () => button(i18n.t('pick.restart'))!.click())
    await flush()
    await flush()
    expect(source.fetch).toHaveBeenLastCalledWith({ count: 8, status: todo, exclude: [] }, { genres: [] })
    expect(document.body.textContent).not.toContain('Film 11')
  })

  it('reads the saved count, toggles statuses, saves silently and keeps at least one status', async () => {
    const source = await mount({ fetch: vi.fn(async () => films(1, 4)) }, { pick: { count: 4, statuses: ['wishlist'] } })

    expect(source.fetch).toHaveBeenCalledWith({ count: 4, status: ['wishlist'], exclude: [] }, { genres: [] })
    expect(document.body.textContent).toContain(i18n.t('pick.moreN', { count: 4 }))

    await act(async () => chip('ვუყურებ')!.click())
    await flush()
    expect(source.fetch).toHaveBeenLastCalledWith({ count: 4, status: ['wishlist', 'watching'], exclude: [] }, { genres: [] })
    expect(mocks.save).toHaveBeenCalledWith('movie', { pick: { count: 4, statuses: ['wishlist', 'watching'] } })

    // ბოლო ჩიპი არ იხსნება
    await act(async () => chip('ვუყურებ')!.click())
    await flush()
    const before = calls(source).length
    await act(async () => chip('სურვილები')!.click())
    await flush()
    expect(chip('სურვილები')?.getAttribute('aria-pressed')).toBe('true')
    expect(calls(source).length).toBe(before)
  })

  it('shows the list filter as chips, drops one, edits it and clears it — without touching the list', async () => {
    const initial = { genres: ['comedy', 'drama'] }
    const source = await mount({}, {}, initial)

    expect(source.fetch).toHaveBeenCalledWith({ count: 8, status: todo, exclude: [] }, { genres: ['comedy', 'drama'] })
    const filterRow = document.querySelector('[data-testid="pick-filter"]')!
    expect(filterRow.querySelector('[data-filter="comedy"]')).not.toBeNull()
    expect(filterRow.querySelector('[data-filter="drama"]')).not.toBeNull()

    // ✕ — ერთი პირობა იხსნება
    await act(async () => filterRow.querySelector<HTMLButtonElement>('[data-filter="comedy"]')!.click())
    await flush()
    expect(source.fetch).toHaveBeenLastCalledWith({ count: 8, status: todo, exclude: [] }, { genres: ['drama'] })

    // „ფილტრის შეცვლა" — მონახაზი მხოლოდ „გაფილტვრაზე" მოქმედებს
    await act(async () => button(i18n.t('pick.editFilter'))!.click())
    const editor = document.querySelector('[data-testid="pick-filter-editor"]')!
    expect(editor.textContent).toContain('fields:drama')
    const before = calls(source).length
    await act(async () => editor.querySelector<HTMLButtonElement>('[data-testid="add-horror"]')!.click())
    expect(calls(source).length).toBe(before)

    await act(async () => button(i18n.t('filter.apply'))!.click())
    await flush()
    expect(source.fetch).toHaveBeenLastCalledWith({ count: 8, status: todo, exclude: [] }, { genres: ['drama', 'horror'] })
    expect(document.querySelector('[data-testid="pick-filter-editor"]')).toBeNull()

    // „ფილტრის გარეშე"
    await act(async () => button(i18n.t('pick.withoutFilter'))!.click())
    await flush()
    expect(source.fetch).toHaveBeenLastCalledWith({ count: 8, status: todo, exclude: [] }, { genres: [] })
    expect(document.querySelector('[data-testid="pick-filter"]')!.textContent).toContain(i18n.t('pick.filterNone'))
    expect(button(i18n.t('pick.withoutFilter'))).toBeUndefined()

    // სიის ფილტრი ხელუხლებელია
    expect(initial).toEqual({ genres: ['comedy', 'drama'] })
  })

  it('"start it" stays in place as "started" and a second press brings the old status back', async () => {
    const source = await mount()
    const start = () => document.querySelector<HTMLButtonElement>('[data-start]')!

    expect(start().dataset.start).toBe('idle')
    expect(start().textContent).toBe(i18n.t('pick.start'))

    await act(async () => start().click())
    await flush()

    expect(source.setStatus).toHaveBeenCalledWith(1, 'watching')
    expect(mocks.toast).toHaveBeenCalled()
    // ბარათი ადგილზეა, ახალი სტატუსით; ღილაკი არ გაქრა და არ გაითიშა
    expect(document.body.textContent).toContain('Amélie')
    expect(document.querySelector('[data-testid="pick-status"]')?.textContent).toBe('ვუყურებ')
    expect(start().dataset.start).toBe('started')
    expect(start().textContent).toBe(i18n.t('pick.startedLabel'))
    expect(start().getAttribute('aria-pressed')).toBe('true')
    expect(start().disabled).toBe(false)

    // ხელახალი დაჭერა — ძველი სტატუსი
    await act(async () => start().click())
    await flush()
    expect(source.setStatus).toHaveBeenLastCalledWith(1, 'to_watch')
    expect(start().dataset.start).toBe('idle')
    expect(document.querySelector('[data-testid="pick-status"]')?.textContent).toBe('სანახავი')

    await act(async () => button(i18n.t('actions.open'))!.click())
    expect(source.open).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it('keeps the status on its own line above two equal buttons, four cards to a row', async () => {
    await mount({ fetch: vi.fn(async () => [record(1, 'Amélie'), record(2, 'Heat', 'watching')]) }, { pick: { count: 4, statuses: ['to_watch', 'watching'] } })

    const card = document.querySelector('article')!
    expect(card.parentElement!.className).toContain('grid-cols-2')
    expect(card.parentElement!.className).toContain('md:grid-cols-3')
    expect(card.parentElement!.className).toContain('xl:grid-cols-4')

    const actions = card.querySelector('[data-testid="pick-actions"]')!
    expect(actions.className).toContain('grid-cols-2')
    expect(actions.querySelectorAll('button').length).toBe(2)
    // სტატუსი ღილაკების რიგში არ ზის
    expect(actions.querySelector('[data-testid="pick-status"]')).toBeNull()
    expect(card.querySelector('[data-testid="pick-status"]')).not.toBeNull()

    // უკვე დაწყებულს დასაბრუნებელი არაფერი აქვს
    const already = document.querySelectorAll<HTMLButtonElement>('[data-start]')[1]
    expect(already.dataset.start).toBe('already')
    expect(already.disabled).toBe(true)
  })

  it('reads a saved 12 and a typed-in count up to 20', async () => {
    const twelve = await mount({}, { pick: { count: 12 } })
    expect(twelve.fetch).toHaveBeenCalledWith({ count: 12, status: todo, exclude: [] }, { genres: [] })
    expect(document.body.textContent).toContain(i18n.t('pick.moreN', { count: 12 }))
    act(() => root?.unmount())
    container?.remove()

    // სიაში არ არის (4 · 8 · 12 · 16) — „სხვა"-ს ველში ჩანს; 20-ზე მეტი იჭრება
    const typed = await mount({}, { pick: { count: 15 } })
    expect(typed.fetch).toHaveBeenCalledWith({ count: 15, status: todo, exclude: [] }, { genres: [] })
    expect(document.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe('15')
    act(() => root?.unmount())
    container?.remove()

    const capped = await mount({}, { pick: { count: 99 } })
    expect(capped.fetch).toHaveBeenCalledWith({ count: 20, status: todo, exclude: [] }, { genres: [] })
  })

  it('shows as many skeletons as cards while it rolls, and keeps the cards while more are coming', async () => {
    let release: (list: PickRecord[]) => void = () => {}
    const pending = () => new Promise<PickRecord[]>((resolve) => (release = resolve))
    const fetch = vi.fn(pending)
    await mount({ fetch }, { pick: { count: 4 } })

    // პირველი პასუხის მოლოდინში — ოთხი ჩონჩხი, სპინერის გარეშე
    expect(document.querySelectorAll('[data-testid="pick-skeleton"]').length).toBe(4)
    expect(document.querySelector('.animate-spin')).toBeNull()

    await act(async () => release(films(1, 4)))
    await flush()
    expect(document.querySelectorAll('[data-testid="pick-skeleton"]').length).toBe(0)
    expect(document.body.textContent).toContain('Film 3')

    // „კიდევ 4" — ბარათები რჩება, ქვემოთ ოთხი ჩონჩხი იმავე ბადეში
    await act(async () => button(i18n.t('pick.moreN', { count: 4 }))!.click())
    const skeletons = document.querySelectorAll('[data-testid="pick-skeleton"]')
    expect(skeletons.length).toBe(4)
    expect(document.body.textContent).toContain('Film 3')
    expect(skeletons[0].parentElement).toBe(document.querySelector('article')!.parentElement)

    await act(async () => release(films(5, 4)))
    await flush()
    expect(document.querySelectorAll('[data-testid="pick-skeleton"]').length).toBe(0)
    expect(document.body.textContent).toContain('Film 3')
    expect(document.body.textContent).toContain('Film 8')
  })
})
