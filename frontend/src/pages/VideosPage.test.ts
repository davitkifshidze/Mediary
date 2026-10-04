import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import { PlayerProvider } from '@/lib/player'
import type { Status } from '@/api/types'
import type { Video, VideoMetadata } from '@/api/videos'
import i18n from '@/i18n'

/* ============================================================
   **ვიდეოს ფორმა — ბმულიდან სრული ინფო** (Tasks §44).

   ⚠️ მოწმდება: YouTube-ის ბმულის ჩასმის შემდეგ **მთავარი ფოტოს ჩარჩო**
   ბმულის ფოტოთია შევსებული (შენახვამდე, URL-ით), ცარიელი აღწერა და
   გამოქვეყნების თარიღი ივსება, ბარათში აღწერა ჩანს, „წამოღება ვებიდან"
   yt-dlp-ის არსებობისას აღარ ჩანს; შენახვისას ჩარჩოს ფოტო `thumbnail_url`-ად
   მიდის, ჩარჩოს „წაშლის" შემდეგ კი — აღარ.
   ============================================================ */

const statuses: Status[] = [
  { id: 1, key: 'to_watch', module: 'video', name_ka: 'სანახავი', name_en: 'To watch', role: 'todo', icon: null, color: null, is_default: true, sort_order: 0 },
] as Status[]

const META: VideoMetadata = {
  kind: 'video',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  platform: 'youtube',
  external_id: 'dQw4w9WgXcQ',
  embed_url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  title: 'Never Gonna Give You Up',
  description: 'The official video',
  image_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
  favicon_url: null,
  site_name: 'YouTube',
  domain: 'youtube.com',
  author: 'Rick Astley',
  duration: 213,
  published_at: '2009-10-25',
  tags: ['rick'],
  youtube_key: false,
  ytdlp: true,
  existing: null,
}

const mocks = vi.hoisted(() => ({
  fetchVideos: vi.fn(),
  fetchVideoTypes: vi.fn(),
  fetchVideoMetadata: vi.fn(),
  createVideo: vi.fn(),
  statuses: { data: [] as unknown[] },
  // §45 — მოდულის შენახული ხედი და მისი ჩუმი შენახვა
  modules: [] as { key: string; user_settings?: Record<string, unknown> }[],
  updateModuleSettings: vi.fn(),
}))

vi.mock('@/api/videos', async (original) => ({
  ...(await original<typeof import('@/api/videos')>()),
  fetchVideos: mocks.fetchVideos,
  fetchVideoTypes: mocks.fetchVideoTypes,
  fetchVideoMetadata: mocks.fetchVideoMetadata,
  createVideo: mocks.createVideo,
}))

/* ფორმა იხსნება: ველების კატალოგი და დამატებითი ველები ცარიელი მოდის */
vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  fetchModuleFields: vi.fn().mockResolvedValue([]),
  fetchCustomFields: vi.fn().mockResolvedValue([]),
  fetchCustomFieldValues: vi.fn().mockResolvedValue({}),
  updateModuleSettings: mocks.updateModuleSettings,
}))

vi.mock('@/lib/statuses', async (original) => ({
  ...(await original<typeof import('@/lib/statuses')>()),
  useStatuses: () => mocks.statuses,
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => ({
    all: mocks.modules,
    enabled: [],
    mediaModules: [],
    pageModules: [],
    customModules: [],
    has: () => false,
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

// Radix `Select` არჩეულ რიგს ხედში აბრუნებს; jsdom-ს ეს მეთოდი არ აქვს
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

/* მძიმე მოდულის გათბობა ტესტის ბიუჯეტის გარეთ (DEBT-12-ის წესი) */
beforeAll(async () => {
  await import('@/pages/VideosPage')
}, 60_000)
vi.setConfig({ testTimeout: 15_000 })

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  mocks.modules = []
  vi.clearAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** სია ერთი ვიდეოთი (`entry` — `?new=1` ფორმას ხსნის) */
async function mountList(entry = '/videos') {
  mocks.statuses.data = statuses
  mocks.fetchVideos.mockResolvedValue({ items: [VIDEO], total: 1, lastPage: 1 })
  mocks.fetchVideoTypes.mockResolvedValue([])

  const { VideosPage } = await import('@/pages/VideosPage')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: [entry] },
        h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, h(PlayerProvider, null, h(VideosPage))))),
      ),
    ),
  )
  await flush()
  await flush()
  return container
}

const VIDEO = {
  id: 9, title: 'Rick Astley — Never Gonna Give You Up', description: null, channel: 'Rick Astley', published_at: '2009-10-25',
  type_id: null, type: null, status: null, visibility: 'private', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  platform: 'youtube', external_id: 'dQw4w9WgXcQ', embed_url: null, thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  duration: 213, tags: ['80s'], is_favorite: false, watch_count: 0, watched_at: null, created_at: null,
  download_status: null, download_size: 0, download_format: null, download_name: null, download_error: null, downloaded_at: null,
} as unknown as Video

