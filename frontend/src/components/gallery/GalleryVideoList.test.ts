import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import { PlayerProvider } from '@/lib/player'
import type { GalleryVideo } from '@/api/gallery'
import i18n from '@/i18n'

/* ============================================================
   **ჩანაწერის ვიდეო-ბმულები — პატარა ბარათები**.

   ⚠️ მოწმდება: ერთი ვიდეო — ერთი ბარათი (პირველი დიდ ფლეიერად აღარ იხატება);
   დიდი ადგილი მხოლოდ „ნახვაზე" ჩნდება; ჩაუშენებელი პლატფორმა ბმულით იხსნება;
   „რედაქტირება" მხოლოდ სათაურსა და არხს აგზავნის (ცარიელი — `null`);
   ცარიელი სია ქრება, ცალკე სექციად კი ცარიელ მდგომარეობას და ღილაკს აჩვენებს.
   ============================================================ */

const video = (id: number, extra: Partial<GalleryVideo> = {}): GalleryVideo => ({
  id,
  url: `https://youtu.be/v${id}`,
  platform: 'youtube',
  external_id: `v${id}`,
  embed_url: `https://www.youtube-nocookie.com/embed/v${id}`,
  title: `Video ${id}`,
  channel: 'Channel',
  duration: 95,
  published_at: null,
  thumbnail_url: `https://i.ytimg.com/vi/v${id}/hq.jpg`,
  source_url: null,
  source: 'web',
  sort_order: id,
  created_at: null,
  owner: { kind: 'bookmark', id: 5 },
  ...extra,
})

const mocks = vi.hoisted(() => ({
  updateGalleryVideo: vi.fn(),
  deleteGalleryVideo: vi.fn(),
}))

vi.mock('@/api/gallery', async (original) => ({
  ...(await original<typeof import('@/api/gallery')>()),
  updateGalleryVideo: mocks.updateGalleryVideo,
  deleteGalleryVideo: mocks.deleteGalleryVideo,
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
  await import('@/components/gallery/GalleryVideoList')
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
  vi.restoreAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(videos: GalleryVideo[], props: Record<string, unknown> = {}) {
  const { GalleryVideoList } = await import('@/components/gallery/GalleryVideoList')
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
          h(TooltipProvider, null, h(FeedbackProvider, null, h(PlayerProvider, null, h(GalleryVideoList, { videos, ...props })))),
        ),
      ),
    ),
  )
  await flush()
  return container
}

const cards = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[data-testid="gallery-video"]')]
/** ქვედა რიგის ღილაკები — ესკიზი (`data-kind="tile"`) მათში არ ითვლება */
const labels = (card: HTMLElement) => [...card.querySelectorAll('button:not([data-kind])')].map((b) => b.textContent?.trim())

describe('GalleryVideoList', () => {
  it('draws one small card per video with watch, edit and delete — and no big player up front', async () => {
    const el = await mount([video(1), video(2), video(3)])

    expect(cards(el)).toHaveLength(3)
    expect(el.querySelector('[data-testid="count-badge"]')?.textContent).toBe('3')
    expect(labels(cards(el)[0])).toEqual([i18n.t('gallery.videoWatch'), i18n.t('actions.edit'), i18n.t('actions.delete')])
    expect(el.querySelector('[data-player-spot]')).toBeNull()
  })

  it('"watch" opens the big player spot above the list', async () => {
    const el = await mount([video(1), video(2)])

    await act(async () => cards(el)[1].querySelector<HTMLButtonElement>('[data-testid="gallery-video-watch"]')!.click())
    await flush()

    expect(el.querySelector('[data-player-spot]')).not.toBeNull()
    // სია რჩება — ყველა ბარათი ისევ თავის ადგილზეა
    expect(cards(el)).toHaveLength(2)
  })

  it('a platform that cannot be embedded opens its link instead of the player', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const el = await mount([video(1, { embed_url: null, platform: 'other', url: 'https://example.com/clip' })])

    const watch = cards(el)[0].querySelector<HTMLButtonElement>('[data-testid="gallery-video-watch"]')!
    expect(watch.textContent?.trim()).toBe(i18n.t('actions.openLink'))
    await act(async () => watch.click())
    await flush()

    expect(open).toHaveBeenCalledWith('https://example.com/clip', '_blank', 'noreferrer')
    expect(el.querySelector('[data-player-spot]')).toBeNull()
  })

  it('"edit" saves the title and the channel only — an emptied field goes as null', async () => {
    mocks.updateGalleryVideo.mockResolvedValue(video(1, { title: 'ოფიციალური თრეილერი', channel: null }))
    const onChanged = vi.fn()
    const el = await mount([video(1)], { onChanged })

    await act(async () => cards(el)[0].querySelector<HTMLButtonElement>('[data-testid="gallery-video-edit"]')!.click())
    await flush()

    const form = document.querySelector<HTMLFormElement>('[data-testid="gallery-video-form"]')!
    const [title, channel] = [...form.querySelectorAll<HTMLInputElement>('input')]
    expect(title.value).toBe('Video 1')
    expect(channel.value).toBe('Channel')
    // ბმული ჩანს, მაგრამ ველი არ არის — ის არ იცვლება
    expect(form.textContent).toContain('https://youtu.be/v1')
    expect(form.querySelectorAll('input')).toHaveLength(2)

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(title, ' ოფიციალური თრეილერი ')
      title.dispatchEvent(new Event('input', { bubbles: true }))
      setter.call(channel, '')
      channel.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => form.querySelector<HTMLButtonElement>('button[type="submit"]')!.click())
    await flush()

    expect(mocks.updateGalleryVideo).toHaveBeenCalledWith(1, { title: 'ოფიციალური თრეილერი', channel: null })
    expect(onChanged).toHaveBeenCalled()
    expect(document.querySelector('[data-testid="gallery-video-form"]')).toBeNull()
  })

  it('an empty list disappears, but a standalone section stays with an empty state and its button', async () => {
    const el = await mount([])
    expect(el.querySelector('[data-testid="gallery-videos"]')).toBeNull()

    act(() => root?.unmount())
    container?.remove()

    const standalone = await mount([], { standalone: true, action: h('button', { type: 'button' }, 'find') })
    expect(standalone.querySelector('[data-testid="gallery-videos"]')).not.toBeNull()
    expect(standalone.textContent).toContain(i18n.t('gallery.noVideos'))
    // ღილაკი ერთხელ — ცარიელ მდგომარეობაში და არა სათაურის გვერდითაც
    expect([...standalone.querySelectorAll('button')].filter((b) => b.textContent === 'find')).toHaveLength(1)
  })
})
