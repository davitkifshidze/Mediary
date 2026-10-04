import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { ActorCard, ActorList, HiddenActorCard } from '@/api/actors'
import i18n from '@/i18n'

/* ============================================================
   **მსახიობების გვერდი `/actors` (Tasks §35.2)** — ბარათები ჩემი რიცხვებით,
   სქესის ჭრილი მთვლელით, პანელის ფილტრი სერვერამდე მიდის, მარჯვენა ღილაკის
   მენიუ და „წაშლა ჩემი ჩანაწერებიდან" დადასტურებით.
   ============================================================ */

const liam: ActorCard = {
  id: 7,
  name: 'Liam Neeson',
  name_ka: 'ლიამ ნისონი',
  photo: null,
  gender: 2,
  known_for: 'Acting',
  popularity: 12.5,
  has_tmdb: true,
  synced: true,
  counts: { movie: 3, series: 1, anime: 0 },
  records: 4,
  photos: 2,
  tags: ['portrait'],
}

const list = (items: (ActorCard | HiddenActorCard)[]): ActorList => ({
  items,
  total: items.length,
  page: 1,
  last_page: 1,
  per_page: 40,
  facets: { gender: { all: 5, female: 2, male: 3 } },
  options: { known_for: ['Acting', 'Directing'], tags: ['portrait'] },
})

const mocks = vi.hoisted(() => ({
  fetchActors: vi.fn(),
  detachActorEverywhere: vi.fn(),
}))

vi.mock('@/api/actors', async (original) => ({
  ...(await original<typeof import('@/api/actors')>()),
  ...mocks,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeAll(async () => {
  await import('@/pages/ActorsPage')
}, 60_000)
vi.setConfig({ testTimeout: 15_000 })

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

async function render(path = '/actors') {
  mocks.fetchActors.mockResolvedValue(list([liam]))
  mocks.detachActorEverywhere.mockResolvedValue({ removed: 4, skipped: 0 })

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const { ActorsPage } = await import('@/pages/ActorsPage')
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () =>
    root!.render(
      h(MemoryRouter, { initialEntries: [path] }, h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, h(ActorsPage))))),
    ),
  )
  await flush()
}

const lastFilters = () => mocks.fetchActors.mock.calls.at(-1)![0]

const button = (text: string, scope: ParentNode = document) =>
  [...scope.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement

describe('ActorsPage', () => {
  it('draws my actors with my counts and the gender facets', async () => {
    await render()

    const tile = container!.querySelector('[data-testid="actor-tile"]')!
    expect(tile.getAttribute('href')).toBe('/actors/7')
    expect(tile.textContent).toContain('ლიამ ნისონი')
    expect(tile.textContent).toContain(i18n.t('actors.countMovies', { count: 3 }))
    expect(tile.textContent).toContain(i18n.t('actors.countSeries', { count: 1 }))
    expect(tile.textContent).not.toContain(i18n.t('actors.countAnime', { count: 0 }))
    expect(button(i18n.t('actors.gender.male')).textContent).toContain('3')

    // Tasks §46 — გვერდზე 10
    expect(lastFilters()).toMatchObject({ sort: 'name', page: 1, per_page: 10 })
  })

  it('sends the gender cut and a panel filter to the server', async () => {
    await render()

    await act(async () => button(i18n.t('actors.gender.female')).click())
    await flush()
    expect(lastFilters()).toMatchObject({ gender: 'female' })

    const option = [...document.querySelectorAll('label')].find((l) => l.textContent?.includes(i18n.t('actors.dept.directing')))!
    await act(async () => option.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click())
    await act(async () => button(i18n.t('filter.apply')).click())
    await flush()

    expect(lastFilters()).toMatchObject({ gender: 'female', known_for: 'Directing' })
  })

  it('removes the actor from my records from the right-click menu after confirming', async () => {
    await render()

    const tile = container!.querySelector('[data-testid="actor-tile"]')!
    await act(async () => {
      tile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }))
    })
    await flush()

    const item = (label: string) =>
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((m) => m.textContent?.trim() === label)

    for (const label of [i18n.t('actions.open'), i18n.t('actors.menuTags'), i18n.t('actors.menuWebPhotos'), i18n.t('actors.menuSync')]) {
      expect(item(label), label).toBeTruthy()
    }

    await act(async () => item(i18n.t('actors.menuRemove'))!.click())
    await flush()
    expect(mocks.detachActorEverywhere).not.toHaveBeenCalled()

    await act(async () => button(i18n.t('confirm.confirm')).click())
    await flush()

    expect(mocks.detachActorEverywhere).toHaveBeenCalledWith(7)
  })

  /* Tasks §35.5 — ჩემ მიერ ჩაკეტილი: მხოლოდ სახელი და ბოქლომი, მენიუს გარეშე; ფილტრი სერვერამდე მიდის */
  it('draws a hidden actor as a padlock tile and sends the locked-only filter', async () => {
    await render()
    const hidden: HiddenActorCard = {
      id: 9,
      name: 'Secret Actor',
      name_ka: null,
      hidden: true,
      locked: true,
      unlocked: false,
      lock_hint: null,
      unlock_blocked_until: null,
    }
    mocks.fetchActors.mockResolvedValue(list([hidden]))

    const option = [...document.querySelectorAll('label')].find((l) => l.textContent?.includes(i18n.t('actors.filter.lockedOnly')))!
    await act(async () => option.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click())
    await act(async () => button(i18n.t('filter.apply')).click())
    await flush()

    expect(lastFilters()).toMatchObject({ locked: true })

    const tile = container!.querySelector('[data-testid="actor-locked-tile"]') as HTMLButtonElement
    expect(tile.textContent).toContain('Secret Actor')
    expect(container!.querySelector('[data-testid="actor-tile"]')).toBeNull()

    await act(async () => tile.click())
    await flush()
    expect(document.getElementById('record-unlock')).toBeTruthy()
  })
})
