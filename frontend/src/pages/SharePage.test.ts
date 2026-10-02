import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { PublicShare, ShareItems } from '@/api/shareLinks'
import '@/i18n'

/* ============================================================
   გაზიარების ბმულის გვერდი — `/share/:token` (Tasks §40.6).

   აქ მოწმდება ის, რასაც ვერც `tsc` ხედავს და ვერც backend-ის ტესტი:
   · ანონიმის „შესვლა" **ისევ ბმულზე აბრუნებს** (`state.from`);
   · შესულ უცხოს „უკვე გაქვს ✓" / „შენს ურნაშია" ეწერება ბარათზე;
   · 410 „ვადა გაუვიდა"-ს ამბობს და არა „ასეთი ბმული არ არსებობს"-ს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchPublicShare: vi.fn(),
  fetchPublicShareItems: vi.fn(),
}))

vi.mock('@/api/shareLinks', async (original) => ({
  ...(await original<typeof import('@/api/shareLinks')>()),
  ...mocks,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TOKEN = 'A'.repeat(48)

const head = (viewer: PublicShare['viewer']): PublicShare => ({
  owner: { username: 'nino', display_name: 'Nino', avatar_path: null },
  link: { expires_at: null, show_status: true },
  sections: [{ domain: 'movie', count: 3 }],
  modules: { movie: { name_ka: 'ფილმები', name_en: 'Movies', icon: 'Film', color: '#7073ff' } },
  viewer,
})

const items: ShareItems = {
  data: [
    { id: 1, domain: 'movie', title_en: 'Alien', year: 1979, in_library: { id: 9, trashed: false } },
    { id: 2, domain: 'movie', title_en: 'Heat', year: 1995, in_library: { id: 10, trashed: true } },
    { id: 3, domain: 'movie', title_en: 'Ran', year: 1985, in_library: null },
  ],
  meta: { current_page: 1, last_page: 1, per_page: 30, total: 3 },
  genres: [],
}

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeAll(async () => {
  await import('@/pages/SharePage')
}, 60_000)

vi.setConfig({ testTimeout: 20_000 })

beforeEach(() => {
  mocks.fetchPublicShareItems.mockResolvedValue(items)
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

/** შესვლის გვერდის ნაცვლად — რას გადასცა ბმულმა `state.from`-ად */
function LoginProbe() {
  const location = useLocation()
  return h('p', { 'data-testid': 'login-from' }, (location.state as { from?: string } | null)?.from ?? 'none')
}

async function mount() {
  const { SharePage } = await import('@/pages/SharePage')

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
            { initialEntries: [`/share/${TOKEN}`] },
            h(
              Routes,
              null,
              h(Route, { path: '/share/:token', element: h(SharePage) }),
              h(Route, { path: '/login', element: h(LoginProbe) }),
            ),
          ),
        ),
      ),
    )
  })

  for (let i = 0; i < 4; i++) await flush()
}

describe('SharePage', () => {
  it('ანონიმის „შესვლა" ისევ ბმულზე აბრუნებს', async () => {
    mocks.fetchPublicShare.mockResolvedValue(head({ signed_in: false, own: false }))
    await mount()

    expect(document.body.textContent).toContain('Nino')
    const login = [...document.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/login')
    expect(login, '„შესვლის" ბმული არ დაიხატა').toBeTruthy()

    await act(async () => login!.click())
    await flush()

    expect(document.querySelector('[data-testid="login-from"]')?.textContent).toBe(`/share/${TOKEN}`)
  })

  it('შესულ უცხოს ბარათზე „უკვე გაქვს" და „შენს ურნაშია" ეწერება', async () => {
    mocks.fetchPublicShare.mockResolvedValue(head({ signed_in: true, own: false }))
    await mount()

    const cards = [...document.querySelectorAll('[data-testid="share-card"]')]
    const textOf = (title: string) => cards.find((c) => c.textContent?.includes(title))?.textContent ?? ''

    expect(cards).toHaveLength(3)
    expect(textOf('Alien')).toContain('უკვე გაქვს')
    expect(textOf('Heat')).toContain('შენს ურნაშია')
    expect(textOf('Ran')).not.toContain('უკვე გაქვს')
    expect(mocks.fetchPublicShareItems).toHaveBeenCalledWith(TOKEN, 'movie', { page: 1, q: undefined, genre: undefined })
  })

  it('410 „ვადა გაუვიდა"-ს ამბობს და არა „არ არსებობს"-ს', async () => {
    const response = {
      status: 410,
      statusText: 'Gone',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: { message: 'share_expired' },
    }
    mocks.fetchPublicShare.mockRejectedValue(
      new AxiosError('gone', 'ERR_BAD_REQUEST', undefined, undefined, response),
    )
    await mount()

    expect(document.body.textContent).toContain('ბმულს ვადა გაუვიდა')
    expect(document.body.textContent).not.toContain('ასეთი ბმული არ არსებობს')
  })
})
