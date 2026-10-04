import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { LIST_PAGE_SIZE, readPage, usePagedList, type Page } from './paged'
import { Pagination } from '@/components/ui/pagination'
import i18n from '@/i18n'

/* ============================================================
   `lib/paged.ts` — სიის პასუხის წაკითხვა და გვერდები (Tasks §46).

   ⚠️ ბექენდი **ორ ფორმას** აბრუნებს: გვერდს (`{data, meta}`) და მთელ სიას
   (`{data}`, `all=1`-ზე). ერთი წაკითხვა ორივეს უნდა უმკლავდებოდეს.

   ⚠️ §46: თითო მოთხოვნა **ერთი გვერდია** (`page` + `per_page=10`) — „მეტის
   ჩვენება" შემდეგ გვერდს ითხოვს და არა უფრო დიდ `per_page`-ს, ე.ი. ბექენდის
   500-იანი ჭერი ვეღარ შეგვხვდება; მიმდინარე გვერდი `?page=`-შია, ფილტრის
   შეცვლა პირველზე აბრუნებს, არარსებული გვერდი ბოლოზე გადადის.
   ============================================================ */

describe('readPage', () => {
  it('გვერდიდან ჯამს და ბოლო გვერდს `meta`-დან იღებს', () => {
    const page = readPage<{ id: number }>({ data: [{ id: 1 }, { id: 2 }], meta: { total: 353, last_page: 36 } })

    expect(page.items).toHaveLength(2)
    expect(page.total).toBe(353)
    expect(page.lastPage).toBe(36)
  })

  it('`meta`-ს გარეშე ჯამი თვითონ სიის სიგრძეა, გვერდი — ერთი (`all=1`)', () => {
    const page = readPage<{ id: number }>({ data: [{ id: 1 }, { id: 2 }] })

    expect(page.total).toBe(2)
    expect(page.lastPage).toBe(1)
  })

  it('ცარიელ და გაუმართავ პასუხზე არ ტყდება', () => {
    expect(readPage({ data: [] })).toEqual({ items: [], total: 0, lastPage: 1 })
    expect(readPage({})).toEqual({ items: [], total: 0, lastPage: 1 })
  })
})

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

/** 1234 ჩანაწერი — 124 გვერდი; ბექენდის ჭერი 500-ია, აქ მას ვერასდროს მივუახლოვდებით */
const TOTAL = 1234
const fetchPage = vi.fn(async (page: number, _filter = ''): Promise<Page<number>> => {
  const from = (page - 1) * LIST_PAGE_SIZE
  const items = Array.from({ length: Math.max(0, Math.min(LIST_PAGE_SIZE, TOTAL - from)) }, (_, i) => from + i + 1)
  return { items, total: TOTAL, lastPage: Math.ceil(TOTAL / LIST_PAGE_SIZE) }
})

let location = ''
let setFilter: (value: string) => void = () => {}

async function mount(entry = '/books') {
  const { useState } = await import('react')

  function Harness() {
    const [filter, set] = useState('')
    setFilter = set
    const list = usePagedList({ queryKey: ['test-list', { filter }], fetchPage: (page) => fetchPage(page, filter) })
    const loc = useLocation()
    location = loc.search
    return h('div', null, h('p', { 'data-testid': 'items' }, list.items.join(',')), h(Pagination, list.pagination))
  }

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(h(MemoryRouter, { initialEntries: [entry] }, h(QueryClientProvider, { client: qc }, h(Harness)))),
  )
  await flush()
  await flush()
  return container
}

const shown = () => document.querySelector('[data-testid="items"]')!.textContent!.split(',').filter(Boolean).map(Number)
const pageButton = (n: number) =>
  [...document.querySelectorAll<HTMLButtonElement>('[data-testid="pagination"] button')].find((b) => b.textContent === String(n))!

describe('usePagedList', () => {
  it('asks for one page of 10 at a time — „show more" asks for the next page, never a bigger per_page', async () => {
    fetchPage.mockClear()
    await mount()
    expect(shown()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

    // 60 „მეტის ჩვენება" — ძველ მოდელში ეს 610-იანი `per_page` იქნებოდა (ჭერი 500)
    for (let i = 0; i < 60; i++) {
      await act(async () => (document.querySelector('[data-testid="pagination-more"]') as HTMLButtonElement).click())
      await flush()
    }

    expect(shown()).toHaveLength(610)
    expect(shown().at(-1)).toBe(610)
    expect(fetchPage.mock.calls.map(([page]) => page)).toEqual(Array.from({ length: 61 }, (_, i) => i + 1))
    // ნომერი შეიცვალა — 61-ე გვერდი მიმდინარეა და მისამართშიც ზის
    expect(location).toBe('?page=61')
    expect(document.querySelector('[aria-current="page"]')?.textContent).toBe('61')
  })

  it('opens the page from the address, a number click moves there, and a filter change returns to the first', async () => {
    await mount('/books?page=7')
    expect(shown()[0]).toBe(61)
    expect(document.querySelector('[aria-current="page"]')?.textContent).toBe('7')

    await act(async () => pageButton(8).click())
    await flush()
    expect(shown()[0]).toBe(71)
    expect(location).toBe('?page=8')

    await act(async () => setFilter('dune'))
    await flush()
    await flush()
    expect(shown()[0]).toBe(1)
    expect(location).toBe('')
  })

  it('a page past the end moves to the last one', async () => {
    await mount('/books?page=500')
    await flush()

    expect(location).toBe('?page=124')
    expect(shown()).toEqual([1231, 1232, 1233, 1234])
  })
})

describe('Pagination numbers', () => {
  it('shows the total and, on a single page, no numbers', async () => {
    const { createElement } = await import('react')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root!.render(createElement(Pagination, { page: 1, lastPage: 1, total: 7, onPage: () => {} })))

    expect(container.textContent).toContain(i18n.t('pagination.total', { count: 7 }))
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })
})
