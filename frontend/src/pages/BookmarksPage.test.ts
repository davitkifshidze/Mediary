import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import { PlayerProvider } from '@/lib/player'
import type { Bookmark } from '@/api/bookmarks'
import type { Status } from '@/api/types'
import i18n from '@/i18n'

/* ============================================================
   **ბუკმარკის რიგი — სტატუსი ნიშნიდან და მარჯვენა კლიკიდან** (Tasks §24).

   ⚠️ სელექთი ქრება და სტატუსი ნიშნით იცვლება; იგივე ცვლილება კონტექსტური
   მენიუდანაც. ორივე გზამ **ერთი და იგივე** `setBookmarkStatus(id, key)`
   უნდა დაუძახოს — ეს მხოლოდ მონტირებით ჩანს.

   Tasks §28 — რიგზე ერთი სიგანის სტატუს-ჩამოსაშლელი (§16.4) და ტექსტიანი
   რჩეული (§8); ფორმა ორ სვეტად — სქროლის გარეშე.

   Tasks §36 — სათაურსა და ფოტოზე დაჭერა **ფანჯარას** ხსნის და არა ბმულს;
   გარე ბმული §29-ის ზოლის „ბმულით" იხსნება და „გახსნის" მთვლელს ზრდის;
   `?open=<id>` ფილტრს მიღმა მდგომ ბუკმარკსაც ხსნის; ფორმას ბმულების სია აქვს.
   ============================================================ */

const statuses: Status[] = [
  { id: 1, key: 'open', module: 'bookmark', name_ka: 'მიმდინარე', name_en: 'Open', role: 'doing', icon: null, color: null, is_default: true, sort_order: 0 },
  { id: 2, key: 'done', module: 'bookmark', name_ka: 'დასრულებული', name_en: 'Done', role: 'done', icon: null, color: null, is_default: false, sort_order: 1 },
] as Status[]

const bookmark: Bookmark = {
  id: 7,
  title: 'Laravel docs',
  url: 'https://laravel.com/docs',
  domain: 'laravel.com',
  description: null,
  category_id: null,
  category: null,
  tags: [],
  links: [],
  image: null,
  favicon_url: null,
  files_count: 1,
  photos_count: 2,
  status: statuses[0],
  is_favorite: false,
  visit_count: 0,
  visited_at: null,
  visibility: 'private',
  created_at: null,
}

const mocks = vi.hoisted(() => ({
  setBookmarkStatus: vi.fn(),
  fetchBookmarks: vi.fn(),
  fetchBookmark: vi.fn(),
  fetchBookmarkCategories: vi.fn(),
  fetchBookmarkFiles: vi.fn(),
  markBookmarkVisited: vi.fn(),
  createBookmark: vi.fn(),
  statuses: { data: [] as unknown[] },
}))

vi.mock('@/api/bookmarks', async (original) => ({
  ...(await original<typeof import('@/api/bookmarks')>()),
  setBookmarkStatus: mocks.setBookmarkStatus,
  fetchBookmarks: mocks.fetchBookmarks,
  fetchBookmark: mocks.fetchBookmark,
  fetchBookmarkCategories: mocks.fetchBookmarkCategories,
  fetchBookmarkFiles: mocks.fetchBookmarkFiles,
  markBookmarkVisited: mocks.markBookmarkVisited,
  createBookmark: mocks.createBookmark,
}))

/* §28.1 — ფორმა იხსნება: ველების კატალოგი და დამატებითი ველები ცარიელი მოდის */
vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  fetchModuleFields: vi.fn().mockResolvedValue([]),
  fetchCustomFields: vi.fn().mockResolvedValue([]),
  fetchCustomFieldValues: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/lib/statuses', async (original) => ({
  ...(await original<typeof import('@/lib/statuses')>()),
  useStatuses: () => mocks.statuses,
}))

/* §36.4 — ფანჯრის გალერეა: მოდული გამორთულია, ე.ი. ქსელში არაფერი მიდის */
vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => ({
    all: [],
    enabled: [],
    mediaModules: [],
    pageModules: [],
    customModules: [],
    has: () => false,
    loading: false,
  }),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

/* მძიმე მოდულების გათბობა ტესტის ბიუჯეტის გარეთ (DEBT-12-ის წესი) — გვერდი ახლა
   დეტალის ფანჯარასაც და გალერეასაც იწევს */
