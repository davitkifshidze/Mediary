import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Video } from '@/api/videos'
import { PlayerProvider, usePlayer, videoItem } from '@/lib/player'
import i18n from '@/i18n'

/* ============================================================
   ვიდეოს დეტალები — დაკვრა მხოლოდ აპის დამკვრელში.

   ⚠️ აქ ფანჯარას **საკუთარი ჩაშენება ჰქონდა** (`VideoEmbed`) და გლობალურ
   დამკვრელთან ერთად ორივე ჟღერდა. ტესტი იმას პინავს, რასაც ვერც ტიპი
   ხედავს და ვერც backend-ი: ფანჯარაში ფრეიმი **საერთოდ არ იხატება**.
   „დაკვრა" ვიდეოს გვერდს გადასცემს და ფანჯარა **ღია რჩება**: ესკიზი
   დამკვრელის ადგილია (`inline`); „გატანა" მას მოტივტივე ჩარჩოში (ვიწროზე —
   ზოლში) გადაიტანს, ესკიზი კი „აქ დაბრუნებას" გვთავაზობს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchVideoFiles: vi.fn(),
  fetchVideoNotes: vi.fn(),
  fetchSimilarVideos: vi.fn(),
  markVideoWatched: vi.fn(),
  markSongPlayed: vi.fn(),
}))

vi.mock('@/api/videos', async (original) => ({
  ...(await original<typeof import('@/api/videos')>()),
  fetchVideoFiles: mocks.fetchVideoFiles,
  fetchVideoNotes: mocks.fetchVideoNotes,
  fetchSimilarVideos: mocks.fetchSimilarVideos,
  markVideoWatched: mocks.markVideoWatched,
}))
vi.mock('@/api/songs', async (original) => ({
  ...(await original<typeof import('@/api/songs')>()),
  markSongPlayed: mocks.markSongPlayed,
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
    description: 'About players',
    channel: 'Studio',
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
    download_status: null,
    download_size: 0,
    download_format: null,
    download_name: null,
    download_error: null,
    downloaded_at: null,
    download_stale: false,
    ...extra,
  }
}

let root: Root | null = null
let container: HTMLDivElement | null = null
let api: ReturnType<typeof usePlayer> | null = null

function Grab() {
  api = usePlayer()
  return null
}

beforeEach(() => {
  mocks.fetchVideoFiles.mockResolvedValue([])
  mocks.fetchVideoNotes.mockResolvedValue([])
  mocks.fetchSimilarVideos.mockResolvedValue([])
  mocks.markVideoWatched.mockResolvedValue(undefined)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  api = null
  vi.clearAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(subject: Video, props: { onPlay: () => void; onClose: () => void }, playFirst = false) {
  const { VideoDetail } = await import('@/components/VideoDetail')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root!.render(
      h(QueryClientProvider, {
        client: qc,
        children: h(TooltipProvider, {
          children: h(PlayerProvider, {
            children: [
              h(Grab, { key: 'grab' }),
              h(VideoDetail, { key: 'detail', video: subject, onClose: props.onClose, onPlay: props.onPlay }),
            ],
          }),
        }),
      }),
    )
  })
  await flush()

  if (playFirst) {
    await act(async () => api!.play([videoItem(subject)], 0))
    await flush()
  }
}

const buttonWith = (key: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t(key)))
const spotButton = () => document.querySelector<HTMLButtonElement>('[data-player-spot] button')

describe('VideoDetail — დაკვრა დამკვრელშია', () => {
  it('ფანჯარა საკუთარ ფრეიმს არ ხატავს; „დაკვრა" ვიდეოს გადასცემს და ფანჯარა ღია რჩება', async () => {
    const onPlay = vi.fn()
    const onClose = vi.fn()
    const subject = video()
    await mount(subject, { onPlay, onClose })

    // ⚠️ ორი ხმა ერთდროულად სწორედ აქედან იყო — ფრეიმი ფანჯარაში აღარ არის
    expect(document.querySelector('iframe')).toBeNull()

    await act(async () => spotButton()!.click())

    expect(onPlay).toHaveBeenCalledWith(subject)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ამ ფანჯარაში მყოფი ვიდეო ესკიზზე ჯდება; „გატანა" და „აქ დაბრუნება"', async () => {
    const onClose = vi.fn()
    await mount(video(), { onPlay: vi.fn(), onClose }, true)

    // ესკიზი დამკვრელის ადგილია — მასზე ღილაკი აღარ არის
    expect(api!.layout).toBe('inline')
    expect(spotButton()).toBeNull()

    await act(async () => buttonWith('playback.popOut')!.click())
    await flush()
    // jsdom-ს `matchMedia` არ აქვს → ვიწრო ეკრანი → მოტივტივე ჩარჩოს ნაცვლად ზოლი
    expect(api!.popped).toBe(true)
    expect(api!.layout).toBe('bar')
    expect(spotButton()?.textContent).toContain(i18n.t('playback.inFrame'))
    expect(buttonWith('playback.popOut')).toBeUndefined()

    await act(async () => spotButton()!.click())
    await flush()
    expect(api!.layout).toBe('inline')
    expect(api!.playing).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('სათაურის ქვეშ სამი ბეჯია და „რედაქტირება" გვერდს გადასცემს', async () => {
    const { VideoDetail } = await import('@/components/VideoDetail')
    const onEdit = vi.fn()
    const subject = video({
      type: { id: 1, key: 'fun', name_ka: 'გასართობი', name_en: 'Entertainment', icon: 'Clapperboard', color: 'c8', sort_order: 1 },
      status: { id: 2, key: 'to_watch', module: 'video', name_ka: 'სანახავი', name_en: 'To watch', role: 'todo', icon: null, color: null, is_default: true, sort_order: 0 },
    })

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root!.render(
        h(QueryClientProvider, {
          client: qc,
          children: h(TooltipProvider, {
            children: h(PlayerProvider, {
              children: h(VideoDetail, { video: subject, onClose: vi.fn(), onPlay: vi.fn(), onEdit }),
            }),
          }),
        }),
      )
    })
    await flush()

    const row = [...document.querySelectorAll<HTMLElement>('[data-testid="video-badges"] > *')]
    expect(row).toHaveLength(3)
    expect(row[0].textContent).toContain('გასართობი')
    expect(row[1].textContent).toContain('სანახავი')
    expect(row[2].textContent).toContain('YouTube')

    await act(async () => buttonWith('actions.edit')!.click())
    expect(onEdit).toHaveBeenCalledWith(subject)
  })

  it('რჩეული · „საჯარო" · რედაქტირება — ერთი სიმაღლე, h-9', async () => {
    const { VideoDetail } = await import('@/components/VideoDetail')

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root!.render(
        h(QueryClientProvider, {
          client: qc,
          children: h(TooltipProvider, {
            children: h(PlayerProvider, {
              children: h(VideoDetail, { video: video({ visibility: 'public' }), onClose: vi.fn(), onPlay: vi.fn(), onEdit: vi.fn() }),
            }),
          }),
        }),
      )
    })
    await flush()

    const favorite = document.querySelector<HTMLElement>(`button[aria-label="${i18n.t('actions.favorite')}"]`)!
    const visibility = [...document.querySelectorAll<HTMLElement>('span')].find((s) => s.textContent === i18n.t('visibility.public'))!
    const edit = buttonWith('actions.edit')!
    // „ბმულის გახსნა" ბარათის ზოლიდან აქ გადმოვიდა
    const link = document.querySelector<HTMLAnchorElement>('[data-testid="video-open-link"]')!
    expect(link.getAttribute('href')).toBe('https://youtu.be/talk')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.textContent).toContain(i18n.t('actions.openLink'))

    // ადრე: რჩეული `xs` (28 px), „საჯარო" ~20 px, რედაქტირება `sm` (36 px)
    for (const el of [favorite, visibility, edit, link]) expect(el.className).toContain('h-9')
    expect(favorite.className).not.toContain('h-7')
  })

  it('ჩაუშენებელი წყარო ბმულად რჩება და დაკვრას არ გვთავაზობს', async () => {
    await mount(video({ platform: 'other', embed_url: null, url: 'https://example.com/v' }), {
      onPlay: vi.fn(),
      onClose: vi.fn(),
    })

    expect(document.querySelector('[data-player-spot]')).toBeNull()
    const link = [...document.querySelectorAll('a')].find((a) => a.textContent?.includes(i18n.t('videos.openExternal')))
    expect(link?.getAttribute('href')).toBe('https://example.com/v')
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('ფანჯრის გახსნა ნახვად არ ითვლება', async () => {
    await mount(video(), { onPlay: vi.fn(), onClose: vi.fn() })
    expect(mocks.markVideoWatched).not.toHaveBeenCalled()
  })
})
