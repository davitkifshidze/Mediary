import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Bike,
  Car,
  ExternalLink,
  Footprints,
  Home,
  Loader2,
  Map as MapIcon,
  MapPin,
  Navigation,
  Save,
  Search,
  SquarePen,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import type { ModuleInfo } from '@/api/account'
import { saveModuleSettings } from '@/api/videos'
import {
  computePlaceRoute,
  deletePlaceRoute,
  fetchPlaceCandidates,
  fetchPlaceRoutes,
  fetchPlaces,
  renamePlaceRoute,
  ROUTE_PROFILES,
  savePlaceRoute,
  type Place,
  type PlaceCandidate,
  type PlaceRoute,
  type PlaceRouteInput,
  type RoutePlan,
  type RouteProfile,
} from '@/api/places'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { useModules } from '@/lib/modules'
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
import { NumberPick } from '@/components/ui/number-pick'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/* ============================================================
   **რუკა და ნავიგაცია ადგილის ფანჯარაში**.

   შენი სიტყვები: „ნავიგაციაც შენი მიმდინარე ლოკაციიდან (არ ურევდე სხვა
   წერტილს) — იქიდან, Google Maps-ივით, გთავაზობდეს მოკლე მარშრუტს, შეგეძლოს
   მარშრუტების შეცვლაც და სხვა შემოთავაზებების ნახვაც, არჩევა და შენახვაც".

   ნაკადი: საწყისი → `POST /places/{id}/route` → რუკაზე მთავარი + ალტერნატივები
   ჩამქრალი ხაზებით, გვერდით სია (მანძილი · დრო · არჩევა) → სახელი და „შენახვა".
   პროფილის/გზების რაოდენობის გადართვა უკვე არჩეული საწყისით მაშინვე ხელახლა ითვლის.

   ⚠️ **საწყისი აღარ არის მხოლოდ გეოლოკაცია.** „ბათუმის პინი"
   ბრაუზერის გეოლოკაცია იყო: კომპიუტერს GPS არ აქვს და მდებარეობას IP-ით/Wi-Fi-ით
   ითვლის. ახლა: (ა) **სიზუსტე ჩანს** („±18 კმ") და რამდენიმე კმ-ზე მეტზე —
   გაფრთხილება; (ბ) **„საიდან"** — ჩემი მდებარეობა · სახლი · მისამართი/სახელი
   (ადგილების ძებნის წყაროთი) · ჩემი სხვა ადგილი · რუკაზე დაჭერა/პინის გადათრევა;
   (გ) **„სახლი"** — შენახული საწყისი, რომელიც უზუსტო გეოლოკაციის დროს თავისით
   ირჩევა. „სახლი" და გზების რაოდენობა `module_user.settings.routes`-შია (ჩუმი
   მეხსიერება, „რა ვნახო დღეს"-ის წესი — `users.settings`-ის ცხადი შენახვის ზოლი
   ერთი პინისთვის ზედმეტი იქნებოდა).
   ⚠️ **„გზები: 1 · 2 · 3 …"** — OSRM იმდენს აბრუნებს, რამდენსაც პოულობს.
   ⚠️ **შენახული მარშრუტები რუკის ქვემოთ, სრულ სიგანეზე** (ადრე ვიწრო
   მარჯვენა სვეტში არ ეტეოდა); „საიდან" — `from_label`.

   ⚠️ **ღრმა ბმულები Google Maps-ზე/OSM-ზე ყოველთვის რჩება** — ტელეფონზე
   ნავიგაციას მაინც ის აკეთებს; ჩვენი რუკა გეგმაა, არა ხმოვანი გზამკვლევი.
   ⚠️ **საწყისი წერტილი სერვერზე არ ინახება** შენახულ მარშრუტამდე.
   ⚠️ **გეოლოკაცია მხოლოდ დაჭერიდან** — ბრაუზერები სხვანაირად ბლოკავენ.
   ============================================================ */

