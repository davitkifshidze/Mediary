import { api } from '@/lib/api'
import type { Status } from '@/api/types'
import type { GalleryParentKind, GallerySort } from '@/api/gallery'
import type { StackPreview } from '@/components/ui/photo-stack'
import type { MediaType } from '@/lib/media'

/* ============================================================
   საჯარო პროფილი (Tasks §16.1).

   ⚠️ სამი ფენა უნდა იყოს ღია, რომ ჩანაწერი გამოჩნდეს:
   პროფილი (`users.profile_visibility`) → მოდული (`module_user.is_public`) →
   ჩანაწერი (`<record>.visibility`). სამივე default-ით `private`.
   ============================================================ */

export type Visibility = 'private' | 'public'

/**
 * დომენი — **მოდულის ტოლი არაა**: `playlist` ცალკე დომენია, მაგრამ `song`
 * მოდულში ცხოვრობს. სარკეა backend-ის `PublicDomain::DOMAINS`-ისა.
 * ⚠️ `note` აქ განზრახ არ არის (16.5 — პირადი დოკუმენტები არასდროს საჯაროვდება).
 */
export const PUBLIC_DOMAINS = [
  'movie',
  'series',
  // §7.1 — მესამე მედია-დომენი
  'anime',
  'game',
  'book',
  'board_game',
  'video',
  'song',
  'playlist',
  // §18 — ბუკმარკები; იდენტობა თვითონ ბმულია (`PublicDomain::MATCH`)
  'bookmark',
  // Tasks §2 — ორივე აკლდა და „რომელი ჩანაწერი ჩანს"-ში მათი ჩანართი არ იხატებოდა.
  // ⚠️ სია `RegistryConsistencyTest`-ით `PublicDomain::DOMAINS`-ს ედარება.
  'course',
  'place',
  /* §7.5 — გალერეის **ალბომი**. ⚠️ ეს „ჩანაწერი" არ არის: ფოტო მშობლის
     ხილვადობას იმემკვიდრებს, ე.ი. ფილმის კადრს ცალკე გადამრთველი არ
     სჭირდება — **უმშობლო** ფოტოს კი მემკვიდრეობით არაფერი მოსდის და
     ერთადერთი, რითიც ის შეიძლება გაზიარდეს, ალბომია. */
  'gallery_album',
] as const
export type PublicDomainKey = (typeof PUBLIC_DOMAINS)[number]

/**
 * დომენი → **რომელი მოდულის ჩართვა სჭირდება**.
 * ⚠️ `playlist` მოდული არაა (ის `song`-ის შიგნითაა, §15) — სწორედ ამიტომ
 * არსებობს ეს რუკა და არა `domain === module` დაშვება. სარკეა backend-ის
 * `PublicDomain::DOMAINS[...]['module']`-ისა.
 */
export const DOMAIN_MODULE: Record<PublicDomainKey, string> = {
  movie: 'movie',
  series: 'series',
  anime: 'anime',
  game: 'game',
  book: 'book',
  board_game: 'board_game',
  video: 'video',
  song: 'song',
  playlist: 'song',
  bookmark: 'bookmark',
  course: 'course',
  place: 'place',
  gallery_album: 'gallery',
}

/** ვიწრო ბარათი — backend განზრახ **არ** აბრუნებს ჩანაწერის სრულ რესურსს */
export interface PublicCard {
  id: number
  domain: PublicDomainKey
  title_ka?: string | null
  title_en?: string | null
  subtitle?: string | null
  year?: number | null
  image?: string | null
  /**
   * ⚠️ **ლექსიკონიან დომენებზე ობიექტია** (§6.4) — სახელი **მფლობელისაა**
   * და უცხო მნახველი მას სხვაგან ვერსად წაიკითხავდა. `enum`-იან სამზე
   * (წიგნი · თამაში · ბორდგეიმი) კვლავ სტრიქონია და i18n-ით ითარგმნება.
   */
  status?: Status | string | null
  rating?: number | string | null
  url?: string | null
  songs_count?: number
}

export interface PublicProfile {
  profile: {
    username: string
    display_name: string
    avatar_path: string | null
    bio: string | null
    joined_at: string | null
  }
  domains: PublicDomainKey[]
  counts: Record<string, number>
  modules: Record<string, { name_ka: string; name_en: string; icon: string; color: string | null }>
  domain_modules: Record<string, string>
}

