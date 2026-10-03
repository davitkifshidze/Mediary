import { api } from '@/lib/api'
import type { CustomModuleKey } from '@/lib/customModules'

/* ============================================================
   ძებნა ვებში (Tasks §7.5/§7.6).

   ⚠️ **ეს მოდული არ არის, წყაროა** (TMDB/RAWG/BGG-ის რიგში): არც საიდბარის
   სექცია აქვს, არც `modules` რიგი. ამიტომ აქ არც `PAGE_MODULE_KEYS`-ია და
   არც მარშრუტი — მხოლოდ კლიენტი, რომელსაც კონკრეტული ადგილები იძახებენ.

   ⚠️ **წყარო ორი სახისაა და ფასიც ორია:**
     · **უფასო კატალოგი** (Wikimedia Commons) — ლიმიტის გარეშე, გასაღების
       გარეშე, ლიცენზირებული. **ნაგულისხმევია** (§7.5).
     · **SerpApi-ის engine-ები** — ნამდვილი ტეგით ძებნა, მაგრამ **250 ძებნა
       თვეში მთელ ანგარიშზე** და **ყოველი მონიშნული +1**.

   ⚠️ ამ ფაილში არსად არ არის ავტომატური გამოძახება: ყველა ფუნქცია მხოლოდ
   ღილაკის პასუხად იძახება. ერთადერთი გამონაკლისი `webSearchStatus()`-ია —
   ის SerpApi-ის `GET /account`-ს ეკითხება და **კვოტას არ ხარჯავს**.
   ============================================================ */

/** ერთი წყარო — უფასო კატალოგი ან SerpApi-ის engine */
export interface SerpEngine {
  key: string
  name: string
  /** ცენზურის გამორთვა მხოლოდ Google-ის engine-ებს აქვს */
  safe_search: boolean
  /** ⚠️ უფასო წყარო **კვოტას არ ხარჯავს** — ღილაკზე ფასიც ამით ითვლება */
  free: boolean
  /**
   * ⚠️ **სამი კატეგორიაა და არა ორი** (2026-09-14): უფასო (Wikimedia) ·
   * საკუთარი გასაღები (Serper) · SerpApi. მხოლოდ ბოლო ხარჯავს იმ 250-ს,
   * რომელიც ეკრანზე „დარჩა N ძებნა"-დ იკითხება.
   *
   * ⚠️ Tasks §19.2 — ხარჯი **ამით** ითვლება და არა `!free`-ით: Serper
   * არც უფასოა და არც 250-ს ხარჯავს, ე.ი. `!free` მას ტყუილად ჩათვლიდა.
   */
  uses_quota: boolean
  /** გვერდები მხოლოდ Serper-ს აქვს — ველი სხვა წყაროზე არ ჩანს */
  paged?: boolean
}

export interface SerpQuota {
  used: number
  limit: number | null
  remaining: number | null
}

export interface SerpStatus {
  configured: boolean
  limit: number | null
  used: number
  window_start: string
  remaining: number | null
  /** ნამდვილი მდგომარეობა SerpApi-იდან; `null` = ანგარიში არ პასუხობს */
  account: {
    plan: string | null
    searches_per_month: number | null
    this_month_usage: number | null
    total_searches_left: number | null
    rate_limit_per_hour: number | null
    renews_at: string | null
  } | null
  /** ⚠️ სიაში **ჯერ უფასო, მერე ფასიანი** — რიგი backend-ისაა (§7.5) */
  sources: { images: SerpEngine[]; videos: SerpEngine[] }
  /**
   * Tasks §30.6 — რომელ ფასიან წყაროს აკლია **ჩემი** გასაღები (`serpapi` · `serper`).
   * ⚠️ სიიდან ისინი უბრალოდ ქრებიან, ე.ი. ამის გარეშე ფანჯარა ვერ იტყოდა, რატომ ჩანს
   * მხოლოდ Wikimedia. ძველი სერვერი ველს არ აბრუნებს — ამიტომ არასავალდებულოა.
   */
  missing?: string[]
}

