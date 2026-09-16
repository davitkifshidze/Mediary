import { api } from '@/lib/api'
import type { StorageUsage } from './account'
import type { Status } from './types'
import type { MediaType } from '@/lib/media'

/* ============================================================
   გალერეის მოდული (Tasks 10 → **§8, გალერეა 2.0**).

   ორი სახის შიგთავსი, ერთსა და იმავე მშობლებზე:
     · **ფოტო** (`gallery_images`) — ფაილია დისკზე, კვოტაში ითვლება;
     · **ვიდეო** (`gallery_videos`, §8.1) — მხოლოდ ბმულია, კვოტას არ ეხება.

   მშობელი შეიძლება იყოს ჩანაწერი (ფილმი · სერიალი · ანიმე · სიმღერა ·
   წიგნი · თამაში) ან **მსახიობი** — ე.ი. ერთი მსახიობის ფოტო ერთხელ ინახება
   და მის გვერდზეც ჩანს, ორ ფილმს შორის კი არ დუბლირდება.

   ჩამოტვირთვა სათითაოდ მიდის და ციკლს queue ატარებს.
   ============================================================ */

/* ---------- ჩანაწერის ფოტოები: სახეობა, რაოდენობა, ზომა ---------- */

/**
 * ჩანაწერის ფოტოს სახეობები — `GalleryFetcher::SUBJECTS`-ის ასლი.
 *
 * ⚠️ **`logos` ამოღებულია 2026-09-14-ს** (შენი მითითება: „ეს
 * ნაწილი საერთოდ არ მცირდება“). `gallery_images.category`-ში `logo`
 * **რჩება** (ძველი რიგები და მსახიობის tagged-ფოტოები), ამოღებულია
 * **არჩევანი** და არა ბიბლიოთეკა.
 *
 * ⚠️ **ძველი შენახული პარამეტრი არ ტყდება** — `readGalleryDefaults()`
 * უცნობ სახეობას ისედაც ფილტრავს, ე.ი. მიგრაცია არ დასჭირდება.
 */
export const GALLERY_SUBJECTS = ['stills', 'posters'] as const
export type GallerySubject = (typeof GALLERY_SUBJECTS)[number]

/**
 * **ზომების სია სახეობიდან მოდის** (§8.2) — `GalleryFetcher::SUBJECT_SIZES`-ის ასლი.
 *
 * ⚠️ TMDB-ს თითო სახეობაზე თავისი ზომები აქვს: პოსტერზე `w1280` არ არსებობს,
 * ლოგოზე `w780` არ არსებობს. ერთი საერთო სია მომხმარებელს არარსებულ
 * ვარიანტს სთავაზობდა (CDN მას იღებს, მაგრამ ეს დამთხვევაა და არა წესი).
 */
export const GALLERY_SUBJECT_SIZES = {
  stills: ['w300', 'w780', 'w1280', 'original'],
  posters: ['w185', 'w342', 'w500', 'w780', 'original'],
} as const satisfies Record<GallerySubject, readonly string[]>

export const GALLERY_SUBJECT_DEFAULT_SIZE = {
  stills: 'w780',
  posters: 'w500',
} as const satisfies Record<GallerySubject, string>

/** მსახიობების არჩევანი (user-ის მოთხოვნა) */
export const GALLERY_CAST_MODES = ['none', 'all', 'female', 'male', 'selected'] as const
export type GalleryCastMode = (typeof GALLERY_CAST_MODES)[number]

/**
 * **მსახიობის ფოტოს წყარო (§8.2).**
 *
 * ⚠️ სწორედ ესაა პასუხი იმაზე, რომ „ოფიციალურ წყაროზე მსახიობს სამი ფოტო
 * აქვს": `profiles` მართლა მწირია, `tagged` კი იმ ფილმების კადრებია, სადაც
 * ის მონიშნულია — ათეულობით ცალი.
 */
export const GALLERY_CAST_SOURCES = ['profiles', 'tagged', 'both'] as const
export type GalleryCastSource = (typeof GALLERY_CAST_SOURCES)[number]

/**
 * მსახიობის პორტრეტის ზომები (Tasks §3.2).
 *
 * ⚠️ **ჩანაწერის ზომებს არ ემთხვევა და ეს TMDB-ის პირობაა** — `profile`
 * ზომებში `w780` არ არსებობს.
 */
export const GALLERY_CAST_SIZES = ['w185', 'h632', 'original'] as const
export type GalleryCastSize = (typeof GALLERY_CAST_SIZES)[number]

/**
 * ⚠️ **ჭერები backend-ის `GalleryFetcher`-ის კონსტანტების ასლია** — ორივე
 * მხარემ ერთი და იგივე რიცხვი უნდა იცოდეს, თორემ ინტერფეისი შესთავაზებს
 * იმას, რასაც სერვერი ჩუმად მოჭრის (ზუსტად ასე ხდებოდა `actors`-ზე).
 */
