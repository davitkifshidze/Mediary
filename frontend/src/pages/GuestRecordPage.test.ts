import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { GuestRecord } from '@/api/guestRecord'
import i18n from '@/i18n'

/* ============================================================
   **სტუმრის შიდა გვერდი**.

   ⚠️ მოწმდება: ორივე გზა (ბმული და პროფილი) სწორ წყაროს ეკითხება; ჩანაწერის
   ფაქტები ჩანს; **გამორთული ბლოკი საერთოდ არ იხატება**, ჩართული და ცარიელი კი
   „არ არის"-ს წერს; უცნობი ჩანაწერი „ვერ მოიძებნა"-ა და უკან სიაზე აბრუნებს.
   ============================================================ */

const mocks = vi.hoisted(() => ({ fetchGuestRecord: vi.fn() }))

vi.mock('@/api/guestRecord', async (original) => ({
  ...(await original<typeof import('@/api/guestRecord')>()),
  fetchGuestRecord: mocks.fetchGuestRecord,
}))

// ბადე თავის ტესტებშია — აქ მხოლოდ ის მოწმდება, რა ფოტოები გადაეცა და რომ მხოლოდ სანახავია
vi.mock('@/components/ui/photo-grid', () => ({
  PhotoGrid: ({ items, readOnly }: { items: { id: number; src: string }[]; readOnly?: boolean }) =>
    h('div', { 'data-testid': 'photo-grid', 'data-read-only': String(!!readOnly), 'data-src': items.map((i) => i.src).join(',') }),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

const record = (over: Partial<GuestRecord> = {}): GuestRecord => ({
  record: { id: 5, domain: 'movie', title_ka: null, title_en: 'Taken', year: 2008, image: null, rating: '7.8', my_rating: 9 },
  description: { ka: null, en: 'A retired agent.' },
  genres: [{ value: 'action', name_ka: null, name_en: 'Action' }],
  blocks: { gallery: false, cast: false, trailer: false },
  gallery: [],
  cast: [],
  trailer: null,
  ...over,
})

async function mount(path: string) {
  const { GuestRecordPage } = await import('@/pages/GuestRecordPage')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(
          MemoryRouter,
          { initialEntries: [path] },
          h(
            TooltipProvider,
            null,
            h(
              Routes,
              null,
              h(Route, { path: '/share/:token/:domain/:id', element: h(GuestRecordPage, { via: 'link' }) }),
              h(Route, { path: '/u/:username/:domain/:id', element: h(GuestRecordPage, { via: 'profile' }) }),
            ),
          ),
        ),
      ),
    ),
  )
  await flush()
  await flush()

  return container
}

describe('GuestRecordPage', () => {
  it('shows the record from a share link and draws no block that is switched off', async () => {
    mocks.fetchGuestRecord.mockResolvedValue(record())
    const box = await mount('/share/tok123/movie/5')

    expect(mocks.fetchGuestRecord).toHaveBeenCalledWith({ kind: 'link', token: 'tok123' }, 'movie', 5)
    expect(box.querySelector('h1')!.textContent).toBe('Taken')
    expect(box.textContent).toContain('A retired agent.')
    expect(box.querySelector('[data-testid="guest-genres"]')!.textContent).toContain('Action')
    expect(box.querySelector('[data-testid="guest-my-rating"]')!.textContent).toContain('9')
    // გამორთული ბლოკი — არც სათაური, არც „არ არის"
    expect(box.querySelector('[data-testid="guest-gallery"]')).toBeNull()
    expect(box.querySelector('[data-testid="guest-cast"]')).toBeNull()
    expect(box.querySelector('[data-testid="guest-trailer"]')).toBeNull()
    // „უკან" სიაზე აბრუნებს
    expect(box.querySelector('a')!.getAttribute('href')).toBe('/share/tok123')
  })

  it('draws the blocks the owner switched on, empty ones included', async () => {
    mocks.fetchGuestRecord.mockResolvedValue(
      record({
        blocks: { gallery: true, cast: true, trailer: true },
        gallery: [{ id: 1, path: 'gallery/images/one.jpg', category: 'still', width: 100, height: 50 }],
        cast: [{ name: 'Liam Neeson', name_ka: 'ლიამ ნისონი', character: 'Bryan', photo: null }],
        trailer: null,
      }),
    )
    const box = await mount('/u/nino/movie/5')

    expect(mocks.fetchGuestRecord).toHaveBeenCalledWith({ kind: 'profile', username: 'nino' }, 'movie', 5)
    const grid = box.querySelector('[data-testid="photo-grid"]')!
    expect(grid.getAttribute('data-src')).toBe('gallery/images/one.jpg')
    // სხვის გვერდზე ბადე მხოლოდ სანახავია
    expect(grid.getAttribute('data-read-only')).toBe('true')
    const cast = box.querySelector('[data-testid="guest-cast"]')!.textContent!
    expect(cast).toContain('Bryan')
    // ჩართული და ცარიელი ბლოკი „არ არის"-ს წერს
    expect(box.querySelector('[data-testid="guest-trailer"]')!.textContent).toContain(i18n.t('guestRecord.noTrailer'))
    expect(box.querySelector('a')!.getAttribute('href')).toBe('/u/nino')
  })

  it('says the record was not found and leads back to the list', async () => {
    mocks.fetchGuestRecord.mockRejectedValue(new Error('share_record_not_found'))
    const box = await mount('/share/tok123/movie/99')

    expect(box.textContent).toContain(i18n.t('guestRecord.notFound'))
    expect(box.querySelector('[data-testid="guest-record"]')).toBeNull()
    expect(box.querySelector('a')!.getAttribute('href')).toBe('/share/tok123')
  })
})
