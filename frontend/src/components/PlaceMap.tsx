import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { LAYER_MAP_HINT } from '@/lib/layers'
import { createWheelZoom } from '@/lib/mapWheel'
import type { LatLng } from '@/lib/polyline'
import { cn } from '@/lib/utils'

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
   „დაიჭიროს"; მასშტაბი ღილაკებით, ორმაგი დაწკაპუნებით ან **Ctrl + ბორბლით**
   (Tasks §56.2, `lib/mapWheel.ts` — ადრე Ctrl + ბორბალი მთელ გვერდს ადიდებდა);
   უბრალო ბორბალზე — მინიშნება „ზუმი — Ctrl + ბორბალი".

   ⚠️ **Tasks §56.1 — საწყისის არჩევა რუკაზე** (`onPickFrom`): ამ რეჟიმში
   დაჭერა საწყისს სვამს (და არა ადგილის მარკერს), საწყისის პინი კი
   გადაითრევა.
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
  /** §56.1 — საწყისი რუკიდან: დაჭერა და საწყისის პინის გადათრევა */
  onPickFrom?: (lat: number, lng: number) => void
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
  onPickFrom,
  zoom = 15,
  className,
}: PlaceMapProps) {
  const { t } = useTranslation()
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
  const pick = useRef(onPickFrom)
  pick.current = onPickFrom
  const picking = !!onPickFrom
  // §56.2 — „ზუმი — Ctrl + ბორბალი" (უბრალო ბორბალზე, ცოტა ხნით)
  const [wheelHint, setWheelHint] = useState(false)

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
      // §56.1 — საწყისის არჩევისას დაჭერა საწყისს სვამს, ადგილს არ ეხება
      if (pick.current) pick.current(e.latlng.lat, e.latlng.lng)
      else if (drag.current) move.current?.(e.latlng.lat, e.latlng.lng)
    })
    map.current = m

    // ⚠️ მოდალის ზომა ანიმაციის შემდეგ დგება — ერთი დაგვიანებული გადათვლა, თორემ ფილები ნახევრად იხატება
    const timer = window.setTimeout(() => m.invalidateSize(), 150)

    /* §56.2 — Ctrl + ბორბალი: რუკის ზუმი კურსორის წერტილზე. ⚠️ `passive: false` —
       თორემ `preventDefault` არ მუშაობს და ბრაუზერი გვერდსაც ადიდებს */
    let hintTimer = 0
    const onWheel = createWheelZoom(
      (step, e) => m.setZoomAround(m.mouseEventToContainerPoint(e), m.getZoom() + step),
      () => {
        setWheelHint(true)
        window.clearTimeout(hintTimer)
        hintTimer = window.setTimeout(() => setWheelHint(false), 1200)
      },
    )
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(hintTimer)
      el.removeEventListener('wheel', onWheel)
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
      me.current = L.marker([fromLat, fromLng], { icon: pin('me'), keyboard: false, draggable: true }).addTo(m)
      // §56.1 — გადათრეული საწყისი; გადათრევა მხოლოდ არჩევის რეჟიმშია ჩართული (ქვემოთ)
      me.current.on('dragend', () => {
        const p = me.current?.getLatLng()
        if (p) pick.current?.(p.lat, p.lng)
      })
      if (!pick.current) me.current.dragging?.disable()
    } else {
      me.current.setLatLng([fromLat, fromLng])
    }
  }, [fromLat, fromLng])

  /* ---- §56.1 — საწყისის პინი გადაითრევა მხოლოდ არჩევის რეჟიმში; კურსორი — ჯვარი ---- */
  useEffect(() => {
    const dragging = me.current?.dragging
    if (dragging) {
      if (picking) dragging.enable()
      else dragging.disable()
    }
    // `index.css` — `.mediary-picking.leaflet-container` (ჯვარი Leaflet-ის „ხელის" ნაცვლად)
    host.current?.classList.toggle('mediary-picking', picking)
  }, [picking, fromLat, fromLng])

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

  return (
    <div className={cn('relative', className)}>
      <div ref={host} className="size-full" data-testid="leaflet-map" />
      {/* §56.2 — მინიშნება უბრალო ბორბალზე; რუკის ზემოთ, მაგრამ მაუსს არ იჭერს */}
      {wheelHint && (
        <div
          className={cn('pointer-events-none absolute inset-0 grid place-items-center bg-black/35 text-sm font-medium text-white', LAYER_MAP_HINT)}
          data-testid="map-wheel-hint"
        >
          {t('places.map.wheelHint')}
        </div>
      )}
    </div>
  )
}