export interface PublicItems {
  data: PublicCard[]
  meta: { current_page: number; last_page: number; per_page: number; total: number }
}

/** ⚠️ ავტორიზაციის გარეშეც მუშაობს — არასაჯარო პროფილი 404-ია და არა 403 */
export async function fetchPublicProfile(username: string): Promise<PublicProfile> {
  const { data } = await api.get(`/public/profiles/${encodeURIComponent(username)}`)
  return data
}

export async function fetchPublicItems(
  username: string,
  domain: PublicDomainKey,
  page = 1,
): Promise<PublicItems> {
  const { data } = await api.get(
    `/public/profiles/${encodeURIComponent(username)}/${domain}`,
    { params: { page } },
  )
  return data
}

/* ---------- დამთხვევები (Tasks §16.2) ---------- */

/**
 * შედარებადი დომენები — ⚠️ **`playlist` აქ არ არის**: მას საერთო იდენტობა
 * არ გააჩნია (ერთნაირად დასათაურებული პლეილისტი ერთი და იგივე არაა).
 * სარკეა backend-ის `PublicDomain::MATCH`-ისა.
 */
export const MATCH_DOMAINS = [
  'movie',
  'series',
  // §7.1 — იდენტობა `tmdb_id`-ია, ისევე როგორც სერიალზე
  'anime',
  'game',
  'book',
  'board_game',
  'video',
  'song',
  // §18 — იდენტობა თვითონ ბმულია, ე.ი. ერთი გვერდი ორივესთან ერთი და იგივეა
  'bookmark',
] as const
export type MatchDomainKey = (typeof MATCH_DOMAINS)[number]

export interface MatchRow {
  domain: MatchDomainKey
  shared: number
  /** ⚠️ `null` = დომენს სტატუსი არ აქვს (ვიდეო/სიმღერა), და არა „ნული დაემთხვა" */
  both_done: number | null
  done_status: string | null
  mine: number
  theirs: number
  /** Jaccard: საერთო ÷ გაერთიანება — ასიმეტრიული წილადი შეცდომაში შეიყვანდა */
  percent: number
}

export interface MatchSummary {
  profile: PublicProfile['profile']
  domains: MatchRow[]
  total: { shared: number; both_done: number; percent: number }
  modules: PublicProfile['modules']
}

/**
 * ერთი საერთო ჩანაწერი.
 * ⚠️ ბარათის `status`/`rating` **მეორე მხარისაა** (პროფილს ვუყურებ), ჩემი
 * მონაცემი კი `mine`-შია — ორივეს სრული ბარათი ერთსა და იმავეს გაიმეორებდა.
 */
export interface MatchCard extends PublicCard {
  mine: { id: number; status: Status | null; rating: number | string | null }
  both_done: boolean
}

/**
 * ⚠️ ავტორიზებულია (საჯარო პროფილისგან განსხვავებით) და **ჩემი პროფილიც
 * საჯარო უნდა იყოს** — თორემ 409 `profile_not_public`.
 */
export async function fetchMatches(username: string): Promise<MatchSummary> {
  const { data } = await api.get(`/matches/${encodeURIComponent(username)}`)
  return data
}

export async function fetchMatchItems(
  username: string,
  domain: MatchDomainKey,
): Promise<MatchCard[]> {
  const { data } = await api.get(
    `/matches/${encodeURIComponent(username)}/${domain}`,
  )
  return data.data
}

/* ---------- „ვისთან ჰგავს ჩემი გემოვნება" (Tasks §16.2) ---------- */

/** ერთი პროფილი კატალოგში — კომპაქტური, სრული დაშლა `/u/{username}`-ზეა */
export interface MatchRankingRow {
  profile: PublicProfile['profile']
  shared: number
  both_done: number
  percent: number
  /** მხოლოდ ის დომენები, სადაც რამე დაემთხვა (ცარიელი = ჯერ არაფერი) */
  domains: { domain: MatchDomainKey; shared: number }[]
}

