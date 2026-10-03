import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bike,
  Car,
  ExternalLink,
  Footprints,
  Loader2,
  Map as MapIcon,
  MapPin,
  Navigation,
  Save,
  SquarePen,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import {
  computePlaceRoute,
  deletePlaceRoute,
  fetchPlaceRoutes,
  renamePlaceRoute,
  ROUTE_PROFILES,
  savePlaceRoute,
  type Place,
  type PlaceRoute,
  type PlaceRouteInput,
  type RoutePlan,
  type RouteProfile,
} from '@/api/places'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { decodePolyline, type LatLng } from '@/lib/polyline'
import { cn } from '@/lib/utils'
import type { MapRoute } from '@/components/PlaceMap'
import { MapFrame } from '@/components/PlaceMapLazy'
import { DetailSection } from '@/components/DetailHero'
import { Button, buttonVariants } from '@/components/ui/button'
import { CutTabs } from '@/components/ui/cut-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'

/* ============================================================
   **რუკა და ნავიგაცია ადგილის ფანჯარაში** (Tasks §30.3/§30.4).

   შენი სიტყვები: „ნავიგაციაც შენი მიმდინარე ლოკაციიდან (არ ურევდე სხვა
   წერტილს) — იქიდან, Google Maps-ივით, გთავაზობდეს მოკლე მარშრუტს, შეგეძლოს
   მარშრუტების შეცვლაც და სხვა შემოთავაზებების ნახვაც, არჩევა და შენახვაც".

   ნაკადი: „მარშრუტი ჩემი მდებარეობიდან" → ბრაუზერის გეოლოკაცია (ნებართვა,
   შეცდომა ტოსტით) → `POST /places/{id}/route` → რუკაზე მთავარი + ალტერნატივები
   ჩამქრალი ხაზებით, გვერდით სია (მანძილი · დრო · არჩევა) → სახელი და „შენახვა".
   პროფილის გადართვა (მანქანა · ფეხით · ველოსიპედი) უკვე ნაპოვნი მდებარეობით
   მაშინვე ხელახლა ითვლის.

   ⚠️ **ღრმა ბმულები Google Maps-ზე/OSM-ზე ყოველთვის რჩება** — ტელეფონზე
   ნავიგაციას მაინც ის აკეთებს; ჩვენი რუკა გეგმაა, არა ხმოვანი გზამკვლევი.
   ⚠️ **საწყისი წერტილი არსად ინახება** შენახულ მარშრუტამდე — სერვერი მას
   მხოლოდ გამოთვლისთვის იღებს.
   ⚠️ **გეოლოკაცია მხოლოდ დაჭერიდან** — ბრაუზერები სხვანაირად ბლოკავენ.
   ============================================================ */

const PROFILE_ICON: Record<RouteProfile, LucideIcon> = { driving: Car, foot: Footprints, bike: Bike }
const GOOGLE_MODE: Record<RouteProfile, string> = { driving: 'driving', foot: 'walking', bike: 'bicycling' }
const OSM_ENGINE: Record<RouteProfile, string> = { driving: 'fossgis_osrm_car', foot: 'fossgis_osrm_foot', bike: 'fossgis_osrm_bike' }

class GeoUnsupported extends Error {}

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new GeoUnsupported())

      return
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 })
  })
}

/** ბრაუზერის `GeolocationPositionError` კონსტრუირებადი არაა — კოდით ვცნობთ */
function geoErrorKey(e: unknown): string {
  if (e instanceof GeoUnsupported) return 'places.route.geoUnsupported'
  const code = (e as { code?: number } | null)?.code

  return code === 1 ? 'places.route.geoDenied' : 'places.route.geoFailed'
}

export function distanceLabel(meters: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  return meters < 1000
    ? t('places.route.m', { value: Math.round(meters) })
    : t('places.route.km', { value: (meters / 1000).toFixed(meters < 10_000 ? 1 : 0) })
}

export function durationLabel(seconds: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60

  return h > 0 ? t('places.route.duration', { h, m }) : t('places.route.durationShort', { m })
}

function googleUrl(to: LatLng, profile: RouteProfile, from: LatLng | null): string {
  const params = new URLSearchParams({ api: '1', destination: `${to[0]},${to[1]}`, travelmode: GOOGLE_MODE[profile] })
  if (from) params.set('origin', `${from[0]},${from[1]}`)

  return `https://www.google.com/maps/dir/?${params}`
}

