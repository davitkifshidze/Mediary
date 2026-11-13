import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Episode, EpisodeOverview } from '@/api/episodes'
import i18n from '@/i18n'

/* ============================================================
   სეზონები და ეპიზოდები — **რა ჩანს გაუშლელად**.

   ⚠️ მოწმდება: გვერდის გახსნისას არც ერთი სეზონი არ არის გაშლილი — არც
   პირველი, არც ის, სადაც გავჩერდი; სათაურთან წერია, რამდენი სეზონი და
   ჯამში რამდენი ეპიზოდია; დაჭერა ერთ სეზონს შლის, მეორე დაჭერა კეცავს,
   სხვა სეზონზე დაჭერა კი წინას კეცავს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchEpisodes: vi.fn(),
  markEpisodes: vi.fn(),
  syncEpisodes: vi.fn(),
  // ⚠️ კონტექსტის ჰუკი ყოველ გამოძახებაზე ერთსა და იმავე ობიექტს აბრუნებს
  auth: { can: () => true },
  dates: { format: 'dmy', date: (value: unknown) => String(value ?? '') },
  toast: vi.fn(),
}))

vi.mock('@/api/episodes', async (original) => ({
  ...(await original<typeof import('@/api/episodes')>()),
  fetchEpisodes: mocks.fetchEpisodes,
  markEpisodes: mocks.markEpisodes,
  syncEpisodes: mocks.syncEpisodes,
}))

vi.mock('@/lib/auth', async (original) => ({
  ...(await original<typeof import('@/lib/auth')>()),
  useAuth: () => mocks.auth,
}))

vi.mock('@/lib/dates', async (original) => ({
  ...(await original<typeof import('@/lib/dates')>()),
  useDateFormat: () => mocks.dates,
}))

vi.mock('@/components/ui/feedback', async (original) => ({
  ...(await original<typeof import('@/components/ui/feedback')>()),
  useToast: () => ({ toast: mocks.toast, dismiss: () => {} }),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeAll(async () => {
  await import('@/components/EpisodeTracker')
}, 60_000)
vi.setConfig({ testTimeout: 15_000 })

const episode = (id: number, number: number, watched = false): Episode => ({
  id,
  episode: number,
  name: `Episode ${id}`,
  air_date: null,
  runtime: null,
  watched,
  watched_at: null,
})

// სამი სეზონი, ხუთი ეპიზოდი; პირველი სეზონი ნანახია — გავჩერდი მეორის დასაწყისში
const OVERVIEW: EpisodeOverview = {
  total: 5,
  watched: 2,
  percent: 40,
  next: { id: 21, season: 2, episode: 1, name: null, air_date: null },
  seasons: [
    { season: 1, total: 2, watched: 2, episodes: [episode(11, 1, true), episode(12, 2, true)] },
    { season: 2, total: 2, watched: 0, episodes: [episode(21, 1), episode(22, 2)] },
    { season: 3, total: 1, watched: 0, episodes: [episode(31, 1)] },
  ],
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

async function mount(overview: EpisodeOverview) {
  mocks.fetchEpisodes.mockResolvedValue(overview)

  const { EpisodeTracker } = await import('@/components/EpisodeTracker')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root!.render(
      h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(EpisodeTracker, { type: 'series', id: 7 }))),
    )
  })
  // მოთხოვნის პასუხი და მისი დახატვა
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  return container
}

const seasons = () => [...container!.querySelectorAll<HTMLButtonElement>('button[data-kind="accordion"]')]
/** გაშლილი სეზონის ეპიზოდები — სეზონის სტრიქონში ჩადგმული სტრიქონები */
const shown = () => [...container!.querySelectorAll('li li')].map((row) => row.textContent ?? '')
const summary = () => container!.querySelector('[data-testid="episodes-summary"]')

describe('EpisodeTracker', () => {
  it('გახსნისას ყველა სეზონი დაკეცილია — ისიც, სადაც გავჩერდი', async () => {
    await mount(OVERVIEW)

    expect(seasons()).toHaveLength(3)
    expect(shown()).toEqual([])
  })

  it('სათაურთან წერია სეზონების რაოდენობა და ეპიზოდების ჯამი', async () => {
    await mount(OVERVIEW)

    expect(summary()?.textContent).toBe(
      `${i18n.t('detail.seasons', { count: 3 })} · ${i18n.t('detail.episodes', { count: 5 })}`,
    )
  })

  it('დაჭერა სეზონს შლის, მეორე დაჭერა კეცავს, სხვა სეზონი წინას კეცავს', async () => {
    await mount(OVERVIEW)

    await act(async () => seasons()[1].click())
    expect(shown()).toHaveLength(2)
    expect(shown()[0]).toContain('Episode 21')

    await act(async () => seasons()[2].click())
    expect(shown()).toHaveLength(1)
    expect(shown()[0]).toContain('Episode 31')

    await act(async () => seasons()[2].click())
    expect(shown()).toEqual([])
  })

  it('ჩამოუტვირთავ სიაზე ჯამი არ ჩანს', async () => {
    await mount({ total: 0, watched: 0, percent: 0, next: null, seasons: [] })

    expect(summary()).toBeNull()
    expect(container!.textContent).toContain(i18n.t('episodes.empty'))
  })
})