export const GALLERY_DEFAULT_LIMIT = 20
export const GALLERY_MAX_LIMIT = 1000
export const GALLERY_DEFAULT_PER_ACTOR = 3
export const GALLERY_MAX_PER_ACTOR = 200
export const GALLERY_DEFAULT_ACTORS = 12
export const GALLERY_MAX_ACTORS = 500

/** რა ჩამოვიდეს — ჩანაწერები თუ ბიბლიოთეკის მსახიობები */
export const GALLERY_TARGETS = ['record', 'actor'] as const
export type GalleryTarget = (typeof GALLERY_TARGETS)[number]

/**
 * სკოუპი — **ცხადი არჩევანი** (§8.2).
 *
 * ⚠️ `off` მხოლოდ მსახიობების სამიზნეზეა და „ჩანაწერებს ნუ მიხედავ,
 * ზოგადად მსახიობებზე ჩამოწერე"-ს ნიშნავს.
 */
export const GALLERY_SCOPES = ['all', 'status', 'favorite', 'genre', 'ids', 'off'] as const
export type GalleryScope = (typeof GALLERY_SCOPES)[number]

export interface GalleryOptions {
  subjects?: GallerySubject[]
  /** თითო სახეობის ჭერი — `0` = „არცერთი" */
  limits?: Partial<Record<GallerySubject, number>>
  /** თითო სახეობის ზომა */
  sizes?: Partial<Record<GallerySubject, string>>
  cast?: GalleryCastMode
  /** `cast: 'selected'`-ზე — ლოკალური `cast_members.id` */
  cast_ids?: number[]
  cast_source?: GalleryCastSource
  /** მსახიობის პორტრეტის ზომა — ჩანაწერისას არ ემთხვევა */
  cast_size?: GalleryCastSize
  /** ფოტო თითო მსახიობზე */
  per_actor?: number
  /** მაქსიმუმ რამდენ მსახიობს ჩამოვუტვირთოთ */
  actors?: number
}

/**
 * მოდულის პარამეტრები (`module_user.settings`) — ბოლო გაშვების არჩევანი
 * default-ად რჩება.
 */
export interface GalleryDefaults {
  subjects: GallerySubject[]
  limits: Record<GallerySubject, number>
  sizes: Record<GallerySubject, string>
  cast: GalleryCastMode
  cast_source: GalleryCastSource
  cast_size: GalleryCastSize
  per_actor: number
  actors: number
}

export const GALLERY_FALLBACK_DEFAULTS: GalleryDefaults = {
  subjects: ['stills'],
  limits: { stills: GALLERY_DEFAULT_LIMIT, posters: GALLERY_DEFAULT_LIMIT },
  sizes: { ...GALLERY_SUBJECT_DEFAULT_SIZE },
  /* ⚠️ **„არცერთი" აღარ არის ნაგულისხმევი** (Tasks §3.2): მსახიობები ცალკე
     ტაბია, ე.ი. იქ „არცერთი" იმას ნიშნავდა, რომ ტაბი თავისთავად გამორთულია. */
  cast: 'all',
  cast_source: 'profiles',
  cast_size: 'h632',
  per_actor: GALLERY_DEFAULT_PER_ACTOR,
  actors: GALLERY_DEFAULT_ACTORS,
}

