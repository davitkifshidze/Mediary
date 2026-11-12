import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { MovieListItem } from '@/api/types'
import i18n from '@/i18n'

/* ============================================================
   **ფრანჩაიზის დაუმატებელი ნაწილი სიაში — მკრთალი ბარათი**.

   ⚠️ მოწმდება: ბარათი და რიგი მკრთალია და „აკლია"-ს აწერია, გამოუსვლელ ნაწილს —
   „მალე"; დაჭერა ნაწილს „აღმოჩენის" რიგში ამატებს (ფილმად); რიგში მყოფი ნაწილი
   აღარ არის მკრთალი და მეორედ არ ემატება.
   ============================================================ */

const mocks = vi.hoisted(() => ({ enqueue: vi.fn(), queued: new Set<number>() }))

const queue = { enqueue: mocks.enqueue, isQueued: (id: number) => mocks.queued.has(id) }
vi.mock('@/components/ui/queue', async (original) => ({
  ...(await original<typeof import('@/components/ui/queue')>()),
  useQueue: () => queue,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  mocks.queued.clear()
  vi.clearAllMocks()
})

const ghost = (over: Partial<MovieListItem> = {}): MovieListItem => ({
  id: -604,
  ghost: true,
  tmdb_id: 604,
  title_ka: null,
  title_en: 'Reloaded',
  year: 2003,
  release_date: '2003-05-15',
  released: true,
  rating: '7.0',
  my_rating: null,
  poster: null,
  status: null,
  is_favorite: false,
  collection_id: 2344,
  collection_name: 'The Matrix Collection',
  genres: [],
  ...over,
})

async function render(kind: 'card' | 'row', part: MovieListItem) {
  const { FranchiseGhostCard, FranchiseGhostRow } = await import('@/components/FranchiseGhost')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root!.render(h(kind === 'card' ? FranchiseGhostCard : FranchiseGhostRow, { part })))

  return container.querySelector<HTMLElement>('[data-testid="franchise-ghost"]')!
}

describe('FranchiseGhost', () => {
  it('draws a faded card that says the part is missing and adds it on press', async () => {
    const card = await render('card', ghost())

    expect(card.className).toContain('opacity-50')
    expect(card.textContent).toContain('Reloaded')
    expect(card.textContent).toContain(`2003 · ${i18n.t('franchise.missing')}`)

    await act(async () => card.click())
    expect(mocks.enqueue).toHaveBeenCalledWith([{ tmdbId: 604, title: 'Reloaded' }], 'movie')
  })

  it('marks an unreleased part as coming soon', async () => {
    const card = await render('card', ghost({ year: null, release_date: null, released: false, title_en: 'Matrix 5' }))

    expect(card.textContent).toContain(i18n.t('soon.section'))
  })

  it('is no longer faded and cannot be added twice while it is queued', async () => {
    mocks.queued.add(604)
    const card = await render('card', ghost())

    expect(card.className).not.toContain('opacity-50')
    expect(card.textContent).toContain(i18n.t('queue.queued'))

    await act(async () => card.click())
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  it('has a row form with the franchise name and an add button', async () => {
    const row = await render('row', ghost())

    expect(row.textContent).toContain('The Matrix Collection')
    await act(async () => row.querySelector('button')!.click())
    expect(mocks.enqueue).toHaveBeenCalledWith([{ tmdbId: 604, title: 'Reloaded' }], 'movie')
  })
})
