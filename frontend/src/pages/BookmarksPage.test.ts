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

   Tasks §41 — ფორმა: ბმული თავში (`paste` წამოღებას იწყებს), მარცხნივ ფოტო და
   მარჯვნივ ბადე, ქვემოთ აღწერა/ტეგები, ბმულები და გალერეა ბარათებად; ახალ
   ბუკმარკზე ვებიდან არჩეული ფოტო/ვიდეო შექმნისთანავე იგზავნება.
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
  fetchLinkPreview: vi.fn(),
  importWebImages: vi.fn(),
  saveSerpVideo: vi.fn(),
  statuses: { data: [] as unknown[] },
  categories: [] as unknown[],
  gallery: false,
  // §45 — მოდულის შენახული ხედი (`module_user.settings.view`) და მისი ჩუმი შენახვა
  modules: [] as { key: string; user_settings?: Record<string, unknown> }[],
  updateModuleSettings: vi.fn(),
  // §41.3 — ძებნის ფანჯრების სტაბი ამ ორს „არჩევს"
  webImage: { engine: 'serper', source: 'serper', title: 'Docs logo', original: 'https://img.test/logo.png', thumbnail: 'https://img.test/logo-s.png', link: 'https://laravel.com', domain: 'laravel.com', width: 400, height: 300, engines: ['serper'] },
  webVideo: { engine: 'youtube', source: 'serpapi', title: 'Laravel in 100 seconds', link: 'https://youtu.be/l100', channel: 'Fireship', duration: 100, views: null, published: null, thumbnail: null, description: null, engines: ['youtube'] },
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

/* §41.1 — ბმულის ველი (`LinkField`) `POST /links/metadata`-ს ეკითხება */
vi.mock('@/api/links', async (original) => ({
  ...(await original<typeof import('@/api/links')>()),
  fetchLinkPreview: mocks.fetchLinkPreview,
}))
/* §41.3 — შექმნის შემდეგ ვებიდან არჩეული იგზავნება */
vi.mock('@/api/web', async (original) => ({
  ...(await original<typeof import('@/api/web')>()),
  importWebImages: mocks.importWebImages,
}))
vi.mock('@/api/gallery', async (original) => ({
  ...(await original<typeof import('@/api/gallery')>()),
  saveSerpVideo: mocks.saveSerpVideo,
}))
/* ძებნის ფანჯრები — სტაბი, რომელიც `onPick`-ს ერთ შედეგს აწვდის (ძებნა თავისი ტესტებითაა დაფარული) */
vi.mock('@/components/WebImageDialog', async () => {
  const { createElement } = await import('react')
  return {
    WebImageDialog: (props: { onPick?: (images: unknown[]) => void; onClose: () => void }) =>
      createElement('button', { type: 'button', 'data-testid': 'stub-photo-pick', onClick: () => { props.onPick?.([mocks.webImage]); props.onClose() } }, 'pick'),
  }
})
vi.mock('@/components/WebVideoDialog', async () => {
  const { createElement } = await import('react')
  return {
    WebVideoDialog: (props: { onPick?: (video: unknown) => void; onClose: () => void }) =>
      createElement('button', { type: 'button', 'data-testid': 'stub-video-pick', onClick: () => { props.onPick?.(mocks.webVideo); props.onClose() } }, 'pick'),
  }
})
/* §28.1 — ფორმა იხსნება: ველების კატალოგი და დამატებითი ველები ცარიელი მოდის */
vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  fetchModuleFields: vi.fn().mockResolvedValue([]),
  fetchCustomFields: vi.fn().mockResolvedValue([]),
  fetchCustomFieldValues: vi.fn().mockResolvedValue({}),
  updateModuleSettings: mocks.updateModuleSettings,
}))

vi.mock('@/lib/statuses', async (original) => ({
  ...(await original<typeof import('@/lib/statuses')>()),
  useStatuses: () => mocks.statuses,
}))