/** უცნობი/მოძველებული მნიშვნელობა fallback-ზე ბრუნდება (settings JSON-ია) */
export function readGalleryDefaults(raw?: Record<string, unknown> | null): GalleryDefaults {
  /**
   * ⚠️ **`zeroAllowed` აუცილებელია რაოდენობებზე:** 0 „არცერთს" ნიშნავს (§3.6)
   * და ცხადი არჩევანია. უამისოდ „მსახიობზე არცერთი ფოტო" გაშვების შემდეგ
   * ჩუმად 3-ად ბრუნდებოდა.
   */
  const num = (value: unknown, fallback: number, zeroAllowed = false) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return fallback
    return n > 0 || (zeroAllowed && n === 0) ? n : fallback
  }

  const subjects = Array.isArray(raw?.subjects)
    ? (raw!.subjects as unknown[]).filter((s): s is GallerySubject =>
        GALLERY_SUBJECTS.includes(s as GallerySubject),
      )
    : []

  const rawLimits = (raw?.limits ?? {}) as Record<string, unknown>
  const rawSizes = (raw?.sizes ?? {}) as Record<string, unknown>
  // ⚠️ ძველი ერთი საერთო `limit`/`size` — მიგრაციის გარეშე უნდა იმუშაოს
  const legacyLimit = num(raw?.limit, GALLERY_DEFAULT_LIMIT, true)
  const legacySize = typeof raw?.size === 'string' ? (raw.size as string) : null

  const limits = {} as Record<GallerySubject, number>
  const sizes = {} as Record<GallerySubject, string>

  for (const subject of GALLERY_SUBJECTS) {
    limits[subject] = num(rawLimits[subject], legacyLimit, true)
    const size = rawSizes[subject] ?? legacySize
    sizes[subject] = (GALLERY_SUBJECT_SIZES[subject] as readonly string[]).includes(String(size))
      ? String(size)
      : GALLERY_SUBJECT_DEFAULT_SIZE[subject]
  }

  return {
    subjects: subjects.length ? subjects : GALLERY_FALLBACK_DEFAULTS.subjects,
    limits,
    sizes,
    /* ⚠️ ძველ პარამეტრებში `none` შენახულია — ტაბების შემდეგ ის „მსახიობების
       ტაბი ცარიელი გახსენი"-ს ნიშნავდა, ე.ი. `all`-ზე ბრუნდება. */
    cast:
      GALLERY_CAST_MODES.includes(raw?.cast as GalleryCastMode) && raw?.cast !== 'none'
        ? (raw!.cast as GalleryCastMode)
        : GALLERY_FALLBACK_DEFAULTS.cast,
    cast_source: GALLERY_CAST_SOURCES.includes(raw?.cast_source as GalleryCastSource)
      ? (raw!.cast_source as GalleryCastSource)
      : GALLERY_FALLBACK_DEFAULTS.cast_source,
    cast_size: GALLERY_CAST_SIZES.includes(raw?.cast_size as GalleryCastSize)
      ? (raw!.cast_size as GalleryCastSize)
      : GALLERY_FALLBACK_DEFAULTS.cast_size,
    per_actor: num(raw?.per_actor, GALLERY_DEFAULT_PER_ACTOR, true),
    // ⚠️ მსახიობების **რაოდენობა** 0-ს არ იღებს — „არცერთი მსახიობი" `cast: 'none'`-ია
    actors: num(raw?.actors, GALLERY_DEFAULT_ACTORS),
  }
}

/* ---------- ფოტო ---------- */

/** ვისაც ფოტო/ვიდეო ჰკიდია — backend-ის `GalleryParent`-ის ასლი */
export const GALLERY_PARENTS = ['movie', 'series', 'anime', 'song', 'book', 'game'] as const
export type GalleryParentKind = (typeof GALLERY_PARENTS)[number]
/** ბადეში მშობელი ან ჩანაწერია, ან მსახიობი */
export type GalleryOwnerKind = GalleryParentKind | 'actor'

export interface GalleryImage {
  id: number
  /** storage-ის გზა (ფრონტი `storageUrl()`-ით აწყობს) */
  url: string
  original_name: string | null
  mime: string | null
  size: number
  created_at: string | null
  source: 'upload' | 'tmdb' | 'wikimedia' | 'web' | string | null
  /** ორიგინალის გვერდი — ვებიდან ჩამოწერილს აქვს (§4.3) */
  source_url: string | null
  /** ორიგინალი ხელმისაწვდომი არ იყო და ესკიზი ჩამოიწერა (§4.3) */
  is_thumbnail: boolean
  /** ⚠️ TMDB-ის **ტექნიკური** ტიპი — წყაროდან მოდის და ხელით არ იცვლება */
  category: 'backdrop' | 'poster' | 'logo' | 'actor' | null
  /** §26 — user-ის თავისი დახარისხება; მშობლისგან დამოუკიდებელი */
  album_id: number | null
  width: number | null
  height: number | null
  /**
   * ⚠️ **დისკს backend ამბობს** (§17.5-ის წესი): ჩაკეტილი ალბომის ფოტო
   * პირად დისკზეა (§7.9) და `/storage/*` მას ვერ კითხულობს —
   * `PrivateImage`-ით უნდა დაიხატოს.
   */
  private?: boolean
}

/**
 * **ჩაკეტილი ალბომის ფოტო — მხოლოდ სამი ფაქტი (Tasks §7.11).**
 *
 * ⚠️ `url` აქ **არ არსებობს** და ეს არ არის დავიწყებული ველი: სერვერი
 * ბილიკს საერთოდ არ აგზავნის, ე.ი. ინსპექტორშიც არაფერია საპოვნელი.
 * ზომები კი მოდის, თორემ ბადე პროპორციას ვერ დაიცავდა.
 */
export interface GalleryLockedImage {
  id: number
  width: number | null
  height: number | null
  locked: true
}

/** ფოტო მშობლის მითითებით — ბრტყელ სიას სჭირდება */
export interface GalleryOwnedImage extends GalleryImage {
  owner: {
    kind: GalleryOwnerKind
    id: number
    title: string | null
    title_ka: string | null
  } | null
}

