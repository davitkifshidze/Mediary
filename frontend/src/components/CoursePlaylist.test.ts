import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Course, CoursePlaylist, CoursePlaylistItem } from '@/api/courses'
import i18n from '@/i18n'

/* ============================================================
   **კურსის „ვიდეოები (N)"**.

   ⚠️ მოწმდება: ნომერი, სათაური, ხანგრძლივობა და ჯამი; დაჭერა მთელ სიას
   რიგად უკრავს დაჭერილიდან (`link`, უარყოფითი id, backend-ის embed);
   „განახლება" ქეშს გვერდს უვლის; „ფლეილისტი არ არის" — სექცია არ ჩანს;
   შეცდომა — თავისი ტექსტით.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchCoursePlaylist: vi.fn(),
  addPlaylistVideos: vi.fn(),
  updateModuleSettings: vi.fn(),
  // ვიდეოების მოდული ჩართულია? (არჩევა მხოლოდ მაშინ ჩანს)
  videoModule: false,
  modules: [] as { key: string; user_settings?: Record<string, unknown> }[],
  play: vi.fn(),
  player: {
    current: null as unknown,
    origin: null as string | null,
    layout: null as string | null,
    popIn: () => {},
    play: (...args: unknown[]) => mocks.play(...args),
  },
}))

vi.mock('@/api/courses', async (original) => ({
  ...(await original<typeof import('@/api/courses')>()),
  fetchCoursePlaylist: mocks.fetchCoursePlaylist,
  addPlaylistVideos: mocks.addPlaylistVideos,
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  updateModuleSettings: mocks.updateModuleSettings,
}))

vi.mock('@/api/videos', async (original) => ({
  ...(await original<typeof import('@/api/videos')>()),
  fetchVideoTypes: async () => [{ id: 4, key: 'study', name_ka: 'სასწავლო', name_en: 'Study', icon: null, color: null, sort_order: 0 }],
}))

vi.mock('@/lib/statuses', async (original) => ({
  ...(await original<typeof import('@/lib/statuses')>()),
  useStatuses: () => ({
    data: [{ id: 1, key: 'to_watch', module: 'video', name_ka: 'სანახავი', name_en: 'To watch', role: 'todo', icon: null, color: null, is_default: true, sort_order: 0 }],
  }),
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => ({
    all: mocks.modules,
    enabled: [],
    mediaModules: [],
    pageModules: [],
    customModules: [],
    has: (key: string) => key === 'video' && mocks.videoModule,
    loading: false,
  }),
}))

vi.mock('@/lib/player', async (original) => ({
  ...(await original<typeof import('@/lib/player')>()),
  usePlayer: () => mocks.player,
  // ⚠️ ესკიზის რეგისტრაცია დამკვრელს სჭირდება — აქ მხოლოდ ref-ია
  usePlayerAnchor: () => () => {},
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const course = {
  id: 7,
  title: 'Laravel',
  url: 'https://www.youtube.com/playlist?list=PLillGF-RfqbbiTGgA77tGO426V3hRF9iE',
} as Course

const item = (position: number, title: string, duration: number | null): CoursePlaylistItem => ({
  position,
  video_id: `vid${position}aaaaaa`,
  title,
  duration,
  thumbnail: `https://i.ytimg.com/vi/vid${position}aaaaaa/mqdefault.jpg`,
  url: `https://www.youtube.com/watch?v=vid${position}aaaaaa&list=PL`,
  embed_url: `https://www.youtube-nocookie.com/embed/vid${position}aaaaaa`,
  published_at: null,
  video: null,
})

const playlist: CoursePlaylist = {
  id: 'PLillGF-RfqbbiTGgA77tGO426V3hRF9iE',
  title: 'Laravel from scratch',
  description: null,
  channel: 'Laracasts',
  thumbnail: null,
  count: 3,
  total_duration: 3723 + 600,
  source: 'youtube_api',
  fetched_at: '2026-10-05T01:00:00+04:00',
  items: [item(1, 'One', 600), item(2, 'Two', 3723), item(3, 'Three', null)],
}

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  mocks.videoModule = false
  mocks.modules = []
  vi.clearAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount() {
  const { CoursePlaylistSection } = await import('@/components/CoursePlaylist')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(MemoryRouter, null, h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(CoursePlaylistSection, { course })))),
    ),
  )
  await flush()
  return container
}

const rows = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[data-testid="playlist-items"] > li')]

describe('CoursePlaylistSection', () => {
  it('lists the videos with their numbers and durations and plays the whole list from the one clicked', async () => {
    mocks.fetchCoursePlaylist.mockResolvedValue(playlist)
    const el = await mount()

    expect(el.textContent).toContain(i18n.t('courses.playlist.title', { count: 3 }))
    expect(el.querySelector('[data-testid="playlist-total"]')?.textContent).toBe(
      i18n.t('courses.playlist.total', { duration: '1:12:03' }),
    )
    expect(rows(el)).toHaveLength(3)
    expect(rows(el)[1].textContent).toContain('2')
    expect(rows(el)[1].textContent).toContain('Two')
    expect(rows(el)[1].textContent).toContain('1:02:03')
    // YouTube-ზე გახსნა — ცალკე ბმული
    expect(rows(el)[1].querySelector('a')?.getAttribute('href')).toBe(playlist.items[1].url)

    await act(async () => rows(el)[1].querySelector('button')!.click())

    const [queue, startAt, label, origin] = mocks.play.mock.calls[0]
    expect(startAt).toBe(1)
    expect(queue).toHaveLength(3)
    // რიგის სახელი — კურსის სათაური; `origin` — კურსი (ფანჯრის ადგილი მას ცნობს)
    expect(label).toBe('Laravel from scratch')
    expect(origin).toBe('course-7')
    expect(queue[1]).toMatchObject({
      kind: 'link',
      title: 'Two',
      subtitle: 'Laravel from scratch',
      embedUrl: 'https://www.youtube-nocookie.com/embed/vid2aaaaaa',
      platform: 'youtube',
      duration: 3723,
      // ჩარჩოს „ფანჯარაში დაბრუნება" კურსის ფანჯარას ხსნის
      href: '/courses?open=7',
    })
    // ⚠️ უარყოფითი id — ბაზის ჩანაწერს ვერ დაემთხვევა
    expect(queue.every((q: { id: number }) => q.id < 0)).toBe(true)
  })

  it('the course window has its own video spot above the list — it starts the course from the first video', async () => {
    mocks.fetchCoursePlaylist.mockResolvedValue(playlist)
    mocks.play.mockClear()
    const el = await mount()

    const spot = el.querySelector<HTMLButtonElement>('[data-testid="player-spot"]')!
    expect(spot.textContent).toContain(i18n.t('playback.play'))
    await act(async () => spot.click())
    const [queue, startAt, , origin] = mocks.play.mock.calls[0]
    expect(queue).toHaveLength(3)
    expect(startAt).toBe(0)
    expect(origin).toBe('course-7')
  })

  it('refresh asks the server to skip its cache', async () => {
    mocks.fetchCoursePlaylist.mockResolvedValue(playlist)
    const el = await mount()

    const refresh = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('courses.playlist.refresh')))!
    await act(async () => refresh.click())
    await flush()

    expect(mocks.fetchCoursePlaylist).toHaveBeenLastCalledWith(7, true)
  })

  it('draws nothing when the server says it is not a playlist, and the reason when it fails', async () => {
    mocks.fetchCoursePlaylist.mockResolvedValue(null)
    const none = await mount()
    expect(none.textContent).toBe('')
    act(() => root?.unmount())
    container?.remove()

    const response = {
      status: 503,
      statusText: '',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: { message: 'youtube_unavailable' },
    } as AxiosResponse
    mocks.fetchCoursePlaylist.mockRejectedValue(new AxiosError('unavailable', 'ERR_BAD_RESPONSE', undefined, undefined, response))
    const failed = await mount()
    await flush()
    expect(failed.textContent).toContain(i18n.t('errors.youtube_unavailable'))
  })
})

/* ფლეილისტი → ვიდეოები: ჩექბოქსები, „ყველას მონიშვნა" (ყველა ელემენტზე), უკვე
   დამატებულზე ბეჯი, ტიპი/სტატუსი ერთხელ (ბოლო არჩევანი ახსოვს) */