/* §36.4 — ფანჯრის გალერეა: მოდული გამორთულია, ე.ი. ქსელში არაფერი მიდის */
vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => ({
    all: mocks.modules,
    enabled: [],
    mediaModules: [],
    pageModules: [],
    customModules: [],
    // §41.3 — გალერეის მოდული მხოლოდ იმ ტესტში ირთვება, სადაც ვებიდან არჩევა მოწმდება
    has: (key: string) => key === 'gallery' && mocks.gallery,
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

// §41 — Radix `Select` არჩეულ რიგს ხედში აბრუნებს; jsdom-ს ეს მეთოდი არ აქვს
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

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
  mocks.gallery = false
  mocks.categories = []
  mocks.modules = []
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
  mocks.fetchBookmarkCategories.mockResolvedValue(mocks.categories)
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

/** Radix `Select`: კლავიატურით გახსნა და რიგის არჩევა */
async function choose(triggerId: string, label: string) {
  const trigger = document.getElementById(triggerId)!
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  await flush()
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.trim() === label)!
  await act(async () => option.click())
  await flush()
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

/* Tasks §41 — „ბმული ყოველთვის, ყველგან თავშია; მერე მარცხნივ ფოტო და მარჯვნივ ინფუთები,
   ზოგი ქვევით" — დამატებაც და რედაქტირებაც ერთი განლაგებით */
describe('BookmarksPage form (§41)', () => {
  async function openAdd() {
    const el = await mount()
    const add = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === i18n.t('bookmarks.add'))!
    await act(async () => add.click())
    await flush()
    return document.querySelector<HTMLFormElement>('[data-testid="bookmark-form"]')!
  }

  it('puts the link first, the photo beside title · classifier · status, description and tags below', async () => {
    const form = await openAdd()

    // 1) ბმული — ფორმის პირველი ბლოკი, სრულ სიგანეზე
    expect(form.firstElementChild?.querySelector('#b-url')).not.toBeNull()

    // 2) მარცხნივ მთავარი ფოტო, მარჯვნივ სათაური, კლასიფიკატორი და სტატუსი
    const media = form.querySelector<HTMLElement>('[data-testid="form-media-row"]')!
    expect(media.querySelector('[data-testid="form-media"] input[type="file"]')).not.toBeNull()
    for (const id of ['#b-title', '#b-category', '#b-status']) expect(media.querySelector(id)).not.toBeNull()
    // ⚠️ ლეიბლი ჩარჩოს ზემოთაა — ჩარჩო მას (და ქვემოთ მდგარ „ტეგებს") აღარ ფარავს (§38.2)
    const column = media.querySelector('[data-testid="form-media"]')!
    expect(column.firstElementChild?.tagName).toBe('LABEL')
    expect(column.querySelector('[data-testid="form-media-frame"] [data-testid="poster-dropzone"]')).not.toBeNull()

    // 3) აღწერა და ტეგები — ფოტოს რიგის ქვემოთ, სრულ სიგანეზე
    const desc = form.querySelector('#b-desc')!
    const tags = form.querySelector('#b-tags')!
    expect(media.contains(desc)).toBe(false)
    expect(media.contains(tags)).toBe(false)
    expect(media.compareDocumentPosition(desc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('extra links and the gallery are separate cards below the fields', async () => {
    const form = await openAdd()

    const editor = form.querySelector<HTMLElement>('[data-testid="bookmark-links-editor"]')!
    expect(editor.closest('[data-testid="form-media-row"]')).toBeNull()
    expect(editor.closest('section')?.className).toContain('rounded-xl')

    const gallery = form.querySelector<HTMLElement>('[data-testid="bookmark-gallery-card"]')!
    expect(gallery.className).toContain('rounded-xl')
    expect(gallery.querySelector('[data-testid="pending-files"]')).not.toBeNull()
    // გალერეის მოდული გამორთულია — „ვებიდან" არ ჩანს
    expect(gallery.querySelector('[data-testid="pending-web"]')).toBeNull()
  })

  it('pasting a link fetches the page and fills the empty title and description', async () => {
    mocks.fetchLinkPreview.mockResolvedValue({
      kind: 'page', url: 'https://laravel.com/docs', platform: 'web', external_id: null, embed_url: null,
      title: 'Laravel', description: 'The PHP framework', image_url: 'https://laravel.com/og.png', favicon_url: null,
      site_name: 'Laravel', domain: 'laravel.com', author: null, duration: null,
    })
    await openAdd()

    const input = document.getElementById('b-url') as HTMLInputElement
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => 'https://laravel.com/docs' } })
    await act(async () => {
      input.dispatchEvent(paste)
    })
    await flush()

    expect(mocks.fetchLinkPreview).toHaveBeenCalledWith('https://laravel.com/docs')
    expect((document.getElementById('b-title') as HTMLInputElement).value).toBe('Laravel')
    expect((document.getElementById('b-desc') as HTMLTextAreaElement).value).toBe('The PHP framework')
  })

  it('a web photo and video picked before saving are sent right after the bookmark is created (§41.3)', async () => {
    mocks.gallery = true
    mocks.categories = [{ id: 3, key: 'article', name_ka: 'სტატია', name_en: 'Article', icon: null, sort_order: 0 }]
    mocks.createBookmark.mockResolvedValue({ ...bookmark, id: 42 })
    mocks.importWebImages.mockResolvedValue({ added: 1, skipped: 0, failed: 0, thumbnails: 0, bytes: 10, quota_exceeded: false })
    mocks.saveSerpVideo.mockResolvedValue({ video: { id: 9 }, duplicate: false })
    const form = await openAdd()

    const web = form.querySelector<HTMLElement>('[data-testid="pending-web"]')!
    const open = (label: string) => [...web.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t(label)))!
    await act(async () => open('web.searchPhotos').click())
    await act(async () => (document.querySelector('[data-testid="stub-photo-pick"]') as HTMLButtonElement).click())
    await act(async () => open('web.searchVideos').click())
    await act(async () => (document.querySelector('[data-testid="stub-video-pick"]') as HTMLButtonElement).click())
    await flush()

    expect(web.querySelectorAll('[data-testid="pending-web-images"] li')).toHaveLength(1)
    expect(web.querySelectorAll('[data-testid="pending-web-videos"] li')).toHaveLength(1)
    // შექმნამდე არაფერი იგზავნება
    expect(mocks.importWebImages).not.toHaveBeenCalled()

    const setValue = (el: HTMLInputElement, value: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await act(async () => setValue(document.getElementById('b-url') as HTMLInputElement, 'https://laravel.com/docs'))
    await act(async () => setValue(document.getElementById('b-title') as HTMLInputElement, 'Laravel docs'))
    await choose('b-category', 'სტატია')
    await choose('b-status', 'მიმდინარე')

    await act(async () => form.requestSubmit())
    await flush()
    await flush()

    expect(mocks.createBookmark).toHaveBeenCalledTimes(1)
    expect(mocks.importWebImages).toHaveBeenCalledWith(expect.objectContaining({ target: 'bookmark', id: 42, images: [mocks.webImage] }))
    expect(mocks.saveSerpVideo).toHaveBeenCalledWith('bookmark', 42, mocks.webVideo)
  })

  /* Tasks §36.3 — დამატებითი ბმულების სია: „ბმულის დამატება" ახალ რიგს ამატებს ტიპით,
     წარწერითა და ბმულის ველით; ფასის ველი მხოლოდ მაღაზიასა და ფასზე ჩანს */
  it('adds extra link rows below the fields', async () => {
    const el = await mount()

    const add = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === i18n.t('bookmarks.add'))!
    await act(async () => add.click())
    await flush()

    const editor = document.querySelector<HTMLElement>('[data-testid="bookmark-links-editor"]')!
    expect(editor).not.toBeNull()
    expect(editor.closest('[data-testid="form-media-row"]')).toBeNull()
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

/* Tasks §45 — ხედის გადამრთველი: ნაგულისხმევად ახლანდელი სტრიქონები; გადართვა მოდულზე ინახება,
   შენახული ხედი კი გვერდის გახსნისას აღდგება */
describe('BookmarksPage view toggle (§45)', () => {
  const layoutOf = (el: HTMLElement) => el.querySelector('[data-testid="record-list"]')?.getAttribute('data-layout')
  const toggle = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('[data-testid="view-toggle"] button')].find((b) => b.textContent === label)!

  it('starts with the current rows and saves the switch to the grid on the module', async () => {
    mocks.updateModuleSettings.mockResolvedValue(undefined)
    const el = await mount()
    expect(layoutOf(el)).toBe('rows')

    await act(async () => toggle(i18n.t('view.grid')).click())

    expect(layoutOf(el)).toBe('grid')
    expect(mocks.updateModuleSettings).toHaveBeenCalledWith('bookmark', { view: 'grid' })
    // ბადეში — ფოტო და სათაური, ზოლი ჰოვერის მენიუშია
    expect(el.querySelector('[data-testid="bookmark-thumb"]')).not.toBeNull()
    expect(el.querySelector('[data-testid="record-actions"]')).toBeNull()
  })

  it('opens in the saved view', async () => {
    mocks.modules = [{ key: 'bookmark', user_settings: { view: 'cards' } }]
    const el = await mount()

    expect(layoutOf(el)).toBe('cards')
    expect(el.querySelector('[data-testid="record-card-bar"] [data-testid="record-actions"]')).not.toBeNull()
  })
})