/* ---------- ვიდეო-ბმული (§8.1) ---------- */

export interface GalleryVideo {
  id: number
  url: string
  platform: string | null
  external_id: string | null
  /** backend-ის აწყობილი; ფრონტი ჰოსტს ხელახლა ამოწმებს (`lib/embed.ts`) */
  embed_url: string | null
  title: string | null
  channel: string | null
  duration: number | null
  published_at: string | null
  /** ⚠️ **დაშორებული** მისამართია — `storageUrl()` არ სჭირდება */
  thumbnail_url: string | null
  source_url: string | null
  source: string
  sort_order: number
  created_at: string | null
  owner: { kind: GalleryOwnerKind; id: number; title?: string | null }
}

export interface GalleryVideoPage {
  data: GalleryVideo[]
  meta: { page: number; per_page: number; total: number; last_page: number }
}

/* ---------- ჯგუფები და ჭრილები ---------- */

/**
 * როგორ ჯგუფდება გალერეა.
 *
 * ⚠️ **`source` და `provider` ორი სხვადასხვა კითხვაა**: პირველი „ფილმიდან
 * მოვიდა თუ სერიალიდან", მეორე კი „TMDB-დან თუ Google-დან". ვებძებნის
 * შემდეგ ორივეს პასუხი სჭირდება.
 */
export type GalleryGroupBy = 'record' | 'actor' | 'source' | 'provider' | 'module' | 'album'

export interface GalleryGroup {
  kind: GalleryOwnerKind | 'provider' | 'module'
  id: number
  /** მხოლოდ „წყაროს" ჭრილში: ჯგუფი **დომენია და არა ერთეული** */
  from?: MediaType
  /** მხოლოდ „მომწოდებლის" ჭრილში */
  provider?: string
  /** მხოლოდ „მოდულების" ჭრილში */
  module?: string
  title: string | null
  title_ka: string | null
  poster_path: string | null
  photos: number
  bytes: number
  has_tmdb: boolean
  /** მსახიობების ჭრილში — „ყველა ქალის მონიშვნა" ღილაკს სჭირდება */
  gender?: number | null
  /** მოდულების ჭრილში ესკიზები ჯგუფშივე მოდის */
  previews?: string[]
  /** მოდულების ჭრილი პრივატულ დისკზეც ცხოვრობს (`note`) */
  private?: boolean
  /** ალბომების ჭრილში — ჩაკეტილ ჯგუფს ესკიზი არ მოსდევს (2026-09-16) */
  locked?: boolean
  unlocked?: boolean

  /* ---------- ეტაპი 2: შიდა დაჯგუფების საკვები ----------
     ⚠️ **სამივე ჯგუფშივე მოდის და ცალკე არ იკითხება.** „ჟანრი / წელი /
     სტატუსი" სექციებად დაყოფა ფრონტზე ხდება (იხ. `lib/galleryGroups.ts`),
     ე.ი. თითო ბარათზე ცალკე მოთხოვნა ასჯერ გაიგზავნებოდა.
     ⚠️ მხოლოდ ჩანაწერების ჭრილშია — მსახიობს, წყაროსა და მომწოდებელს ეს
     ველები არ აქვთ. */
  year?: number | null
  favorite?: boolean
  /** ⚠️ **ობიექტია და არა სტრიქონი** (§6.4) — სახელი მფლობელის ლექსიკონშია */
  status?: Status | null
  genres?: { slug: string; name_ka: string | null; name_en: string | null }[]
}

export interface GalleryGroups {
  by: GalleryGroupBy
  groups: GalleryGroup[]
  /**
   * **ფასეტური მთვლელები ჭრილის ბარათებისთვის** (§24).
   *
   * ⚠️ **ჭრილი საკუთარ თავს არ ითვლის** — რიცხვი ფილტრის *გარეშე* მოდის,
   * თორემ „ქალების" არჩევისთანავე „კაცები" ნულზე ჩამოვიდოდა და ბარათი
   * იმ კითხვას ვეღარ უპასუხებდა, რისთვისაც არსებობს.
   */
  facets?: {
    gender?: { all: number; female: number; male: number }
    types?: Partial<Record<string, number>>
  }
  /** `kind:id` → ესკიზების გზები (ბადეზე „რა დევს შიგნით") */
  previews: Record<string, string[]>
}

export interface GalleryPageMeta {
  page: number
  per_page: number
  total: number
  last_page: number
}

export interface GalleryPhotoPage {
  data: GalleryOwnedImage[]
  meta: GalleryPageMeta
}

