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
   **ადგილის რიგი — ერთი მოქმედებების ზოლი**.

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
    visited_at: null,
    photo: null,
    phone: null,
    website: null,
    opening_hours: [],
    source_rating: null,
    source_rating_count: null,
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
  searchPlaces: vi.fn(),
  lookupPlace: vi.fn(),
  placeFromLink: vi.fn(),
  reverseGeocode: vi.fn(),
  updatePlace: vi.fn(),
}))

vi.mock('@/api/places', async (original) => ({
  ...(await original<typeof import('@/api/places')>()),
  fetchPlaces: mocks.fetchPlaces,
  fetchPlaceCategories: mocks.fetchPlaceCategories,
  fetchPlaceCountries: mocks.fetchPlaceCountries,
  setPlaceStatus: mocks.setPlaceStatus,
  searchPlaces: mocks.searchPlaces,
  lookupPlace: mocks.lookupPlace,
  placeFromLink: mocks.placeFromLink,
  reverseGeocode: mocks.reverseGeocode,
  updatePlace: mocks.updatePlace,
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  fetchModuleFields: async () => [],
  fetchCustomFields: async () => [],
  fetchCustomFieldValues: async () => ({}),
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

/* მძიმე მოდულების გათბობა ტესტის ბიუჯეტის გარეთ (როგორც `NoteReminders.test.ts`-ში):
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

async function mount(list: Place[] = items, categories: unknown[] = []) {
  mocks.fetchPlaces.mockResolvedValue({ items: list, total: list.length, lastPage: 1 })
  mocks.fetchPlaceCategories.mockResolvedValue(categories)
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

describe('PlacesPage row', () => {
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

    // შეფასება (უშეფასებოზე არაფერი) რუკის წინაა — რუკა და სტატუსი ყოველთვის გვერდიგვერდ
    for (const bar of [first, second]) {
      const slot = bar.querySelector('[data-testid="link-slot"]')!
      const status = bar.querySelector(`button[aria-label="${i18n.t('places.status')}"]`)!
      expect(slot.nextElementSibling === status || slot.nextElementSibling?.contains(status)).toBe(true)
    }
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

/* ============================================================
   სახელით ძებნა წერისას (Google) და Google Maps-ის ბმული.
   ============================================================ */
describe('PlacesPage form — suggestions while typing and a Google Maps link', () => {
  const category = { id: 5, key: 'food', name_ka: 'რესტორანი', name_en: 'Restaurant', icon: null, sort_order: 0 }

  const draft = {
    source: 'google' as const,
    source_id: 'ChIJpictogram0001',
    osm_id: null,
    osm_type: null,
    name: 'პიქტოგრამა',
    address: 'კოსტავას ქ. 12, თბილისი',
    city: 'თბილისი',
    country: 'საქართველო',
    lat: 41.7151,
    lng: 44.8271,
    kind: 'რესტორანი',
    rating: 4.6,
    rating_count: 1234,
    phone: '032 222 22 22',
    website: 'https://pictogram.ge',
    hours: ['ორშაბათი: 11:00–23:00', 'სამშაბათი: 11:00–23:00'],
    photo: 'https://lh3.googleusercontent.com/p1',
    photos: ['https://lh3.googleusercontent.com/p1', 'https://lh3.googleusercontent.com/p2'],
    maps_url: null,
  }

  async function type(el: HTMLInputElement, value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  async function openAdd() {
    await act(async () => menuItem(i18n.t('places.add'))!.click())
    await flush()
  }

  const value = (selector: string) => document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)?.value

  it('suggests while typing (Google) and a pick fills everything, the category too', async () => {
    mocks.searchPlaces.mockResolvedValue({
      results: [{ ...draft, address: 'კოსტავას ქ., თბილისი', lat: null, lng: null, phone: null, hours: [], photo: null, photos: [] }],
      source: 'google',
      live: true,
    })
    mocks.lookupPlace.mockResolvedValue(draft)
    await mount([], [category])
    await openAdd()

    await type(document.querySelector<HTMLInputElement>('#p-lookup')!, 'პიქტოგრამა')
    // მცირე პაუზა (450 ms) და მოთხოვნა — Enter-ის გარეშე
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 520))
    })
    await flush()

    expect(mocks.searchPlaces).toHaveBeenCalledWith('პიქტოგრამა', { live: true, session: expect.any(String) })
    const pick = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('კოსტავას ქ., თბილისი'))!
    await act(async () => pick.click())
    await flush()

    expect(mocks.lookupPlace).toHaveBeenCalledWith(expect.objectContaining({ source: 'google' }), 'პიქტოგრამა', expect.any(String))
    expect(value('#p-name')).toBe('პიქტოგრამა')
    expect(value('#p-city')).toBe('თბილისი')
    expect(value('#p-phone')).toBe('032 222 22 22')
    expect(value('#p-website')).toBe('https://pictogram.ge')
    expect(value('#p-hours')).toBe('ორშაბათი: 11:00–23:00\nსამშაბათი: 11:00–23:00')
    expect(value('#p-lat')).toBe('41.7151')
    expect(document.querySelector('[data-testid="source-rating"]')?.textContent).toContain('4.6')
    // კატეგორია სახელით — „რესტორანი"
    expect(document.querySelector('#p-category')?.textContent).toContain('რესტორანი')
  })

  it('without a Google key it stops suggesting and waits for Enter', async () => {
    mocks.searchPlaces.mockResolvedValue({ results: [], live: false })
    await mount([], [category])
    await openAdd()

    const input = document.querySelector<HTMLInputElement>('#p-lookup')!
    await type(input, 'პიქტოგრამა')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 520))
    })
    await type(input, 'პიქტოგრამა თბილისი')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 520))
    })

    // ერთი ცდა `live`-ით, მერე — აღარ
    expect(mocks.searchPlaces).toHaveBeenCalledTimes(1)
  })

  it('a pasted Google Maps link fills the form, and saving sends the source details and photos', async () => {
    const existing = place(9, { name: 'ჩემი სახინკლე', category_id: 5, category, status: 'to_visit', lat: null, lng: null })
    mocks.placeFromLink.mockResolvedValue(draft)
    mocks.updatePlace.mockResolvedValue(existing)
    await mount([existing], [category])

    const edit = [...document.querySelectorAll<HTMLButtonElement>('[data-testid="record-actions"] button')].find((b) =>
      b.textContent?.includes(i18n.t('actions.edit')),
    )!
    await act(async () => edit.click())
    await flush()

    const link = document.querySelector<HTMLInputElement>('#p-maplink')!
    await type(link, 'https://maps.app.goo.gl/AbCdEf123')
    await act(async () => {
      link.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    await flush()

    expect(mocks.placeFromLink).toHaveBeenCalledWith('https://maps.app.goo.gl/AbCdEf123')
    // შენი სახელი რჩება, დანარჩენი — ბმულიდან
    expect(value('#p-name')).toBe('ჩემი სახინკლე')
    expect(value('#p-address')).toBe('კოსტავას ქ. 12, თბილისი')

    await act(async () => document.querySelector<HTMLFormElement>('form')!.requestSubmit())
    await flush()

    expect(mocks.updatePlace).toHaveBeenCalledWith(
      9,
      expect.objectContaining({
        name: 'ჩემი სახინკლე',
        phone: '032 222 22 22',
        website: 'https://pictogram.ge',
        opening_hours: ['ორშაბათი: 11:00–23:00', 'სამშაბათი: 11:00–23:00'],
        source_rating: 4.6,
        source_rating_count: 1234,
        gallery_urls: draft.photos,
        lat: 41.7151,
      }),
    )
  })
})
