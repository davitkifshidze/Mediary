import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { TooltipProvider } from '@/components/ui/tooltip'
import { credentialShortName } from '@/lib/credentials'
import i18n from '@/i18n'

/* ============================================================
   **„აღმოაჩინე" გასაღების გარეშე** (Tasks §30.6).

   ⚠️ მოდალი შეცდომას საერთოდ არ კითხულობდა: ცარიელი `q.data`
   „ვერაფერი მოიძებნა"-დ იხატებოდა, ე.ი. ვისაც TMDB-ის გასაღები არ
   ჩაუწერია (§30-იდან — ყველა ახალი ანგარიში), მას TMDB-ის კატალოგი
   **ცარიელი** ეჩვენებოდა — გასაღების არქონა, მკვდარი წყარო და ცარიელი
   პასუხი ერთ ტექსტად ითქმოდა, რასაც §30.6 სწორედ კრძალავს.

   ⚠️ QueryClient-ს აქ **ცოცხალი აპის** `retry: 1` აქვს (`main.tsx`) —
   მხოლოდ ასე ამოწმებს ტესტი, რომ გასაღების არქონაზე მეორე ცდა აღარ მიდის.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  discover: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/media', async (original) => ({
  ...(await original<typeof import('@/api/media')>()),
  discover: mocks.discover,
}))

vi.mock('@/components/ui/feedback', async (original) => ({
  ...(await original<typeof import('@/components/ui/feedback')>()),
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

function apiError(status: number, data: Record<string, unknown>): AxiosError {
  const response = {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  } as AxiosResponse

  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, response)
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

/** ⚠️ დიალოგი პორტალშია — ტექსტი `document.body`-დან იკითხება */
async function mount() {
  const { DiscoverModal } = await import('@/components/DiscoverModal')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 0 } } })

  await act(async () => {
    root!.render(
      h(
        MemoryRouter,
        null,
        h(
          QueryClientProvider,
          { client: qc },
          h(TooltipProvider, null, h(DiscoverModal, { open: true, onOpenChange: () => {}, genres: [], type: 'movie' })),
        ),
      ),
    )
  })
  for (let i = 0; i < 4; i++) await flush()

  return document.body
}

describe('DiscoverModal', () => {
  it('says the TMDB key is missing instead of showing an empty catalogue', async () => {
    mocks.discover.mockRejectedValue(apiError(409, { message: 'credential_missing', provider: 'tmdb' }))

    const body = await mount()
    const text = body.textContent ?? ''

    expect(text).toContain(i18n.t('errors.credential_missing_for', { provider: credentialShortName('tmdb') }))
    expect(text).not.toContain(i18n.t('discover.empty'))
    expect(body.querySelector('a[href="/credentials"]'), '„მონაცემების" ბმული').toBeTruthy()
    // გასაღები მეორე ცდაზე არ გაჩნდება — ხელახლა კითხვა ზედმეტია
    expect(mocks.discover).toHaveBeenCalledTimes(1)
  })

  it('says the source is not answering instead of "nothing found"', async () => {
    mocks.discover.mockRejectedValue(apiError(502, { message: 'tmdb_error' }))

    const body = await mount()
    const text = body.textContent ?? ''

    expect(text).toContain(i18n.t('errors.tmdb_error'))
    expect(text).not.toContain(i18n.t('discover.empty'))
    expect(body.querySelector('a[href="/credentials"]')).toBeNull()
  })

  it('still says "nothing found" for a real empty answer', async () => {
    mocks.discover.mockResolvedValue({ page: 1, total_pages: 1, results: [] })

    const body = await mount()

    expect(body.textContent).toContain(i18n.t('discover.empty'))
  })
})
