import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { Place } from '@/api/places'
import i18n from '@/i18n'

/* ============================================================
   **ადგილის რიგი — ერთი მოქმედებების ზოლი** (Tasks §29.1/§29.4).

   ⚠️ აქამდე სტატუსი **ორჯერ** იყო (ბეჯი სათაურთან და `Select` ზოლში) და
   რუკა აიქონ-ბმულად. მოწმდება: სტატუსი ერთხელ, ჩამოსაშლელი; „რუკა" ტექსტით;
   კოორდინატის გარეშე სლოტი უხილავი, მაგრამ ადგილზე.
   ============================================================ */

function place(id: number, over: Partial<Place> = {}): Place {
  return {
    id,
    name: `Place ${id}`,
    address: null,
    city: 'Tbilisi',
    country: 'Georgia',
    lat: 41.7,
    lng: 44.8,
    osm_id: null,
    osm_type: null,
    map_url: 'https://www.openstreetmap.org/?mlat=41.7&mlon=44.8',
    description: null,
    category_id: null,
    category: null,
    tags: [],
    status: 'to_visit',
    rating: null,
    is_favorite: false,
    visits_count: 0,
    visited_at: null,
    photo: null,
    files_count: 1,
    photos_count: 0,
    visibility: 'private',
    created_at: null,
    ...over,
  }
}

const items = [place(1), place(2, { lat: null, lng: null, map_url: null, files_count: 0 })]

const mocks = vi.hoisted(() => ({
  fetchPlaces: vi.fn(),
  fetchPlaceCategories: vi.fn(),
  fetchPlaceCountries: vi.fn(),
  setPlaceStatus: vi.fn(),
}))

vi.mock('@/api/places', async (original) => ({
  ...(await original<typeof import('@/api/places')>()),
  fetchPlaces: mocks.fetchPlaces,
  fetchPlaceCategories: mocks.fetchPlaceCategories,
  fetchPlaceCountries: mocks.fetchPlaceCountries,
  setPlaceStatus: mocks.setPlaceStatus,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

/* მძიმე მოდულების გათბობა ტესტის ბიუჯეტის გარეთ (DEBT-12-ის წესი, `NoteReminders.test.ts`):
   გვერდი დეტალის ფანჯარასთან ერთად Leaflet-ის ლეიზი საზღვარსაც იწევს და სრულ `npm test`-ში
   პირველი ტესტი 5 წმ-ს სცდებოდა — ერთჯერადი იმპორტი ჰუკშია, თავისი ვადით. */
beforeAll(async () => {
  await import('@/pages/PlacesPage')
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

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount() {
  mocks.fetchPlaces.mockResolvedValue({ items, total: items.length, lastPage: 1 })
  mocks.fetchPlaceCategories.mockResolvedValue([])
  mocks.fetchPlaceCountries.mockResolvedValue([])
  mocks.setPlaceStatus.mockResolvedValue({ ...items[0], status: 'visited' })

  const { PlacesPage } = await import('@/pages/PlacesPage')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: ['/places'] },
        h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, h(PlacesPage)))),
      ),
    ),
  )
  await flush()
  await flush()

  return container
}

const bars = () => [...document.querySelectorAll<HTMLElement>('[data-testid="record-actions"]')]
const menuItem = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('button, [role="menuitem"]')].find((el) => el.textContent?.trim() === label)

describe('PlacesPage row (§29.1)', () => {
  it('shows the status once as a dropdown, the map as a text button and keeps the slot without coordinates', async () => {
    await mount()

    const [first, second] = bars()
    expect(bars()).toHaveLength(2)

    for (const child of [...first.children]) {
      expect(child.matches('.h-9') || child.querySelector('.h-9') !== null, child.outerHTML).toBe(true)
    }

    // სტატუსი მთელ რიგზე ერთხელ — სათაურთან ბეჯი აღარ არის
    const row = first.closest('li')!
    expect(row.querySelectorAll(`[aria-label="${i18n.t('places.status')}"]`)).toHaveLength(1)
    expect(row.textContent?.split(i18n.t('places.statuses.to_visit')).length).toBe(2)
    // ⚠️ რიგის შიგნით — სათაურის დალაგების სელექთი ცალკე ამბავია
    expect(row.querySelector('[role="combobox"]')).toBeNull()

    const map = first.querySelector<HTMLAnchorElement>('[data-testid="link-slot"]')!
    expect(map.textContent).toContain(i18n.t('actions.map'))
    expect(map.getAttribute('href')).toContain('openstreetmap.org')
    expect(first.querySelector('[data-testid="files-button"]')?.textContent).toContain('1')

    const empty = second.querySelector<HTMLAnchorElement>('[data-testid="link-slot"]')!
    expect(empty.className).toContain('invisible')
  })

  it('the status dropdown sends the picked status', async () => {
    await mount()

    const trigger = bars()[0].querySelector<HTMLButtonElement>(`button[aria-label="${i18n.t('places.status')}"]`)!
    await act(async () => trigger.click())
    await flush()

    await act(async () => menuItem(i18n.t('places.statuses.visited'))!.click())
    await flush()

    expect(mocks.setPlaceStatus).toHaveBeenCalledWith(1, 'visited')
  })
})
