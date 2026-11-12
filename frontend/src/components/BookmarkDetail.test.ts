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
   **ბუკმარკის დეტალის ფანჯარა**.

   ⚠️ მოწმდება: „ბმულის გახსნა" ფანჯრის შიგნითაა, ახალ ჩანართში იხსნება და
   „გახსნის" მთვლელს ზრდის; დამატებითი ბმულები თითო ხაზზეა (ტიპი, დომენი, ფასი,
   „გახსნა" და „რედაქტირება") და რიგი გადათრევით ინახება; „ბმულის დამატება" მთელ სიას
   აგზავნის (ძველი + ახალი); გალერეა ორი ნამდვილი ჩანართია — „ატვირთული" (`bookmark_files`)
   და „ვებიდან" (`owner=bookmark:<id>`), რიცხვებით; ვიდეო-ბმულები ცალკე სექციაა;
   გამორთულ მოდულზე „ვებიდან" ამბობს, რომ მოდული ჩასართავია.
   ============================================================ */

const status: Status = {
  id: 1, key: 'open', module: 'bookmark', name_ka: 'მიმდინარე', name_en: 'Open', role: 'doing',
  icon: null, color: null, is_default: true, sort_order: 0,
} as Status

const bookmark: Bookmark = {
  id: 5,
  title: 'MX Master 3S',
  url: 'https://www.logitech.com/mx-master-3s',
  domain: 'logitech.com',
  description: 'უსადენო მაუსი',
  category_id: null,
  category: null,
  tags: ['shopping'],
  links: [
    { label: 'Amazon', url: 'https://www.amazon.com/dp/B0B11LJ69K', kind: 'shop', price: '$99', favicon_url: null },
    { label: null, url: 'https://www.rtings.com/mouse/reviews/logitech/mx-master-3s', kind: 'review', price: null, favicon_url: null },
  ],
  image: null,
  favicon_url: null,
  status,
  is_favorite: false,
  visit_count: 4,
  visited_at: '2026-10-01T12:00:00+04:00',
  visibility: 'private',
  created_at: '2026-09-20T10:00:00+04:00',
}

const mocks = vi.hoisted(() => ({
  fetchBookmarkFiles: vi.fn(),
  fetchBookmarkFields: vi.fn(),
  markBookmarkVisited: vi.fn(),
  setBookmarkLinks: vi.fn(),
  refreshBookmarkFromLink: vi.fn(),
  fetchGalleryPhotos: vi.fn(),
  fetchGalleryVideos: vi.fn(),
  gallery: true,
}))

vi.mock('@/api/bookmarks', async (original) => ({
  ...(await original<typeof import('@/api/bookmarks')>()),
  fetchBookmarkFiles: mocks.fetchBookmarkFiles,
  fetchBookmarkFields: mocks.fetchBookmarkFields,
  markBookmarkVisited: mocks.markBookmarkVisited,
  setBookmarkLinks: mocks.setBookmarkLinks,
  refreshBookmarkFromLink: mocks.refreshBookmarkFromLink,
}))

vi.mock('@/api/gallery', async (original) => ({
  ...(await original<typeof import('@/api/gallery')>()),
  fetchGalleryPhotos: mocks.fetchGalleryPhotos,
  fetchGalleryVideos: mocks.fetchGalleryVideos,
}))