export interface SerpImage {
  engine: string
  source: string
  title: string | null
  /** პირდაპირი ლინკი — აქედან ჩამოიწერება ფაილი */
  original: string | null
  /** ესკიზი — სიის სწრაფად ჩვენებისთვის და სათადარიგო ჩამოსატვირთად */
  thumbnail: string | null
  /** გვერდი, სადაც სურათი დევს */
  link: string | null
  domain: string | null
  width: number | null
  height: number | null
  /** რომელმა წყაროებმა მოიტანა (დუბლიკატები გაერთიანებულია) */
  engines: string[]
  /** ლიცენზია — მხოლოდ უფასო კატალოგს აქვს (სწორედ ესაა მისი უპირატესობა) */
  license?: string | null
}

export interface SerpVideo {
  engine: string
  source: string
  title: string | null
  link: string
  channel: string | null
  duration: number | null
  views: number | null
  /**
   * გამოქვეყნების თარიღი — **`YYYY-MM-DD` ან `null`**, არასდროს „9 months ago".
   *
   * ⚠️ YouTube სწორედ იმ ფარდობით სტრიქონს აბრუნებს, და ის პირდაპირ მიდიოდა
   * `published_at`-ზე, რომელიც `date`-ით მოწმდება — ე.ი. **ნაპოვნი ვიდეოს
   * შენახვა ყოველთვის 422-ით ვარდებოდა**. ნორმალიზაცია სერვერზეა
   * (`SerpApiClient::publishedDate()`), ე.ი. აქ ყოველთვის თარიღია.
   */
  published: string | null
  thumbnail: string | null
  description: string | null
  engines: string[]
  /**
   * Tasks §19.6 — ეს ბმული **უკვე გაქვს ვიდეოებში** (FEAT-17-ის
   * `DuplicateLink`, სერვერი ძებნის პასუხშივე ამბობს). ⚠️ ველი მხოლოდ მაშინ
   * მოდის, როცა ვიდეოების მოდული გაქვს — `undefined` ≠ „არ გაქვს".
   */
  existing?: { id: number; title: string | null } | null
}

/**
 * ერთი engine-ის შედეგი. ⚠️ **სამი სხვადასხვა მდგომარეობაა და სამივე ჩანს:**
 * `ok: false` = წყარო არ პასუხობს · `ok: true, count: 0` = ვერაფერი იპოვა ·
 * `count: 0, dropped > 0` = იპოვა, მაგრამ ერთეულები გამოუსადეგარი იყო
 * (ლინკის გარეშე — `yandex_videos` ზუსტად ასე იქცევა).
 */
export interface SerpSource {
  engine: string
  ok: boolean
  /** ქეშიდან მოვიდა → **ძებნა არ დახარჯულა** */
  cached: boolean
  count: number
  dropped: number
  quota_exceeded: boolean
  /** ⚠️ Serper-ის ხარჯი — **SerpApi-ის 250-ში არ ჯდება**, მაგრამ ფულია */
  credits?: number
  /**
   * Tasks §19.4 — „კიდევ ჩამოიტანე"-ს გაგრძელება (Serper — შემდეგი გვერდი,
   * Wikimedia — Commons-ის offset). `null` = ამ წყაროდან მეტი არაფერი მოვა,
   * ან წყაროს გაგრძელება საერთოდ არ აქვს (SerpApi-ის engine-ები).
   */
  next?: number | null
}

export interface SerpSearchResult<T> {
  items: T[]
  sources: SerpSource[]
  /** რამდენი ძებნა დაიხარჯა **მართლა** (ქეშიდან მოსული არ ითვლება) */
  spent: number
  quota: SerpQuota
}

/** კვოტის მდგომარეობა. ⚠️ **უფასოა** — `GET /account` ძებნას არ ხარჯავს. */
export async function webSearchStatus(): Promise<SerpStatus> {
  const { data } = await api.get<SerpStatus>('/web/status')
  return data
}

