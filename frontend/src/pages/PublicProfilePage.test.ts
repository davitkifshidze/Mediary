import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { PublicProfile } from '@/api/publicProfile'
import '@/i18n'

/* ============================================================
   საჯარო პროფილი — **ფლეილისტის ბარათი იხსნება**.

   აქამდე ბარათი მხოლოდ სახელსა და რიცხვს ხატავდა და არაფერს აკეთებდა;
   „რა შედის იქ" (შენი სიტყვები) არსაიდან ჩანდა. აქ მოწმდება ბმა, რომელსაც
   ვერც `tsc` ხედავს და ვერც backend-ის ტესტი: ფლეილისტის ჩანართის ბარათი
   **ღილაკია**, რიცხვს აწერს და დაჭერაზე სწორ ფლეილისტს ითხოვს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchPublicProfile: vi.fn(),
  fetchPublicItems: vi.fn(),
  fetchPublicPlaylist: vi.fn(),
  planProfileImport: vi.fn(),
}))

const queue = vi.hoisted(() => ({ enqueueShare: vi.fn() }))

vi.mock('@/api/publicProfile', async (original) => ({
  ...(await original<typeof import('@/api/publicProfile')>()),
  ...mocks,
}))

// ⚠️ ერთი და იგივე ობიექტი ყოველ გამოძახებაზე — თორემ ეფექტები ყოველ რენდერზე თავიდან გაეშვება
const queueApi = { enqueueShare: queue.enqueueShare }
vi.mock('@/components/ui/queue', async (original) => ({
  ...(await original<typeof import('@/components/ui/queue')>()),
  useQueue: () => queueApi,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const profile: PublicProfile = {
  profile: { username: 'alice', display_name: 'Alice', avatar_path: null, bio: null, joined_at: null },
  domains: ['playlist'],
  counts: { playlist: 1 },
  modules: { song: { name_ka: 'სიმღერები', name_en: 'Songs', icon: 'Music', color: '#e0865b' } },
  domain_modules: { playlist: 'song' },
  viewer: { signed_in: false, own: false, sections: {} },
}

const playlistCard = { id: 12, domain: 'playlist' as const, title_en: 'Evening', songs_count: 3 }

let root: Root | null = null
let container: HTMLDivElement | null = null

// ⚠️ გვერდი გალერეის ჩანართსაც სტატიკურად შემოიტანს (ლაითბოქსი მძიმეა)
beforeAll(async () => {
  await import('@/pages/PublicProfilePage')
}, 60_000)

vi.setConfig({ testTimeout: 20_000 })

beforeEach(() => {
  mocks.fetchPublicProfile.mockResolvedValue(profile)
  mocks.fetchPublicItems.mockResolvedValue({
    data: [playlistCard],
    meta: { current_page: 1, last_page: 1, per_page: 24, total: 1 },
  })
  mocks.fetchPublicPlaylist.mockResolvedValue({
    playlist: playlistCard,
    data: [],
    meta: { current_page: 1, last_page: 1, per_page: 100, total: 0 },
  })
})

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
  const { PublicProfilePage } = await import('@/pages/PublicProfilePage')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root!.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(
          TooltipProvider,
          null,
          h(
            MemoryRouter,
            { initialEntries: ['/u/alice'] },
            h(Routes, null, h(Route, { path: '/u/:username', element: h(PublicProfilePage) })),
          ),
        ),
      ),
    )
  })

  await flush()
  await flush()
  await flush()
}

describe('PublicProfilePage — ფლეილისტი', () => {
  it('ფლეილისტის ბარათი ღილაკია, რიცხვს აწერს და თავის ფლეილისტს ხსნის', async () => {
    await mount()

    const tile = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Evening'))
    expect(tile, 'ფლეილისტის ბარათი ღილაკად არ დაიხატა').toBeTruthy()
    expect(tile?.textContent).toContain('3 სიმღერა')

    await act(async () => tile!.click())
    await flush()
    await flush()

    expect(mocks.fetchPublicPlaylist).toHaveBeenCalledWith('alice', 12, 1)
    // ფანჯარა ფლეილისტის სახელითაა და ცარიელზე ამას ამბობს
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Evening')
    expect(document.body.textContent).toContain('სიმღერა ჯერ არ არის დამატებული.')
  })
})

describe('PublicProfilePage — ჩემს ბიბლიოთეკაში დამატება', () => {
  const movies: PublicProfile = {
    ...profile,
    domains: ['movie', 'gallery_album'],
    counts: { movie: 2, gallery_album: 0 },
    modules: { movie: { name_ka: 'ფილმები', name_en: 'Movies', icon: 'Film', color: '#5b8def' } },
    domain_modules: { movie: 'movie', gallery_album: 'gallery' },
    viewer: {
      signed_in: true,
      own: false,
      sections: { movie: { enabled: true, can_create: true, requested: false, owner_status: true } },
    },
  }

  it('შესულ უცხოს რიგს, „უკვე გაქვს" ნიშანს და მონიშვნას აჩვენებს და გეგმას პროფილის წყაროთი რიგში აგზავნის', async () => {
    mocks.fetchPublicProfile.mockResolvedValue(movies)
    mocks.fetchPublicItems.mockResolvedValue({
      data: [
        { id: 1, domain: 'movie', title_en: 'Dune', in_library: { id: 9, trashed: false } },
        { id: 2, domain: 'movie', title_en: 'Arrival', in_library: null },
      ],
      meta: { current_page: 1, last_page: 1, per_page: 24, total: 2 },
    })
    mocks.planProfileImport.mockResolvedValue({
      domain: 'movie',
      module: { enabled: true, can_create: true, requested: false },
      items: [
        { id: 2, title_ka: null, title_en: 'Arrival', year: 2016, state: 'new', mine_id: null },
        { id: 1, title_ka: null, title_en: 'Dune', year: 2021, state: 'have', mine_id: 9 },
      ],
      counts: { new: 1, have: 1, trash: 0 },
      status_modes: ['default', 'owner'],
    })

    await mount()

    expect(document.body.textContent).toContain('ჩემს ბიბლიოთეკაში დამატება')
    expect(document.body.textContent).toContain('უკვე გაქვს')
    // მონიშვნა მხოლოდ ახალზე — რაც უკვე გაქვს, ის აღარ ინიშნება
    const boxes = document.querySelectorAll('[role="checkbox"]')
    expect(boxes).toHaveLength(1)

    const addAll = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('ყველა ახლის დამატება'))
    await act(async () => addAll!.click())
    await flush()

    expect(mocks.planProfileImport).toHaveBeenCalledWith('alice', 'movie', undefined)
    expect(queue.enqueueShare).toHaveBeenCalledWith(
      { kind: 'profile', owner: 'alice' },
      'movie',
      [{ id: 2, title: 'Arrival (2016)' }],
      'default',
    )
  })

  it('გალერეის ჩანართზე დამატება არ ჩანს — მხოლოდ ახსნა', async () => {
    mocks.fetchPublicProfile.mockResolvedValue({ ...movies, domains: ['gallery_album'] })

    await mount()

    expect(document.body.textContent).toContain('ამ სექციიდან ბიბლიოთეკაში დამატება არ ხდება')
    expect(document.body.textContent).not.toContain('ყველა ახლის დამატება')
  })

  it('ანონიმს დამატების რიგი არ აქვს', async () => {
    mocks.fetchPublicProfile.mockResolvedValue({ ...movies, viewer: { signed_in: false, own: false, sections: {} } })
    mocks.fetchPublicItems.mockResolvedValue({
      data: [{ id: 2, domain: 'movie', title_en: 'Arrival' }],
      meta: { current_page: 1, last_page: 1, per_page: 24, total: 1 },
    })

    await mount()

    expect(document.body.textContent).toContain('Arrival')
    expect(document.body.textContent).not.toContain('ჩემს ბიბლიოთეკაში დამატება')
    expect(document.querySelectorAll('[role="checkbox"]')).toHaveLength(0)
  })
})