/**
 * **ჩაკეტილი ალბომის გვერდი (Tasks §7.11).**
 *
 * ⚠️ **ცალკე ტიპია და არა „`url` არჩევითი"**: სერვერი ბილიკს საერთოდ არ
 * აგზავნის, ე.ი. ერთ ტიპში შერევა კომპილატორს ატყუებდა და ბადე
 * `undefined`-ს ჩასვამდა `<img src>`-ში. `'locked' in page` ერთადერთი
 * განშტოებაა, რაც გამომძახებელს სჭირდება.
 */
export interface GalleryLockedPage {
  locked: true
  album: { id: number; name: string }
  data: GalleryLockedImage[]
  meta: GalleryPageMeta
}

/** „არეული / ახალი / ძველი" — §8.3-ის გადამრთველი */
export const GALLERY_SORTS = ['new', 'old', 'random'] as const
export type GallerySort = (typeof GALLERY_SORTS)[number]

export interface GalleryPhotoFilters {
  /**
   * `movie:12` · `song:4` · `actor:5` · `album:3` · `none`;
   * მისი გარეშე — ყველა ფოტო.
   *
   * ⚠️ **`none` და „owner არ მოსულა" ორი სხვადასხვა კითხვაა**: პირველი
   * უკატეგორიოა (§26), მეორე — მთელი ბიბლიოთეკა.
   */
  owner?: string
  /** §28 — „არეული" ხედი ჭრილის ფარგლებში: ვის ჰკიდია ფოტო */
  parent?: 'record' | 'actor' | 'none'
  /** §28 — ერთ დომენზე ჭრა („არეული" ხედი ერთი ტაბის შიგნით) */
  type?: GalleryParentKind
  album_id?: number
  /**
   * ⚠️ **„ალბომების" ჭრილის ბრტყელი ხედი** (2026-09-16): `any` — რომელიმე
   * ალბომში დევს, `none` — არცერთში. `album_id`-ით ეს ვერ ითქმებოდა, და
   * „ალბომის გარეშე" ბარათის მოხსნის შემდეგ „არეული" ხედს სხვა პასუხი
   * აღარ ჰქონდა — `owner: 'none'` იმავე წაშლილ საქაღალდეს დააბრუნებდა.
   */
  album?: 'any' | 'none'
  /** „წყაროს" ჭრილი — დომენის ყველა ფოტო (ჩანაწერისაც და მსახიობებისაც) */
  from?: MediaType
  /** „მომწოდებლის" ჭრილი — `tmdb` · `wikimedia` · `serpapi:*` */
  provider?: string
  with_cast?: boolean
  category?: string
  sort?: GallerySort
  /** „არეულის" სიდი — გვერდებს შორის რიგი მდგრადი უნდა იყოს */
  seed?: number
  page?: number
  per_page?: number
}

/** სხვა მოდულების ფოტო — **მხოლოდ კითხვადი** (§8.3) */
export interface ModulePhoto {
  /** ⚠️ სტრიქონია: ორი სხვადასხვა ცხრილის რიგები ერთ სიაშია */
  id: string
  module: string
  owner: { kind: string; id: number; title: string | null }
  /** საჯარო დისკზე — storage-ის გზა; პრივატულზე — API-ის მისამართი */
  url: string
  private: boolean
  kind: 'cover' | 'file'
  size: number | null
  original_name: string | null
  created_at: string | null
}

export interface ModulePhotoPage {
  data: ModulePhoto[]
  meta: {
    page: number
    per_page: number
    total: number
    last_page: number
    /** ჭერს მიაღწია — ცხადად ითქვას, თორემ „სულ ეს არის"-ად იკითხება */
    truncated: boolean
  }
}

/** ქვე-მენიუს მთვლელები — ერთი გამოძახება სამი სიის ნაცვლად (§8.3) */
export interface GallerySummary {
  photos: number
  bytes: number
  records: number
  actors: number
  /**
   * რომელი კატეგორია რამდენია — `{backdrop: 14, poster: 4, actor: 103}`.
   *
   * ⚠️ **გასაღები მხოლოდ მაშინ არის, როცა ფოტო მართლა არსებობს**: სწორედ
   * ამიტომ ჩანდა „ლოგო" ცარიელ ბიბლიოთეკაზეც — სია ფრონტში კონსტანტა იყო.
   */
  categories: Partial<Record<string, number>>
  /** §26 — მშობლის გარეშე დარჩენილი ფოტოები */
  uncategorized: number
  /** §26 — რამდენი ალბომია */
  albums: number
  videos: number
  module_groups: number
  domains: MediaType[]
  storage: StorageUsage
}

/* ---------- მსახიობი ---------- */

export interface GalleryCastMember {
  id: number
  name: string
  name_ka: string | null
  /** TMDB-ის კოდირება: 1 = ქალი, 2 = კაცი, null = უცნობი */
  gender: number | null
  photo_path: string | null
  has_tmdb: boolean
  photos: number
}