export interface SerpSearchParams {
  query: string
  /**
   * ცარიელი = **პირველი (უფასო)** წყარო. ყოველი დამატებული **ფასიანი**
   * წყარო +1 ძებნაა 250-იდან; უფასო არაფერს ხარჯავს.
   */
  engines?: string[]
  /** სულ რამდენი ფოტო (ხელით შესაყვანი, ჭერი 1000) */
  limit?: number
  /**
   * რამდენი გვერდი მოვითხოვოთ — **მხოლოდ Serper-ს ეხება**.
   * ⚠️ **თითო გვერდი = ერთი credit**, ე.ი. ეს რიცხვი ფულს ხარჯავს.
   */
  pages?: number
  /** ⚠️ ნაგულისხმევად **გამორთულია** (§7.5-ის პირობა) */
  safe?: boolean
  /**
   * Tasks §19.4 — „კიდევ ჩამოიტანე": engine → წინა პასუხის `next`.
   * ⚠️ მითითებისას **მხოლოდ ეს წყაროები** ეშვება (`engines` არ ითვლება) —
   * დანარჩენის ხელახლა გაშვება იგივე შედეგს და იგივე ხარჯს მოიტანდა.
   */
  cursor?: Record<string, number>
}

/** ხელით შეყვანის ჭერები — backend-ის `SerperImages`-ის ასლი */
export const WEB_MAX_PAGES = 100
export const WEB_MAX_PHOTOS = 1000

export async function searchWebImages(params: SerpSearchParams): Promise<SerpSearchResult<SerpImage>> {
  const { data } = await api.get<SerpSearchResult<SerpImage>>('/web/images', { params })
  return data
}

export async function searchWebVideos(params: SerpSearchParams): Promise<SerpSearchResult<SerpVideo>> {
  const { data } = await api.get<SerpSearchResult<SerpVideo>>('/web/videos', { params })
  return data
}

/**
 * ერთი YouTube-ის ვიდეოს მეტამონაცემები — YouTube-ის გასაღების გარეშე.
 * ⚠️ **ღილაკია და არა ავტომატური probe:** თითო გამოძახება ერთ ძებნას ხარჯავს,
 * ამიტომ URL-ის ჩასმაზე ისევ უფასო `POST /videos/metadata` მუშაობს.
 */
export async function fetchWebVideoDetails(url: string) {
  const { data } = await api.get<{
    video: {
      engine: string
      cached: boolean
      video_id: string
      title: string | null
      description: string | null
      channel: string | null
      duration: number | null
      views: number | null
      /**
   * გამოქვეყნების თარიღი — **`YYYY-MM-DD` ან `null`**, არასდროს „9 months ago".
   *
   * ⚠️ YouTube სწორედ იმ ფარდობით სტრიქონს აბრუნებს, და ის პირდაპირ მიდიოდა
   * `published_at`-ზე, რომელიც `date`-ით მოწმდება — ე.ი. **ნაპოვნი ვიდეოს
   * შენახვა ყოველთვის 422-ით ვარდებოდა**. ნორმალიზაცია სერვერზეა
   * (`SerpApiClient::publishedDate()`), ე.ი. აქ ყოველთვის თარიღია.
   */
  published: string | null
      thumbnail: string | null
    }
    quota: SerpQuota
  }>('/web/video', { params: { url } })
  return data
}

/** სად ეკიდება ჩამოტვირთული ფოტო — backend-ის `WebSearchController::TARGETS`-ის ასლი */
export const SERP_IMPORT_TARGETS = [
  'cast_member',
  'movie',
  'series',
  'anime',
  // Tasks §11 — `song` გავიდა (Q9)
  'book',
  'game',
  // Tasks §4.10 — ადგილი `GalleryParent`-ში FEAT-26-იდან დგას
  'place',
  // Tasks §36.4 — ბუკმარკი („შოპინგის" ფოტოები, პროდუქტი, სკრინშოტები)
  'bookmark',
] as const
/** §37.4 — პირადი მოდულის ჩანაწერიც სამიზნეა, მოდულის გასაღებით */
export type SerpImportTarget = (typeof SERP_IMPORT_TARGETS)[number] | CustomModuleKey

