import { api } from '@/lib/api'
import { readPage, type ListParams, type Page } from '@/lib/paged'
import { readRemoved, removalBody, type DictionaryRemoval, type DictionaryRemoved } from '@/api/dictionary'

/* ============================================================
   ადგილების მოდული (`place`, FEAT-26).

   ⚠️ წყარო **OSM Nominatim**-ია: უფასო და გასაღების გარეშე, ე.ი. §12-ის
   `candidates → lookup` ნაკადი აქ ნამდვილად მუშაობს (კურსებისგან
   განსხვავებით). სამაგიეროდ მას წამში ერთი მოთხოვნა უშვებს — ამიტომ
   ძებნა **მხოლოდ ცხადი დაწკაპუნებით** ხდება და არასდროს აკრეფისას.

   ⚠️ სტატუსი **enum-ია** და ორმნიშვნელოვანი: ადგილს „მიმდინარე"
   მდგომარეობა არ აქვს — ან ვიყავი, ან არა.
   ============================================================ */

export const PLACE_STATUSES = ['to_visit', 'visited'] as const

export type PlaceStatus = (typeof PLACE_STATUSES)[number]

export const PLACE_FILE_KINDS = ['image', 'doc'] as const

export type PlaceFileKind = (typeof PLACE_FILE_KINDS)[number]

export interface PlaceCategory {
  id: number
  key: string
  name_ka: string
  name_en: string
  icon: string | null
  sort_order: number
  places_count?: number
}

export interface Place {
  id: number
  name: string
  address: string | null
  city: string | null
  country: string | null
  lat: number | null
  lng: number | null
  /** §16.2-ის იდენტობა — ხელით შეყვანილს არ აქვს */
  osm_id: string | null
  osm_type: string | null
  /** გარე რუკის ბმული; ⚠️ რუკა თვითონ ამ ეტაპზე არ ემატება */
  map_url: string | null
  description: string | null
  category_id: number | null
  category?: PlaceCategory | null
  tags: string[]
  status: PlaceStatus
  /** Tasks §25.2 — მთელი რიცხვი 1–10 (ადრე `decimal(3,1)` სტრიქონად) */
  rating: number | null
  is_favorite: boolean
  visited_at: string | null
  photo: string | null
  /** Tasks §57.1 — წყაროდან (Google Maps): ტელეფონი, ვებგვერდი, სამუშაო საათები */
  phone: string | null
  website: string | null
  opening_hours: string[]
  /** წყაროს საშუალო 0–5 (Google) — **შენი ქულა არ არის** (`rating`) */
  source_rating: number | null
  source_rating_count: number | null
  files_count?: number
  /** გალერეიდან/ვებიდან მოტანილი ფოტოები — ატვირთვებისგან ცალკე ფაქტია */
  photos_count?: number
  visibility: 'private' | 'public'
  created_at: string | null
}

export interface PlaceFile {
  id: number
  kind: PlaceFileKind
  path: string
  url: string
  original_name: string
  mime: string | null
  size: number
  created_at: string | null
}

/** Tasks §57 — ადგილის წყარო: Google Places → SerpApi → Serper → Nominatim (+ ბმული) */
export type PlaceSource = 'google' | 'serpapi' | 'serper' | 'nominatim' | 'link'

/**
 * კანდიდატი/მონახაზი ნებისმიერი წყაროდან — ერთი ფორმა (`PlaceSearch`, backend).
 * ⚠️ წერისას შემოთავაზებას (Google) მხოლოდ სახელი და მისამართი აქვს — დანარჩენი
 * არჩევისას (`lookupPlace`) მოდის; `kind` ჩვენს კატეგორიად **არ** ითარგმნება.
 */
export interface PlaceCandidate {
  source: PlaceSource
  source_id: string
  osm_id: string | null
  osm_type: string | null
  name: string
  address: string | null
  city: string | null
  country: string | null
  lat: number | null
  lng: number | null
  /** წყაროს კლასიფიკაცია („რესტორანი", „historic monastery") */
  kind: string | null
  /** წყაროს საშუალო (Google 0–5) და შეფასებების რიცხვი */
  rating: number | null
  rating_count: number | null
  phone: string | null
  website: string | null
  hours: string[]
  photo: string | null
  /** ყველა ფოტო — შენახვისას გალერეაში ჩამოდის (`gallery_urls`) */
  photos: string[]
  maps_url: string | null
}