/** მსახიობის სრული ფორმა — `CastMember::toDetailArray()`-ის ასლი (§8.1) */
export interface GalleryActor extends GalleryCastMember {
  tmdb_person_id?: number | null
  imdb_id: string | null
  birthday: string | null
  deathday: string | null
  place_of_birth: string | null
  biography: string | null
  known_for: string | null
  popularity: number | null
  homepage: string | null
  profile_links: Record<string, string> | null
  details_synced_at: string | null
}

/** მსახიობის ფოტო ჩანაწერის გვერდზე — ვიცით, ვისია */
export interface GalleryCastImage extends GalleryImage {
  actor: { id: number; name: string; name_ka: string | null } | null
}

export interface GalleryRecordRef {
  type: MediaType
  id: number
  title_ka: string | null
  title_en: string | null
  year: number | null
  poster_path: string | null
  tmdb_id: number | null
}

export interface GalleryDetail {
  record: GalleryRecordRef
  images: GalleryImage[]
  cast_images: GalleryCastImage[]
  cast: GalleryCastMember[]
  videos: GalleryVideo[]
  bytes: number
}

export interface GalleryActorDetail {
  actor: GalleryActor
  images: GalleryImage[]
  videos: GalleryVideo[]
  bytes: number
}

/* ---------- გეგმა ---------- */

export interface GalleryPlanItem {
  /** ⚠️ `'actor'` — მსახიობების სამიზნე: ერთეული მსახიობია და არა ჩანაწერი */
  type: MediaType | 'actor'
  id: number
  title: string
  year: number | null
}

export interface GalleryPlanFilters extends GalleryOptions {
  target?: GalleryTarget
  /** ⚠️ **სია და არა ერთი დომენი** (§8.2) — „ფილმებზე, სერიალებზე და ანიმეებზე ჯამში" */
  types?: MediaType[]
  scope?: GalleryScope
  statuses?: string[]
  genres?: string[]
  /** „ნებისმიერი არჩეული" თუ „ყველა ერთდროულად" */
  genre_mode?: 'any' | 'all'
  favorite?: boolean
  /** დომენების რუკა — `/sync`-ის არსებული ფორმა */
  ids?: Partial<Record<MediaType, number[]>>
  skip_with_photos?: boolean
  /** მსახიობთა ავზში ძებნა (ბიბლიოთეკაში ასეულობით მსახიობია) */
  cast_q?: string
}

export interface GalleryPlan {
  target: GalleryTarget
  types: MediaType[]
  items: GalleryPlanItem[]
  count: number
  eta_seconds: number
  skipped_without_tmdb: number
  /**
   * რამდენი მოიჭრა „ვისაც უკვე აქვს, გამოტოვე"-ით.
   *
   * ⚠️ **ნული თავის მიზეზს უნდა ატარებდეს**: „მსახიობი 0" ერთნაირად
   * იხატებოდა მაშინაც, როცა სკოუპი ცარიელია, და მაშინაც, როცა ყველას
   * ფოტოები უკვე აქვს — ეს ორი სრულიად სხვადასხვა მდგომარეობაა.
   */
  skipped_with_photos: number
  /** ⚠️ ზედა ზღვარია: TMDB სიაში ფაილის ზომას არ იძლევა (17.3) */
  estimated_bytes: number
  storage: StorageUsage
  fits: boolean
  options: Required<Omit<GalleryOptions, 'limits' | 'sizes'>> & {
    limits: Record<GallerySubject, number>
    sizes: Record<GallerySubject, string>
  }
  /** არჩეული ჩანაწერების გაერთიანებული შემადგენლობა — „კონკრეტული მსახიობი" */
  cast: GalleryCastMember[]
  /** ავზი ჭერზე მოიჭრა — ინტერფეისმა ძებნა უნდა შესთავაზოს */
  cast_truncated: boolean
  /** ⚠️ სქესი უცნობია — „ქალი/კაცი" ფილტრში ეს მსახიობები ვერ ჩავარდებიან */
  unknown_gender: number
}

export interface GalleryFetchResult {
  ok: boolean
  added: number
  skipped: number
  bytes: number
  /** კვოტა გავსდა → ნაკადი უნდა გაჩერდეს, არა გაგრძელდეს (Tasks 10) */
  quota_exceeded: boolean
  error: string | null
  title: string
  storage: StorageUsage
}

/* ============================================================
   გამოძახებები
   ============================================================ */

/** ქვე-მენიუს მთვლელები + კვოტა */
export async function fetchGallerySummary(): Promise<GallerySummary> {
  const { data } = await api.get('/gallery')
  return data
}

