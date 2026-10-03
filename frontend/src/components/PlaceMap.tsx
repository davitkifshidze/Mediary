import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from '@/lib/polyline'

/* ============================================================
   **ადგილის რუკა — Leaflet, OSM-ის ფილები** (Tasks §30.2).

   ⚠️ **ლეიზი ჩანკია**: ეს ფაილი მხოლოდ `import()`-ით იტვირთება
   (`PlaceMapLazy.tsx`), ე.ი. Leaflet (~40 kB) ბანდლში მხოლოდ ადგილების
   გვერდზე მოდის — 2026-09-21-ის „მოგვიანებით" ზუსტად ეს პირობა იყო.

   ⚠️ **მარკერი `divIcon`-ია და არა სურათი**: Leaflet-ის ნაგულისხმევი
   მარკერი PNG-ებს ბანდლერის მიღმა ეძებს და ტყდება; ფერადი წერტილი CSS-ით
   (`index.css`, `.mediary-pin`) ორივე თემაზე მუშაობს და ასეტი არ სჭირდება.

   ⚠️ **მარშრუტის ფერი CSS-კლასითაა** (`.mediary-route`), არა `color`
   ოფციით: SVG-ის `stroke` ატრიბუტში `var(--primary)` არ მუშაობს, კლასის
   `stroke:` კი ატრიბუტს ფარავს — თემის ფერი ასე ხვდება რუკაზე.

   ⚠️ `scrollWheelZoom: false` — რუკა მოდალშია და გვერდის სქროლი არ უნდა
   „დაიჭიროს"; მასშტაბი ღილაკებით ან ორმაგი დაწკაპუნებით.
   ============================================================ */

export interface MapRoute {
  id: string | number
  points: LatLng[]
  active: boolean
}

export interface PlaceMapProps {
  center: LatLng
  /** ჩემი მდებარეობა — ცალკე წერტილი */
  from?: LatLng | null
  routes?: MapRoute[]
  /** ფორმაში — მარკერის გადათრევა და დაწკაპუნებით გადატანა */
  draggable?: boolean
  onMove?: (lat: number, lng: number) => void
  zoom?: number
  className?: string
}

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
const NO_ROUTES: MapRoute[] = []

function pin(kind: 'place' | 'me') {
  return L.divIcon({
    className: 'mediary-pin-wrap',
    html: `<span class="mediary-pin mediary-pin--${kind}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

export default function PlaceMap({
  center,
  from = null,
  routes = NO_ROUTES,
  draggable = false,
  onMove,
  zoom = 15,
  className,
}: PlaceMapProps) {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const marker = useRef<L.Marker | null>(null)
  const me = useRef<L.Marker | null>(null)
  const lines = useRef<L.LayerGroup | null>(null)
  // ⚠️ ყოველთვის ბოლო callback — ინიციალიზაცია ერთხელ ხდება, prop კი იცვლება
  const move = useRef(onMove)
  move.current = onMove
  const drag = useRef(draggable)
  drag.current = draggable

  const [lat, lng] = center
  const fromLat = from?.[0] ?? null
  const fromLng = from?.[1] ?? null

  /* ---- ინიციალიზაცია — ერთხელ ---- */
  useEffect(() => {
    const el = host.current
    if (!el || map.current) return

    const m = L.map(el, { scrollWheelZoom: false })
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(m)
    m.setView([lat, lng], zoom)

    lines.current = L.layerGroup().addTo(m)
    marker.current = L.marker([lat, lng], { icon: pin('place'), draggable: drag.current, keyboard: false }).addTo(m)
    marker.current.on('dragend', () => {
      const p = marker.current?.getLatLng()
      if (p) move.current?.(p.lat, p.lng)
    })
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (drag.current) move.current?.(e.latlng.lat, e.latlng.lng)
    })
    map.current = m

    // ⚠️ მოდალის ზომა ანიმაციის შემდეგ დგება — ერთი დაგვიანებული გადათვლა, თორემ ფილები ნახევრად იხატება
    const timer = window.setTimeout(() => m.invalidateSize(), 150)

    return () => {
      window.clearTimeout(timer)
      m.remove()
      map.current = null
      marker.current = null
      me.current = null
      lines.current = null
    }
    // ⚠️ საწყისი ხედი მხოლოდ პირველ რენდერზე — შემდეგ ქვემოთა ეფექტები მართავენ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- ადგილის მარკერი ---- */
  useEffect(() => {
    const m = map.current
    if (!m || !marker.current) return

    marker.current.setLatLng([lat, lng])
    if (!routes.length && fromLat === null) m.setView([lat, lng], m.getZoom())
  }, [lat, lng, routes.length, fromLat])

  /* ---- ჩემი მდებარეობა ---- */
  useEffect(() => {
    const m = map.current
    if (!m) return

    if (fromLat === null || fromLng === null) {
      me.current?.remove()
      me.current = null

      return
    }

    if (!me.current) {
      me.current = L.marker([fromLat, fromLng], { icon: pin('me'), keyboard: false, interactive: false }).addTo(m)
    } else {
      me.current.setLatLng([fromLat, fromLng])
    }
  }, [fromLat, fromLng])

  /* ---- მარშრუტები — აქტიური სქელი და მკვეთრი, დანარჩენი ჩამქრალი; ჩარჩო აქტიურზე ---- */
  useEffect(() => {
    const m = map.current
    const group = lines.current
    if (!m || !group) return

    group.clearLayers()
    let active: L.Polyline | null = null

    // ⚠️ აქტიური ბოლოს ემატება, რომ ზემოდან იხატოს
    for (const route of [...routes].sort((a, b) => Number(a.active) - Number(b.active))) {
      if (!route.points.length) continue
      const line = L.polyline(route.points, {
        className: route.active ? 'mediary-route mediary-route--active' : 'mediary-route',
        weight: route.active ? 5 : 4,
        interactive: false,
      }).addTo(group)
      if (route.active) active = line
    }

    if (active) {
      m.fitBounds(active.getBounds(), { padding: [24, 24] })
    } else if (fromLat !== null && fromLng !== null) {
      m.fitBounds(L.latLngBounds([[lat, lng], [fromLat, fromLng]]), { padding: [24, 24] })
    }
  }, [routes, lat, lng, fromLat, fromLng])

  return <div ref={host} className={className} data-testid="leaflet-map" />
}
