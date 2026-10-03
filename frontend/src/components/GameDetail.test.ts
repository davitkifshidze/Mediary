import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Game } from '@/api/games'
import i18n from '@/i18n'

/* ============================================================
   **თამაშის დეტალი — პლატფორმები, რეჟიმები, ჟანრები ბარათებად** (Tasks §24.5).

   ⚠️ მოწმდება: სამი სექცია ბარათებით; რეჟიმები **ჩანს** (აქამდე არსად არ
   ჩანდა); „ჩემი პლატფორმა" სავსე ფონით და ✓-ით, ბარათზე დაჭერა
   `PATCH /games/{id}` `my_platform`-ით; ჟანრის ბარათი ლექსიკონის ფერს ატარებს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  updateGame: vi.fn(),
  fetchGameFiles: vi.fn(),
  fetchGameNotes: vi.fn(),
  fetchGameVideos: vi.fn(),
}))

vi.mock('@/api/games', async (original) => ({
  ...(await original<typeof import('@/api/games')>()),
  updateGame: mocks.updateGame,
  fetchGameFiles: mocks.fetchGameFiles,
  fetchGameNotes: mocks.fetchGameNotes,
  fetchGameVideos: mocks.fetchGameVideos,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
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

const game = {
  id: 9,
  title_en: 'Hades',
  title_ka: null,
  status: 'playing',
  rating: 9,
  cover: null,
  visibility: 'private',
  is_favorite: false,
  platforms: ['pc', 'switch'],
  my_platform: 'pc',
  modes: ['single'],
  genres: [{ id: 1, key: 'rpg', name_ka: 'როლური (RPG)', name_en: 'RPG', icon: 'Swords', color: 'c8', sort_order: 1 }],
  links: [],
  tags: [],
  description_ka: null,
  description_en: null,
} as unknown as Game

async function mount() {
  mocks.fetchGameFiles.mockResolvedValue([])
  mocks.fetchGameNotes.mockResolvedValue([])
  mocks.fetchGameVideos.mockResolvedValue([])
  mocks.updateGame.mockResolvedValue(game)

  const { GameDetail } = await import('@/components/GameDetail')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(GameDetail, { game, onClose: () => {} })))),
  )
  await flush()
}

const cards = () => [...document.querySelectorAll<HTMLElement>('[data-testid="game-meta"] [data-testid="meta-card"]')]

describe('GameDetail — ბარათები (§24)', () => {
  it('shows platforms, modes and genres as cards with their colours', async () => {
    await mount()

    const meta = document.querySelector('[data-testid="game-meta"]')!
    expect(meta.textContent).toContain(i18n.t('games.platformsTitle'))
    expect(meta.textContent).toContain(i18n.t('games.modesTitle'))
    expect(meta.textContent).toContain(i18n.t('games.genresTitle'))
    // რეჟიმი ჩანს — აქამდე არსად არ ჩანდა
    expect(meta.textContent).toContain(i18n.t('games.modes.single'))

    const rpg = cards().find((c) => c.textContent?.includes('RPG'))!
    expect(rpg.style.color).toBe('var(--status-c8)')
  })

  it('"my platform" is the filled card and a click on another card re-assigns it', async () => {
    await mount()

    const pc = cards().find((c) => c.textContent?.includes(i18n.t('games.platforms.pc')))!
    const sw = cards().find((c) => c.textContent?.includes(i18n.t('games.platforms.switch')))!
    expect(pc.getAttribute('aria-pressed')).toBe('true')
    expect(pc.querySelector('svg.lucide-check')).not.toBeNull()
    expect(sw.getAttribute('aria-pressed')).toBe('false')

    await act(async () => sw.click())
    await flush()
    expect(mocks.updateGame).toHaveBeenCalledWith(9, { my_platform: 'switch' })

    await act(async () => pc.click())
    await flush()
    expect(mocks.updateGame).toHaveBeenCalledWith(9, { my_platform: null })
  })
})