/**
 * ჯგუფების ჭრილის ფილტრი (ეტაპი 2).
 *
 * ⚠️ **`have: 'without'` — „რომელ ჩანაწერს არ აქვს ფოტო".** აქამდე ჯგუფების
 * სია ყოველთვის `has('galleryImages')`-ით იწყებოდა, ე.ი. სწორედ ის ჩანაწერები
 * არსად ჩანდა, რომლებისთვისაც ჩამოტვირთვა არსებობს.
 *
 * ⚠️ `genre`/`status` **მძიმით გაყოფილი სიაა** — ჟანრები AND-ით, სტატუსები
 * OR-ით (ჩანაწერი ორ სტატუსში ვერ იქნება); იგივე წესი, რაც ბიბლიოთეკის სიას.
 */
export interface GalleryGroupQuery {
  /** ჩანაწერების ჭრილის დომენის ტაბი — `movie` · `song` · … */
  type?: GalleryParentKind
  /** მსახიობების ჭრილის დომენის ტაბი: ვინც **ამ დომენში** თამაშობს */
  from?: MediaType
  q?: string
  gender?: 'female' | 'male'
  have?: 'with' | 'without' | 'all'
  genre?: string
  status?: string
  year_min?: number
  year_max?: number
  favorite?: boolean
  /** დასტას ხუთი ბარათი აქვს — ე.ი. სამი ესკიზი აღარ ჰყოფნის */
  previews?: number
}

export async function fetchGalleryGroups(
  by: GalleryGroupBy,
  params: GalleryGroupQuery = {},
): Promise<GalleryGroups> {
  const { data } = await api.get('/gallery/groups', { params: { by, ...params } })
  return data
}

export async function fetchGalleryPhotos(
  filters: GalleryPhotoFilters = {},
): Promise<GalleryPhotoPage | GalleryLockedPage> {
  const { data } = await api.get('/gallery/photos', {
    params: { ...filters, with_cast: filters.with_cast === false ? 0 : undefined },
  })
  return data
}

/* ---------- ალბომები და გადატანა (Tasks §26) ---------- */

export interface GalleryAlbum {
  id: number
  name: string
  description: string | null
  sort_order: number
  photos: number
  /**
   * **ჩაკეტილი ალბომი (2026-09-16).**
   *
   * ⚠️ ორი ცალკე ფაქტია და ორივე სჭირდება ინტერფეისს: `locked` — პაროლი
   * ადევს; `unlocked` — ამ სესიაში უკვე გაიხსნა. hash არასდროს მოდის.
   */
  locked: boolean
  unlocked: boolean
  /**
   * §7.5 — ალბომი გალერეაში ერთადერთია, რასაც საკუთარი ხილვადობა აქვს:
   * ფოტო მშობლის ხილვადობას იმემკვიდრებს, **უმშობლოს** კი მემკვიდრეობით
   * არაფერი მოსდის.
   */
  visibility: 'private' | 'public'
}

export async function fetchGalleryAlbums(): Promise<GalleryAlbum[]> {
  const { data } = await api.get('/gallery/albums')
  return data
}

export async function createGalleryAlbum(body: {
  name: string
  description?: string | null
  password?: string | null
  visibility?: 'private' | 'public'
}): Promise<GalleryAlbum> {
  const { data } = await api.post('/gallery/albums', body)
  return data
}

export async function updateGalleryAlbum(
  id: number,
  body: {
    name?: string
    description?: string | null
    /** ახალი პაროლი — ლოკის დადება ან შეცვლა */
    password?: string | null
    /** ლოკის მოხსნა */
    remove_password?: boolean
    /**
     * ⚠️ **ანგარიშის პაროლია და აღარ ალბომისა** (Tasks §7.8, შენი
     * გადაწყვეტილება): ლოკის შეცვლა/მოხსნა მფლობელობის დამტკიცებას
     * ითხოვს, „ალბომის პაროლი დამავიწყდა" კი აღარ არის ჩიხი. ამ სესიაში
     * უკვე გახსნილს ის აღარ სჭირდება.
     */
    account_password?: string
    visibility?: 'private' | 'public'
  },
): Promise<GalleryAlbum> {
  const { data } = await api.patch(`/gallery/albums/${id}`, body)
  return data
}

/** პაროლის შემოწმება — სწორზე ალბომი **სერვერის სესიაში** იხსნება */
export async function unlockGalleryAlbum(id: number, password: string): Promise<GalleryAlbum> {
  const { data } = await api.post(`/gallery/albums/${id}/unlock`, { password })
  return data
}

/** „ისევ ჩაკეტე" — პაროლი ხელუხლებელია, უბრალოდ სესია იხურება */
export async function lockGalleryAlbum(id: number): Promise<GalleryAlbum> {
  const { data } = await api.post(`/gallery/albums/${id}/lock`)
  return data
}

