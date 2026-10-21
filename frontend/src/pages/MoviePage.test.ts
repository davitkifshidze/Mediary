import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import i18n from '@/i18n'

/* ============================================================
   **ჩანაწერის გვერდი ჩავარდნილ მოთხოვნაზე**.

   ⚠️ აქამდე `useQuery`-დან მხოლოდ `data` იკითხებოდა, ე.ი. სერვერის 500
   (ჩამორჩენილი სქემა, ჩამქრალი ბაზა) „ასეთი ჩანაწერი არ არის"-ად იხატებოდა —
   ზუსტად ის ტექსტი, რომელიც წაშლილ ფილმს ეკუთვნის. backend-ის ტესტი ამას ვერ
   ხედავს: სერვერი სწორ 500-ს აბრუნებს. მოწმდება: 500 → შეცდომის ბარათი
   „თავიდან სცადე"-თი, რომელიც იმავე ჩანაწერს ხელახლა ითხოვს; 404 → ისევ `NotFound`.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), setStatus: vi.fn(), toggleFavorite: vi.fn(), resync: vi.fn(), remove: vi.fn() },
  // ⚠️ ერთი და იგივე ობიექტი ყოველ რენდერზე (მოკის ჰუკის წესი)
  statuses: { data: [] as unknown[] },
}))

vi.mock('@/api/media', async (original) => ({
  ...(await original<typeof import('@/api/media')>()),
  mediaApi: () => mocks.api,
}))

vi.mock('@/lib/statuses', async (original) => ({
  ...(await original<typeof import('@/lib/statuses')>()),
  useStatuses: () => mocks.statuses,
}))

vi.mock('@/lib/audit', async (original) => ({
  ...(await original<typeof import('@/lib/audit')>()),
  useRecordOpen: () => {},
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

function apiError(status: number, data: Record<string, unknown> = {}): AxiosError {
  const response = {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  } as AxiosResponse

  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', undefined, undefined, response)
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

async function flush(times = 4) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function mount() {
  const { MoviePage } = await import('@/pages/MoviePage')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: ['/movies/12'] },
        h(
          QueryClientProvider,
          { client: qc },
          h(
            TooltipProvider,
            null,
            h(FeedbackProvider, null, h(Routes, null, h(Route, { path: '/movies/:id', element: h(MoviePage, { type: 'movie' }) }))),
          ),
        ),
      ),
    ),
  )
  await flush()
}

const button = (text: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement

describe('MoviePage', () => {
  it('draws an error card with a retry button on a server failure, not "no such record"', async () => {
    mocks.api.get.mockRejectedValueOnce(apiError(500, { message: 'Server Error' }))
    await mount()

    expect(document.body.textContent).toContain(i18n.t('errors.loadFailed'))
    expect(document.body.textContent).not.toContain(i18n.t('notFound.recordTitle'))

    // „თავიდან სცადე" იმავე ჩანაწერს ხელახლა ითხოვს
    mocks.api.get.mockRejectedValueOnce(apiError(500, { message: 'Server Error' }))
    await act(async () => button(i18n.t('actions.retry')).click())
    await flush()

    expect(mocks.api.get).toHaveBeenCalledTimes(2)
  })

  it('keeps "no such record" for a 404', async () => {
    mocks.api.get.mockRejectedValueOnce(apiError(404, { message: 'No query results for model' }))
    await mount()

    expect(document.body.textContent).toContain(i18n.t('notFound.recordTitle'))
    expect(document.body.textContent).not.toContain(i18n.t('errors.loadFailed'))
  })
})
