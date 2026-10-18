import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { MovieListItem, Status } from '@/api/types'
import type { RecordLayout } from '@/lib/recordLayout'
import i18n from '@/i18n'

/* ============================================================
   **ფილმი/სერიალი/ანიმე — სამი ხედი**.

   ⚠️ მოწმდება: „ბარათები" ახლანდელი ბადეა (პარამეტრების ზომით), „ბადე" —
   კომპაქტური ზომა, „სტრიქონები" — ახალი რიგი: პოსტერი, სათაური, წელი ·
   ჟანრი · TMDB და მოქმედებების ზოლი (ჩემი ქულა · სტატუსი · რჩეული · რედაქტირება ·
   წაშლა); დამალული ჩანაწერი სტრიქონშიც მხოლოდ ბოქლომითა და სათაურით ჩანს;
   რედაქტირება ფორმის გვერდზე გადადის.
   ============================================================ */

const statuses: Status[] = [
  { id: 1, key: 'to_watch', module: 'movie', name_ka: 'სანახავი', name_en: 'To watch', role: 'todo', icon: null, color: null, is_default: true, sort_order: 0 },
] as Status[]

vi.mock('@/lib/statuses', async (original) => ({
  ...(await original<typeof import('@/lib/statuses')>()),
  useStatuses: () => ({ data: statuses }),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

const movie = {
  id: 3,
  title_ka: 'დიუნა',
  title_en: 'Dune',
  year: 2021,
  rating: '7.8',
  my_rating: 9,
  poster: 'https://img.test/dune.jpg',
  status: statuses[0],
  is_favorite: false,
  genres: [{ id: 1, name_en: 'Science Fiction', name_ka: 'ფანტასტიკა', slug: 'sci-fi' }],
  missing: [],
} as unknown as MovieListItem

const hidden = { id: 4, title_ka: 'საიდუმლო', title_en: 'Secret', hidden: true, locked: true, genres: [] } as unknown as MovieListItem

async function render(layout: RecordLayout) {
  const { MovieGrid } = await import('@/components/MovieGrid')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: ['/movies'] },
        h(
          QueryClientProvider,
          { client: qc },
          h(
            TooltipProvider,
            null,
            h(
              FeedbackProvider,
              null,
              h(
                Routes,
                null,
                h(Route, { path: '/movies', element: h(MovieGrid, { movies: [movie, hidden], type: 'movie', layout }) }),
                h(Route, { path: '/movies/:id/edit', element: h('p', { 'data-testid': 'edit-page' }, 'edit') }),
              ),
            ),
          ),
        ),
      ),
    ),
  )
  return container
}

describe('MovieGrid layouts', () => {
  it('rows: poster, title, year · genre · TMDB and the shared bar; the hidden one only with a lock', async () => {
    const el = await render('rows')

    const rows = [...el.querySelectorAll<HTMLElement>('[data-record-layout="rows"]')]
    expect(rows).toHaveLength(2)
    const row = rows[0]
    expect(row.textContent).toContain('დიუნა')
    expect(row.textContent).toContain('2021')
    expect(row.textContent).toContain('ფანტასტიკა')
    expect(row.textContent).toContain('TMDB 7.8')
    const bar = row.querySelector('[data-testid="record-actions"]')!
    expect(bar.textContent).toContain('სანახავი')
    expect(bar.textContent).toContain(i18n.t('actions.edit'))

    const locked = el.querySelector('[data-testid="media-locked-row"]')!
    expect(locked.textContent).toContain('საიდუმლო')
    expect(locked.textContent).toContain(i18n.t('lock.badgeLocked'))
    expect(locked.querySelector('[data-testid="record-actions"]')).toBeNull()

    const edit = [...bar.querySelectorAll('button')].find((b) => b.textContent === i18n.t('actions.edit'))!
    await act(async () => edit.click())
    expect(document.querySelector('[data-testid="edit-page"]')).not.toBeNull()
  })

  it('cards keep the current grid, the grid is its compact size', async () => {
    let el = await render('cards')
    expect(el.querySelector('[data-record-layout]')).toBeNull()
    expect(el.querySelector('.grid')?.className).toContain('grid-cols-2')
    expect(el.querySelector('[data-testid="media-locked-card"]')).not.toBeNull()

    act(() => root?.unmount())
    container?.remove()

    el = await render('grid')
    expect(el.querySelector('.grid')?.className).toContain('grid-cols-3')
  })
})
