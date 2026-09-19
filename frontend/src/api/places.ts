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
  rating: string | null
  is_favorite: boolean
  visited_at: string | null
  photo: string | null
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

/** Nominatim-ის კანდიდატი — ჩვენს კატეგორიად **არ** ითარგმნება */
export interface PlaceCandidate {
  osm_id: string
  osm_type: string
  name: string
  address: string | null
  city: string | null
  country: string | null
  lat: number
  lng: number
  /** OSM-ის საკუთარი კლასიფიკაცია („historic monastery") */
  kind: string | null
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
  if (input.lat != null) fd.append('lat', String(input.lat))
  if (input.lng != null) fd.append('lng', String(input.lng))
  if (input.osm_id) fd.append('osm_id', input.osm_id)
  if (input.osm_type) fd.append('osm_type', input.osm_type)
  if (input.category_id != null) fd.append('category_id', String(input.category_id))
  if (input.status) fd.append('status', input.status)
  if (input.visibility) fd.append('visibility', input.visibility)
  if (input.rating != null) fd.append('rating', String(input.rating))
  if (input.visited_at) fd.append('visited_at', input.visited_at)
  /* ⚠️ **ცარიელი სიაც იგზავნება**: backend `has('tags')`-ზე დგას, ე.ი.
     გამოტოვებული გასაღები „არ შეცვალო"-ს ნიშნავს და ბოლო ტეგის მოხსნა
     შეუძლებელი იქნებოდა. */
  if ((input.tags ?? []).length === 0) fd.append('tags', '')
  ;(input.tags ?? []).forEach((tag) => fd.append('tags[]', tag))
  if (input.photo) fd.append('photo', input.photo)
  if (input.remove_photo) fd.append('remove_photo', '1')

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

/** Nominatim-ის კანდიდატები — **მხოლოდ ცხადი დაწკაპუნებით** */
export async function fetchPlaceCandidates(query: string): Promise<PlaceCandidate[]> {
  const { data } = await api.post('/places/lookup/candidates', { query })
  return data.results ?? []
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
