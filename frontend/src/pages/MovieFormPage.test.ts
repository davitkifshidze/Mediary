import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { TooltipProvider } from '@/components/ui/tooltip'
import { credentialShortName } from '@/lib/credentials'
import i18n from '@/i18n'

/* ============================================================
   **ფილმის ფორმა გასაღების გარეშე** (Tasks §30.6).

   ⚠️ §30-იდან TMDB-ის გასაღები მხოლოდ მომხმარებლისაა, ე.ი. „გასაღები არ
   გაქვს" ყოველდღიური მდგომარეობაა. სწრაფი შევსება კი სერვერის `message`-ს
   **პირდაპირ** ხატავდა — ის მანქანური კოდია (GAP-01), და ეკრანზე ნედლი
   „credential_missing" ეწერა; „სინქრონიზაციის" ღილაკს კი `onError`
   საერთოდ არ ჰქონდა და ჩუმად არაფერს აკეთებდა. backend-ის ტესტი ორივეს
   ვერ ხედავს: სერვერი სწორ 409-ს აბრუნებს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  lookupCandidates: vi.fn(),
  lookupDraft: vi.fn(),
  fetchGenres: vi.fn(),
  fetchModuleFields: vi.fn(),
  fetchCustomFields: vi.fn(),
  fetchCustomFieldValues: vi.fn(),
  toast: vi.fn(),
  api: { get: vi.fn(), create: vi.fn(), update: vi.fn(), resync: vi.fn() },
  // ⚠️ ერთი და იგივე ობიექტი ყოველ რენდერზე (CLAUDE.md — მოკის ჰუკის წესი)
  statuses: { data: [] as unknown[] },
}))

vi.mock('@/api/media', async (original) => ({
  ...(await original<typeof import('@/api/media')>()),
  lookupCandidates: mocks.lookupCandidates,
  lookupDraft: mocks.lookupDraft,
  fetchGenres: mocks.fetchGenres,
  mediaApi: () => mocks.api,
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  fetchModuleFields: mocks.fetchModuleFields,
  fetchCustomFields: mocks.fetchCustomFields,
  fetchCustomFieldValues: mocks.fetchCustomFieldValues,
}))

vi.mock('@/lib/statuses', async (original) => ({
  ...(await original<typeof import('@/lib/statuses')>()),
  useStatuses: () => mocks.statuses,
}))

vi.mock('@/components/ui/feedback', async (original) => ({
  ...(await original<typeof import('@/components/ui/feedback')>()),
  useToast: () => ({ toast: mocks.toast, dismiss: () => {} }),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/* ⚠️ jsdom-ს `ResizeObserver` არ აქვს — Radix-ის ჩამრთველს ის სჭირდება */
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

const noTmdbKey = () => apiError(409, { message: 'credential_missing', provider: 'tmdb' })

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

/** ახალი ფილმი (`/movies/new`) ან არსებულის რედაქტირება (`/movies/5/edit`) */
async function mount(path = '/movies/new') {
  mocks.fetchGenres.mockResolvedValue([])
  mocks.fetchModuleFields.mockResolvedValue([])
  mocks.fetchCustomFields.mockResolvedValue([])
  mocks.fetchCustomFieldValues.mockResolvedValue({})

  const { MovieFormPage } = await import('@/pages/MovieFormPage')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const page = h(MovieFormPage, { type: 'movie' })

  await act(async () => {
    root!.render(
      // ⚠️ Router — „გასაღები არ გაქვს"-ის შეტყობინებაში „მონაცემების" ბმულია
      h(
        MemoryRouter,
        { initialEntries: [path] },
        h(
          QueryClientProvider,
          { client: qc },
          h(
            TooltipProvider,
            null,
            h(Routes, null, h(Route, { path: '/movies/new', element: page }), h(Route, { path: '/movies/:id/edit', element: page })),
          ),
        ),
      ),
    )
  })
  await flush()
  await flush()

  return container
}

/** React-ის მართულ ველს მნიშვნელობა native setter-ით უნდა მიეცეს */
async function search(el: HTMLElement, value: string) {
  const input = el.querySelector('#m-lookup')
  expect(input, 'სწრაფი შევსების ველი ვერ მოიძებნა').toBeTruthy()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input!.dispatchEvent(new Event('input', { bubbles: true }))
  })

  const button = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('form.lookupBtn')))
  expect(button, 'ძებნის ღილაკი ვერ მოიძებნა').toBeTruthy()
  await act(async () => (button as HTMLButtonElement).click())
  await flush()
  await flush()
}

describe('MovieFormPage — quick fill', () => {
  it('says the TMDB key is missing and links to Credentials instead of printing the code', async () => {
    mocks.lookupCandidates.mockRejectedValue(noTmdbKey())

    const el = await mount()
    await search(el, 'Alien')

    const text = el.textContent ?? ''
    expect(text).toContain(i18n.t('errors.credential_missing_for', { provider: credentialShortName('tmdb') }))
    expect(text).not.toContain('credential_missing')
    expect(el.querySelector('a[href="/credentials"]'), '„მონაცემების" ბმული').toBeTruthy()
  })

  it('translates a source that is not answering and does not send it to Credentials', async () => {
    mocks.lookupCandidates.mockRejectedValue(apiError(502, { message: 'tmdb_error' }))

    const el = await mount()
    await search(el, 'Alien')

    const text = el.textContent ?? ''
    expect(text).toContain(i18n.t('errors.tmdb_error'))
    expect(text).not.toContain('tmdb_error')
    expect(el.querySelector('a[href="/credentials"]')).toBeNull()
  })

  it('keeps the domain wording when the picked draft is not found', async () => {
    mocks.lookupCandidates.mockResolvedValue([{ tmdb_id: 7, title_en: 'Alien', year: 1979, rating: 8.5, poster: null }])
    mocks.lookupDraft.mockRejectedValue(apiError(404, { message: 'tmdb_not_found' }))

    const el = await mount()
    await search(el, 'Alien')

    expect(mocks.lookupDraft).toHaveBeenCalled()
    expect(el.textContent).toContain(i18n.t('form.lookupNotFound'))
    expect(el.textContent).not.toContain('tmdb_not_found')
  })
})

describe('MovieFormPage — sync on the edit form', () => {
  it('reports a missing key instead of doing nothing', async () => {
    mocks.api.get.mockResolvedValue({
      id: 5,
      title_ka: 'უცხო',
      title_en: 'Alien',
      year: 1979,
      imdb_id: 'tt0078748',
      ge_url: null,
      trailer_url: null,
      description_ka: null,
      description_en: null,
      rating: null,
      my_rating: null,
      runtime: null,
      genres: [],
      status: null,
      is_favorite: false,
      poster: null,
      tmdb_id: 348,
    })
    mocks.api.resync.mockRejectedValue(noTmdbKey())

    const el = await mount('/movies/5/edit')
    const sync = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('detail.sync')))
    expect(sync, '„სინქრონიზაციის" ღილაკი ვერ მოიძებნა').toBeTruthy()

    await act(async () => (sync as HTMLButtonElement).click())
    await flush()
    await flush()

    expect(mocks.api.resync).toHaveBeenCalledWith(5)
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: i18n.t('errors.credential_missing_for', { provider: credentialShortName('tmdb') }),
        variant: 'error',
      }),
    )
  })
})