vi.mock('@/lib/statuses', async (original) => ({
  ...(await original<typeof import('@/lib/statuses')>()),
  useStatuses: () => ({ data: [status] }),
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => ({
    all: [],
    enabled: [],
    mediaModules: [],
    pageModules: [],
    customModules: [],
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

beforeAll(async () => {
  await import('@/components/BookmarkDetail')
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

const shot = { id: 1, kind: 'image', path: 'bookmarks/files/images/shot.png', url: '/storage/bookmarks/files/images/shot.png', original_name: 'shot.png', mime: 'image/png', size: 10, created_at: null }

async function mount(gallery = true, files: unknown[] = [shot]) {
  mocks.gallery = gallery
  mocks.fetchBookmarkFiles.mockResolvedValue(files)
  mocks.fetchBookmarkFields.mockResolvedValue([{ id: 9, label: 'შეკვეთის კოდი', value: 'ORD-55', is_secret: false, readable: true }])
  mocks.markBookmarkVisited.mockResolvedValue({ ...bookmark, visit_count: 5 })
  mocks.setBookmarkLinks.mockResolvedValue(bookmark)
  mocks.fetchGalleryPhotos.mockResolvedValue({ data: [], meta: { page: 1, per_page: 60, total: 0, last_page: 1 } })
  mocks.fetchGalleryVideos.mockResolvedValue({ data: [], meta: { page: 1, per_page: 50, total: 0, last_page: 1 } })

  const { BookmarkDetail } = await import('@/components/BookmarkDetail')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        null,
        h(
          QueryClientProvider,
          { client: qc },
          h(
            TooltipProvider,
            null,
            h(
              FeedbackProvider,
              null,
              h(PlayerProvider, null, h(BookmarkDetail, { bookmark, onClose: () => {}, onEdit: () => {}, onDelete: () => {} })),
            ),
          ),
        ),
      ),
    ),
  )
  await flush()
  await flush()
}

const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)
/** გალერეის ორი ჩანართი — „ატვირთული" და „ვებიდან" */
const tabs = () => [...document.querySelectorAll<HTMLButtonElement>('[data-testid="bookmark-gallery-tabs"] button')]

describe('BookmarkDetail', () => {
  it('refreshes the photo from the link and says what happened', async () => {
    mocks.refreshBookmarkFromLink.mockResolvedValue({ bookmark, imageFound: true, imageChanged: true })
    await mount()

    const refresh = document.querySelector<HTMLButtonElement>('[data-testid="bookmark-refresh"]')!
    expect(refresh.textContent?.trim()).toBe(i18n.t('bookmarks.refresh.one'))

    await act(async () => refresh.click())
    await flush()

    expect(mocks.refreshBookmarkFromLink).toHaveBeenCalledWith(bookmark.id)
    expect(document.body.textContent).toContain(i18n.t('bookmarks.refresh.done'))
  })

  it('tells the difference between a page with the same photo and one with none', async () => {
    mocks.refreshBookmarkFromLink.mockResolvedValue({ bookmark, imageFound: false, imageChanged: false })
    await mount()

    await act(async () => document.querySelector<HTMLButtonElement>('[data-testid="bookmark-refresh"]')!.click())
    await flush()

    expect(document.body.textContent).toContain(i18n.t('bookmarks.refresh.none'))
    expect(document.body.textContent).not.toContain(i18n.t('bookmarks.refresh.done'))
  })

  it('opens the link in a new tab from inside the window and counts the visit', async () => {
    await mount()

    const open = document.querySelector<HTMLAnchorElement>('[data-testid="bookmark-open-link"]')!
    expect(open.getAttribute('href')).toBe(bookmark.url)
    expect(open.getAttribute('target')).toBe('_blank')
    expect(open.getAttribute('rel')).toContain('noopener')

    // jsdom-მა ნავიგაცია არ უნდა სცადოს — მთვლელი მაინც ითვლის
    document.addEventListener('click', (e) => e.preventDefault(), { once: true })
    await act(async () => open.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
    await flush()
    expect(mocks.markBookmarkVisited).toHaveBeenCalledWith(5)

    // ცნობები — დომენი, გახსნების რიცხვი; მოქმედებები — კოპირება, რედაქტირება, წაშლა
    const text = document.body.textContent ?? ''
    expect(text).toContain('logitech.com')
    expect(text).toContain(i18n.t('bookmarks.visits', { count: 4 }))
    expect(button(i18n.t('actions.copy'))).toBeDefined()
    expect(button(i18n.t('actions.edit'))).toBeDefined()
    expect(button(i18n.t('actions.delete'))).toBeDefined()
  })

  it('shows the own fields of the bookmark under the header, above the extra links', async () => {
    await mount()

    const fields = document.querySelector<HTMLElement>('[data-testid="bookmark-fields"]')!
    expect(mocks.fetchBookmarkFields).toHaveBeenCalledWith(5)
    expect(fields.textContent).toContain('შეკვეთის კოდი')
    expect(fields.textContent).toContain('ORD-55')
    expect(fields.querySelector('[data-testid="bookmark-field-copy"]')?.textContent?.trim()).toBe(i18n.t('actions.copy'))

    // „ბმულის გახსნა" ზემოთაა, დამატებითი ბმულები — ქვემოთ
    const open = document.querySelector('[data-testid="bookmark-open-link"]')!
    const links = document.querySelector('[data-testid="bookmark-link-cards"]')!
    expect(open.compareDocumentPosition(fields) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(fields.compareDocumentPosition(links) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows each extra link on one row with type, host, price and an "open" link', async () => {
    await mount()

    const cards = document.querySelector<HTMLElement>('[data-testid="bookmark-link-cards"]')!
    const rows = [...cards.querySelectorAll<HTMLElement>('[data-testid="bookmark-link"]')]
    expect(rows).toHaveLength(bookmark.links.length)

    // „გახსნა" — ნამდვილი ბმული ახალ ჩანართში, თითო რიგზე ერთი
    const opens = rows.map((row) => row.querySelector<HTMLAnchorElement>('[data-testid="bookmark-link-open"]')!)
    expect(opens.map((a) => a.getAttribute('href'))).toEqual(bookmark.links.map((l) => l.url))
    expect(opens.every((a) => a.getAttribute('target') === '_blank' && a.getAttribute('rel')?.includes('noopener'))).toBe(true)
    expect(opens[0].textContent?.trim()).toBe(i18n.t('actions.open'))

    expect(rows[0].textContent).toContain('Amazon')
    expect(rows[0].textContent).toContain('amazon.com')
    expect(rows[0].textContent).toContain(i18n.t('bookmarks.linkKinds.shop'))
    expect(rows[0].querySelector('[data-testid="bookmark-link-price"]')?.textContent).toBe('$99')

    // წარწერის გარეშე — დომენი; მიმოხილვას ფასი არ აქვს
    expect(rows[1].textContent).toContain('rtings.com')
    expect(rows[1].textContent).toContain(i18n.t('bookmarks.linkKinds.review'))
    expect(rows[1].querySelector('[data-testid="bookmark-link-price"]')).toBeNull()

    // ორ ბმულზე რიგი ითრევა — თითოს სახელური აქვს
    expect(cards.querySelectorAll('[data-sortable-handle]')).toHaveLength(bookmark.links.length)
  })

  it('dragging a link saves the whole list in the new order', async () => {
    mocks.setBookmarkLinks.mockClear()
    const originalRect = Element.prototype.getBoundingClientRect
    // jsdom-ს განლაგება არ აქვს — მართკუთხედი რიგის ნომრიდან ითვლება (`sortable.test.ts`-ის ხერხი)
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const ids = [...new Set([...document.querySelectorAll<HTMLElement>('[data-sortable-id]')].map((x) => x.dataset.sortableId))]
      const target = (this.closest('[data-sortable-id]') ?? this.querySelector('[data-sortable-id]')) as HTMLElement | null
      const top = target ? ids.indexOf(target.dataset.sortableId) * 50 : 0
      return { x: 0, y: top, top, left: 0, width: 200, height: 40, right: 200, bottom: top + 40, toJSON: () => ({}) } as DOMRect
    }

    try {
      await mount()
      const handle = document.querySelector<HTMLElement>('[data-testid="bookmark-link"] [data-sortable-handle][aria-roledescription="sortable"]')!
      const press = async (code: string) => {
        await act(async () => {
          handle.dispatchEvent(new KeyboardEvent('keydown', { code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true }))
        })
        await flush()
      }

      await press('Space')
      await press('ArrowDown')
      await press('Space')

      expect(mocks.setBookmarkLinks).toHaveBeenCalledWith(5, [bookmark.links[1], bookmark.links[0]])
      // ახალი რიგი პასუხამდეც ჩანს
      const first = document.querySelector<HTMLElement>('[data-testid="bookmark-link"]')!
      expect(first.textContent).toContain('rtings.com')
    } finally {
      Element.prototype.getBoundingClientRect = originalRect
    }
  })

  it('"add link" sends the whole list — the old links and the new one', async () => {
    await mount()

    await act(async () => button(i18n.t('bookmarks.addLink'))!.click())
    await flush()

    const row = [...document.querySelectorAll<HTMLElement>('[data-testid="bookmark-link-row"]')].pop()!
    const url = row.querySelector<HTMLInputElement>('input[placeholder="https://…"]')!
    const label = row.querySelector<HTMLInputElement>(`input[aria-label="${i18n.t('bookmarks.linkLabel')}"]`)!
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(url, 'https://www.ebay.com/itm/1')
      url.dispatchEvent(new Event('input', { bubbles: true }))
      setter.call(label, 'eBay')
      label.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].pop()!.click())
    await flush()

    expect(mocks.setBookmarkLinks).toHaveBeenCalledWith(5, [
      ...bookmark.links,
      { label: 'eBay', url: 'https://www.ebay.com/itm/1', kind: 'other', price: null, favicon_url: null },
    ])
  })

  it('"edit" beside a link card opens it filled in and saves the whole list with that link changed', async () => {
    mocks.setBookmarkLinks.mockClear()
    await mount()

    const edits = [...document.querySelectorAll<HTMLButtonElement>('[data-testid="bookmark-link-edit"]')]
    expect(edits).toHaveLength(bookmark.links.length)
    // ღილაკი „გახსნის" გვერდითაა და არა მის შიგნით — ბმულზე დაჭერა მას არ „ყლაპავს"
    expect(edits[1].closest('a')).toBeNull()
    expect(edits[1].textContent).toBe(i18n.t('actions.edit'))

    await act(async () => edits[1].click())
    await flush()
    expect(document.body.textContent).toContain(i18n.t('bookmarks.editLink'))

    const row = [...document.querySelectorAll<HTMLElement>('[data-testid="bookmark-link-row"]')].pop()!
    const label = row.querySelector<HTMLInputElement>(`input[aria-label="${i18n.t('bookmarks.linkLabel')}"]`)!
    expect(row.querySelector<HTMLInputElement>('input[placeholder="https://…"]')!.value).toBe(bookmark.links[1].url)
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(label, 'RTINGS')
      label.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].pop()!.click())
    await flush()

    expect(mocks.setBookmarkLinks).toHaveBeenCalledWith(5, [bookmark.links[0], { ...bookmark.links[1], label: 'RTINGS' }])
  })

  it('"remove link" inside the edit window sends the list without it', async () => {
    mocks.setBookmarkLinks.mockClear()
    await mount()

    await act(async () => document.querySelectorAll<HTMLButtonElement>('[data-testid="bookmark-link-edit"]')[0].click())
    await flush()
    await act(async () => button(i18n.t('bookmarks.removeLink'))!.click())
    await flush()

    expect(mocks.setBookmarkLinks).toHaveBeenCalledWith(5, [bookmark.links[1]])
  })

  it('the gallery is two real tabs with counts — uploaded and from the web for owner bookmark:<id>', async () => {
    await mount(true)

    const gallery = document.querySelector<HTMLElement>('[data-testid="bookmark-gallery"]')!
    expect(gallery.textContent).toContain(i18n.t('bookmarks.galleryTitle'))

    const [uploaded, web] = tabs()
    expect(uploaded.textContent).toContain(i18n.t('gallery.uploadedBadge'))
    expect(uploaded.textContent).toContain('1')
    expect(uploaded.getAttribute('aria-pressed')).toBe('true')
    expect(web.textContent).toContain(i18n.t('gallery.webBadge'))
    expect(web.textContent).toContain('0')

    // „ატვირთული" ღიაა: ვიტრინა ჩანს, ვების ბადე — არა; რიცხვი კი ორივეს მოაქვს
    expect(gallery.querySelector('[data-testid="showcase-main"]')).not.toBeNull()
    expect(gallery.textContent).not.toContain(i18n.t('bookmarks.webPhotosTitle'))
    expect(mocks.fetchBookmarkFiles).toHaveBeenCalledWith(5)
    expect(mocks.fetchGalleryPhotos).toHaveBeenCalledWith({ owner: 'bookmark:5', per_page: 1 })

    await act(async () => web.click())
    await flush()

    expect(tabs()[1].getAttribute('aria-pressed')).toBe('true')
    expect(gallery.querySelector('[data-testid="showcase-main"]')).toBeNull()
    expect(gallery.textContent).toContain(i18n.t('bookmarks.webPhotosTitle'))
    // ცარიელზე — ცარიელი მდგომარეობა ღილაკით (ზედა ღილაკის გარდა)
    expect(gallery.textContent).toContain(i18n.t('gallery.emptyRecord'))
    expect([...gallery.querySelectorAll('button')].filter((b) => b.textContent?.trim() === i18n.t('web.searchPhotos'))).toHaveLength(2)
  })

  it('an empty "uploaded" tab is an empty state that carries the upload button', async () => {
    await mount(true, [])

    const gallery = document.querySelector<HTMLElement>('[data-testid="bookmark-gallery"]')!
    expect(tabs()[0].textContent).toContain('0')
    expect(gallery.textContent).toContain(i18n.t('bookmarks.photosEmpty'))
    const uploads = gallery.querySelectorAll('[data-testid="detail-photos-upload"]')
    expect(uploads).toHaveLength(1)
    expect(uploads[0].closest('[data-empty-state]')).not.toBeNull()
  })

  it('video links are their own section: empty with a search button, never a big player before "watch"', async () => {
    await mount(true)

    const videos = document.querySelector<HTMLElement>('[data-testid="gallery-videos"]')!
    expect(videos.textContent).toContain(i18n.t('gallery.videosTitle'))
    expect(videos.textContent).toContain(i18n.t('gallery.noVideos'))
    expect([...videos.querySelectorAll('button')].some((b) => b.textContent?.trim() === i18n.t('web.searchVideos'))).toBe(true)
    expect(videos.querySelector('[data-player-spot]')).toBeNull()
    expect(mocks.fetchGalleryVideos).toHaveBeenCalledWith(expect.objectContaining({ owner: 'bookmark:5' }))
  })

  it('without the gallery module the web tab says the module must be enabled', async () => {
    await mount(false)

    const gallery = document.querySelector<HTMLElement>('[data-testid="bookmark-gallery"]')!
    // ატვირთული ფოტოები მოდულის გარეშეც ჩანს — ისინი ბუკმარკისაა
    expect(tabs()[0].textContent).toContain(i18n.t('gallery.uploadedBadge'))
    expect(gallery.querySelector('[data-testid="showcase-main"]')).not.toBeNull()

    await act(async () => tabs()[1].click())
    await flush()

    // შენიშვნა ერთხელ — ვიდეოს სექცია მას არ იმეორებს
    expect(gallery.querySelectorAll('[data-testid="gallery-off"]')).toHaveLength(1)
    expect(gallery.querySelector('[data-testid="parent-gallery"]')).toBeNull()
    expect(gallery.querySelector('[data-testid="gallery-videos"]')).toBeNull()
    expect(mocks.fetchGalleryPhotos).not.toHaveBeenCalled()
  })
})
