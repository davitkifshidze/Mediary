import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { PublicProfile } from '@/api/publicProfile'
import '@/i18n'

/* ============================================================
   საჯარო პროფილი — **ფლეილისტის ბარათი იხსნება** (Tasks §33.2).

   აქამდე ბარათი მხოლოდ სახელსა და რიცხვს ხატავდა და არაფერს აკეთებდა;
   „რა შედის იქ" (შენი სიტყვები) არსაიდან ჩანდა. აქ მოწმდება ბმა, რომელსაც
   ვერც `tsc` ხედავს და ვერც backend-ის ტესტი: ფლეილისტის ჩანართის ბარათი
   **ღილაკია**, რიცხვს აწერს და დაჭერაზე სწორ ფლეილისტს ითხოვს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchPublicProfile: vi.fn(),
  fetchPublicItems: vi.fn(),
  fetchPublicPlaylist: vi.fn(),
}))

vi.mock('@/api/publicProfile', async (original) => ({
  ...(await original<typeof import('@/api/publicProfile')>()),
  ...mocks,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const profile: PublicProfile = {
  profile: { username: 'alice', display_name: 'Alice', avatar_path: null, bio: null, joined_at: null },
  domains: ['playlist'],
  counts: { playlist: 1 },
  modules: { song: { name_ka: 'სიმღერები', name_en: 'Songs', icon: 'Music', color: '#e0865b' } },
  domain_modules: { playlist: 'song' },
}

const playlistCard = { id: 12, domain: 'playlist' as const, title_en: 'Evening', songs_count: 3 }

let root: Root | null = null
let container: HTMLDivElement | null = null

// ⚠️ გვერდი გალერეის ჩანართსაც სტატიკურად შემოიტანს (ლაითბოქსი მძიმეა) — DEBT-12-ის გაკვეთილი
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
