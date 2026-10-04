import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { Place, RoutePlan } from '@/api/places'
import i18n from '@/i18n'

/* ============================================================
   **რუკა და მარშრუტები ადგილის ფანჯარაში** (Tasks §30.5).

   ⚠️ Leaflet თვითონ არ იტვირთება — `PlaceMap` ჩანკი ყალბი `div`-ით ჩანაცვლებულია,
   რომელიც მხოლოდ იმას ამბობს, რამდენი მარშრუტი მიიღო. მოწმდება: ლეიზი საზღვარი
   (ჯერ სკელეტი, მერე რუკა), ღრმა ბმულები, უარყოფილი გეოლოკაცია (ტოსტი და
   არცერთი რექვესთი) და ნაპოვნი მდებარეობიდან გამოთვლა (პირველი აქტიური).
   Tasks §56 — უზუსტო გეოლოკაცია (სიზუსტე და გაფრთხილება; სახლი თავისით),
   საწყისი მისამართით და რუკიდან, გზების რაოდენობა მეხსიერებიდან, „ნაპოვნია N
   გზა", შენახული მარშრუტები რუკის ქვემოთ „საიდან"-ით.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchPlaceRoutes: vi.fn(),
  computePlaceRoute: vi.fn(),
  savePlaceRoute: vi.fn(),
  fetchPlaceCandidates: vi.fn(),
  saveModuleSettings: vi.fn(),
  modules: { all: [] as unknown[] },
}))

vi.mock('@/components/PlaceMap', () => ({
  default: (props: { routes?: unknown[]; from?: unknown; onPickFrom?: (lat: number, lng: number) => void }) =>
    h(
      'div',
      { 'data-testid': 'leaflet-map', 'data-routes': String(props.routes?.length ?? 0), 'data-from': props.from ? 'yes' : 'no' },
      // §56.1 — „რუკაზე" რეჟიმში დაჭერა საწყისს სვამს
      props.onPickFrom ? h('button', { 'data-testid': 'map-pick', onClick: () => props.onPickFrom!(41.1, 44.1) }) : null,
    ),
}))

vi.mock('@/api/places', async (original) => ({
  ...(await original<typeof import('@/api/places')>()),
  fetchPlaceRoutes: mocks.fetchPlaceRoutes,
  computePlaceRoute: mocks.computePlaceRoute,
  savePlaceRoute: mocks.savePlaceRoute,
  fetchPlaceCandidates: mocks.fetchPlaceCandidates,
}))

vi.mock('@/api/videos', async (original) => ({
  ...(await original<typeof import('@/api/videos')>()),
  saveModuleSettings: mocks.saveModuleSettings,
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => mocks.modules,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const place: Place = {
  id: 7,
  name: 'ვარძია',
  address: null,
  city: null,
  country: 'Georgia',
  lat: 41.38,
  lng: 43.28,
  osm_id: null,
  osm_type: null,
  map_url: 'https://www.openstreetmap.org/?mlat=41.38&mlon=43.28',
  description: null,
  category_id: null,
  category: null,
  tags: [],
  status: 'to_visit',
  rating: null,
  is_favorite: false,
  visited_at: null,
  photo: null,
  visibility: 'private',
  created_at: null,
}

const plan: RoutePlan = {
  profile: 'driving',
  requested: 2,
  from: { lat: 41.7, lng: 44.8 },
  to: { lat: 41.38, lng: 43.28 },
  routes: [
    { index: 0, distance_m: 212_000, duration_s: 10_800, geometry: '_p~iF~ps|U_ulLnnqC', summary: 'E60' },
    { index: 1, distance_m: 230_000, duration_s: 12_000, geometry: '_p~iF~ps|U', summary: null },
  ],
}

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
  delete (navigator as { geolocation?: unknown }).geolocation
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function geolocation(handler: (ok: PositionCallback, err: PositionErrorCallback) => void) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: handler },
  })
}

async function mount(memory: Record<string, unknown> | null = null, saved: unknown[] = []) {
  mocks.fetchPlaceRoutes.mockResolvedValue(saved)
  mocks.saveModuleSettings.mockResolvedValue(undefined)
  mocks.modules.all = [{ key: 'place', user_settings: memory ? { routes: memory } : {} }]
  const { PlaceRoutes } = await import('@/components/PlaceRoutes')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(
      h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(FeedbackProvider, null, h(PlaceRoutes, { place })))),
    ),
  )

  return container
}

const button = (label: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined
const toasts = () => [...document.body.querySelectorAll('.fb-toast p.font-medium')].map((n) => n.textContent)

describe('PlaceRoutes (§30)', () => {
  it('loads the map chunk lazily and always offers the deep links', async () => {
    const el = await mount()

    // ლეიზი საზღვარი: ჯერ სკელეტი ან უკვე რუკა — Leaflet-ის ჩანკი ცალკე მოდის
    expect(el.querySelector('[data-testid="map-frame"]')).not.toBeNull()
    await flush()
    await flush()
    expect(el.querySelector('[data-testid="leaflet-map"]')).not.toBeNull()
    expect(el.querySelector('[data-testid="map-loading"]')).toBeNull()

    const links = [...el.querySelectorAll<HTMLAnchorElement>('[data-testid="route-deep-links"] a')].map((a) => a.href)
    expect(links.some((href) => href.includes('google.com/maps/dir') && href.includes('destination=41.38%2C43.28'))).toBe(true)
    expect(links.some((href) => href.includes('openstreetmap.org'))).toBe(true)
    expect(el.textContent).toContain(i18n.t('places.route.savedEmpty'))
  })

  it('a refused geolocation names the reason and sends nothing', async () => {
    geolocation((_ok, err) => err({ code: 1, message: 'denied' } as GeolocationPositionError))
    await mount()
    await flush()

    await act(async () => button(i18n.t('places.route.fromMe'))!.click())
    await flush()

    expect(toasts()).toContain(i18n.t('places.route.geoDenied'))
    expect(mocks.computePlaceRoute).not.toHaveBeenCalled()
  })

  it('computes the routes from the found position and makes the shortest one active', async () => {
    geolocation((ok) => ok({ coords: { latitude: 41.7, longitude: 44.8 } } as GeolocationPosition))
    mocks.computePlaceRoute.mockResolvedValue(plan)
    const el = await mount()
    await flush()

    await act(async () => button(i18n.t('places.route.fromMe'))!.click())
    await flush()
    await flush()

    expect(mocks.computePlaceRoute).toHaveBeenCalledWith(7, { from_lat: 41.7, from_lng: 44.8, profile: 'driving', count: 3 })

    const options = [...el.querySelectorAll<HTMLButtonElement>('[data-testid="route-options"] button')]
    expect(options).toHaveLength(2)
    expect(options[0].getAttribute('aria-pressed')).toBe('true')
    expect(options[0].textContent).toContain(i18n.t('places.route.best'))
    expect(options[0].textContent).toContain('E60')
    expect(options[1].textContent).toContain(i18n.t('places.route.alternative', { n: 1 }))

    // რუკამ ორივე მარშრუტი და ჩემი მდებარეობა მიიღო
    const map = el.querySelector<HTMLElement>('[data-testid="leaflet-map"]')!
    expect(map.getAttribute('data-routes')).toBe('2')
    expect(map.getAttribute('data-from')).toBe('yes')

    // ალტერნატივის არჩევა აქტიურს ცვლის; შენახვის ფორმა ჩანს
    await act(async () => options[1].click())
    expect(options[1].getAttribute('aria-pressed')).toBe('true')
    expect(el.querySelector('[data-testid="route-save"]')).not.toBeNull()
  })
})

describe('PlaceRoutes — the start, the number of routes and the saved list (§56)', () => {
  const tab = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((b) => b.textContent?.includes(label))

  it('shows how precise the position is and warns when it is a guess (the "Batumi pin")', async () => {
    geolocation((ok) => ok({ coords: { latitude: 41.6237, longitude: 41.5942, accuracy: 18_000 } } as GeolocationPosition))
    mocks.computePlaceRoute.mockResolvedValue(plan)
    const el = await mount()
    await flush()

    await act(async () => button(i18n.t('places.route.fromMe'))!.click())
    await flush()

    expect(mocks.computePlaceRoute).toHaveBeenCalledWith(7, { from_lat: 41.6237, from_lng: 41.5942, profile: 'driving', count: 3 })
    expect(el.querySelector('[data-testid="route-start"]')?.textContent).toContain(
      i18n.t('places.route.accuracy', { value: i18n.t('places.route.km', { value: '18' }) }),
    )
    expect(el.querySelector('[data-testid="route-inaccurate"]')?.textContent).toContain(i18n.t('places.route.inaccurate'))
  })

  it('an imprecise position falls back to the saved home by itself', async () => {
    geolocation((ok) => ok({ coords: { latitude: 41.6237, longitude: 41.5942, accuracy: 18_000 } } as GeolocationPosition))
    mocks.computePlaceRoute.mockResolvedValue(plan)
    const el = await mount({ home: { lat: 41.73, lng: 44.83, label: 'სახლი' }, count: 3 })
    await flush()

    await act(async () => button(i18n.t('places.route.fromMe'))!.click())
    await flush()

    expect(mocks.computePlaceRoute).toHaveBeenCalledWith(7, { from_lat: 41.73, from_lng: 44.83, profile: 'driving', count: 3 })
    expect(el.querySelector('[data-testid="route-note"]')?.textContent).toBe(
      i18n.t('places.route.usedHome', { accuracy: i18n.t('places.route.km', { value: '18' }) }),
    )
    expect(tab(i18n.t('places.route.from.home'))?.getAttribute('aria-pressed')).toBe('true')
    expect(el.querySelector('[data-testid="route-inaccurate"]')).toBeNull()
  })

  it('a start from an address: search, pick, route — and the saved route remembers where from', async () => {
    mocks.fetchPlaceCandidates.mockResolvedValue([
      { osm_id: '1', osm_type: 'way', name: 'ვაჟა-ფშაველას 12', address: 'თბილისი', city: 'თბილისი', country: 'Georgia', lat: 41.72, lng: 44.75, kind: null },
    ])
    mocks.computePlaceRoute.mockResolvedValue(plan)
    mocks.savePlaceRoute.mockResolvedValue({})
    const el = await mount({ count: 1 })
    await flush()

    await act(async () => tab(i18n.t('places.route.from.address'))!.click())
    const input = el.querySelector<HTMLInputElement>(`input[aria-label="${i18n.t('places.route.from.address')}"]`)!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'ვაჟა-ფშაველა')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => input.form!.requestSubmit())
    await flush()
    expect(mocks.fetchPlaceCandidates).toHaveBeenCalledWith('ვაჟა-ფშაველა')

    await act(async () => el.querySelector<HTMLButtonElement>('[data-testid="route-candidates"] button')!.click())
    await flush()
    // გზების რაოდენობა მეხსიერებიდან (1)
    expect(mocks.computePlaceRoute).toHaveBeenCalledWith(7, { from_lat: 41.72, from_lng: 44.75, profile: 'driving', count: 1 })
    expect(el.querySelector('[data-testid="route-start"]')?.textContent).toContain(
      i18n.t('places.route.from.short', { label: 'ვაჟა-ფშაველას 12' }),
    )

    await act(async () => el.querySelector<HTMLFormElement>('[data-testid="route-save"]')!.requestSubmit())
    await flush()
    expect(mocks.savePlaceRoute).toHaveBeenCalledWith(7, expect.objectContaining({ from_label: 'ვაჟა-ფშაველას 12', from_lat: 41.72 }))

    // „სახლად შენახვა" — ჩუმად, მოდულის მეხსიერებაში, მისამართის სახელით
    await act(async () => button(i18n.t('places.route.saveHome'))!.click())
    expect(mocks.saveModuleSettings).toHaveBeenCalledWith('place', {
      routes: { home: { lat: 41.72, lng: 44.75, label: 'ვაჟა-ფშაველას 12' }, count: 1 },
    })
  })

  it('a start picked on the map, and fewer routes than asked are named', async () => {
    mocks.computePlaceRoute.mockResolvedValue({ ...plan, requested: 3 })
    const el = await mount()
    await flush()
    await flush()

    expect(el.querySelector('[data-testid="map-pick"]')).toBeNull()
    await act(async () => tab(i18n.t('places.route.from.pin'))!.click())
    await act(async () => el.querySelector<HTMLButtonElement>('[data-testid="map-pick"]')!.click())
    await flush()

    expect(mocks.computePlaceRoute).toHaveBeenCalledWith(7, { from_lat: 41.1, from_lng: 44.1, profile: 'driving', count: 3 })
    expect(el.querySelector('[data-testid="route-found"]')?.textContent).toBe(i18n.t('places.route.found', { count: 2 }))
  })

  it('saved routes sit under the map at full width and say where they start', async () => {
    const saved = [
      { id: 1, place_id: 7, name: 'სახლიდან', profile: 'driving', distance_m: 212_000, duration_s: 10_800, from_lat: 41.73, from_lng: 44.83, from_label: 'სახლი', geometry: '_p~iF~ps|U', chosen_at: null, created_at: null },
      { id: 2, place_id: 7, name: 'ძველი', profile: 'foot', distance_m: 900, duration_s: 600, from_lat: 41.6237, from_lng: 41.5942, from_label: null, geometry: '_p~iF~ps|U', chosen_at: null, created_at: null },
    ]
    const el = await mount(null, saved)
    await flush()

    const list = el.querySelector<HTMLElement>('[data-testid="saved-routes"]')!
    // რუკის სვეტის გვერდით აღარ არის — ბადის შემდეგ, სრულ სიგანეზე
    expect(list.closest('.lg\\:grid-cols-\\[minmax\\(0\\,3fr\\)_minmax\\(0\\,2fr\\)\\]')).toBeNull()
    expect(list.previousElementSibling?.querySelector('[data-testid="map-frame"]')).not.toBeNull()

    const rows = [...list.querySelectorAll<HTMLElement>('[data-testid="saved-route"]')]
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain(i18n.t('places.route.from.short', { label: 'სახლი' }))
    expect(rows[1].textContent).toContain(i18n.t('places.route.from.short', { label: '41.6237, 41.5942' }))
    for (const label of [i18n.t('places.route.show'), i18n.t('places.route.rename')]) {
      expect(rows[0].textContent).toContain(label)
    }
  })
})