export interface MatchRanking {
  items: MatchRankingRow[]
  /** სულ რამდენი საჯარო პროფილია (ჭერამდე ჩამოჭრამდე) */
  total: number
  /** ⚠️ true = ყველა არ დაითვალა; UI-მ ეს ცხადად უნდა თქვას */
  truncated: boolean
  modules: PublicProfile['modules']
  max_profiles: number
}

/**
 * საჯარო პროფილების კატალოგი, მსგავსების რეიტინგით.
 * ⚠️ **ჩემი პროფილიც საჯარო უნდა იყოს** — თორემ 409 `profile_not_public`.
 */
export async function fetchMatchRanking(q?: string): Promise<MatchRanking> {
  const { data } = await api.get('/matches', { params: q ? { q } : undefined })
  return data
}

/* ---------- გადამრთველები (ავტორიზებული) ---------- */

/**
 * ერთი ჩანაწერის ხილვადობა — **ერთი endpoint ყველა დომენზე**.
 * ⚠️ `PATCH` და არა `POST`: `permission:` middleware POST-იდან `create`-ს
 * გამოიყვანდა და მხოლოდ რედაქტირების უფლების მქონე user-ს ცრუ 403 დაუბრუნდებოდა.
 */
export async function setRecordVisibility(
  domain: PublicDomainKey,
  id: number,
  visibility: Visibility,
): Promise<Visibility> {
  const { data } = await api.patch(`/visibility/${domain}/${id}`, { visibility })
  return data.visibility as Visibility
}

/* ---------- §6.1 — ხილვადობის ცენტრალური მართვა (პროფილზე) ---------- */

export interface VisibilityCard extends PublicCard {
  visibility: Visibility
}

export interface VisibilityList {
  data: VisibilityCard[]
  meta: {
    total: number
    page: number
    per_page: number
    last_page: number
    /** ⚠️ ჯამები **ფილტრამდე** — ჩიპების რიცხვები ძებნაზე არ ხტუნავს */
    public: number
    private: number
  }
}

/**
 * ერთი დომენის ჩანაწერები ხილვადობით.
 * ⚠️ ბარათი **იგივე ვიწრო ფორმაა**, რასაც საჯარო პროფილი ხატავს
 * (`PublicDomain::card()`) — მოდულის სრული რესურსი აქ განზრახ არ მოდის.
 */
export async function fetchVisibilityList(
  domain: PublicDomainKey,
  params: { q?: string; only?: 'all' | Visibility; page?: number; per_page?: number } = {},
): Promise<VisibilityList> {
  const { data } = await api.get(`/visibility/${domain}`, { params })
  return data
}

/**
 * მასობრივი გადართვა — მონიშნულები ან მთელი დომენი.
 * ⚠️ `all` **ცხადი დროშაა**: ცარიელი მონიშვნა ვერასდროს ნიშნავს „ყველაფერს".
 */
export async function setDomainVisibility(
  domain: PublicDomainKey,
  visibility: Visibility,
  scope: { ids: number[] } | { all: true },
): Promise<number> {
  const { data } = await api.patch(`/visibility/${domain}`, { visibility, ...scope })
  return data.updated as number
}

/** ჩანს თუ არა მოდული ჩემს საჯარო პროფილზე (`module_user.is_public`) */
export async function setModulePublic(key: string, isPublic: boolean): Promise<void> {
  await api.put(`/modules/${key}/public`, { is_public: isPublic })
}

/* ---------- საჯარო გალერეა (Tasks §7.4) ---------- */

interface PublicGalleryPhotoBase {
  id: number
  width: number | null
  height: number | null
  album_id: number | null
}

/**
 * **ჩაკეტილ ალბომში მდგომი ფოტო — ფაილის გარეშე** (§7.11): მხოლოდ `id`,
 * ზომები და `locked: true`. ე.ი. ინსპექტორში საპოვნელი არაფერია.
 */
export interface PublicLockedPhoto extends PublicGalleryPhotoBase {
  locked: true
}

