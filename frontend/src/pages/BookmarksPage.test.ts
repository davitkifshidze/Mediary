import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Bookmark } from '@/api/bookmarks'
import type { Status } from '@/api/types'
import i18n from '@/i18n'

/* ============================================================
   **ბუკმარკის რიგი — სტატუსი ნიშნიდან და მარჯვენა კლიკიდან** (Tasks §24).

   ⚠️ სელექთი ქრება და სტატუსი ნიშნით იცვლება; იგივე ცვლილება კონტექსტური
   მენიუდანაც. ორივე გზამ **ერთი და იგივე** `setBookmarkStatus(id, key)`
   უნდა დაუძახოს — ეს მხოლოდ მონტირებით ჩანს.
   ============================================================ */

const statuses: Status[] = [
  { id: 1, key: 'open', module: 'bookmark', name_ka: 'მიმდინარე', name_en: 'Open', role: 'doing', icon: null, color: null, is_default: true, sort_order: 0 },
  { id: 2, key: 'done', module: 'bookmark', name_ka: 'დასრულებული', name_en: 'Done', role: 'done', icon: null, color: null, is_default: false, sort_order: 1 },
] as Status[]

const bookmark: Bookmark = {
  id: 7,
  title: 'Laravel docs',
  url: 'https://laravel.com/docs',
  domain: 'laravel.com',
  description: null,
  category_id: null,
  category: null,
  tags: [],
  image: null,
  favicon_url: null,
  status: statuses[0],
  is_favorite: false,
  visit_count: 0,
  visited_at: null,
  visibility: 'private',
  created_at: null,
}

const mocks = vi.hoisted(() => ({
  setBookmarkStatus: vi.fn(),
  fetchBookmarks: vi.fn(),
  fetchBookmarkCategories: vi.fn(),
  statuses: { data: [] as unknown[] },
}))

vi.mock('@/api/bookmarks', async (original) => ({
  ...(await original<typeof import('@/api/bookmarks')>()),
  setBookmarkStatus: mocks.setBookmarkStatus,
  fetchBookmarks: mocks.fetchBookmarks,
  fetchBookmarkCategories: mocks.fetchBookmarkCategories,
}))

vi.mock('@/lib/statuses', async (original) => ({
  ...(await original<typeof import('@/lib/statuses')>()),
  useStatuses: () => mocks.statuses,
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

async function mount() {
  mocks.statuses.data = statuses
  mocks.fetchBookmarks.mockResolvedValue({ items: [bookmark], total: 1, lastPage: 1 })
  mocks.fetchBookmarkCategories.mockResolvedValue([])
  mocks.setBookmarkStatus.mockResolvedValue({ ...bookmark, status: statuses[1] })

  const { BookmarksPage } = await import('@/pages/BookmarksPage')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: ['/bookmarks'] },
        h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(BookmarksPage))),
      ),
    ),
  )
  await flush()
  await flush()

  return container
}

const menuItem = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('button, [role="menuitem"]')].find(
    (el) => el.textContent?.trim() === label,
  )

describe('BookmarksPage row', () => {
  it('the status mark opens the statuses and sends the picked key', async () => {
    const el = await mount()

    const mark = el.querySelector<HTMLButtonElement>(`button[aria-label="${i18n.t('bookmarks.statusChange')}"]`)
    expect(mark?.textContent).toContain(statuses[0].name_ka)

    await act(async () => mark!.click())
    await flush()

    await act(async () => menuItem(statuses[1].name_ka)!.click())
    await flush()

    expect(mocks.setBookmarkStatus).toHaveBeenCalledWith(7, 'done')
  })

  it('right click opens the context menu with open, status, favourite, edit and delete', async () => {
    const el = await mount()
    const row = el.querySelector('li')!

    await act(async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }))
    })
    await flush()

    for (const label of [
      i18n.t('bookmarks.open'),
      i18n.t('bookmarks.status'),
      i18n.t('actions.favorite'),
      i18n.t('actions.edit'),
      i18n.t('actions.delete'),
    ]) {
      expect(
        [...document.querySelectorAll('[role="menuitem"]')].some((m) => m.textContent?.includes(label)),
        label,
      ).toBe(true)
    }
  })
})
