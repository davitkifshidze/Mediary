import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { PhotoPlacement } from '@/api/gallery'
import i18n from '@/i18n'

/* ============================================================
   **ფოტოს გადატანა — „ახლა სად არის" და მხოლოდ აზრიანი მოქმედებები.**

   ⚠️ მოწმდება: ფანჯარა ზემოთ წერს ფოტოს ამჟამინდელ ადგილს (ჩანაწერი · ალბომი);
   „ჩანაწერიდან მოხსნა" მხოლოდ ჩანაწერზე მიბმულ ფოტოზე ჩანს და ქვეშ წერს, სად
   იპოვი ფოტოს მერე; „ალბომიდან ამოღება" — მხოლოდ ალბომში მყოფზე; ნაგულისხმევი
   არაფერს ცვლის (ღილაკი გამორთულია ცხად არჩევანამდე); ალბომის წაშლის ფანჯარა
   ჩაკეტილ ალბომზე ნაგულისხმევად ფოტოებს ურნაში აყოლებს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchPhotoPlacement: vi.fn(),
  moveGalleryImages: vi.fn(),
  fetchGalleryAlbums: vi.fn(),
  fetchGalleryGroups: vi.fn(),
  deleteGalleryAlbum: vi.fn(),
}))

vi.mock('@/api/gallery', async (original) => ({
  ...(await original<typeof import('@/api/gallery')>()),
  ...mocks,
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => MODULES,
}))

const MOVIE = { key: 'movie', name_ka: 'ფილმები', name_en: 'Movies', route_base: '/movies', icon: 'Film', color: null }
const MODULES = { all: [MOVIE], enabled: [MOVIE] }

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

beforeAll(async () => {
  await import('@/components/gallery/GalleryMoveDialog')
  await import('@/components/gallery/AlbumDeleteDialog')
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

async function render(node: ReturnType<typeof h>) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root!.render(h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, node))))
  await flush()
  await flush()
}

async function mountMove(placement: PhotoPlacement) {
  mocks.fetchPhotoPlacement.mockResolvedValue(placement)
  mocks.fetchGalleryAlbums.mockResolvedValue([
    { id: 4, name: 'მოგზაურობა', description: null, sort_order: 1, photos: 3, locked: false, unlocked: false, visibility: 'private' },
  ])
  mocks.moveGalleryImages.mockResolvedValue({ moved: 1 })
  const { GalleryMoveDialog } = await import('@/components/gallery/GalleryMoveDialog')
  await render(h(GalleryMoveDialog, { ids: [5], onClose: () => {} }))
}

const text = () => document.body.textContent ?? ''
const radio = (value: string) => document.querySelector<HTMLButtonElement>(`button[role="radio"][value="${value}"]`)
const moveButton = () =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === i18n.t('gallery.move')) as HTMLButtonElement

describe('GalleryMoveDialog', () => {
  it('says where the photo is now and offers detaching with a note about where it goes', async () => {
    await mountMove({
      total: 1,
      attached: 1,
      in_album: 0,
      record: { kind: 'movie', id: 7, title: 'Alien', title_ka: null },
      album: null,
    })

    const now = document.querySelector('[data-testid="move-now"]')!
    expect(now.textContent).toContain(i18n.t('gallery.moveNow.title'))
    expect(now.textContent).toContain('Alien')
    expect(now.textContent).toContain(i18n.t('gallery.moveNow.albumNone'))

    // ნაგულისხმევი არაფერს ცვლის — ღილაკი გამორთულია ცხად არჩევანამდე
    expect(radio('keep')?.getAttribute('aria-checked')).toBe('true')
    expect(moveButton().disabled).toBe(true)

    // ფოტო ალბომში არ არის — „ალბომიდან ამოღება" ზედმეტია
    expect(text()).not.toContain(i18n.t('gallery.moveAlbumNone'))

    // მოხსნა: ქვეშ წერია, სად იპოვი ფოტოს — ალბომის გარეშე „მიუბმელში"
    await act(async () => radio('none')!.click())
    expect(document.querySelector('[data-testid="move-detach-note"]')?.textContent).toBe(i18n.t('gallery.moveDetachToLoose'))
    expect(moveButton().disabled).toBe(false)

    await act(async () => moveButton().click())
    await flush()
    expect(mocks.moveGalleryImages).toHaveBeenCalledWith({ ids: [5], target: 'none' })
  })

  it('hides detaching for a photo on no record and offers leaving the album only when it is in one', async () => {
    await mountMove({ total: 1, attached: 0, in_album: 1, record: null, album: { id: 4, name: 'მოგზაურობა' } })

    const now = document.querySelector('[data-testid="move-now"]')!
    expect(now.textContent).toContain(i18n.t('gallery.moveNow.recordNone'))
    expect(now.textContent).toContain(i18n.t('gallery.moveNow.album', { name: 'მოგზაურობა' }))

    expect(radio('none')).toBeNull()
    expect(text()).toContain(i18n.t('gallery.moveAlbumNone'))
    // ინტერფეისში „მშობელი" აღარ იწერება
    expect(text()).not.toContain('მშობ')
  })
})

describe('AlbumDeleteDialog', () => {
  const album = { id: 9, name: 'საიდუმლო', description: null, sort_order: 1, photos: 62, locked: true, unlocked: true, visibility: 'private' as const }
  const other = { ...album, id: 4, name: 'მოგზაურობა', locked: false }

  async function mountDelete() {
    mocks.deleteGalleryAlbum.mockResolvedValue(undefined)
    const onDeleted = vi.fn()
    const { AlbumDeleteDialog } = await import('@/components/gallery/AlbumDeleteDialog')
    await render(h(AlbumDeleteDialog, { album, photos: 62, others: [other], onClose: () => {}, onDeleted }))

    return onDeleted
  }

  const confirm = () => document.querySelector<HTMLButtonElement>('[data-testid="album-delete-confirm"]')!

  it('sends the photos to the trash with the album unless something else is chosen', async () => {
    const onDeleted = await mountDelete()

    expect(document.querySelector('[data-testid="album-delete-count"]')?.textContent).toContain('62')
    expect(radio('trash')?.getAttribute('aria-checked')).toBe('true')

    await act(async () => confirm().click())
    await flush()

    expect(mocks.deleteGalleryAlbum).toHaveBeenCalledWith(9, { photos: 'trash', moveTo: null })
    expect(onDeleted).toHaveBeenCalled()
  })

  it('needs a target album before moving, and unlocking is an explicit choice', async () => {
    await mountDelete()

    await act(async () => radio('move')!.click())
    expect(confirm().disabled).toBe(true)

    await act(async () => radio('release')!.click())
    expect(confirm().disabled).toBe(false)
    await act(async () => confirm().click())
    await flush()

    expect(mocks.deleteGalleryAlbum).toHaveBeenCalledWith(9, { photos: 'release', moveTo: null })
  })
})