/** `?new=1` — საიდბარის „დამატება": ფორმა პირდაპირ იხსნება */
async function openAdd() {
  mocks.statuses.data = statuses
  mocks.fetchVideos.mockResolvedValue({ items: [], total: 0, lastPage: 1 })
  mocks.fetchVideoTypes.mockResolvedValue([
    { id: 4, key: 'music', name_ka: 'მუსიკა', name_en: 'Music', icon: null, color: null, sort_order: 0 },
  ])
  mocks.fetchVideoMetadata.mockResolvedValue(META)

  const { VideosPage } = await import('@/pages/VideosPage')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: ['/videos?new=1'] },
        h(
          QueryClientProvider,
          { client: qc },
          h(TooltipProvider, null, h(FeedbackProvider, null, h(PlayerProvider, null, h(VideosPage)))),
        ),
      ),
    ),
  )
  await flush()
  await flush()

  return document.getElementById('v-url') as HTMLInputElement
}

async function paste(input: HTMLInputElement, text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } })
  await act(async () => {
    input.dispatchEvent(event)
  })
  await flush()
  await flush()
}

/** Radix `Select`: კლავიატურით გახსნა და რიგის არჩევა */
async function choose(triggerId: string, label: string) {
  const trigger = document.getElementById(triggerId)!
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
  await flush()
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.trim() === label)!
  await act(async () => option.click())
  await flush()
}

const frameImage = () => document.querySelector<HTMLImageElement>('[data-testid="poster-preview"] img')

describe('VideoForm link info (Tasks §44)', () => {
  it('pasting a YouTube link puts its photo into the main photo frame and fills description and date', async () => {
    const input = await openAdd()
    // შენახვამდე ჩარჩო ცარიელია
    expect(document.querySelector('[data-testid="poster-dropzone"]')).not.toBeNull()

    await paste(input, META.url)

    expect(mocks.fetchVideoMetadata).toHaveBeenCalledWith(META.url, undefined)
    expect(frameImage()?.getAttribute('src')).toBe(META.image_url)
    expect((document.getElementById('v-title') as HTMLInputElement).value).toBe(META.title)
    expect((document.getElementById('v-desc') as HTMLTextAreaElement).value).toBe(META.description)
    expect((document.getElementById('v-channel') as HTMLInputElement).value).toBe(META.author)
    // ბარათში აღწერაც ჩანს; yt-dlp არის — „წამოღება ვებიდან" აღარ სჭირდება
    expect(document.body.textContent).toContain(META.description)
    expect(document.body.textContent).not.toContain(i18n.t('videos.metaFetchWeb'))
  })

  /** ჩასმა → ტიპი და სტატუსი (სავალდებულოა) → შენახვა; აბრუნებს `createVideo`-ს პირველ არგუმენტს */
  async function pasteAndSave(beforeSave?: () => Promise<void>) {
    mocks.createVideo.mockResolvedValue({ id: 5 })
    const input = await openAdd()
    await paste(input, META.url)
    await choose('v-type', 'მუსიკა')
    await choose('v-status', 'სანახავი')
    await beforeSave?.()

    await act(async () => input.closest('form')!.requestSubmit())
    await flush()

    expect(mocks.createVideo).toHaveBeenCalledTimes(1)
    return mocks.createVideo.mock.calls[0][0]
  }

  it('saving sends the frame photo as thumbnail_url together with the date', async () => {
    const sent = await pasteAndSave()

    expect(sent).toEqual(
      expect.objectContaining({ thumbnail_url: META.image_url, published_at: META.published_at, thumbnail: null }),
    )
  })

  it('a cleared frame sends no link photo', async () => {
    const sent = await pasteAndSave(async () => {
      // „წაშლა" ჩარჩოდან — ბმულის ფოტოც ქრება
      const remove = document.querySelector<HTMLButtonElement>('[data-testid="poster-preview"] button[aria-label="remove"]')!
      await act(async () => remove.click())
      expect(frameImage()).toBeNull()
    })

    expect(sent).toEqual(expect.objectContaining({ thumbnail_url: null, remove_thumbnail: true }))
  })
})

/* Tasks §45 — ვიდეოს ნაგულისხმევი ხედი ახლანდელი ბარათებია (`VideoCard`); შენახული ხედი აღდგება,
   გადართვა მოდულზე ინახება */
describe('VideosPage view toggle (§45)', () => {
  const layoutOf = (el: HTMLElement) => el.querySelector('[data-testid="record-list"]')?.getAttribute('data-layout')

  it('keeps the current cards by default', async () => {
    const el = await mountList()

    expect(el.querySelector('[data-testid="video-card"]')).not.toBeNull()
    expect(el.querySelector('[data-testid="record-list"]')).toBeNull()
  })

  it('opens in the saved rows with the shared action bar, and saves the switch to the grid', async () => {
    mocks.modules = [{ key: 'video', user_settings: { view: 'rows' } }]
    mocks.updateModuleSettings.mockResolvedValue(undefined)
    const el = await mountList()

    expect(layoutOf(el)).toBe('rows')
    const row = el.querySelector('[data-record-layout="rows"]')!
    expect(row.textContent).toContain('Rick Astley')
    expect(row.querySelector('[data-testid="record-actions"]')?.textContent).toContain(i18n.t('videos.noStatus'))
    expect(el.querySelector('[data-testid="video-card"]')).toBeNull()

    const grid = [...el.querySelectorAll<HTMLButtonElement>('[data-testid="view-toggle"] button')].find(
      (b) => b.textContent === i18n.t('view.grid'),
    )!
    await act(async () => grid.click())

    expect(layoutOf(el)).toBe('grid')
    expect(mocks.updateModuleSettings).toHaveBeenCalledWith('video', { view: 'grid' })
  })
})