const PROFILE_ICON: Record<RouteProfile, LucideIcon> = { driving: Car, foot: Footprints, bike: Bike }
const GOOGLE_MODE: Record<RouteProfile, string> = { driving: 'driving', foot: 'walking', bike: 'bicycling' }
const OSM_ENGINE: Record<RouteProfile, string> = { driving: 'fossgis_osrm_car', foot: 'fossgis_osrm_foot', bike: 'fossgis_osrm_bike' }

/** ამაზე უარესი სიზუსტე (მეტრი) „ზუსტი არ არის"-ია */
const ACCURACY_LIMIT = 3000

/** „გზები" — `NumberPick`-ის სია; „სხვა" — `ROUTE_MAX`-მდე (`RouteClient::MAX_ROUTES`) */
const ROUTE_COUNTS = [1, 2, 3]
const ROUTE_MAX = 5
const ROUTE_DEFAULT = 3

/** `module_user.settings`-ის გასაღები (ადგილების მოდული) */
const ROUTES_SETTING = 'routes'

type StartMode = 'here' | 'home' | 'address' | 'myplace' | 'pin'

/** ხატულა და ფერი — `lib/cutStyle.ts`-ის რეესტრიდან (`here` · `home` · …) */
const START_MODES: StartMode[] = ['here', 'home', 'address', 'myplace', 'pin']

interface RouteHome {
  lat: number
  lng: number
  label: string
}

interface RouteMemory {
  home: RouteHome | null
  count: number
}

/** საწყისი — სად, რა ჰქვია (შენახულ მარშრუტზე „საიდან") და როგორ აირჩა */
interface Start {
  at: LatLng
  label: string
  mode: StartMode
}

/** ⚠️ JSON ბლოკი ნებისმიერი იყოს — ცარიელი/დაზიანებული ნაგულისხმევს ნიშნავს */
function readMemory(settings: Record<string, unknown> | undefined): RouteMemory {
  const raw = settings?.[ROUTES_SETTING]
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const home = value.home as Partial<RouteHome> | null | undefined
  const count = typeof value.count === 'number' && Number.isFinite(value.count) ? Math.round(value.count) : ROUTE_DEFAULT

  return {
    home:
      home && typeof home.lat === 'number' && typeof home.lng === 'number'
        ? { lat: home.lat, lng: home.lng, label: typeof home.label === 'string' ? home.label : '' }
        : null,
    count: Math.min(ROUTE_MAX, Math.max(1, count)),
  }
}

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

