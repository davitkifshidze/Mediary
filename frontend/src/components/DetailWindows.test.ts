import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Book } from '@/api/books'
import type { BoardGame } from '@/api/boardGames'
import type { Place } from '@/api/places'
import i18n from '@/i18n'

/* ============================================================
   **დეტალის ფანჯრების ერთი რიგი** (Tasks §26.4).

   შენი სიტყვები: „ფოტოები ბოლოშია — ზემოთ გააკეთე… ყველა მოდულში".
   თამაშის ფანჯარამ ეს §22.2-ში დაადგინა; აქ მოწმდება, რომ წიგნი,
   სამაგიდო და ადგილიც იმავეს აკეთებს: თავში მთავარი ფოტო და ცნობები,
   **ფოტოების სექცია დოკუმენტებზე ადრე**. რიგი მხოლოდ მონტირებით ჩანს.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchBookFiles: vi.fn().mockResolvedValue([]),
  fetchBookNotes: vi.fn().mockResolvedValue([]),
  fetchBoardGameFiles: vi.fn().mockResolvedValue([]),
  fetchBoardGameNotes: vi.fn().mockResolvedValue([]),
  fetchPlaceFiles: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/api/books', async (original) => ({
  ...(await original<typeof import('@/api/books')>()),
  fetchBookFiles: mocks.fetchBookFiles,
  fetchBookNotes: mocks.fetchBookNotes,
}))
vi.mock('@/api/boardGames', async (original) => ({
  ...(await original<typeof import('@/api/boardGames')>()),
  fetchBoardGameFiles: mocks.fetchBoardGameFiles,
  fetchBoardGameNotes: mocks.fetchBoardGameNotes,
}))
vi.mock('@/api/places', async (original) => ({
  ...(await original<typeof import('@/api/places')>()),
  fetchPlaceFiles: mocks.fetchPlaceFiles,
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
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(node: ReactElement) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root!.render(h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, node))))
  await flush()
}

/** სექციის სათაურების რიგი ფანჯარაში */
const headings = () => [...document.querySelectorAll('h3')].map((el) => el.textContent?.trim() ?? '')

const before = (list: string[], first: string, second: string) => {
  const a = list.findIndex((x) => x.startsWith(first))
  const b = list.findIndex((x) => x.startsWith(second))
  expect(a, `${first} არ ჩანს`).toBeGreaterThanOrEqual(0)
  expect(b, `${second} არ ჩანს`).toBeGreaterThanOrEqual(0)
  expect(a).toBeLessThan(b)
}

describe('detail windows (§26.4)', () => {
  it('book: cover and facts on top, photos before files and notes', async () => {
    const { BookDetail } = await import('@/components/BookDetail')
    const book = {
      id: 1,
      title_en: 'Dune',
      title_ka: null,
      author: 'Frank Herbert',
      year: 1965,
      pages: 412,
      format: 'print',
      status: 'reading',
      rating: 9,
      cover: 'https://covers.test/dune.jpg',
      links: [],
      source_url: null,
      visibility: 'private',
    } as unknown as Book
    await mount(h(BookDetail, { book, onClose: () => {} }))

    expect(document.querySelector('img[alt="Dune"]')?.getAttribute('src')).toBe('https://covers.test/dune.jpg')
    expect(document.body.textContent).toContain('Frank Herbert')
    // ⚠️ გვერდების რიცხვი ჩანს (აქამდე მხოლოდ „გვ." იწერებოდა)
    expect(document.body.textContent).toContain(i18n.t('books.pagesShort', { count: 412 }))
    expect(i18n.t('books.pagesShort', { count: 412 })).toContain('412')

    const list = headings()
    before(list, i18n.t('books.photosTitle'), i18n.t('books.filesTitle'))
    before(list, i18n.t('books.filesTitle'), i18n.t('books.notesTitle'))
  })

  it('board game: photos come right after the header, before shops and rules', async () => {
    const { BoardGameDetail } = await import('@/components/BoardGameDetail')
    const game = {
      id: 2,
      title: 'Catan',
      designer: 'Klaus Teuber',
      image: null,
      links: [{ url: 'https://shop.test/catan', label: 'Shop' }],
      visibility: 'private',
    } as unknown as BoardGame
    await mount(h(BoardGameDetail, { game, onClose: () => {} }))

    expect(document.body.textContent).toContain('Klaus Teuber')
    const list = headings()
    before(list, i18n.t('boardGames.galleryTitle'), i18n.t('boardGames.shops'))
    before(list, i18n.t('boardGames.shops'), i18n.t('boardGames.rulesTitle'))
  })

  it('place: photos before the documents', async () => {
    const { PlaceDetail } = await import('@/components/PlaceDetail')
    const place = {
      id: 3,
      name: 'Vardzia',
      status: 'visited',
      rating: 8,
      photo: null,
      address: 'Aspindza',
      visibility: 'private',
    } as unknown as Place
    await mount(h(PlaceDetail, { place, onClose: () => {} }))

    expect(document.body.textContent).toContain('Aspindza')
    before(headings(), i18n.t('places.fileKinds.image'), i18n.t('places.fileKinds.doc'))
  })
})
