import { api } from '@/lib/api'

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
  published: string | null
  thumbnail: string | null
  description: string | null
  engines: string[]
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
  limit?: number
  /** ⚠️ ნაგულისხმევად **გამორთულია** (§7.5-ის პირობა) */
  safe?: boolean
}

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
  'song',
  'book',
  'game',
] as const
export type SerpImportTarget = (typeof SERP_IMPORT_TARGETS)[number]

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
}): Promise<SerpImportResult> {
  const { data } = await api.post<SerpImportResult>('/web/import', body)
  return data
}