export interface PlaceSearchResult {
  results: PlaceCandidate[]
  /** რომელმა წყარომ უპასუხა */
  source?: PlaceSource
  /** წერისას შემოთავაზება ამ ანგარიშზე შესაძლებელია? (Google-ის გასაღები) */
  live: boolean
}

export interface PlaceFilters extends ListParams {
  q?: string
  status?: string
  favorite?: boolean
  /** კატეგორიები — მძიმით გამოყოფილი id-ები (OR — სვეტია) */
  category_id?: string
  /** ქვეყნები — მძიმით გამოყოფილი სია (OR) */
  country?: string
  /** ტეგები — მძიმით გამოყოფილი სია (AND) */
  tag?: string
  sort?: string
}

export interface PlaceInput {
  name: string
  address?: string | null
  city?: string | null
  country?: string | null
  lat?: number | null
  lng?: number | null
  osm_id?: string | null
  osm_type?: string | null
  description?: string | null
  category_id?: number | null
  tags?: string[]
  status?: PlaceStatus
  rating?: number | null
  visibility?: 'private' | 'public'
  visited_at?: string | null
  /** ატვირთული ფოტო; მითითების შემთხვევაში multipart-ად იგზავნება */
  photo?: File | null
  remove_photo?: boolean
  /** Tasks §57.1 — წყაროს ინფო */
  phone?: string | null
  website?: string | null
  opening_hours?: string[]
  source_rating?: number | null
  source_rating_count?: number | null
  /** წყაროს ფოტოები → ადგილის გალერეა (პირველი — მთავარი, თუ ფოტო არ გაქვს) */
  gallery_urls?: string[]
}

function toFormData(input: PlaceInput): FormData {
  const fd = new FormData()
  fd.append('name', input.name)
  fd.append('address', input.address ?? '')
  fd.append('city', input.city ?? '')
  fd.append('country', input.country ?? '')
  fd.append('description', input.description ?? '')
  /* ⚠️ `!= null` და არა truthy: **ნული ნამდვილი კოორდინატია** (ეკვატორი,
     გრინვიჩი) და `if (input.lat)` მას ჩუმად გადააგდებდა. */
  if (input.lat !== undefined) fd.append('lat', input.lat == null ? '' : String(input.lat))
  if (input.lng !== undefined) fd.append('lng', input.lng == null ? '' : String(input.lng))
  if (input.osm_id) fd.append('osm_id', input.osm_id)
  if (input.osm_type) fd.append('osm_type', input.osm_type)
  if (input.category_id != null) fd.append('category_id', String(input.category_id))
  if (input.status) fd.append('status', input.status)
  if (input.visibility) fd.append('visibility', input.visibility)
  // Tasks §4.8 — გასუფთავებული შეფასება (`null`) ცარიელად იგზავნება, თორემ უკან ბრუნდებოდა
  if (input.rating !== undefined) fd.append('rating', input.rating == null ? '' : String(input.rating))
  if (input.visited_at) fd.append('visited_at', input.visited_at)
  /* ⚠️ **ცარიელი სიაც იგზავნება**: backend `has('tags')`-ზე დგას, ე.ი.
     გამოტოვებული გასაღები „არ შეცვალო"-ს ნიშნავს და ბოლო ტეგის მოხსნა
     შეუძლებელი იქნებოდა. */
  if ((input.tags ?? []).length === 0) fd.append('tags', '')
  ;(input.tags ?? []).forEach((tag) => fd.append('tags[]', tag))
  if (input.photo) fd.append('photo', input.photo)
  if (input.remove_photo) fd.append('remove_photo', '1')
  // Tasks §57.1 — `undefined` „არ შეეხო"-ა, `null`/ცარიელი — „გაასუფთავე"
  if (input.phone !== undefined) fd.append('phone', input.phone ?? '')
  if (input.website !== undefined) fd.append('website', input.website ?? '')
  if (input.opening_hours !== undefined) {
    if (input.opening_hours.length === 0) fd.append('opening_hours', '')
    input.opening_hours.forEach((line) => fd.append('opening_hours[]', line))
  }
  if (input.source_rating !== undefined) fd.append('source_rating', input.source_rating == null ? '' : String(input.source_rating))
  if (input.source_rating_count !== undefined) {
    fd.append('source_rating_count', input.source_rating_count == null ? '' : String(input.source_rating_count))
  }
  ;(input.gallery_urls ?? []).forEach((url) => fd.append('gallery_urls[]', url))

  return fd
}