export interface SerpImportResult {
  added: number
  skipped: number
  failed: number
  /** რამდენს ჩამოვწერეთ **ესკიზად** (ორიგინალი არ გაიხსნა) */
  thumbnails: number
  bytes: number
  quota_exceeded: boolean
  /**
   * §8.4 — რომელ მშობელს რამდენი ფოტო მიება (`cast_member:5` → 3).
   * ⚠️ **განაწილება სერვერზე ხდება**, ე.ი. შედეგიც იქიდან უნდა მოვიდეს:
   * ფრონტში გამოთვლილი „ალბათ ასე დანაწილდა" ერთ დღეს გაშორდებოდა.
   */
  assigned?: Record<string, number>
}

/** backend-ის `images` → `max:50` — ერთ მოთხოვნაზე მეტს სერვერი 422-ით უარყოფს */
export const WEB_IMPORT_CHUNK = 50

/**
 * მონიშნული ფოტოების ჩამოტვირთვა და მიმაგრება.
 * ⚠️ **`POST`-ია, რადგან მართლა იქმნება ჩანაწერი** (ძებნა კი `GET` რჩება),
 * და ⚠️ **ეს ატვირთვის ტოლფასია** — ჩამოტვირთული ფაილი კვოტას ხარჯავს.
 */
export async function importWebImages(body: {
  target: SerpImportTarget
  id: number
  /**
   * §8.4 — რომელ **მსახიობებზე** შეიძლება დანაწილება. სერვერი თითო ფოტოს
   * სახელით უსადაგებს; ვინც ვერ გაირკვა — ჩანაწერზე ჯდება.
   *
   * ⚠️ **ცარიელი სია = განაწილება გამორთულია** და ყველაფერი ჩანაწერზე მიდის
   * (ძველი ქცევა). ეს ცხადად უნდა იყოს, თორემ „რატომ მიება ფილმს" კითხვად დარჩება.
   */
  distribute?: number[]
  images: (SerpImage & { target_id?: number | null })[]
}, onProgress?: (done: number, total: number) => void): Promise<SerpImportResult> {
  /* Tasks §4.3 — სერვერი ერთ მოთხოვნაზე მაქსიმუმ `WEB_IMPORT_CHUNK` ფოტოს იღებს,
     ძებნა კი ნაგულისხმევად 100-ს აბრუნებს ⇒ „ყველას მონიშვნა“ 422 იყო. ახლა
     ნაწილებად მიდის, **ერთი პროგრესით** და ერთი შეჯამებული შედეგით.
     ⚠️ ნაწილი, რომელიც კვოტამ გააჩერა (413), უკვე შემოსულს არ აუქმებს:
     მისი პასუხიც შეჯამებაში ჯდება, დანარჩენი ნაწილები კი აღარ იგზავნება. */
  const total = body.images.length
  const sum: SerpImportResult = {
    added: 0, skipped: 0, failed: 0, thumbnails: 0, bytes: 0, quota_exceeded: false, assigned: {},
  }
  let sent = 0

  onProgress?.(0, total)

  for (let i = 0; i < total; i += WEB_IMPORT_CHUNK) {
    const images = body.images.slice(i, i + WEB_IMPORT_CHUNK)
    let part: SerpImportResult

    try {
      part = (await api.post<SerpImportResult>('/web/import', { ...body, images })).data
    } catch (e) {
      const res = (e as { response?: { status?: number; data?: SerpImportResult } }).response
      // კვოტა — პასუხი შედეგს შეიცავს; სხვა შეცდომა პირველ ნაწილზე ჩვეულებრივ ვარდება
      if (res?.status === 413 && res.data) part = res.data
      else if (sent === 0) throw e
      else break
    }

    for (const k of ['added', 'skipped', 'failed', 'thumbnails', 'bytes'] as const) sum[k] += part[k]
    for (const [key, n] of Object.entries(part.assigned ?? {})) {
      sum.assigned![key] = (sum.assigned![key] ?? 0) + n
    }

    sent += images.length
    onProgress?.(sent, total)

    if (part.quota_exceeded) {
      sum.quota_exceeded = true
      break
    }
  }

  return sum
}

/** რამდენი ფოტო დარჩა ჩამოუტვირთავი (კვოტამ ან შეცდომამ გააჩერა) */
export function notImported(res: SerpImportResult, requested: number): number {
  return Math.max(0, requested - res.added - res.skipped - res.failed)
}
