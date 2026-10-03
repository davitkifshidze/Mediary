import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Status } from '@/api/types'
import type { CollectionPart } from '@/api/media'
import i18n from '@/i18n'

/* ============================================================
   **რჩეულში დამატება — ფრანჩაიზი პოპაპით** (Tasks §18.5).

   ⚠️ მოწმდება: ორი ჩანართი; „მთელი ფრანჩაიზი" — ყველა ნაწილი ჩექბოქსით,
   ბეჯები „ეს ფილმი / ბიბლიოთეკაშია / დაემატება", რიცხვი ღილაკზე; მოხსნილი
   ნაწილი არც `parts`-ში მიდის, არც რიგში; არარსებული ნაწილი რიგში
   ნაგულისხმევი სტატუსით და `favorite: true`-თი ემატება (Q5); „მხოლოდ ეს
   ფილმი" — ცარიელი `parts`; უფრანჩაიზო პასუხზე დიალოგი კითხვის გარეშე
   უმალ რჩეულად ნიშნავს და იხურება.
   ============================================================ */

const statuses: Status[] = [
  { id: 1, key: 'to_watch', module: 'movie', name_ka: 'სანახავი', name_en: 'To watch', role: 'todo', icon: null, color: null, is_default: true, sort_order: 0 },
  { id: 2, key: 'watching', module: 'movie', name_ka: 'ვუყურებ', name_en: 'Watching', role: 'doing', icon: null, color: null, is_default: false, sort_order: 1 },
]

const part = (tmdb: number, title: string, owned: boolean, movieId: number | null): CollectionPart => ({
  tmdb_id: tmdb,
  title,
  year: 1999 + tmdb,
  rating: 7.5,
  poster: null,
  overview: `About ${title}`,
  owned,
  movie_id: movieId,
})

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  setFavorite: vi.fn(),
  enqueue: vi.fn(),
  toast: vi.fn(),
  statuses: { data: [] as unknown[] },
}))

vi.mock('@/api/media', async (original) => ({
  ...(await original<typeof import('@/api/media')>()),
  fetchMovieCollection: mocks.collection,
  mediaApi: () => ({ setFavorite: mocks.setFavorite }),
}))

vi.mock('@/lib/statuses', async (original) => ({
  ...(await original<typeof import('@/lib/statuses')>()),
  useStatuses: () => mocks.statuses,
}))

vi.mock('@/components/ui/queue', async (original) => ({
  ...(await original<typeof import('@/components/ui/queue')>()),
  useQueue: () => ({ enqueue: mocks.enqueue, isQueued: () => false }),
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

const movie = { id: 1, title_ka: 'მატრიცა', title_en: 'The Matrix', collection_name: 'Matrix' }

async function mount(parts: CollectionPart[]) {
  mocks.statuses.data = statuses
  mocks.collection.mockResolvedValue({ name: 'The Matrix Collection', parts })
  mocks.setFavorite.mockResolvedValue({})
  const onClose = vi.fn()
  const onDone = vi.fn()

  const { FranchiseFavoriteDialog } = await import('@/components/FranchiseFavoriteDialog')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FranchiseFavoriteDialog, { movie, onClose, onDone }))),
    ),
  )
  await flush()
  await flush()

  return { onClose, onDone }
}

const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)

const checkbox = (label: string) => document.querySelector<HTMLButtonElement>(`button[role="checkbox"][aria-label="${label}"]`)

const franchise = [part(10, 'Part 1', true, 1), part(20, 'Part 2', true, 2), part(30, 'Part 3', false, null)]

describe('FranchiseFavoriteDialog', () => {
  it('lists every part with its badge and sends only the ticked owned parts, queueing the missing ones', async () => {
    const { onClose, onDone } = await mount(franchise)

    expect(document.body.textContent).toContain(i18n.t('franchise.favoriteTitle', { name: 'The Matrix Collection' }))
    expect(document.body.textContent).toContain(i18n.t('franchise.thisOne'))
    expect(document.body.textContent).toContain(i18n.t('franchise.inLibrary'))
    expect(document.body.textContent).toContain(i18n.t('franchise.willAdd'))
    expect(document.body.textContent).toContain('About Part 3')
    expect(checkbox('Part 1')?.disabled).toBe(true)
    expect(button(i18n.t('franchise.addFavorites', { count: 3 }))).toBeDefined()

    await act(async () => button(i18n.t('franchise.addFavorites', { count: 3 }))!.click())
    await flush()

    expect(mocks.setFavorite).toHaveBeenCalledWith(1, true, [2])
    expect(mocks.enqueue).toHaveBeenCalledWith(
      [{ tmdbId: 30, title: 'Part 3', status: 'to_watch', favorite: true }],
      'movie',
    )
    expect(onDone).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('an unticked part is neither favourited nor queued', async () => {
    await mount(franchise)

    await act(async () => checkbox('Part 3')!.click())
    await flush()
    expect(button(i18n.t('franchise.addFavorites', { count: 2 }))).toBeDefined()
    // ახალი აღარ ემატება — სტატუსის ამრჩევიც ქრება
    expect(document.body.textContent).not.toContain(i18n.t('franchise.newStatus', { count: 1 }))

    await act(async () => button(i18n.t('franchise.addFavorites', { count: 2 }))!.click())
    await flush()

    expect(mocks.setFavorite).toHaveBeenCalledWith(1, true, [2])
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it('"only this film" favourites just this one', async () => {
    await mount(franchise)

    await act(async () => button(i18n.t('franchise.onlyThis'))!.click())
    await flush()
    expect(document.body.textContent).toContain(i18n.t('franchise.onlyThisHint', { title: 'მატრიცა' }))

    await act(async () => button(i18n.t('franchise.addFavorites', { count: 1 }))!.click())
    await flush()

    expect(mocks.setFavorite).toHaveBeenCalledWith(1, true, [])
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it('without other parts it favourites at once and closes without asking', async () => {
    const { onClose, onDone } = await mount([part(10, 'Part 1', true, 1)])

    expect(mocks.setFavorite).toHaveBeenCalledWith(1, true, [])
    expect(onDone).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
    expect(button(i18n.t('franchise.onlyThis'))).toBeUndefined()
  })
})
