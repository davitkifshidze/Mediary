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
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchPlaceRoutes: vi.fn(),
  computePlaceRoute: vi.fn(),
  savePlaceRoute: vi.fn(),
}))

vi.mock('@/components/PlaceMap', () => ({
  default: (props: { routes?: unknown[]; from?: unknown }) =>
    h('div', { 'data-testid': 'leaflet-map', 'data-routes': String(props.routes?.length ?? 0), 'data-from': props.from ? 'yes' : 'no' }),
}))

vi.mock('@/api/places', async (original) => ({
  ...(await original<typeof import('@/api/places')>()),
  fetchPlaceRoutes: mocks.fetchPlaceRoutes,
  computePlaceRoute: mocks.computePlaceRoute,
  savePlaceRoute: mocks.savePlaceRoute,
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

async function mount() {
  mocks.fetchPlaceRoutes.mockResolvedValue([])
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

    expect(mocks.computePlaceRoute).toHaveBeenCalledWith(7, { from_lat: 41.7, from_lng: 44.8, profile: 'driving' })

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