beforeAll(async () => {
  await import('@/pages/BookmarksPage')
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

async function mount(entry = '/bookmarks') {
  mocks.statuses.data = statuses
  mocks.fetchBookmarks.mockResolvedValue({ items: [bookmark], total: 1, lastPage: 1 })
  mocks.fetchBookmarkCategories.mockResolvedValue([])
  mocks.fetchBookmarkFiles.mockResolvedValue([])
  mocks.markBookmarkVisited.mockResolvedValue({ ...bookmark, visit_count: 1 })
  mocks.setBookmarkStatus.mockResolvedValue({ ...bookmark, status: statuses[1] })

  const { BookmarksPage } = await import('@/pages/BookmarksPage')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: [entry] },
        h(
          QueryClientProvider,
          { client: qc },
          // ⚠️ `GalleryVideoList` დამკვრელს ეკითხება — პროვაიდერი სჭირდება
          h(TooltipProvider, null, h(FeedbackProvider, null, h(PlayerProvider, null, h(BookmarksPage)))),
        ),
      ),
    ),
  )
  await flush()
  await flush()

  return container
}

const menuItem = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('button, [role="menuitem"]')].find(
    (el) => el.textContent?.trim() === label,
  )

const detail = () => document.querySelector<HTMLElement>('[data-testid="bookmark-detail"]')

describe('BookmarksPage row', () => {
  it('the status mark opens the statuses and sends the picked key', async () => {
    const el = await mount()

    const mark = el.querySelector<HTMLButtonElement>(`button[aria-label="${i18n.t('bookmarks.statusChange')}"]`)
    expect(mark?.textContent).toContain(statuses[0].name_ka)

    await act(async () => mark!.click())
    await flush()

    await act(async () => menuItem(statuses[1].name_ka)!.click())
    await flush()

    expect(mocks.setBookmarkStatus).toHaveBeenCalledWith(7, 'done')
  })

  it('right click opens the context menu with open, link, status, favourite, add link, gallery, edit and delete', async () => {
    const el = await mount()
    const row = el.querySelector('li')!

    await act(async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }))
    })
    await flush()

    const items = [...document.querySelectorAll('[role="menuitem"]')].map((m) => m.textContent?.trim() ?? '')

    for (const label of [
      i18n.t('actions.open'),
      i18n.t('actions.openLink'),
      i18n.t('bookmarks.status'),
      i18n.t('actions.favorite'),
      i18n.t('bookmarks.addLink'),
      i18n.t('bookmarks.galleryTitle'),
      i18n.t('actions.edit'),
      i18n.t('actions.delete'),
    ]) {
      expect(items, label).toContain(label)
    }
  })
})

/* Tasks §28.2/§28.3 — რიგზე სტატუსი ერთი სიგანის ჩამოსაშლელია, რჩეული ტექსტით და ერთი სიმაღლით;
   შიშველი აიქონ-ვარსკვლავი აღარ არის */
describe('BookmarksPage row — status width and favourite (§28)', () => {
  it('draws the wide status dropdown and the labelled favourite button', async () => {
    const el = await mount()

    const mark = el.querySelector<HTMLButtonElement>(`button[aria-label="${i18n.t('bookmarks.statusChange')}"]`)!
    expect(mark.querySelector('.min-w-36')).not.toBeNull()

    const favorite = el.querySelector<HTMLButtonElement>(`button[aria-label="${i18n.t('actions.favorite')}"]`)!
    expect(favorite.textContent).toContain(i18n.t('filter.favorite'))
    expect(favorite.className).toContain('h-9')
    expect(el.querySelector('button.size-9')).toBeNull()
  })
})