export interface PublicOpenPhoto extends PublicGalleryPhotoBase {
  locked: false
  /**
   * ⚠️ **საჯარო დისკზე storage-ის გზაა, პირადზე — API-ის მარშრუტი**
   * (`/public/profiles/{u}/gallery-photos/{id}/file`, `private: true`).
   * გახსნილი ჩაკეტილი ალბომის ფაილი `gallery/locked`-შია, სადაც `/storage/*`
   * ვერ წვდება — ე.ი. `storageUrl()`-ში გატარებული ეს მისამართი 404-ია და
   * ფილა ცარიელი რჩება (Tasks §1: „პაროლი შევიყვანე და ფოტოები მაინც არ
   * ჩაიტვირთა").
   */
  path: string
  /** ფაქტი სერვერისაა (§17.5) — `PRIVATE_ROOTS`-ის ასლი SPA-ში ერთ დღეს დაშორდებოდა */
  private: boolean
  category: string | null
  /**
   * ვისია ფოტო (§32) — **მხოლოდ საჯარო მშობელზე**.
   *
   * ⚠️ `null` ნორმაა: საჯარო ალბომში შეიძლება პირადი ფილმის კადრი იდოს და
   * მისი სათაური ალბომით არ უნდა გაჟონოს. ძველ პასუხს ეს ველი საერთოდ არ აქვს.
   */
  owner?: PublicGalleryOwner | null
}

/** ფოტოს/ვიდეოს მშობელი საჯარო პროფილზე — ჩანაწერი ან მსახიობი (§32) */
export interface PublicGalleryOwner {
  kind: GalleryParentKind | 'actor'
  id: number
  title: string | null
  title_ka: string | null
}

/**
 * ერთი ფოტო საჯარო პროფილზე.
 *
 * ⚠️ **ორი ფორმაა და არა ერთი არჩევითი ველებით** (Tasks §1): ღია ფოტოს
 * `path` ყოველთვის აქვს, ჩაკეტილს — არასდროს. არჩევითი `path?` და `private`-ის
 * არქონა სწორედ ის იყო, რის გამოც `tsc` ხარვეზს ვერ ხედავდა
 * (`GalleryLockedImage`-ის იგივე მიზეზი).
 */
export type PublicGalleryPhoto = PublicLockedPhoto | PublicOpenPhoto

export interface PublicGalleryMeta {
  current_page: number
  last_page: number
  per_page: number
  total: number
}

/**
 * ერთი ალბომის თავი (§32) — მხოლოდ `owner=album:N`-ზე მოდის.
 *
 * ⚠️ **ორი ცალკე ფაქტი**: `locked` — პაროლი ადევს, `unlocked` — ამ სესიაში
 * უკვე გახსნეს. მარტო პირველით გახსნილ ალბომზე „პაროლის შეყვანა" დარჩებოდა.
 */
export interface PublicGalleryAlbumMeta {
  id: number
  name: string
  description: string | null
  locked: boolean
  unlocked: boolean
}

export interface PublicGalleryPage {
  data: PublicGalleryPhoto[]
  meta: PublicGalleryMeta
  album?: PublicGalleryAlbumMeta
}

/**
 * **ფოტოების ფილტრი — მფლობელის გალერეის გრამატიკა** (Tasks §32.1).
 *
 * `owner` — ერთი ჯგუფი (`movie:12` · `actor:5` · `album:3`); `parent` —
 * ხილვადობის წესი, `type`/`from` მას ერთ დომენზე ჭრის; `album: 'any'` —
 * საჯარო ალბომების ფოტოები.
 *
 * ⚠️ **ურთიერთგამომრიცხავი კომბინაცია 422-ია** (`type` მხოლოდ
 * `parent: 'record'`-თან, `from` — `parent: 'actor'`-თან, `owner` — მარტო).
 */
export interface PublicGalleryPhotoFilters {
  owner?: string
  parent?: 'record' | 'actor'
  type?: GalleryParentKind
  from?: MediaType
  album?: 'any'
  category?: string
  sort?: GallerySort
  seed?: number
}

export async function fetchPublicGalleryPhotos(
  username: string,
  filters: PublicGalleryPhotoFilters & { page?: number; per_page?: number } = {},
): Promise<PublicGalleryPage> {
  const { data } = await api.get(`/public/profiles/${encodeURIComponent(username)}/gallery-photos`, {
    params: filters,
  })
  return data
}

/* ---------- §32 — ჭრილები, ჯგუფები, ვიდეოები ---------- */

