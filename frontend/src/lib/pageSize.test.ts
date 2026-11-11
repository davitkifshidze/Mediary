import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'

/* ============================================================
   **გვერდზე რამდენი — სვეტების ჯერადი.**

   ⚠️ მოწმდება: ვარიანტები სვეტები × {3,4,5,6,8,12,20} რიგია (3 · 4 · 6 სვეტი),
   სტრიქონებს თავისი სერია აქვთ; ნაგულისხმევი — ბარათები 9, ბადე 24, ფოტოები 16,
   სტრიქონები 10; „ყველა" (0) და „სხვა" სერვერის ჭერზე ჩერდება; პოსტერების
   სვეტები ბარათის ზომიდანაა; არჩევანი მოდულზე ინახება **მთელი ობიექტით**
   (სერვერი ზედაპირულად ერწყმის); ამრჩევი პატარა სიაზე იმალება.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  updateModuleSettings: vi.fn(),
  modules: [] as { key: string; user_settings?: Record<string, unknown> }[],
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  updateModuleSettings: mocks.updateModuleSettings,
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => ({ all: mocks.modules, enabled: mocks.modules, mediaModules: [], pageModules: [], customModules: [], has: () => true, loading: false }),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  mocks.modules = []
  vi.clearAllMocks()
})

async function render(node: ReactNode) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient()
  await act(async () => root!.render(h(QueryClientProvider, { client: qc }, node)))
  return container
}

describe('page size formula', () => {
  it('offers columns × rows, and its own series for rows', async () => {
    const { pageSizeOptions } = await import('@/lib/pageSize')

    expect(pageSizeOptions(3)).toEqual([9, 12, 15, 18, 24, 36, 60])
    expect(pageSizeOptions(4)).toEqual([12, 16, 20, 24, 32, 48, 80])
    expect(pageSizeOptions(6)).toEqual([18, 24, 30, 36, 48, 72, 120])
    expect(pageSizeOptions(1)).toEqual([10, 20, 30, 50, 100])
  })

  it('defaults to 3 rows of cards, 4 rows of tiles and photos, 10 rows', async () => {
    const { defaultPageSize, layoutColumns, PHOTO_COLUMNS } = await import('@/lib/pageSize')

    expect(defaultPageSize(layoutColumns('cards'), 'cards')).toBe(9)
    expect(defaultPageSize(layoutColumns('grid'), 'grid')).toBe(24)
    expect(defaultPageSize(layoutColumns('rows'), 'rows')).toBe(10)
    expect(defaultPageSize(PHOTO_COLUMNS, 'photos')).toBe(16)
  })

  it('takes poster columns from the card size, the grid view from the compact one', async () => {
    const { layoutColumns } = await import('@/lib/pageSize')

    expect(layoutColumns('cards', 'medium')).toBe(6)
    expect(layoutColumns('cards', 'large')).toBe(4)
    expect(layoutColumns('grid', 'large')).toBe(10)
    expect(layoutColumns('rows', 'large')).toBe(1)
  })

  it('"all" asks for the server cap, and a typed size never goes past it', async () => {
    const { perPage, PAGE_ALL, PHOTO_PER_PAGE_MAX } = await import('@/lib/pageSize')

    expect(perPage(PAGE_ALL)).toBe(500)
    expect(perPage(PAGE_ALL, PHOTO_PER_PAGE_MAX)).toBe(1000)
    expect(perPage(800)).toBe(500)
    expect(perPage(24)).toBe(24)
  })

  it('a broken saved value falls back to the default', async () => {
    const { readPageSize } = await import('@/lib/pageSize')

    expect(readPageSize({ page_size: { cards: 12 } }, 'cards', 9)).toBe(12)
    expect(readPageSize({ page_size: { cards: 'x' } }, 'cards', 9)).toBe(9)
    expect(readPageSize({ page_size: { cards: 9999 } }, 'cards', 9)).toBe(9)
    expect(readPageSize({ page_size: [1] }, 'cards', 9)).toBe(9)
    expect(readPageSize(undefined, 'grid', 24)).toBe(24)
  })
})

describe('usePageSize', () => {
  it('saves the whole page_size object on the module, keeping the other views', async () => {
    mocks.modules = [{ key: 'book', user_settings: { view: 'cards', page_size: { grid: 48 } } }]
    mocks.updateModuleSettings.mockResolvedValue(undefined)
    const { usePageSize } = await import('@/lib/pageSize')
    let change: (next: number) => void = () => {}

    function Harness() {
      const [size, set, columns] = usePageSize('book', 'cards')
      change = set
      return h('p', { 'data-testid': 'size' }, `${size}/${columns}`)
    }

    const el = await render(h(Harness))
    expect(el.textContent).toBe('9/3')

    await act(async () => change(15))
    expect(el.textContent).toBe('15/3')
    expect(mocks.updateModuleSettings).toHaveBeenCalledWith('book', { page_size: { grid: 48, cards: 15 } })
  })
})

describe('PageSizePick', () => {
  it('shows the choices with "all" last', async () => {
    const { PageSizePick } = await import('@/components/ui/page-size-pick')

    const big = await render(h(PageSizePick, { value: 9, onChange: vi.fn(), columns: 3 }))
    const pick = big.querySelector('[data-testid="page-size-pick"]')!
    expect(pick.textContent).toContain(i18n.t('list.perPage'))
    // ტრიგერის უხილავი ასლები (`SelectFitValue`) — ყველა ვარიანტი, ბოლოს „ყველა" და „სხვა"
    const labels = [...pick.querySelectorAll('span[aria-hidden="true"]')].map((s) => s.textContent?.trim())
    expect(labels).toEqual(['9', '12', '15', '18', '24', '36', '60', i18n.t('list.all'), i18n.t('numberPick.other')])
  })

  /* ⚠️ ადრე პატარა სიაზე იმალებოდა — ერთ გვერდზე ჩანდა, მეორეზე არა (ვიდეოებში „არ ჩანდა").
     ახლა ამრჩევს სიის ზომა საერთოდ არ გადაეცემა: ვერაფრით დაიმალება. */
  it('always shows, whatever the size of the list', async () => {
    const { PageSizePick } = await import('@/components/ui/page-size-pick')

    for (const value of [9, 3, 0]) {
      const el = await render(h(PageSizePick, { value, onChange: vi.fn(), columns: 3 }))
      expect(el.querySelector('[data-testid="page-size-pick"]'), String(value)).not.toBeNull()
      act(() => root?.unmount())
      container?.remove()
    }
  })
})

/* ============================================================
   **ამრჩევი ყველა სიის გვერდზე დგას** — მსახიობების ჩათვლით (იქ საერთოდ არ იყო).
   ============================================================ */

const LIST_PAGES = import.meta.glob<string>('../pages/*Page.tsx', { query: '?raw', import: 'default', eager: true })

describe('every list page offers the page size', () => {
  it.each([
    'LibraryPage',
    'VideosPage',
    'SongsPage',
    'BooksPage',
    'GamesPage',
    'BoardGamesPage',
    'CoursesPage',
    'PlacesPage',
    'BookmarksPage',
    'NotesPage',
    'CustomModulePage',
    'ActorsPage',
  ])('%s draws the picker, without tying it to the size of the list', (page) => {
    const source = LIST_PAGES[`../pages/${page}.tsx`]

    expect(source).toBeDefined()
    expect(source).toMatch(/<PageSizePick\b[^>]*\/>/)
    // სიის ზომა ამრჩევს აღარ გადაეცემა — მის მიხედვით ვეღარ დაიმალება
    expect(source.match(/<PageSizePick\b[^>]*\/>/)![0]).not.toContain('total=')
  })
})