/* Tasks §36.1/§36.2 — სათაური ფანჯარას ხსნის; გარე ბმული ზოლის „ბმულით" და მთვლელით */
describe('BookmarksPage row — detail window (§36)', () => {
  it('the title is a button that opens the detail window, not a link', async () => {
    const el = await mount()

    // სიაში ბმული მხოლოდ ზოლის სლოტია — სათაური და ფოტო ღილაკებია
    expect([...el.querySelectorAll('li a')].map((a) => a.getAttribute('data-testid'))).toEqual(['link-slot'])

    const title = el.querySelector<HTMLButtonElement>('[data-testid="bookmark-title"]')!
    expect(title.tagName).toBe('BUTTON')

    await act(async () => title.click())
    await flush()

    expect(detail()).not.toBeNull()
    const open = document.querySelector<HTMLAnchorElement>('[data-testid="bookmark-open-link"]')!
    expect(open.getAttribute('href')).toBe('https://laravel.com/docs')
    expect(open.getAttribute('target')).toBe('_blank')
    expect(open.textContent).toContain(i18n.t('actions.openLink'))
  })

  it('the bar keeps a link button that counts the visit, and the files button counts both photo stores', async () => {
    const el = await mount()

    const link = el.querySelector<HTMLAnchorElement>('[data-testid="link-slot"]')!
    expect(link.getAttribute('href')).toBe('https://laravel.com/docs')
    expect(link.textContent).toContain(i18n.t('actions.link'))

    // jsdom-მა ნავიგაცია არ უნდა სცადოს — მთვლელი მაინც ითვლის
    document.addEventListener('click', (e) => e.preventDefault(), { once: true })
    await act(async () => link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
    await flush()
    // ⚠️ TanStack v5 `mutationFn`-ს მეორე არგუმენტადაც აწვდის კონტექსტს — მოწმდება პირველი
    expect(mocks.markBookmarkVisited.mock.calls[0]?.[0]).toBe(7)

    // 1 ატვირთული + 2 ვებიდან; დაჭერა ფანჯარას გალერეაზე ხსნის
    const files = el.querySelector<HTMLButtonElement>('[data-testid="files-button"]')!
    expect(files.textContent).toContain('3')
    await act(async () => files.click())
    await flush()
    expect(detail()).not.toBeNull()
    expect(document.querySelector('[data-testid="bookmark-gallery"]')).not.toBeNull()
  })

  it('opens a bookmark outside the current list from ?open=<id>', async () => {
    mocks.fetchBookmark.mockResolvedValue({ ...bookmark, id: 99, title: 'Hidden by the filter' })

    await mount('/bookmarks?open=99')
    await flush()

    expect(mocks.fetchBookmark).toHaveBeenCalledWith(99)
    expect(detail()?.textContent).toContain(i18n.t('actions.openLink'))
    expect(document.body.textContent).toContain('Hidden by the filter')
  })
})

/* Tasks §28.1 — ფორმა ორ სვეტად: მარცხნივ ბმული/სათაური/აღწერა, მარჯვნივ ფოტო (`fill`, ველების
   სიმაღლე) კატეგორიისა და სტატუსის გვერდით, ტეგები ქვემოთ */
describe('BookmarksPage form (§28.1)', () => {
  it('opens as two columns with the link on the left and the photo beside category and status on the right', async () => {
    const el = await mount()

    const add = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === i18n.t('bookmarks.add'))!
    await act(async () => add.click())
    await flush()

    const grid = document.querySelector<HTMLElement>('[data-testid="bookmark-form-grid"]')!
    expect(grid).not.toBeNull()
    expect(grid.className).toContain('lg:grid-cols-12')

    const left = grid.querySelector<HTMLElement>('[data-testid="bookmark-form-left"]')!
    const right = grid.querySelector<HTMLElement>('[data-testid="bookmark-form-right"]')!
    expect(left.querySelector('#b-url')).not.toBeNull()
    expect(left.querySelector('#b-title')).not.toBeNull()
    expect(left.querySelector('#b-desc')).not.toBeNull()

    const media = right.querySelector<HTMLElement>('[data-testid="form-media-row"]')!
    expect(media).not.toBeNull()
    expect(media.querySelector('input[type="file"]')).not.toBeNull()
    expect(media.querySelector('#b-category')).not.toBeNull()
    expect(media.querySelector('#b-status')).not.toBeNull()
    // ტეგები მედია-რიგის **ქვემოთაა**, სრული სიგანით
    expect(right.querySelector('#b-tags')).not.toBeNull()
    expect(media.querySelector('#b-tags')).toBeNull()
  })

  /* Tasks §36.3 — დამატებითი ბმულების სია: „ბმულის დამატება" ახალ რიგს ამატებს ტიპით,
     წარწერითა და ბმულის ველით; ფასის ველი მხოლოდ მაღაზიასა და ფასზე ჩანს */
  it('adds extra link rows below the two columns', async () => {
    const el = await mount()

    const add = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === i18n.t('bookmarks.add'))!
    await act(async () => add.click())
    await flush()

    const editor = document.querySelector<HTMLElement>('[data-testid="bookmark-links-editor"]')!
    expect(editor).not.toBeNull()
    expect(editor.closest('[data-testid="bookmark-form-left"], [data-testid="bookmark-form-right"]')).toBeNull()
    expect(editor.querySelectorAll('[data-testid="bookmark-link-row"]')).toHaveLength(0)

    const addLink = [...editor.querySelectorAll('button')].find((b) => b.textContent?.trim() === i18n.t('bookmarks.addLink'))!
    await act(async () => addLink.click())
    await flush()

    const row = editor.querySelector<HTMLElement>('[data-testid="bookmark-link-row"]')!
    expect(row).not.toBeNull()
    expect(row.querySelector(`[aria-label="${i18n.t('bookmarks.linkKind')}"]`)?.textContent).toContain(
      i18n.t('bookmarks.linkKinds.other'),
    )
    expect(row.querySelector(`input[aria-label="${i18n.t('bookmarks.linkLabel')}"]`)).not.toBeNull()
    // „სხვა" ტიპზე ფასი არ იწერება
    expect(row.querySelector(`input[aria-label="${i18n.t('bookmarks.linkPrice')}"]`)).toBeNull()
  })
})