/* ---------- ადგილები ---------- */

export async function fetchPlaces(filters: PlaceFilters = {}): Promise<Page<Place>> {
  const { favorite, all, ...rest } = filters
  const params = { ...rest, ...(favorite ? { favorite: 1 } : {}), ...(all ? { all: 1 } : {}) }
  const { data } = await api.get('/places', { params })
  return readPage<Place>(data)
}

export async function fetchPlace(id: number): Promise<Place> {
  const { data } = await api.get(`/places/${id}`)
  return data.data
}

/** ქვეყნები ჩანაწერებიდან — ცალკე ლექსიკონი არ არსებობს (თამაშის `franchise`-ის წესი) */
export async function fetchPlaceCountries(): Promise<{ name: string; count: number }[]> {
  const { data } = await api.get('/places/countries')
  return data.data
}

/**
 * Tasks §57 — ადგილის ძებნა. `live` — წერისას (მხოლოდ Google; გასაღების გარეშე
 * `live: false` და ძებნა Enter-ით ხდება); `city` — ფორმის ქალაქი (მიკერძოება);
 * `session` — Google-ის ავტოშევსების სესია (შემოთავაზებები + დეტალები ერთად ითვლება).
 */
export async function searchPlaces(
  query: string,
  opts: { live?: boolean; city?: string | null; session?: string } = {},
): Promise<PlaceSearchResult> {
  const { data } = await api.post('/places/lookup/candidates', {
    query,
    ...(opts.live ? { live: 1 } : {}),
    ...(opts.city ? { city: opts.city } : {}),
    ...(opts.session ? { session: opts.session } : {}),
  })
  return { results: data.results ?? [], source: data.source, live: !!data.live }
}

/** კანდიდატები სიად — ცხადი ძებნა (მარშრუტის „საიდან", §56) */
export async function fetchPlaceCandidates(query: string): Promise<PlaceCandidate[]> {
  return (await searchPlaces(query)).results
}

/** არჩეული კანდიდატი → სრული მონახაზი (ფოტოები, ქალაქი კოორდინატიდან…) */
export async function lookupPlace(candidate: PlaceCandidate, query: string, session?: string): Promise<PlaceCandidate> {
  const { data } = await api.post('/places/lookup', {
    source: candidate.source,
    source_id: candidate.source_id,
    query,
    ...(session ? { session } : {}),
  })
  return data.draft
}

/** §57.3 — Google Maps-ის ბმული (მოკლეც) → მონახაზი */
export async function placeFromLink(url: string): Promise<PlaceCandidate> {
  const { data } = await api.post('/places/lookup/link', { url })
  return data.draft
}

/** §57.4 — კოორდინატი → მისამართი (პინის გადათრევა) */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ address: string | null; city: string | null; country: string | null }> {
  const { data } = await api.post('/places/lookup/reverse', { lat, lng })
  return data.address
}

export async function createPlace(input: PlaceInput): Promise<Place> {
  const { data } = await api.post('/places', toFormData(input))
  return data.data
}

export async function updatePlace(id: number, input: PlaceInput): Promise<Place> {
  const fd = toFormData(input)
  fd.append('_method', 'PUT') // method spoofing — multipart-safe
  const { data } = await api.post(`/places/${id}`, fd)
  return data.data
}

export async function deletePlace(id: number): Promise<void> {
  await api.delete(`/places/${id}`)
}

export async function togglePlaceFavorite(id: number): Promise<Place> {
  const { data } = await api.patch(`/places/${id}/favorite`)
  return data.data
}

/** ⚠️ `visited_at`-ს მხოლოდ backend-ის `applyStatus()` წერს */
export async function setPlaceStatus(
  id: number,
  status: PlaceStatus,
  visitedAt?: string | null,
): Promise<Place> {
  const { data } = await api.patch(`/places/${id}/status`, {
    status,
    ...(visitedAt ? { visited_at: visitedAt } : {}),
  })
  return data.data
}

/* ---------- ფაილები ---------- */

export async function fetchPlaceFiles(placeId: number): Promise<PlaceFile[]> {
  const { data } = await api.get(`/places/${placeId}/files`)
  return data.data
}