function osmUrl(to: LatLng, profile: RouteProfile, from: LatLng | null): string {
  if (!from) return `https://www.openstreetmap.org/?mlat=${to[0]}&mlon=${to[1]}#map=17/${to[0]}/${to[1]}`

  return `https://www.openstreetmap.org/directions?engine=${OSM_ENGINE[profile]}&route=${from[0]}%2C${from[1]}%3B${to[0]}%2C${to[1]}`
}

export function PlaceRoutes({ place }: { place: Place }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const { dateTime } = useDateFormat()

  const hasCoords = place.lat != null && place.lng != null
  const to = useMemo<LatLng>(() => [Number(place.lat), Number(place.lng)], [place.lat, place.lng])

  const [profile, setProfile] = useState<RouteProfile>('driving')
  const [from, setFrom] = useState<LatLng | null>(null)
  const [plan, setPlan] = useState<RoutePlan | null>(null)
  const [active, setActive] = useState(0)
  const [shown, setShown] = useState<PlaceRoute | null>(null)
  const [locating, setLocating] = useState(false)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)

  const savedQ = useQuery({
    queryKey: ['place-routes', place.id],
    queryFn: () => fetchPlaceRoutes(place.id),
    enabled: hasCoords,
  })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['place-routes', place.id] })
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const compute = useMutation({
    mutationFn: (input: { from: LatLng; profile: RouteProfile }) =>
      computePlaceRoute(place.id, { from_lat: input.from[0], from_lng: input.from[1], profile: input.profile }),
    onSuccess: (result) => {
      setPlan(result)
      setActive(0)
      setShown(null)
      if (!result.routes.length) toast({ title: t('places.route.noRoutes'), variant: 'error' })
    },
    onError: fail,
  })

  const locate = async () => {
    setLocating(true)
    try {
      const position = await currentPosition()
      const here: LatLng = [position.coords.latitude, position.coords.longitude]
      setFrom(here)
      compute.mutate({ from: here, profile })
    } catch (e) {
      toast({ title: t(geoErrorKey(e)), variant: 'error' })
    } finally {
      setLocating(false)
    }
  }

  // პროფილის გადართვა — მდებარეობა უკვე გვაქვს, ხელახლა არ ვეკითხებით
  const pickProfile = (next: RouteProfile) => {
    setProfile(next)
    if (from) compute.mutate({ from, profile: next })
  }

  const save = useMutation({
    mutationFn: (input: PlaceRouteInput) => savePlaceRoute(place.id, input),
    onSuccess: () => {
      invalidate()
      setName('')
      toast({ title: t('places.route.saved'), variant: 'success' })
    },
    onError: fail,
  })
  const rename = useMutation({
    mutationFn: (input: { id: number; name: string }) => renamePlaceRoute(input.id, input.name),
    onSuccess: () => {
      invalidate()
      setRenaming(null)
    },
    onError: fail,
  })
  const remove = useMutation({ mutationFn: deletePlaceRoute, onSuccess: invalidate, onError: fail })

  const chosen = plan?.routes[active] ?? null
  const defaultName = chosen ? `${t(`places.route.profiles.${plan!.profile}`)} · ${distanceLabel(chosen.distance_m, t)}` : ''

  /* ⚠️ `useMemo` — ახალი მასივი ყოველ რენდერზე რუკას ხაზებს თავიდან ახატვინებდა და ჩარჩოს „ახტუნებდა" */
  const mapRoutes = useMemo<MapRoute[]>(() => {
    if (shown) return [{ id: `saved-${shown.id}`, points: decodePolyline(shown.geometry), active: true }]
    if (!plan) return []

    return plan.routes.map((r) => ({ id: r.index, points: decodePolyline(r.geometry), active: r.index === active }))
  }, [plan, active, shown])
  const mapFrom = useMemo<LatLng | null>(() => (shown ? [shown.from_lat, shown.from_lng] : from), [shown, from])

  const busy = locating || compute.isPending

  if (!hasCoords) {
    return (
      <DetailSection title={t('places.route.mapTitle')} icon={<MapIcon className="size-4 text-muted-foreground" />}>
        <EmptyState className="py-6" icon={<MapPin className="size-5" />} title={t('places.route.noCoords')} />
      </DetailSection>
    )
  }

  return (
    <DetailSection
      title={t('places.route.mapTitle')}
      hint={t('places.route.hint')}
      icon={<MapIcon className="size-4 text-muted-foreground" />}
      action={
        <div className="flex flex-wrap gap-1.5" data-testid="route-deep-links">
          <a
            href={googleUrl(to, profile, from)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'text-muted-foreground')}
          >
            <ExternalLink className="size-3.5" />
            {t('places.route.openGoogle')}
          </a>
          <a
            href={osmUrl(to, profile, from)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'text-muted-foreground')}
          >
            <ExternalLink className="size-3.5" />
            {t('places.route.openOsm')}
          </a>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <MapFrame center={to} from={mapFrom} routes={mapRoutes} className="h-72 lg:h-[26rem]" />

        <div className="space-y-3">
          <CutTabs
            label={t('places.route.profile')}
            layout="inline"
            options={ROUTE_PROFILES.map((p) => ({ key: p, label: t(`places.route.profiles.${p}`), icon: PROFILE_ICON[p] }))}
            value={profile}
            onChange={(key) => pickProfile(key as RouteProfile)}
          />

          <Button type="button" className="w-full" disabled={busy} onClick={() => void locate()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Navigation className="size-4" />}
            {locating ? t('places.route.locating') : compute.isPending ? t('places.route.computing') : t('places.route.fromMe')}
          </Button>

          {plan && plan.routes.length > 0 && (
            <ul className="space-y-1.5" data-testid="route-options">
              {plan.routes.map((r) => {
                const isActive = r.index === active && !shown

                return (
                  <li key={r.index}>
                    <button
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => {
                        setActive(r.index)
                        setShown(null)
                      }}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                        isActive ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">
                          {r.index === 0 ? t('places.route.best') : t('places.route.alternative', { n: r.index })}
                        </span>
                        {r.summary && <span className="block truncate text-xs text-muted-foreground">{r.summary}</span>}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {distanceLabel(r.distance_m, t)} · {durationLabel(r.duration_s, t)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {chosen && from && plan && (
            <form
              className="flex gap-1.5"
              data-testid="route-save"
              onSubmit={(e) => {
                e.preventDefault()
                save.mutate({
                  name: name.trim() || defaultName,
                  profile: plan.profile,
                  distance_m: chosen.distance_m,
                  duration_s: chosen.duration_s,
                  from_lat: from[0],
                  from_lng: from[1],
                  geometry: chosen.geometry,
                })
              }}
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={defaultName}
                aria-label={t('places.route.saveName')}
                maxLength={120}
              />
              <Button type="submit" variant="outline" disabled={save.isPending} className="shrink-0">
                {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {t('places.route.save')}
              </Button>
            </form>
          )}

          {/* ---------- შენახული ---------- */}
          <div data-testid="saved-routes">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('places.route.savedTitle')}
            </h4>
            {savedQ.data?.length ? (
              <ul className="space-y-1.5">
                {savedQ.data.map((route) => {
                  const Icon = PROFILE_ICON[route.profile] ?? Car
                  const isShown = shown?.id === route.id

                  return (
                    <li
                      key={route.id}
                      className={cn('rounded-md border px-3 py-2 text-sm', isShown ? 'border-primary bg-primary/5' : 'border-border')}
                    >
                      {renaming?.id === route.id ? (
                        <form
                          className="flex gap-1.5"
                          onSubmit={(e) => {
                            e.preventDefault()
                            if (renaming.name.trim()) rename.mutate({ id: route.id, name: renaming.name.trim() })
                          }}
                        >
                          <Input
                            autoFocus
                            value={renaming.name}
                            maxLength={120}
                            onChange={(e) => setRenaming({ id: route.id, name: e.target.value })}
                            aria-label={t('places.route.saveName')}
                          />
                          <Button type="submit" size="sm" disabled={rename.isPending}>
                            {t('actions.save')}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                            {t('actions.cancel')}
                          </Button>
                        </form>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <Icon className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{route.name}</span>
                            <span className="block text-xs tabular-nums text-muted-foreground">
                              {distanceLabel(route.distance_m, t)} · {durationLabel(route.duration_s, t)}
                              {route.chosen_at ? ` · ${dateTime(route.chosen_at)}` : ''}
                            </span>
                          </span>
                          <Button type="button" variant="outline" size="sm" onClick={() => setShown(isShown ? null : route)}>
                            <MapIcon className="size-3.5" />
                            {t('places.route.show')}
                          </Button>
                          <Button type="button" variant="edit" size="sm" onClick={() => setRenaming({ id: route.id, name: route.name })}>
                            <SquarePen className="size-3.5" />
                            {t('places.route.rename')}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            aria-label={t('actions.delete')}
                            onClick={async () => {
                              const ok = await confirm({
                                title: t('places.route.deleteTitle'),
                                description: t('places.route.deleteHint', { name: route.name }),
                                variant: 'destructive',
                              })
                              if (ok) remove.mutate(route.id)
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">{t('places.route.savedEmpty')}</p>
            )}
          </div>
        </div>
      </div>
    </DetailSection>
  )
}
