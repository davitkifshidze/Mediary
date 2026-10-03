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
   **ბუკმარკის დეტალის ფანჯარა** (Tasks §36.6).

   ⚠️ მოწმდება: „ბმულის გახსნა" ფანჯრის შიგნითაა, ახალ ჩანართში იხსნება და
   „გახსნის" მთვლელს ზრდის; დამატებითი ბმულები ბარათებადაა (ტიპი, დომენი, ფასი);
   „ბმულის დამატება" მთელ სიას აგზავნის (ძველი + ახალი); გალერეა ორ საცავს ერთ
   ხედად აჩვენებს — „ატვირთული" (`bookmark_files`) და „ვებიდან" (`owner=bookmark:<id>`),
   გამორთულ მოდულზე კი ამბობს, რომ ჩასართავია.
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
  markBookmarkVisited: vi.fn(),
  setBookmarkLinks: vi.fn(),
  fetchGalleryPhotos: vi.fn(),
  fetchGalleryVideos: vi.fn(),
  gallery: true,
}))

vi.mock('@/api/bookmarks', async (original) => ({
  ...(await original<typeof import('@/api/bookmarks')>()),
  fetchBookmarkFiles: mocks.fetchBookmarkFiles,
  markBookmarkVisited: mocks.markBookmarkVisited,
  setBookmarkLinks: mocks.setBookmarkLinks,
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

async function mount(gallery = true) {
  mocks.gallery = gallery
  mocks.fetchBookmarkFiles.mockResolvedValue([
    { id: 1, kind: 'image', path: 'bookmarks/files/images/shot.png', url: '/storage/bookmarks/files/images/shot.png', original_name: 'shot.png', mime: 'image/png', size: 10, created_at: null },
  ])
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

describe('BookmarkDetail (§36)', () => {
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

  it('shows the extra links as cards with type, host and price', async () => {
    await mount()

    const cards = document.querySelector<HTMLElement>('[data-testid="bookmark-link-cards"]')!
    const links = [...cards.querySelectorAll<HTMLAnchorElement>('a')]
    expect(links.map((a) => a.getAttribute('href'))).toEqual(bookmark.links.map((l) => l.url))
    expect(links.every((a) => a.getAttribute('target') === '_blank')).toBe(true)

    expect(links[0].textContent).toContain('Amazon')
    expect(links[0].textContent).toContain('amazon.com')
    expect(links[0].textContent).toContain(i18n.t('bookmarks.linkKinds.shop'))
    expect(links[0].querySelector('[data-testid="bookmark-link-price"]')?.textContent).toBe('$99')

    // წარწერის გარეშე — დომენი; მიმოხილვას ფასი არ აქვს
    expect(links[1].textContent).toContain('rtings.com')
    expect(links[1].textContent).toContain(i18n.t('bookmarks.linkKinds.review'))
    expect(links[1].querySelector('[data-testid="bookmark-link-price"]')).toBeNull()
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

  it('the gallery shows the uploaded photos and the web part for owner bookmark:<id>', async () => {
    await mount(true)

    const gallery = document.querySelector<HTMLElement>('[data-testid="bookmark-gallery"]')!
    expect(gallery.textContent).toContain(i18n.t('bookmarks.galleryTitle'))
    expect(gallery.textContent).toContain(i18n.t('gallery.uploadedBadge'))
    expect(gallery.textContent).toContain(i18n.t('gallery.webBadge'))
    expect(gallery.querySelector('[data-testid="parent-gallery"]')).not.toBeNull()

    expect(mocks.fetchBookmarkFiles).toHaveBeenCalledWith(5)
    expect(mocks.fetchGalleryPhotos).toHaveBeenCalledWith(expect.objectContaining({ owner: 'bookmark:5' }))
    expect(mocks.fetchGalleryVideos).toHaveBeenCalledWith(expect.objectContaining({ owner: 'bookmark:5' }))
    expect(button(i18n.t('web.searchPhotos'))).toBeDefined()
  })

  it('without the gallery module the web part says the module must be enabled', async () => {
    await mount(false)

    const gallery = document.querySelector<HTMLElement>('[data-testid="bookmark-gallery"]')!
    // ატვირთული ფოტოები მოდულის გარეშეც ჩანს — ისინი ბუკმარკისაა
    expect(gallery.textContent).toContain(i18n.t('gallery.uploadedBadge'))
    expect(gallery.querySelector('[data-testid="gallery-off"]')).not.toBeNull()
    expect(gallery.querySelector('[data-testid="parent-gallery"]')).toBeNull()
    expect(mocks.fetchGalleryPhotos).not.toHaveBeenCalled()
  })
})
