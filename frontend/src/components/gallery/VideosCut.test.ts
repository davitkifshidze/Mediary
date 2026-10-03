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
   **გალერეის ვიდეოების გვერდი — თავიდან** (Tasks §25.5/§25.8).

   ⚠️ მოწმდება: ვერტიკალური ბარათები ესკიზით, ორხაზიანი სათაურით, არხით და
   მფლობელის ჩიპით; ღილაკები ტექსტით; „მფლობელი" ჭრილი სერვერს `owner_type`-ს
   უგზავნის; „ჩანაწერის მიხედვით" დაჯგუფება სექციებს აკეთებს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchGalleryVideos: vi.fn(),
}))

vi.mock('@/api/gallery', async (original) => ({
  ...(await original<typeof import('@/api/gallery')>()),
  fetchGalleryVideos: mocks.fetchGalleryVideos,
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

const items = [
  video(1, 'Trailer one', { kind: 'movie', id: 7, title: 'Dune' }),
  video(2, 'Trailer two', { kind: 'movie', id: 7, title: 'Dune' }),
  video(3, 'Interview', { kind: 'actor', id: 3, title: 'Zendaya' }),
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

async function mount() {
  mocks.fetchGalleryVideos.mockResolvedValue({ data: items, meta: { page: 1, per_page: 24, total: 3, last_page: 1 } })
  const { VideosCut } = await import('@/components/gallery/VideosCut')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        null,
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

describe('VideosCut (§25.5)', () => {
  it('draws vertical cards with title, channel, owner chip and text buttons', async () => {
    await mount()

    expect(cards()).toHaveLength(3)
    const first = cards()[0]
    expect(first.querySelector('h3')?.textContent).toBe('Trailer one')
    expect(first.textContent).toContain('Studio')
    expect(first.querySelector('[data-testid="video-owner"]')?.textContent).toContain('Dune')
    expect(first.querySelector('button.aspect-video')).not.toBeNull()
    expect(button(first, i18n.t('playback.play'))).toBeDefined()
    expect(button(first, i18n.t('gallery.videoOwnerRecord'))).toBeDefined()
    // წაშლა ზოლში აღარ არის — კონტექსტურ მენიუშია
    expect(button(first, i18n.t('actions.delete'))).toBeUndefined()

    expect(mocks.fetchGalleryVideos).toHaveBeenCalledWith(expect.objectContaining({ page: 1, per_page: 24, sort: 'new' }))
  })

  it('the owner filter is sent to the server and grouping splits the page by owner', async () => {
    const el = await mount()

    await act(async () => button(el, i18n.t('gallery.videoOwnerActor'))!.click())
    await flush()
    expect(mocks.fetchGalleryVideos).toHaveBeenLastCalledWith(expect.objectContaining({ owner_type: 'actor' }))

    await act(async () => button(el, i18n.t('gallery.videoByOwner'))!.click())
    await flush()
    const headings = [...el.querySelectorAll('section > h3')].map((n) => n.textContent ?? '')
    expect(headings.some((x) => x.includes('Dune') && x.includes('2'))).toBe(true)
    expect(headings.some((x) => x.includes('Zendaya'))).toBe(true)
  })
})