export async function uploadPlaceFiles(
  placeId: number,
  kind: PlaceFileKind,
  files: File[],
): Promise<PlaceFile[]> {
  const fd = new FormData()
  fd.append('kind', kind)
  files.forEach((file) => fd.append('files[]', file))
  const { data } = await api.post(`/places/${placeId}/files`, fd)
  return data.data
}

export async function deletePlaceFile(id: number): Promise<void> {
  await api.delete(`/place-files/${id}`)
}

/* ---------- რუკა და მარშრუტები (Tasks §30 → §56) ----------
   ⚠️ გამოთვლა (`computePlaceRoute`) ჩანაწერს არ ქმნის. საწყისი — ჩემი მდებარეობა,
   სახლი, მისამართი, ჩემი სხვა ადგილი ან რუკაზე მონიშნული წერტილი (§56.1; სერვერთან
   ყველა რიცხვებად მიდის); შენახვა არჩეულის ასლია, გეომეტრია polyline-ად
   (`lib/polyline.ts`), „საიდან" — `from_label`-ით. */
export const ROUTE_PROFILES = ['driving', 'foot', 'bike'] as const
export type RouteProfile = (typeof ROUTE_PROFILES)[number]

export interface RouteOption {
  index: number
  distance_m: number
  duration_s: number
  /** encoded polyline, precision 5 */
  geometry: string
  summary: string | null
}

export interface RoutePlan {
  profile: RouteProfile
  /** §56.3 — რამდენი გზა ითხოვე; `routes` შეიძლება ნაკლები იყოს */
  requested: number
  from: { lat: number; lng: number }
  to: { lat: number; lng: number }
  /** პირველი უმოკლესია; ცარიელი = მარშრუტი არ არსებობს (სერვერი კი მუშაობს) */
  routes: RouteOption[]
}

export interface PlaceRoute {
  id: number
  place_id: number
  name: string
  profile: RouteProfile
  distance_m: number
  duration_s: number
  from_lat: number
  from_lng: number
  /** §56.4 — „საიდან" (სახლი, მისამართი…); ძველ მარშრუტს არ აქვს */
  from_label: string | null
  geometry: string
  chosen_at: string | null
  created_at: string | null
}

export interface PlaceRouteInput {
  name: string
  profile: RouteProfile
  distance_m: number
  duration_s: number
  from_lat: number
  from_lng: number
  from_label?: string | null
  geometry: string
}

export async function computePlaceRoute(
  placeId: number,
  input: { from_lat: number; from_lng: number; profile: RouteProfile; count?: number },
): Promise<RoutePlan> {
  const { data } = await api.post(`/places/${placeId}/route`, input)
  return data.data
}

export async function fetchPlaceRoutes(placeId: number): Promise<PlaceRoute[]> {
  const { data } = await api.get(`/places/${placeId}/routes`)
  return data.data
}

export async function savePlaceRoute(placeId: number, input: PlaceRouteInput): Promise<PlaceRoute> {
  const { data } = await api.post(`/places/${placeId}/routes`, input)
  return data.data
}

export async function renamePlaceRoute(id: number, name: string): Promise<PlaceRoute> {
  const { data } = await api.patch(`/place-routes/${id}`, { name })
  return data.data
}

export async function deletePlaceRoute(id: number): Promise<void> {
  await api.delete(`/place-routes/${id}`)
}

/* ---------- კატეგორიები (per-user ლექსიკონი) ---------- */

export async function fetchPlaceCategories(): Promise<PlaceCategory[]> {
  const { data } = await api.get('/place-categories')
  return data.data
}

export interface PlaceCategoryInput {
  name_ka: string
  name_en: string
  icon?: string | null
}

export async function createPlaceCategory(input: PlaceCategoryInput): Promise<PlaceCategory> {
  const { data } = await api.post('/place-categories', input)
  return data.data
}

export async function updatePlaceCategory(
  id: number,
  input: PlaceCategoryInput,
): Promise<PlaceCategory> {
  const { data } = await api.put(`/place-categories/${id}`, input)
  return data.data
}

export async function deletePlaceCategory(
  id: number,
  opts: DictionaryRemoval = {},
): Promise<DictionaryRemoved> {
  const res = await api.delete(`/place-categories/${id}`, { data: removalBody(opts) })
  return readRemoved(res.data)
}

export async function reorderPlaceCategories(ids: number[]): Promise<PlaceCategory[]> {
  const { data } = await api.post('/place-categories/reorder', { ids })
  return data.data
}
