import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PlayerProvider } from '@/lib/player'
import type { Book } from '@/api/books'
import i18n from '@/i18n'

/* ============================================================
   **წიგნის დეტალი — გალერეა ვებიდან** (Tasks §22.5).

   ⚠️ მოწმდება: სექცია „გალერეა" ორ საცავს ერთ ხედად აჩვენებს — „ატვირთული"
   (წიგნის ფაილები) და „ვებიდან" (გალერეის მოდული, `owner=book:<id>`) ვებძებნის
   ღილაკებით; გალერეის მოდულის გარეშე მეორე ნაწილი ამბობს, რომ მოდული ჩასართავია,
   ვებძებნის ღილაკები კი არ ჩანს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchBookFiles: vi.fn(),
  fetchBookNotes: vi.fn(),
  fetchGalleryPhotos: vi.fn(),
  fetchGalleryVideos: vi.fn(),
  gallery: true,
}))

vi.mock('@/api/books', async (original) => ({
  ...(await original<typeof import('@/api/books')>()),
  fetchBookFiles: mocks.fetchBookFiles,
  fetchBookNotes: mocks.fetchBookNotes,
}))

vi.mock('@/api/gallery', async (original) => ({
  ...(await original<typeof import('@/api/gallery')>()),
  fetchGalleryPhotos: mocks.fetchGalleryPhotos,
  fetchGalleryVideos: mocks.fetchGalleryVideos,
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

const book = {
  id: 5,
  title_en: 'Dune',
  title_ka: null,
  author: 'Frank Herbert',
  year: 1965,
  pages: 412,
  format: 'print',
  status: 'reading',
  rating: 9,
  cover: null,
  links: [],
  tags: [],
  source_url: null,
  visibility: 'private',
  is_favorite: false,
} as unknown as Book

async function mount(gallery: boolean) {
  mocks.gallery = gallery
  mocks.fetchBookFiles.mockResolvedValue([])
  mocks.fetchBookNotes.mockResolvedValue([])
  mocks.fetchGalleryPhotos.mockResolvedValue({ data: [], meta: { page: 1, per_page: 60, total: 0, last_page: 1 } })
  mocks.fetchGalleryVideos.mockResolvedValue({ data: [], meta: { page: 1, per_page: 50, total: 0, last_page: 1 } })

  const { BookDetail } = await import('@/components/BookDetail')
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
          // ⚠️ `GalleryVideoList` დამკვრელს ეკითხება — პროვაიდერი სჭირდება
          h(TooltipProvider, null, h(PlayerProvider, null, h(BookDetail, { book, onClose: () => {} }))),
        ),
      ),
    ),
  )
  await flush()
  await flush()
}

const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(label))

describe('BookDetail — გალერეა (§22)', () => {
  it('shows both stores under one gallery section with the web-search buttons', async () => {
    await mount(true)

    expect(document.body.textContent).toContain(i18n.t('books.galleryTitle'))
    expect(document.body.textContent).toContain(i18n.t('gallery.uploadedBadge'))
    expect(document.body.textContent).toContain(i18n.t('gallery.webBadge'))
    expect(document.querySelector('[data-testid="parent-gallery"]')).not.toBeNull()

    // ფოტოები `owner=book:5`-ით მოდის — იგივე ხედი, რაც გალერეის ბიბლიოთეკას აქვს
    expect(mocks.fetchGalleryPhotos).toHaveBeenCalledWith(expect.objectContaining({ owner: 'book:5' }))
    expect(mocks.fetchGalleryVideos).toHaveBeenCalledWith(expect.objectContaining({ owner: 'book:5' }))

    expect(button(i18n.t('web.searchPhotos'))).toBeDefined()
    expect(button(i18n.t('web.searchVideos'))).toBeDefined()
  })

  it('without the gallery module the web part says the module must be enabled', async () => {
    await mount(false)

    expect(document.querySelector('[data-testid="parent-gallery"]')).toBeNull()
    expect(document.querySelector('[data-testid="gallery-off"]')?.textContent).toContain(i18n.t('gallery.moduleOff'))
    expect(button(i18n.t('web.searchPhotos'))).toBeUndefined()
    expect(mocks.fetchGalleryPhotos).not.toHaveBeenCalled()
    // ატვირთული ფოტოების ბლოკი მაინც ადგილზეა
    expect(document.body.textContent).toContain(i18n.t('gallery.uploadedBadge'))
  })
})