/** ⚠️ ფოტოები **არ იშლება** — `move_to`-ს გარეშე ისინი უკატეგორიოში ბრუნდება */
export async function deleteGalleryAlbum(id: number, moveTo?: number | null): Promise<void> {
  await api.delete(`/gallery/albums/${id}`, { data: { move_to: moveTo ?? null } })
}

export async function reorderGalleryAlbums(ids: number[]): Promise<GalleryAlbum[]> {
  const { data } = await api.post('/gallery/albums/reorder', { ids })
  return data
}

/**
 * **ფოტოს გადატანა (§26.3).**
 *
 * ⚠️ **ორი ღერძი ცალ-ცალკე**: `target` მშობელს ცვლის, `album` —
 * დახარისხებას. გამოტოვებული გასაღები „ხელუხლებელს" ნიშნავს, ცხადი
 * `null` კი — „გაასუფთავე". ერთად რომ წასულიყო, ალბომში ჩაგდება ჩუმად
 * ფილმისგან მოხსნას ნიშნავდა.
 */
export async function moveGalleryImages(body: {
  ids: number[]
  /** `none` = უკატეგორიოში; `movie:12` / `cast_member:5` = მშობელზე */
  target?: string
  /** ⚠️ ცხადი `null` = „ალბომიდან ამოღება"; გამოტოვებული = „არ შეეხო" */
  album_id?: number | null
}): Promise<{ moved: number }> {
  const { data } = await api.post('/gallery/images/move', body)
  return data
}

/** სხვა მოდულების ფოტოები (§8.3) — მხოლოდ დათვალიერება */
export async function fetchModulePhotos(
  module: string,
  params: { page?: number; per_page?: number } = {},
): Promise<ModulePhotoPage> {
  const { data } = await api.get('/gallery/module-photos', { params: { module, ...params } })
  return data
}

/** ერთი ჩანაწერის გალერეა — ჩანაწერის გვერდის სექცია */
export async function fetchGalleryDetail(type: MediaType, id: number): Promise<GalleryDetail> {
  const { data } = await api.get(`/gallery/${type}/${id}`)
  return data
}

/** ერთი მსახიობის გალერეა — მსახიობის გვერდი */
export async function fetchActorGallery(castId: number): Promise<GalleryActorDetail> {
  const { data } = await api.get(`/gallery/cast/${castId}`)
  return data
}

export async function fetchActorGalleryImages(
  castId: number,
  opts: { per_actor?: number; cast_size?: GalleryCastSize; cast_source?: GalleryCastSource } = {},
  signal?: AbortSignal,
): Promise<GalleryFetchResult> {
  const { data } = await api.post(`/gallery/cast/${castId}`, opts, { signal })
  return data
}

export async function fetchGalleryPlan(filters: GalleryPlanFilters): Promise<GalleryPlan> {
  const { data } = await api.post('/gallery/plan', filters)
  return data
}

/** ერთი ჩანაწერის ჩამოტვირთვა; კვოტის ამოწურვაზე backend 413-ს აბრუნებს */
export async function fetchGalleryItem(
  type: MediaType,
  id: number,
  opts: GalleryOptions = {},
  signal?: AbortSignal,
): Promise<GalleryFetchResult> {
  const { data } = await api.post(`/gallery/${type}/${id}`, opts, { signal })
  return data
}

export async function deleteGalleryImage(id: number): Promise<void> {
  await api.delete(`/gallery/images/${id}`)
}

/**
 * „მთავარად დაყენება" — ფოტო ხდება ჩანაწერის პოსტერი.
 * ⚠️ მსახიობის ფოტოზე არ მუშაობს (გლობალური ლექსიკონი) — backend 422-ს აბრუნებს.
 */
export async function setGalleryPrimary(id: number): Promise<{ poster_path: string }> {
  const { data } = await api.post(`/gallery/images/${id}/primary`)
  return data
}

/* ---------- ვიდეო-ბმულები (§8.1/§8.4) ---------- */

export async function fetchGalleryVideos(
  params: { owner?: string; page?: number; per_page?: number } = {},
): Promise<GalleryVideoPage> {
  const { data } = await api.get('/gallery/videos', { params })
  return data
}

export interface SaveGalleryVideoBody {
  target: GalleryParentKind | 'cast_member'
  id: number
  url: string
  title?: string | null
  channel?: string | null
  duration?: number | null
  published_at?: string | null
  thumbnail_url?: string | null
  source_url?: string | null
  /** რომელმა engine-მა მოიტანა — `source` მაინც backend-ის დასაწერია */
  engine?: string | null
}

export async function saveGalleryVideo(
  body: SaveGalleryVideoBody,
): Promise<{ video: GalleryVideo; duplicate: boolean }> {
  const { data } = await api.post('/gallery/videos', body)
  return data
}

export async function deleteGalleryVideo(id: number): Promise<void> {
  await api.delete(`/gallery/videos/${id}`)
}
