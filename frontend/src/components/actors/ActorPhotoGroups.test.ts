import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { GalleryAnyImage, GalleryImage } from '@/api/gallery'
import i18n from '@/i18n'

/* ============================================================
   **მსახიობის ფოტოები სათაურის მიხედვით** და ხედის გადამრთველი.

   ⚠️ მოწმდება: დასტა თითო სათაურზე, „პორტრეტები" და „სხვა"; დასტაზე დაჭერა დიდ ფანჯარას
   ხსნის **იმ ჯგუფის** ფოტოებით და არჩეული ხედით; ხედის არჩევანი ბრაუზერს ახსოვს.
   ============================================================ */

// ბადე თავის ტესტებშია — აქ მხოლოდ ის მოწმდება, რა გადაეცა
vi.mock('@/components/ui/photo-grid', () => ({
  PhotoGrid: ({ items, view }: { items: { id: number }[]; view?: string }) =>
    h('div', { 'data-testid': 'photo-grid', 'data-view': view, 'data-ids': items.map((item) => item.id).join(',') }),
}))
vi.mock('@/components/gallery/GalleryMoveDialog', () => ({ GalleryMoveDialog: () => null }))
vi.mock('@/components/gallery/AlbumUnlockById', () => ({ AlbumUnlockById: () => null }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeAll(async () => {
  await import('@/components/actors/ActorPhotoGroups')
}, 60_000)
vi.setConfig({ testTimeout: 15_000 })

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  window.localStorage.clear()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const photo = (id: number, over: Partial<GalleryImage> = {}): GalleryImage => ({
  id,
  url: `gallery/images/${id}.jpg`,
  original_name: null,
  mime: 'image/jpeg',
  size: 100,
  created_at: null,
  source: 'tmdb',
  source_url: null,
  is_thumbnail: false,
  category: 'backdrop',
  album_id: null,
  width: 100,
  height: 50,
  ...over,
})

async function render(node: ReturnType<typeof h>) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root!.render(h(MemoryRouter, null, h(TooltipProvider, null, node))))
  await flush()

  return container
}

describe('ActorPhotoGroups', () => {
  it('stacks photos by title and opens a stack in a large window', async () => {
    const { ActorPhotoGroups } = await import('@/components/actors/ActorPhotoGroups')
    const images: GalleryAnyImage[] = [
      photo(1, { origin: { type: 'movie', tmdb_id: 550, title: 'Fight Club' } }),
      photo(2, { origin: { type: 'movie', tmdb_id: 550, title: 'Fight Club' } }),
      photo(3, { category: 'actor' }),
      photo(4),
    ]
    const box = await render(h(ActorPhotoGroups, { images, view: 'small' }))

    const groups = [...box.querySelectorAll('[data-testid="actor-photo-groups"] > li')]
    expect(groups.map((group) => group.getAttribute('data-group'))).toEqual(['movie:550', 'portraits', 'other'])
    expect(groups[0].textContent).toContain('Fight Club')
    expect(groups[0].textContent).toContain(i18n.t('gallery.photos', { count: 2 }))
    expect(groups[1].textContent).toContain(i18n.t('actorPhotos.group.portraits'))
    expect(groups[2].textContent).toContain(i18n.t('actorPhotos.group.other'))
    // ფანჯარა ჯერ დახურულია
    expect(document.querySelector('[data-testid="actor-photo-group-dialog"]')).toBeNull()

    await act(async () => groups[0].querySelector<HTMLElement>('button, [role="button"]')!.click())
    await flush()

    const grid = document.querySelector('[data-testid="actor-photo-group-dialog"] [data-testid="photo-grid"]')!
    // მხოლოდ ამ სათაურის ფოტოები, არჩეული ხედით
    expect(grid.getAttribute('data-ids')).toBe('1,2')
    expect(grid.getAttribute('data-view')).toBe('small')
  })
})

describe('PhotoViewToggle', () => {
  it('switches between large, small and rows and remembers the choice', async () => {
    const { PhotoViewToggle, usePhotoView } = await import('@/components/ui/photo-view')
    const Probe = () => {
      const [view, setView] = usePhotoView()

      return h('div', { 'data-view': view }, h(PhotoViewToggle, { value: view, onChange: setView }))
    }
    const box = await render(h(Probe))

    expect(box.querySelector('[data-view]')!.getAttribute('data-view')).toBe('large')

    const rows = box.querySelector<HTMLButtonElement>(`button[aria-label="${i18n.t('photos.view.rows')}"]`)!
    await act(async () => rows.click())

    expect(box.querySelector('[data-view]')!.getAttribute('data-view')).toBe('rows')
    expect(rows.getAttribute('aria-pressed')).toBe('true')
    expect(window.localStorage.getItem('photo-grid.view')).toBe('rows')
  })
})