describe('CoursePlaylistSection — adding to videos', () => {
  const withVideo: CoursePlaylist = {
    ...playlist,
    items: [item(1, 'One', 600), { ...item(2, 'Two', 3723), video: { id: 5, download_status: 'ready', download_stale: false } }, item(3, 'Three', null)],
  }

  it('without the video module there is nothing to pick', async () => {
    mocks.fetchCoursePlaylist.mockResolvedValue(withVideo)
    const el = await mount()

    expect(el.querySelector('[data-testid="playlist-picker"]')).toBeNull()
    expect(el.querySelector('[data-testid="playlist-pick"]')).toBeNull()
  })

  it('picks every item not yet in videos and adds them with the remembered type and status', async () => {
    mocks.videoModule = true
    mocks.modules = [{ key: 'course', user_settings: { playlist_import: { type_id: 4, status: 'to_watch' } } }]
    mocks.fetchCoursePlaylist.mockResolvedValue(withVideo)
    mocks.addPlaylistVideos.mockResolvedValue({ course_id: 7, created: [11, 12], existing: [], failed: [] })
    mocks.updateModuleSettings.mockResolvedValue(undefined)
    const el = await mount()

    // უკვე დამატებულს ჩექბოქსის ნაცვლად ბეჯი აქვს; საქაღალდის ბმული სათაურშია
    expect(el.querySelectorAll('[data-testid="playlist-pick"]')).toHaveLength(2)
    expect(rows(el)[1].querySelector('[data-testid="playlist-in-videos"]')?.textContent).toBe(i18n.t('courses.playlist.local'))
    expect(el.querySelector('[data-testid="playlist-folder-link"]')?.getAttribute('href')).toBe('/videos?course=7')

    await act(async () => el.querySelector<HTMLButtonElement>('[data-testid="playlist-pick-all"]')!.click())
    expect(el.querySelector('[data-testid="playlist-picked"]')?.textContent).toBe(
      `${i18n.t('courses.playlist.picked', { count: 2 })} · ~10:00`,
    )

    await act(async () => el.querySelector<HTMLButtonElement>('[data-testid="playlist-add"]')!.click())
    await flush()
    const confirm = document.querySelector<HTMLButtonElement>('[data-testid="playlist-import-confirm"]')!
    expect(confirm.disabled).toBe(false)
    await act(async () => confirm.click())
    await flush()

    expect(mocks.addPlaylistVideos).toHaveBeenCalledWith(7, { video_ids: ['vid1aaaaaa', 'vid3aaaaaa'], type_id: 4, status: 'to_watch' })
    expect(mocks.updateModuleSettings).toHaveBeenCalledWith('course', { playlist_import: { type_id: 4, status: 'to_watch' } })
  })

  it('without a remembered choice the add button waits for type and status', async () => {
    mocks.videoModule = true
    mocks.fetchCoursePlaylist.mockResolvedValue(withVideo)
    const el = await mount()

    await act(async () => el.querySelectorAll<HTMLButtonElement>('[data-testid="playlist-pick"]')[0].click())
    await act(async () => el.querySelector<HTMLButtonElement>('[data-testid="playlist-add"]')!.click())
    await flush()

    expect(document.querySelector<HTMLButtonElement>('[data-testid="playlist-import-confirm"]')!.disabled).toBe(true)
    expect(mocks.addPlaylistVideos).not.toHaveBeenCalled()
  })
})