/**
 * ჭრილების მთვლელები — **ერთი გამოძახება**.
 *
 * ⚠️ თითო რიცხვი იმავე წყაროდანაა, რასაც მისი ჭრილი ხატავს (`PublicGallery`):
 * „ბიბლიოთეკა" ჩანაწერების ჯგუფების რაოდენობაა, „ალბომები" — არაცარიელი
 * საჯარო ალბომებისა.
 */
export interface PublicGallerySummary {
  photos: number
  records: number
  actors: number
  albums: number
  videos: number
  /** `{backdrop: 14, poster: 4, actor: 103}` — ნულიანი კატეგორია არ მოდის */
  categories: Partial<Record<string, number>>
}

export async function fetchPublicGallerySummary(username: string): Promise<PublicGallerySummary> {
  const { data } = await api.get(`/public/profiles/${encodeURIComponent(username)}/gallery-summary`)
  return data
}

export type PublicGalleryGroupBy = 'record' | 'actor' | 'album'

export interface PublicGalleryGroup {
  kind: GalleryParentKind | 'actor' | 'album'
  id: number
  title: string | null
  title_ka: string | null
  /** ალბომის აღწერა */
  subtitle?: string | null
  /** ⚠️ `null`, თუ მფლობელმა საჯარო ბარათზე წელი დამალა */
  year?: number | null
  photos: number
  gender?: number | null
  /** ალბომს პაროლი ადევს */
  locked?: boolean
  /** ამ სესიაში უკვე გახსნეს */
  unlocked?: boolean
}

export interface PublicGalleryGroups {
  by: PublicGalleryGroupBy
  groups: PublicGalleryGroup[]
  /** ⚠️ ფასეტური — ჭრილი საკუთარ თავს არ ითვლის (§24-ის წესი) */
  facets?: {
    types?: Partial<Record<string, number>>
    gender?: { all: number; female: number; male: number }
  }
  /** `kind:id` → ესკიზები; ⚠️ ჩაკეტილ ალბომს ესკიზი არ ახლავს */
  previews: Record<string, StackPreview[]>
}

export async function fetchPublicGalleryGroups(
  username: string,
  by: PublicGalleryGroupBy,
  query: { type?: GalleryParentKind; from?: MediaType; gender?: 'female' | 'male'; previews?: number } = {},
): Promise<PublicGalleryGroups> {
  const { data } = await api.get(`/public/profiles/${encodeURIComponent(username)}/gallery-groups`, {
    params: { by, ...query },
  })
  return data
}

/**
 * **ვიდეო-ბმული — ვიწრო ფორმა.** `source`/`source_url` (სად იპოვა ძებნამ)
 * განზრახ არ მოდის — `PublicDomain::card()`-ის წესი.
 */
export interface PublicGalleryVideo {
  id: number
  url: string
  platform: string | null
  /** backend-ის allowlist-იდან; ფრონტი ჰოსტს მაინც ხელახლა ამოწმებს (`lib/embed.ts`) */
  embed_url: string | null
  title: string | null
  channel: string | null
  duration: number | null
  published_at: string | null
  /** ⚠️ დაშორებული მისამართი — `storageUrl()` არ სჭირდება */
  thumbnail_url: string | null
  owner: PublicGalleryOwner | null
}

export interface PublicGalleryVideoPage {
  data: PublicGalleryVideo[]
  meta: PublicGalleryMeta
}

export async function fetchPublicGalleryVideos(
  username: string,
  page = 1,
): Promise<PublicGalleryVideoPage> {
  const { data } = await api.get(`/public/profiles/${encodeURIComponent(username)}/gallery-videos`, {
    params: { page },
  })
  return data
}

/**
 * ⚠️ **პაროლი მფლობელისაა** — უცხოსთვის ალბომი პრაქტიკულად ჩაკეტილი
 * რჩება, მაგრამ მექანიზმი საჯარო გვერდზეც უნდა არსებობდეს (შენი სიტყვები:
 * „საჯაროშიც პაროლიან ალბომებს პაროლი ჭირდება"). გახსნილობა **სერვერის
 * სესიაშია** და არა კლიენტის ტოკენში.
 */
export async function unlockPublicAlbum(username: string, albumId: number, password: string) {
  const { data } = await api.post(`/public/profiles/${encodeURIComponent(username)}/albums/${albumId}/unlock`, {
    password,
  })
  return data as { id: number; unlocked: boolean }
}
