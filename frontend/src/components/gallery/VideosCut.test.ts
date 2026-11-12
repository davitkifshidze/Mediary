import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PlayerProvider } from '@/lib/player'
import type { GalleryVideo } from '@/api/gallery'
import i18n from '@/i18n'

/* ============================================================
   **გალერეის ვიდეოების ჭრილი — სამი საფეხური.**

   ⚠️ მოწმდება: ჯერ მოდულების დიდი ბარათები (რიცხვებით), მოდულზე დაჭერით — მისი
   ჩანაწერები, ჩანაწერზე დაჭერით — მისი ვიდეოები (`owner` სერვერზე მიდის), „უკან"
   წინა საფეხურზე აბრუნებს; ვიდეოს ბარათს ესკიზი, სათაური, არხი და ტექსტიანი
   ღილაკები აქვს; ძებნა ბრტყელ შედეგს აჩვენებს მფლობელის ჩიპით.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchGalleryVideos: vi.fn(),
  fetchGalleryVideoModules: vi.fn(),
  fetchGalleryVideoRecords: vi.fn(),
}))

vi.mock('@/api/gallery', async (original) => ({
  ...(await original<typeof import('@/api/gallery')>()),
  fetchGalleryVideos: mocks.fetchGalleryVideos,
  fetchGalleryVideoModules: mocks.fetchGalleryVideoModules,
  fetchGalleryVideoRecords: mocks.fetchGalleryVideoRecords,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

function video(id: number, title: string, owner: GalleryVideo['owner'], extra: Partial<GalleryVideo> = {}): GalleryVideo {
  return {
    id,
    url: `https://youtu.be/v${id}`,
    platform: 'youtube',
    external_id: `v${id}`,
    embed_url: `https://www.youtube-nocookie.com/embed/v${id}`,
    title,
    channel: 'Studio',
    duration: 125,
    published_at: '2024-02-01',
    thumbnail_url: null,
    source_url: null,
    source: 'youtube',
    sort_order: 0,
    created_at: null,
    owner,
    ...extra,
  }
}

const dune = [
  video(1, 'Trailer one', { kind: 'movie', id: 7, title: 'Dune' }),
  video(2, 'Trailer two', { kind: 'movie', id: 7, title: 'Dune' }),
]

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

async function mount(path = '/gallery/videos') {
  mocks.fetchGalleryVideoModules.mockResolvedValue([
    { kind: 'movie', videos: 2, records: 1, thumbnails: [] },
    { kind: 'actor', videos: 1, records: 1, thumbnails: [] },
  ])
  mocks.fetchGalleryVideoRecords.mockResolvedValue({
    data: [{ kind: 'movie', id: 7, videos: 2, thumbnail: null, title: 'Dune', title_ka: null }],
    meta: { page: 1, per_page: 24, total: 1, last_page: 1 },
  })
  mocks.fetchGalleryVideos.mockResolvedValue({ data: dune, meta: { page: 1, per_page: 24, total: 2, last_page: 1 } })

  const { VideosCut } = await import('@/components/gallery/VideosCut')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: [path] },
        h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(PlayerProvider, null, h(VideosCut)))),
      ),
    ),
  )
  await flush()
  await flush()
  return container
}

const cards = () => [...document.querySelectorAll<HTMLElement>('[data-testid="gallery-video-card"]')]
const button = (scope: ParentNode, label: string) =>
  [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)

describe('VideosCut', () => {
  it('starts with the modules, then a module’s records, then a record’s videos', async () => {
    const el = await mount()

    // 1. მოდულების დიდი ბარათები — რიცხვებით; ვიდეოები ჯერ არ იტვირთება
    const modules = [...el.querySelectorAll<HTMLButtonElement>('[data-testid="video-modules"] button[data-kind="card"]')]
    expect(modules.map((card) => card.dataset.module)).toEqual(['movie', 'actor'])
    expect(modules[0].textContent).toContain(i18n.t('gallery.videoLevels.moduleCount', { videos: 2, records: 1 }))
    expect(mocks.fetchGalleryVideos).not.toHaveBeenCalled()

    // 2. მოდულის ჩანაწერები
    await act(async () => modules[0].click())
    await flush()
    await flush()
    expect(mocks.fetchGalleryVideoRecords).toHaveBeenCalledWith(expect.objectContaining({ type: 'movie', page: 1 }))
    const records = [...el.querySelectorAll<HTMLButtonElement>('[data-testid="video-records"] button[data-kind="card"]')]
    expect(records).toHaveLength(1)
    expect(records[0].textContent).toContain('Dune')
    expect(records[0].textContent).toContain(i18n.t('gallery.videoLevels.videoCount', { count: 2 }))

    // 3. ჩანაწერის ვიდეოები — მფლობელი სერვერზე მიდის, სათაური ზემოთაა
    await act(async () => records[0].click())
    await flush()
    await flush()
    expect(mocks.fetchGalleryVideos).toHaveBeenLastCalledWith(expect.objectContaining({ owner: 'movie:7', sort: 'new' }))
    expect(cards()).toHaveLength(2)
    expect(el.querySelector('[data-testid="video-crumbs"] h2')?.textContent).toBe('Dune')
    // ჩანაწერის საფეხურზე მფლობელის ჩიპი ზედმეტია
    expect(el.querySelector('[data-testid="video-owner"]')).toBeNull()

    // „უკან" — ჩანაწერებზე, მერე მოდულებზე
    await act(async () => el.querySelector<HTMLButtonElement>('[data-testid="video-crumbs"] button')!.click())
    await flush()
    expect(el.querySelector('[data-testid="video-records"]')).not.toBeNull()
    await act(async () => el.querySelector<HTMLButtonElement>('[data-testid="video-crumbs"] button')!.click())
    await flush()
    expect(el.querySelector('[data-testid="video-modules"]')).not.toBeNull()
  })

  it('draws a video card with title, channel and text buttons, and opens a record from its link', async () => {
    await mount('/gallery/videos?module=movie&record=7')

    expect(cards()).toHaveLength(2)
    const first = cards()[0]
    expect(first.querySelector('h3')?.textContent).toBe('Trailer one')
    expect(first.textContent).toContain('Studio')
    expect(first.querySelector('button.aspect-video')).not.toBeNull()
    expect(button(first, i18n.t('playback.play'))).toBeDefined()
    expect(button(first, i18n.t('gallery.videoOwnerRecord'))).toBeDefined()
    // წაშლა ზოლში არ არის — კონტექსტურ მენიუშია
    expect(button(first, i18n.t('actions.delete'))).toBeUndefined()
    // პირდაპირ ბმულით გახსნილზე სათაური ვიდეოდან მოდის
    expect(document.querySelector('[data-testid="video-crumbs"] h2')?.textContent).toBe('Dune')
  })

  it('search shows a flat result with the owner chip', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const el = await mount()
      const input = el.querySelector<HTMLInputElement>('input')!
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!

      await act(async () => {
        setter.call(input, 'trailer')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await act(async () => {
        vi.advanceTimersByTime(400)
      })
      await flush()
      await flush()

      expect(mocks.fetchGalleryVideos).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'trailer', owner: undefined }))
      expect(cards()).toHaveLength(2)
      expect(cards()[0].querySelector('[data-testid="video-owner"]')?.textContent).toContain('Dune')
    } finally {
      vi.useRealTimers()
    }
  })
})