const coords = (lat: number, lng: number) => `${lat.toFixed(4)}, ${lng.toFixed(4)}`

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
  const { all: modules } = useModules()

  const hasCoords = place.lat != null && place.lng != null
  const to = useMemo<LatLng>(() => [Number(place.lat), Number(place.lng)], [place.lat, place.lng])

  const memory = useMemo(() => readMemory(modules.find((m) => m.key === 'place')?.user_settings), [modules])

  const [profile, setProfile] = useState<RouteProfile>('driving')
  const [count, setCount] = useState(memory.count)
  const [mode, setMode] = useState<StartMode>('here')
  const [start, setStart] = useState<Start | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [plan, setPlan] = useState<RoutePlan | null>(null)
  const [active, setActive] = useState(0)
  const [shown, setShown] = useState<PlaceRoute | null>(null)
  const [locating, setLocating] = useState(false)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<PlaceCandidate[] | null>(null)
  const [searching, setSearching] = useState(false)

  const savedQ = useQuery({
    queryKey: ['place-routes', place.id],
    queryFn: () => fetchPlaceRoutes(place.id),
    enabled: hasCoords,
  })
  // „ჩემი ადგილი": სხვა ადგილები კოორდინატებით (მხოლოდ ამ რეჟიმში ითხოვება)
  const placesQ = useQuery({
    queryKey: ['places', 'route-starts'],
    queryFn: () => fetchPlaces({ all: true }).then((page) => page.items),
    enabled: hasCoords && mode === 'myplace',
  })
  const otherPlaces = (placesQ.data ?? []).filter((p) => p.id !== place.id && p.lat != null && p.lng != null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['place-routes', place.id] })
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  /** ჩუმი შენახვა: ჯერ ლოკალური ქეში, მერე სერვერი (`RandomPickDialog`-ის წესი) */
  const persist = (next: Partial<RouteMemory>) => {
    const value = { ...memory, ...next }
    qc.setQueryData<ModuleInfo[]>(['modules'], (list) =>
      list?.map((m) => (m.key === 'place' ? { ...m, user_settings: { ...m.user_settings, [ROUTES_SETTING]: value } } : m)),
    )
    void saveModuleSettings('place', { [ROUTES_SETTING]: value }).catch(() => {
      // მეხსიერების დაკარგვა მარშრუტს არ აჩერებს
    })
  }

  const compute = useMutation({
    mutationFn: (input: { from: LatLng; profile: RouteProfile; count: number }) =>
      computePlaceRoute(place.id, {
        from_lat: input.from[0],
        from_lng: input.from[1],
        profile: input.profile,
        count: input.count,
      }),
    onSuccess: (result) => {
      setPlan(result)
      setActive(0)
      setShown(null)
      if (!result.routes.length) toast({ title: t('places.route.noRoutes'), variant: 'error' })
    },
    onError: fail,
  })

  const run = (next: Start, opts: { profile?: RouteProfile; count?: number } = {}) => {
    setStart(next)
    compute.mutate({ from: next.at, profile: opts.profile ?? profile, count: opts.count ?? count })
  }

  const homeStart = (home: RouteHome): Start => ({
    at: [home.lat, home.lng],
    label: home.label || t('places.route.from.home'),
    mode: 'home',
  })

  const locate = async () => {
    setLocating(true)
    setNote(null)
    try {
      const position = await currentPosition()
      const acc = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null
      setAccuracy(acc)

      // უზუსტო გეოლოკაცია და სახლი შენახულია → საწყისი სახლია
      if (acc !== null && acc > ACCURACY_LIMIT && memory.home) {
        setNote(t('places.route.usedHome', { accuracy: distanceLabel(acc, t) }))
        setMode('home')
        run(homeStart(memory.home))

        return
      }

      run({ at: [position.coords.latitude, position.coords.longitude], label: t('places.route.from.here'), mode: 'here' })
    } catch (e) {
      toast({ title: t(geoErrorKey(e)), variant: 'error' })
    } finally {
      setLocating(false)
    }
  }

  const search = async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    try {
      setCandidates(await fetchPlaceCandidates(q))
    } catch (e) {
      fail(e)
    } finally {
      setSearching(false)
    }
  }

  // პროფილის/რაოდენობის გადართვა — საწყისი უკვე გვაქვს, ხელახლა არ ვეკითხებით
  const pickProfile = (next: RouteProfile) => {
    setProfile(next)
    if (start) run(start, { profile: next })
  }
  const pickCount = (next: number) => {
    setCount(next)
    persist({ count: next })
    if (start) run(start, { count: next })
  }

  const saveHome = () => {
    if (!start) return
    // „ჩემი მდებარეობა"/რუკის წერტილი სახლად — სახელით „სახლი"; მისამართი/ადგილი — თავისი სახელით
    const label = start.mode === 'here' || start.mode === 'pin' ? t('places.route.from.home') : start.label
    persist({ home: { lat: start.at[0], lng: start.at[1], label } })
    toast({ title: t('places.route.homeSaved'), variant: 'success' })
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
  const from = start?.at ?? null

  /* ⚠️ `useMemo` — ახალი მასივი ყოველ რენდერზე რუკას ხაზებს თავიდან ახატვინებდა და ჩარჩოს „ახტუნებდა" */
  const mapRoutes = useMemo<MapRoute[]>(() => {
    if (shown) return [{ id: `saved-${shown.id}`, points: decodePolyline(shown.geometry), active: true }]
    if (!plan) return []

    return plan.routes.map((r) => ({ id: r.index, points: decodePolyline(r.geometry), active: r.index === active }))
  }, [plan, active, shown])
  const mapFrom = useMemo<LatLng | null>(() => (shown ? [shown.from_lat, shown.from_lng] : from), [shown, from])

  const busy = locating || compute.isPending
  const inaccurate = start?.mode === 'here' && accuracy !== null && accuracy > ACCURACY_LIMIT
  const isHome = !!start && !!memory.home && start.at[0] === memory.home.lat && start.at[1] === memory.home.lng

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
        <MapFrame
          center={to}
          from={mapFrom}
          routes={mapRoutes}
          // „რუკაზე": დაჭერა და საწყისის პინის გადათრევა საწყისს სვამს
          onPickFrom={
            mode === 'pin'
              ? (lat, lng) => run({ at: [lat, lng], label: t('places.route.from.pinned'), mode: 'pin' })
              : undefined
          }
          className="h-72 lg:h-[26rem]"
        />

        <div className="space-y-3">
          <CutTabs
            label={t('places.route.profile')}
            layout="inline"
            options={ROUTE_PROFILES.map((p) => ({ key: p, label: t(`places.route.profiles.${p}`), icon: PROFILE_ICON[p] }))}
            value={profile}
            onChange={(key) => pickProfile(key as RouteProfile)}
          />

          {/* ---------- საიდან ---------- */}
          <CutTabs
            label={t('places.route.from.title')}
            layout="inline"
            size="sm"
            options={START_MODES.map((key) => ({ key, label: t(`places.route.from.${key}`) }))}
            value={mode}
            onChange={(key) => setMode(key as StartMode)}
          />

          <div data-testid="route-start-picker">
            {mode === 'here' && (
              <Button type="button" className="w-full" disabled={busy} onClick={() => void locate()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Navigation className="size-4" />}
                {locating ? t('places.route.locating') : compute.isPending ? t('places.route.computing') : t('places.route.fromMe')}
              </Button>
            )}

            {mode === 'home' &&
              (memory.home ? (
                <Button type="button" className="w-full" disabled={busy} onClick={() => run(homeStart(memory.home!))}>
                  {compute.isPending ? <Loader2 className="size-4 animate-spin" /> : <Home className="size-4" />}
                  {t('places.route.fromHome')}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">{t('places.route.noHome')}</p>
              ))}

            {mode === 'address' && (
              <div className="space-y-2">
                <form
                  className="flex gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void search()
                  }}
                >
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('places.route.addressPlaceholder')}
                    aria-label={t('places.route.from.address')}
                  />
                  <Button type="submit" variant="outline" disabled={searching || !query.trim()} className="shrink-0">
                    {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                    {t('places.route.search')}
                  </Button>
                </form>
                {candidates &&
                  (candidates.length ? (
                    <ul className="max-h-48 space-y-1 overflow-y-auto" data-testid="route-candidates">
                      {candidates.map((c) => (
                        <li key={`${c.source}-${c.source_id}`}>
                          <button
                            type="button"
                            disabled={c.lat == null || c.lng == null}
                            onClick={() => run({ at: [Number(c.lat), Number(c.lng)], label: c.name, mode: 'address' })}
                            className="flex w-full cursor-pointer flex-col rounded-md border border-border px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                          >
                            <span className="truncate font-medium">{c.name}</span>
                            {c.address && <span className="truncate text-xs text-muted-foreground">{c.address}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t('places.route.noCandidates')}</p>
                  ))}
              </div>
            )}

            {mode === 'myplace' &&
              (placesQ.isLoading ? (
                <p className="text-xs text-muted-foreground">{t('api.loading')}</p>
              ) : otherPlaces.length ? (
                <Select
                  value=""
                  onValueChange={(id) => {
                    const p = otherPlaces.find((x) => String(x.id) === id)
                    if (p) run({ at: [Number(p.lat), Number(p.lng)], label: p.name, mode: 'myplace' })
                  }}
                >
                  <SelectTrigger aria-label={t('places.route.from.myplace')}>
                    <SelectValue placeholder={t('places.route.myplacePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {otherPlaces.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">{t('places.route.noOtherPlaces')}</p>
              ))}

            {mode === 'pin' && <p className="text-xs text-muted-foreground">{t('places.route.pinHint')}</p>}
          </div>

          {/* ---------- არჩეული საწყისი: სახელი, სიზუსტე, „სახლად შენახვა" ---------- */}
          {start && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-testid="route-start">
              <span className="text-muted-foreground">{t('places.route.from.short', { label: start.label })}</span>
              {start.mode === 'here' && accuracy !== null && (
                <span className={cn('tabular-nums', inaccurate ? 'text-[var(--icon-warn)]' : 'text-muted-foreground')}>
                  {t('places.route.accuracy', { value: distanceLabel(accuracy, t) })}
                </span>
              )}
              {!isHome && (
                <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={saveHome}>
                  <Home className="size-3.5" />
                  {t('places.route.saveHome')}
                </Button>
              )}
            </div>
          )}
          {inaccurate && (
            <p className="flex items-start gap-1.5 text-xs text-[var(--icon-warn)]" data-testid="route-inaccurate">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {t('places.route.inaccurate')}
            </p>
          )}
          {note && (
            <p className="text-xs text-muted-foreground" data-testid="route-note">
              {note}
            </p>
          )}

          {/* ---------- გზების რაოდენობა ---------- */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('places.route.count')}</span>
            <NumberPick size="sm" value={count} onChange={pickCount} options={ROUTE_COUNTS} min={1} max={ROUTE_MAX} />
          </div>

          {plan && plan.routes.length > 0 && (
            <>
              {plan.routes.length < plan.requested && (
                <p className="text-xs text-muted-foreground" data-testid="route-found">
                  {t('places.route.found', { count: plan.routes.length })}
                </p>
              )}
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
            </>
          )}

          {chosen && start && plan && (
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
                  from_lat: start.at[0],
                  from_lng: start.at[1],
                  from_label: start.label,
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
        </div>
      </div>

      {/* ---------- შენახული მარშრუტები: რუკის ქვემოთ, სრულ სიგანეზე ---------- */}
      <div className="mt-5" data-testid="saved-routes">
        <h4 className="mb-1.5 text-xs font-semibold text-muted-foreground">{t('places.route.savedTitle')}</h4>
        {savedQ.data?.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {savedQ.data.map((route) => {
              const Icon = PROFILE_ICON[route.profile] ?? Car
              const isShown = shown?.id === route.id

              return (
                <li key={route.id} className={cn('px-3 py-2 text-sm', isShown && 'bg-primary/5')} data-testid="saved-route">
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
                    <div className="flex flex-wrap items-center gap-3">
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{route.name}</span>
                        <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
                          <span>{t(`places.route.profiles.${route.profile}`)}</span>
                          <span>
                            {distanceLabel(route.distance_m, t)} · {durationLabel(route.duration_s, t)}
                          </span>
                          <span>
                            {t('places.route.from.short', { label: route.from_label ?? coords(route.from_lat, route.from_lng) })}
                          </span>
                          {route.chosen_at && <span>{dateTime(route.chosen_at)}</span>}
                        </span>
                      </span>
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
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
                          variant="destructiveOutline"
                          size="sm"
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
                          {t('actions.delete')}
                        </Button>
                      </div>
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
    </DetailSection>
  )
}
