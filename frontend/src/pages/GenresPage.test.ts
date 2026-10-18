import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Genre } from '@/api/types'
import i18n from '@/i18n'

/* ============================================================
   **ჟანრის რედაქტირების ფანჯარა**.

   ⚠️ მოწმდება: ჩანართები ბარათებია (`CutTabs`, `aria-pressed`); დომენი
   მოდულის ბარათით ირჩევა (ანიმეც); „ჩანაწერებში" ჩადგმული სქროლი აღარ არის,
   სამი მოქმედება სამი თანაბარი ბარათია `i`-თი, შესრულება — ერთი
   „გამოყენება (N)" ქვედა ზოლიდან, რომელიც ამბობს, რა აკლია; სახელების
   „შენახვა" მხოლოდ სახელების ჩანართზეა.
   ============================================================ */

const genre: Genre = {
  id: 5,
  slug: 'drama',
  name_ka: 'დრამა',
  name_en: 'Drama',
  movies_count: 2,
  series_count: 0,
  animes_count: 1,
} as Genre

const item = (id: number, title: string) => ({ id, title_ka: title, title_en: title, year: 2000 + id, genres: [] })

const modules = [
  { key: 'movie', type: 'movie', name_ka: 'ფილმები', name_en: 'Movies', icon: 'Film', color: '#e11d48' },
  { key: 'series', type: 'series', name_ka: 'სერიალები', name_en: 'Series', icon: 'Tv', color: '#2563eb' },
  { key: 'anime', type: 'anime', name_ka: 'ანიმე', name_en: 'Anime', icon: 'Sparkles', color: '#9333ea' },
]

const mocks = vi.hoisted(() => ({
  fetchGenres: vi.fn(),
  fetchGenreItems: vi.fn(),
  updateGenreItems: vi.fn(),
  confirm: vi.fn(),
  toast: vi.fn(),
  modules: { all: [] as unknown[], enabled: [] as unknown[], mediaModules: [] as unknown[], pageModules: [], customModules: [], has: () => true, loading: false },
}))

vi.mock('@/api/movies', async (original) => ({
  ...(await original<typeof import('@/api/movies')>()),
  fetchGenres: mocks.fetchGenres,
  updateGenreItems: mocks.updateGenreItems,
}))

vi.mock('@/api/media', async (original) => ({
  ...(await original<typeof import('@/api/media')>()),
  fetchGenreItems: mocks.fetchGenreItems,
  updateGenreItems: mocks.updateGenreItems,
  mediaApi: () => ({ list: async () => ({ items: [] }) }),
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => mocks.modules,
}))

vi.mock('@/components/ui/feedback', async (original) => ({
  ...(await original<typeof import('@/components/ui/feedback')>()),
  useToast: () => ({ toast: mocks.toast, dismiss: () => {} }),
  useConfirm: () => mocks.confirm,
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

async function openEditor() {
  mocks.modules.mediaModules = modules
  mocks.modules.all = modules
  mocks.modules.enabled = modules
  mocks.fetchGenres.mockResolvedValue([genre, { ...genre, id: 6, slug: 'comedy', name_ka: 'კომედია', name_en: 'Comedy' }])
  mocks.fetchGenreItems.mockResolvedValue({
    movies: [item(1, 'Alpha'), item(2, 'Beta')],
    series: [],
    animes: [item(3, 'Gamma')],
    movies_count: 2,
    series_count: 0,
    animes_count: 1,
  })
  mocks.updateGenreItems.mockResolvedValue({ affected: 1 })
  mocks.confirm.mockResolvedValue(true)

  const { GenresPage } = await import('@/pages/GenresPage')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(h(MemoryRouter, null, h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(GenresPage))))),
  )
  await flush()

  const edit = document.querySelector<HTMLButtonElement>(`button[aria-label="${i18n.t('genres.edit')}"]`)!
  await act(async () => edit.click())
  await flush()
}

/** ბარათ-ჩანართი/ბარათი წარწერით */
const card = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((b) => b.textContent?.includes(label))

const buttonWith = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(label))

describe('GenresPage — the edit window', () => {
  it('uses card tabs, keeps "save" on the names tab only and drops the nested scroll', async () => {
    await openEditor()

    // სამი ბარათ-ჩანართი; სახელები აქტიურია და „შენახვა" ჩანს
    expect(card(i18n.t('genres.tabNames'))?.getAttribute('aria-pressed')).toBe('true')
    expect(card(i18n.t('genres.tabItems'))?.getAttribute('aria-pressed')).toBe('false')
    expect(card(i18n.t('genres.tabAdd'))).toBeTruthy()
    expect(buttonWith(i18n.t('genres.save'))).toBeTruthy()

    await act(async () => card(i18n.t('genres.tabItems'))!.click())
    await flush()

    expect(buttonWith(i18n.t('genres.save'))).toBeUndefined()
    // ჩადგმული `max-h-64` აღარ არის
    expect(document.querySelector('.max-h-64')).toBeNull()
    expect(document.querySelector('[data-testid="genre-records"]')?.textContent).toContain('Alpha')

    // დომენის ბარათები მოდულებიდან — ანიმეც, რიცხვით
    expect(card('ანიმე')?.textContent).toContain('1')
    await act(async () => card('ანიმე')!.click())
    await flush()
    expect(document.querySelector('[data-testid="genre-records"]')?.textContent).toContain('Gamma')
  })

  it('three equal action cards with an i, and one "apply (N)" that says what is missing', async () => {
    await openEditor()
    await act(async () => card(i18n.t('genres.tabItems'))!.click())
    await flush()

    const actions = document.querySelector<HTMLElement>('[data-testid="genre-actions"]')!
    expect(actions.className).toContain('sm:grid-cols-3')
    expect(actions.querySelectorAll('button[aria-pressed]')).toHaveLength(3)
    // ახსნა `i`-შია (სამივე ბარათზე), არა პროზად
    expect(actions.querySelectorAll(`button[aria-label="${i18n.t('common.info')}"]`)).toHaveLength(3)
    expect(actions.textContent).not.toContain(i18n.t('genres.actHintMove'))

    const state = () => document.querySelector('[data-testid="genre-apply-state"]')?.textContent ?? ''
    const apply = () => buttonWith(i18n.t('genres.actApply', { count: 0 }).replace('(0)', ''))!

    // ჯერ არაფერია მონიშნული
    expect(state()).toContain(i18n.t('genres.actNeedSelection'))
    expect(apply().disabled).toBe(true)

    const alpha = [...document.querySelectorAll('[data-testid="genre-records"] label')].find((l) => l.textContent?.includes('Alpha'))!
    await act(async () => alpha.querySelector<HTMLButtonElement>('button[role="checkbox"]')!.click())
    expect(state()).toContain(i18n.t('genres.actNeedAction'))

    // გადატანას სამიზნე სჭირდება
    await act(async () => card(i18n.t('genres.actMove'))!.click())
    expect(state()).toContain(i18n.t('genres.actNeedTarget'))
    expect(apply().disabled).toBe(true)

    // ჩახსნა — დადასტურებით, ერთი მოთხოვნა
    await act(async () => card(i18n.t('genres.actDetach'))!.click())
    expect(apply().disabled).toBe(false)
    expect(apply().textContent).toContain(i18n.t('genres.actApply', { count: 1 }))
    await act(async () => apply().click())
    await flush()

    expect(mocks.confirm).toHaveBeenCalledTimes(1)
    expect(mocks.updateGenreItems).toHaveBeenCalledWith(5, { type: 'movie', action: 'detach', ids: [1] })
  })
})
