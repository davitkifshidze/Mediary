import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Video } from '@/api/videos'
import i18n from '@/i18n'

/* ============================================================
   **ლოკალური ასლის ფლეერი** (Tasks §21.2/§21.5).

   ⚠️ მოწმდება: HTML5 `<video>` `videoDownloadUrl`-ით (არა iframe, არა საერთო
   დამკვრელი), ზომა/ფორმატი და „წყარო" ბმული ჩანს, ჩართვა ნახვას **ერთხელ**
   ითვლის, „ფაილის წაშლა" დადასტურებით შლის და ფანჯარას ხურავს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  markVideoWatched: vi.fn(),
  deleteVideoDownload: vi.fn(),
  confirm: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/videos', async (original) => ({
  ...(await original<typeof import('@/api/videos')>()),
  markVideoWatched: mocks.markVideoWatched,
  deleteVideoDownload: mocks.deleteVideoDownload,
}))

vi.mock('@/components/ui/feedback', async (original) => ({
  ...(await original<typeof import('@/components/ui/feedback')>()),
  useConfirm: () => mocks.confirm,
  useToast: () => ({ toast: mocks.toast, dismiss: () => {} }),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

function video(extra: Partial<Video> = {}): Video {
  return {
    id: 7,
    title: 'Talk',
    description: null,
    channel: null,
    published_at: null,
    type_id: null,
    type: null,
    status: null,
    visibility: 'private',
    url: 'https://youtu.be/talk',
    platform: 'youtube',
    external_id: 'talk',
    embed_url: 'https://www.youtube-nocookie.com/embed/talk',
    thumbnail: null,
    duration: 610,
    tags: [],
    is_favorite: false,
    watch_count: 0,
    watched_at: null,
    created_at: null,
    download_status: 'ready',
    download_size: 329 * 1024 * 1024,
    download_format: '1920x1080 · MP4',
    download_name: 'talk.mp4',
    download_error: null,
    downloaded_at: '2026-10-01T10:00:00+04:00',
    download_stale: false,
    ...extra,
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

async function mount(subject = video()) {
  mocks.markVideoWatched.mockResolvedValue(undefined)
  mocks.deleteVideoDownload.mockResolvedValue(subject)
  const onClose = vi.fn()
  const onRemoved = vi.fn()
  const { LocalVideoPlayer } = await import('@/components/LocalVideoPlayer')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(LocalVideoPlayer, { video: subject, onClose, onRemoved }))),
    ),
  )
  await flush()
  return { onClose, onRemoved }
}

const player = () => document.querySelector<HTMLVideoElement>('video[data-testid="local-video"]')

describe('LocalVideoPlayer', () => {
  it('plays the private file in an HTML5 video with the facts and the source link', async () => {
    await mount()

    expect(document.querySelector('iframe')).toBeNull()
    expect(player()?.getAttribute('src')).toContain('/api/videos/7/download')
    expect(player()?.hasAttribute('controls')).toBe(true)
    expect(document.body.textContent).toContain('329.0 MB')
    expect(document.body.textContent).toContain('1920x1080 · MP4')
    const source = [...document.querySelectorAll('a')].find((a) => a.textContent?.includes(i18n.t('videos.source')))
    expect(source?.getAttribute('href')).toBe('https://youtu.be/talk')
  })

  it('counts a watch once on play', async () => {
    await mount()

    await act(async () => {
      player()!.dispatchEvent(new Event('play'))
      player()!.dispatchEvent(new Event('play'))
    })
    await flush()

    expect(mocks.markVideoWatched).toHaveBeenCalledTimes(1)
    expect(mocks.markVideoWatched).toHaveBeenCalledWith(7)
  })

  it('deletes the file after confirmation and closes', async () => {
    mocks.confirm.mockResolvedValue(true)
    const { onClose, onRemoved } = await mount()

    const remove = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('videos.local.remove')))
    await act(async () => remove!.click())
    await flush()
    await flush()

    expect(mocks.confirm).toHaveBeenCalled()
    expect(mocks.deleteVideoDownload).toHaveBeenCalledWith(7)
    expect(onRemoved).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('a declined confirmation keeps the file', async () => {
    mocks.confirm.mockResolvedValue(false)
    const { onClose } = await mount()

    const remove = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('videos.local.remove')))
    await act(async () => remove!.click())
    await flush()

    expect(mocks.deleteVideoDownload).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
