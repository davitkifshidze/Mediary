import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { CustomRecord } from '@/api/customRecords'
import { markSongPlayed, type Song } from '@/api/songs'
import { markVideoWatched, type Video, type VideoPlatform } from '@/api/videos'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import type { EmbedEvent } from '@/lib/embed'
import { removeEntry, reorderEntries } from '@/lib/playerQueue'
import { PLAYER_MAX_WIDTH_OPTIONS, useSettings } from '@/lib/settings'
import { safeGet, safeRemove, safeSet } from '@/lib/storage'

/* ============================================================
   ერთიანი დამკვრელი — მუსიკაც და ვიდეოც.

   ⚠️ **რატომ არის გლობალური.** ამოცანის არსი „პლეილისტში ერთი დამთავრდება →
   შემდეგი ჩაირთოს"-ია, ე.ი. დაკვრა გვერდის გადართვას უნდა გადაურჩეს.
   მოდალში მჯდომი პლეერი (ძველი `SongPlayer`) ამას ვერ შეძლებდა — ამიტომ
   მდგომარეობა `AppShell`-ის დონეზეა, სცენა კი `components/Player.tsx`-შია.

   ⚠️ **ერთი წყარო უკრავს.** ორი ერთდროული embed ერთმანეთს ხმას აფარებს,
   ამიტომ `VideoDetail`-ს საკუთარი ჩაშენება აღარ აქვს — ის ჩანაწერს
   ამ რიგს გადასცემს.

   **ორი განლაგება, ერთი სცენა.** ფართო ეკრანზე დამკვრელი მარჯვენა
   პანელია (ზემოთ ვიდეო 16:9, ქვემოთ რიგი — YouTube-ის ფლეილისტივით) და
   გვერდს **აწვება** (`--player-w`); ვიწრო ეკრანზე და ჩაკეცილზე — ქვედა ზოლი
   (`--player-h`). განლაგებას აქ ვითვლით და მხოლოდ CSS იცვლება — იხ.
   `components/Player.tsx`.

   **ვიდეო და სიმღერა სხვადასხვაგვარად დგას:**
   - **ვიდეო** (`video`/`link`) მარჯვენა პანელს აღარ იყენებს: ფანჯარაში
     (`inline`) უკრავს — დამკვრელი ფანჯრის ესკიზზე ჯდება (`usePlayerAnchor`);
     **„გატანა" ვიდეოს მოტივტივე ჩარჩოში ამაგრებს და ფანჯარას ხურავს**
     (`float`; ვიწრო ეკრანზე ქვედა ზოლი) — ის რჩება, სანამ თვითონ არ დახურავ.
     **ფანჯრის დახურვა გაუტანელ ვიდეოსაც ხურავს** — ფანჯარა (`ModalShell` →
     `PlayerWindowScope`) იმ რიგის „მფლობელია", რომლის ვიდეოც მასში უკრავდა
     (რიგი შემდეგზე გადასულიც). ჩანართის შეცვლაზე ფანჯარა ღიაა — ვიდეო
     დროებით ჩარჩოშია და ფანჯრის დახურვისას მასთან ერთად იხურება.
   - **სიმღერა** — პანელი/ზოლი, როგორც აქამდე, + „ჩაკეცვა" ბუშტად (`bubble`).
   ⚠️ ყველა გადასვლაში ფრეიმი იგივე DOM-კვანძია — დაკვრა არ წყდება.
   ============================================================ */

export interface PlayerItem {
  /**
   * რომელი მოდულიდან — მხოლოდ „მოსმენილად/ნანახად" ჩათვლა ჰკიდია.
   *
   * ⚠️ **`link` = მრიცხველი არ არსებობს**: გალერეის ვიდეო ბმულია და
   * არა ვიდეოს მოდულის ჩანაწერი, ე.ი. მისი id `videos`-ში საერთოდ არ დევს —
   * `markVideoWatched()` სხვის ჩანაწერს დაუწერდა ნახვას ან 404-ს მიიღებდა.
   */
  kind: 'song' | 'video' | 'link'
  id: number
  title: string
  subtitle: string | null
  /** ორიგინალი — „წყაროზე გახსნა" და პირდაპირი ფაილის `<video src>` */
  url: string
  /** backend-ის allowlist-ით ნაშენი embed (`null` = ჩაშენება შეუძლებელია) */
  embedUrl: string | null
  platform: VideoPlatform
  thumbnail: string | null
  duration: number | null
  /**
   * ჩანაწერის ფანჯარა (`/videos?open=12`): მოტივტივე ჩარჩოს
   * „ფანჯარაში დაბრუნება" აქ მიდის; `null` — ფანჯარა არ აქვს (გალერეის ვიდეო).
   */
  href?: string | null
}

/**
 * რიგის ერთეული — `uid` **რიგში ჩასმისას** იბადება.
 * ⚠️ `kind-id` გასაღებად არ კმარა: ერთი ჩანაწერი რიგში ორჯერაც შეიძლება
 * იყოს, მიმდინარე კი `uid`-ით იცნობა (იხ. `lib/playerQueue.ts`).
 */
export interface QueueEntry extends PlayerItem {
  uid: number
}

/**
 * სად დგას დამკვრელი: მარჯვენა პანელი · ქვედა ზოლი · ფანჯრის ესკიზზე ·
 * მოტივტივე ჩარჩო · სიმღერის ბუშტი
 */
export type PlayerLayout = 'side' | 'bar' | 'inline' | 'float' | 'bubble'

/** რიგის ერთეულის გასაღები — ფანჯრის ადგილი მას ეკუთვნის */
export function itemKey(item: Pick<PlayerItem, 'kind' | 'id'>): string {
  return `${item.kind}-${item.id}`
}

/** ფანჯრის ესკიზი, რომელზეც ვიდეო ჯდება; `window` — რომელ ფანჯარაშია (`null` — გვერდზე) */
interface PlayerAnchor {
  key: string
  el: HTMLElement
  window: PlayerWindow | null
}

/**
 * **ფანჯარა** (`ModalShell`), რომელშიც ვიდეოს ადგილი დგას. `popOut` — მისი
 * დახურვა (ref, რომ `onClose`-ის ყოველ ახალ იდენტობაზე ესკიზი ხელახლა არ
 * დარეგისტრირდეს).
 */
interface PlayerWindow {
  id: string
  popOut: RefObject<(() => void) | null>
}

const PlayerWindowContext = createContext<PlayerWindow | null>(null)

/** ფანჯრის დახურვის შეტყობინება — ცალკე, სტაბილური კონტექსტი (`PlayerApi` ყოველ ცვლილებაზე ახლდება) */
const PlayerWindowsContext = createContext<{ release: (id: string) => void } | null>(null)

/** ვიწრო (მობილური) ეკრანი — მოტივტივე ჩარჩო იქ ქვედა ზოლია */
const NARROW_QUERY = '(min-width: 640px)'

/* ---------- დაკვრის პროგრესი (ბუშტის რგოლი) ----------
   ⚠️ **კონტექსტის გარეთაა**: YouTube წამში რამდენჯერმე გზავნის `currentTime`-ს,
   კონტექსტში ჩაწერა კი მთელ აპს ყოველ ჯერზე თავიდან დახატავდა. ერთი ნაკადი,
   ერთი მომხმარებელი (ბუშტი) — `useSyncExternalStore`. */
let progressValue: number | null = null
const progressListeners = new Set<() => void>()

/** 0…1, ან `null` — უცნობია (ტრეკის შეცვლაზე და წყაროს უხმობაზე) */
export function reportProgress(value: number | null): void {
  const next = value === null ? null : Math.min(Math.max(value, 0), 1)
  if (next === progressValue) return
  progressValue = next
  progressListeners.forEach((fn) => fn())
}

export function usePlaybackProgress(): number | null {
  return useSyncExternalStore(
    (fn) => {
      progressListeners.add(fn)
      return () => progressListeners.delete(fn)
    },
    () => progressValue,
    () => null,
  )
}

/**
 * საიდან ჩნდება გვერდითა პანელი (px).
 *
 * ⚠️ **ზღვარი დათვლილია და არა შერჩეული**: პანელი გვერდს აწვება, ე.ი.
 * შევიწროებული გვერდი არ უნდა იყოს იმაზე ვიწრო, ვიდრე ყველაზე ვიწრო
 * `xl`-განლაგებაა — 1280px **ეკრანი** (Tailwind-ის `xl`), სადაც ბადეები უკვე
 * ფართო განლაგებაზეა და ფილტრის პანელიც დგას: 1280 + პანელის უმცირესი
 * სიგანე (24rem = 384px) = **1664px**; ზემოთ `<main>` ≥ 1040px რჩება.
 * ⚠️ 1280 ეკრანის ბრეიკპოინტია და **არა გვერდის `max-w`** (`page.tsx`-ის
 * `wide` ახლა 1600/1920-ია) — გვერდის გაფართოება ზღვარს არ ცვლის.
 * ⚠️ რატომ ასე მაღალი: სიების ბადეები (`RecordView`, `MovieGrid`) `<main>`-ის
 * `@container`-ს კითხულობს და პანელით შევიწროებაზე სვეტებს თვითონ აკლებს,
 * მაგრამ გალერეის, ფოტოების, მსახიობების და დაფის ბადეები **ეკრანის**
 * ბრეიკპოინტებზეა — მათ სვეტების რიცხვი შევიწროებულ გვერდზეც არ ეცვლება.
 */
export const PANEL_MIN_VIEWPORT = 1664

/* ---------- პანელის სიგანე რეგულირდება ----------
   შენი სიტყვები: „მარჯვენა კონტექსტის ფანჯარა შეიძლებოდეს რეგულირება —
   გაზარდო უფრო სიგანეში, ოღონდ რაღაც ფიქსირებული ზომა იყოს, რაზეც მეტად ვერ
   გაზრდი — ეგ იწერებოდეს პარამეტრებში; და ბოლოს რაც ხელით გაზარდე, ეგ
   შეინახოს სადმე".

   ⚠️ **ორი ფაქტი, ორი ადგილი**: ჭერი ანგარიშის პარამეტრია (`users.settings.
   playerMaxWidth`, ცხადი შენახვით), ხელით გაწეული სიგანე კი **მოწყობილობისაა**
   (`localStorage` — `player.dock`-ის პრეცედენტი: `users.settings`-ში ჩაწერა
   პარამეტრების „შესანახ" ზოლს აანთებდა და აუდიტში მთელ ბლობს ჩაწერდა).
   ჭერის შემცირება შენახულ სიგანეს ჭრის და არა შლის — ჭერის უკან აწევაზე
   ძველი სიგანე ბრუნდება.

   ⚠️ **გვერდითა განლაგების ზღვარი სიგანეზეა დამოკიდებული**: 1280 +
   მიმდინარე სიგანე, და არა მუდმივი 1664 — ფართო პანელი ვიწრო ეკრანზე გვერდს
   1280-ზე ქვემოთ ჩაწურავდა. */

/** პანელის უმცირესი სიგანე (24rem) — ქვემოთ სცენა და რიგი ვეღარ ეტევა */
export const PANEL_MIN_WIDTH = 384
const WIDTH_KEY = 'player.width'

/** ჭერი პარამეტრებიდან — უცნობი/ძველი მნიშვნელობა ნაგულისხმევზე ბრუნდება */
export function panelCeiling(setting: number | null | undefined): number {
  const n = Number(setting)
  if (!Number.isFinite(n)) return 560
  return Math.min(Math.max(n, PLAYER_MAX_WIDTH_OPTIONS[0]), PLAYER_MAX_WIDTH_OPTIONS[PLAYER_MAX_WIDTH_OPTIONS.length - 1])
}

/** ხელით დაყენებული სიგანე ზღვრებში — ქვემოთ მინიმუმი, ზემოთ ჭერი */
export function clampPanelWidth(width: number, ceiling: number): number {
  return Math.min(Math.max(Math.round(width), PANEL_MIN_WIDTH), Math.max(ceiling, PANEL_MIN_WIDTH))
}

/** შენახული სიგანე (px) ან `null` — ნაგულისხმევი `clamp()` მოქმედებს */
export function readSavedWidth(): number | null {
  const raw = Number(safeGet(WIDTH_KEY))
  return Number.isFinite(raw) && raw >= PANEL_MIN_WIDTH ? Math.round(raw) : null
}

/** CSS-მნიშვნელობა `--player-w`-სთვის: ხელით დაყენებული (ჭერით ჩაჭრილი) ან ნაგულისხმევი */
export function panelWidthValue(width: number | null, ceiling: number): string {
  return width === null ? PANEL_WIDTH : `${clampPanelWidth(width, ceiling)}px`
}

/**
 * პანელის სიგანე — `--player-w`-ის მნიშვნელობა; `<main>`-ის `padding`-იც ამას
 * კითხულობს, ე.ი. ორი სიგანე ვერასდროს დაშორდება ერთმანეთს.
 * ⚠️ `22vw` 1745px-მდე 24rem-ზე ნაკლებია — იქ ქვედა ზღვარი მოქმედებს და
 * ზემოთა გამოთვლა ზუსტია; ფართო ეკრანზე ვიდეო იზრდება (30rem-მდე).
 */
export const PANEL_WIDTH = 'clamp(24rem, 22vw, 30rem)'

/** ქვედა ზოლის სიმაღლე — `--player-h` (ჩვეულებრივი · გადიდებული სცენით) */
const BAR_HEIGHT = { compact: '5.5rem', expanded: '11rem' } as const

/**
 * ფართო ეკრანზე მომხმარებლის არჩევანი — პანელი თუ ზოლი („ახსოვს").
 * ⚠️ `localStorage` და არა `users.settings`: ეს **მოწყობილობის** განლაგებაა
 * (ლეპტოპზე ზოლი, დიდ ეკრანზე პანელი), და იქ შენახვა პარამეტრების
 * გვერდის „შესანახ" ზოლს აანთებდა.
 */
const DOCK_KEY = 'player.dock'

let nextUid = 1

interface PlayerApi {
  queue: QueueEntry[]
  /** მიმდინარის ადგილი რიგში (`-1` — არაფერი უკრავს) */
  index: number
  current: QueueEntry | null
  /** ჩვენი რწმენა — სცენიდან მოსული მოვლენებით სწორდება */
  playing: boolean
  /** ქვედა ზოლის დიდი სცენა (ვიწრო ეკრანზე) */
  expanded: boolean
  /** რიგის სახელი („პლეილისტი X", „სიმღერები") */
  source: string | null
  /** სად დგას ახლა (`null` — არაფერი უკრავს) */
  layout: PlayerLayout | null
  /** მიმდინარე ვიდეოს ფანჯრის ესკიზი (`inline`-ის ადგილი) */
  anchor: HTMLElement | null
  /** ფანჯრის ესკიზის რეგისტრაცია (`usePlayerAnchor`) */
  registerAnchor: (key: string, el: HTMLElement | null, window?: PlayerWindow | null) => void
  /** ვინ გაუშვა რიგი (`play`-ის მეოთხე არგუმენტი — კურსი, გალერეის სია); ფანჯრის ადგილი მას ცნობს */
  origin: string | null
  /** „გატანა": ვიდეო ფანჯრიდან მოტივტივე ჩარჩოში — ფანჯარა იხურება */
  popped: boolean
  popOut: () => void
  /** ფანჯარაში დაბრუნება (ფანჯარა ღია თუ არაა, `Player` მას `href`-ით ხსნის) */
  popIn: () => void
  /** სიმღერის პანელი ბუშტად ჩაკეცილია */
  bubbled: boolean
  setBubbled: (value: boolean) => void
  /** ეკრანი საკმარისად ფართოა პანელისთვის */
  wide: boolean
  /** ფართო ეკრანზე არჩეული განლაგება */
  dock: PlayerLayout
  /** ხელით დაყენებული სიგანე (px) ან `null` = ნაგულისხმევი */
  width: number | null
  /** პანელის ჭერი (px) — `users.settings.playerMaxWidth` */
  maxWidth: number
  /** `--player-w`-ის მიმდინარე მნიშვნელობა */
  panelWidth: string
  /** გადათრევა მიმდინარეობს — სცენაზე გამჭვირვალე ფენა, რომ iframe-მა მაუსი არ „შეჭამოს" */
  resizing: boolean
  play: (items: PlayerItem[], startAt?: number, source?: string | null, origin?: string | null) => void
  toggle: () => void
  next: () => void
  prev: () => void
  jumpTo: (index: number) => void
  /** რიგიდან ამოღება; მიმდინარეს ადგილს შემდეგი იკავებს */
  remove: (uid: number) => void
  /** მთელი რიგი ახალი თანმიმდევრობით (`useDragReorder`) */
  reorder: (uids: number[]) => void
  close: () => void
  setExpanded: (value: boolean) => void
  setDock: (value: PlayerLayout) => void
  /** სიგანე px-ში (ზღვრებში ჩაიჭრება და მოწყობილობაზე ინახება) */
  setWidth: (px: number) => void
  /** ორმაგი დაწკაპუნება სახელურზე — ნაგულისხმევზე დაბრუნება */
  resetWidth: () => void
  setResizing: (value: boolean) => void
  /** სცენის ანგარიში (`ended` → შემდეგზე გადასვლა) */
  report: (event: EmbedEvent) => void
}

const PlayerContext = createContext<PlayerApi | null>(null)

/* ---------- ჩანაწერი → რიგის ერთეული ----------
   ⚠️ გარდაქმნა **აქ ერთხელ წერია**: ხუთი გამომძახებელი (სიმღერების სია,
   პლეილისტები, პლეილისტის გვერდი, ვიდეოების სია, ვიდეოს დეტალები) ერთსა და
   იმავე ველებს კითხულობს და ერთი მათგანის დავიწყება ჩუმად გატეხავდა რიგს. */

export function songItem(song: Song): PlayerItem {
  return {
    kind: 'song',
    id: song.id,
    title: song.title,
    subtitle: song.artist ?? song.album ?? null,
    url: song.url,
    embedUrl: song.embed_url,
    platform: song.platform,
    thumbnail: song.thumbnail,
    duration: song.duration,
  }
}

/** `subtitle` გამომძახებლისაა — ტიპის სახელი შიგთავსის ენაზეა დამოკიდებული */
export function videoItem(video: Video, subtitle: string | null = null): PlayerItem {
  return {
    kind: 'video',
    id: video.id,
    title: video.title,
    subtitle,
    url: video.url,
    embedUrl: video.embed_url,
    platform: video.platform,
    thumbnail: video.thumbnail,
    duration: video.duration,
    href: `/videos?open=${video.id}`,
  }
}

/**
 * **პირადი მოდულის ჩანაწერი** — ბმული, რომელიც `VideoUrl`-მა
 * ამოიცნო (`platform` არა-`null`; `file` — პირდაპირი ფაილი `<video>`-ით).
 *
 * ⚠️ `kind: 'link'` — მრიცხველი არ არსებობს: „ნანახად ჩათვლა" ვიდეოს/სიმღერის
 * მოდულის ცნებაა, და პირადი ჩანაწერის id `videos`-ში არ დევს (გალერეის
 * ვიდეოს იგივე წესი).
 */
export function customRecordItem(record: CustomRecord): PlayerItem {
  return {
    kind: 'link',
    id: record.id,
    title: record.title,
    subtitle: record.domain,
    url: record.url ?? '',
    embedUrl: record.embed_url,
    platform: (record.platform ?? 'other') as VideoPlatform,
    thumbnail: record.image,
    duration: null,
    href: `/c/${record.module}?open=${record.id}`,
  }
}

/** დასაკრავია? — `applyUrl()` პლატფორმას მხოლოდ ამოცნობილ ბმულს უწერს */
export function isPlayableRecord(record: Pick<CustomRecord, 'platform' | 'url'>): boolean {
  return !!record.platform && !!record.url
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()

  const [queue, setQueue] = useState<QueueEntry[]>([])
  const [currentUid, setCurrentUid] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [source, setSource] = useState<string | null>(null)
  const [dock, setDockState] = useState<PlayerLayout>(() => (safeGet(DOCK_KEY) === 'bar' ? 'bar' : 'side'))
  /* სიგანე მოწყობილობისაა, ჭერი — ანგარიშისა (იხ. ზემოთ) */
  const [width, setWidthState] = useState<number | null>(readSavedWidth)
  const [resizing, setResizing] = useState(false)
  /* ფანჯრის ესკიზი, „გატანა" და ბუშტი */
  const [anchor, setAnchor] = useState<PlayerAnchor | null>(null)
  const [popped, setPopped] = useState(false)
  const [bubbled, setBubbled] = useState(false)
  const [origin, setOrigin] = useState<string | null>(null)
  /* ⚠️ ref-ები, რომ ფანჯრის დახურვამ (დემონტაჟი) **იმავე წამის** მდგომარეობა წაიკითხოს:
     „გატანა" ჯერ `popped`-ს წერს, მერე ფანჯარას ხურავს — state ჯერ არ განახლებულა */
  const poppedRef = useRef(false)
  /** რომელ ფანჯარაში უკრავდა მიმდინარე რიგის ვიდეო ბოლოს (`inline`) — ის არის „მფლობელი" */
  const ownerRef = useRef<string | null>(null)
  const anchorRef = useRef<PlayerAnchor | null>(null)
  anchorRef.current = anchor
  const narrow = !useMediaQuery(NARROW_QUERY)
  const maxWidth = panelCeiling(useSettings().settings.playerMaxWidth)
  const panelWidth = panelWidthValue(width, maxWidth)
  const effectiveWidth = width === null ? PANEL_MIN_WIDTH : clampPanelWidth(width, maxWidth)
  // ზღვარი მიმდინარე სიგანეს მიჰყვება: 1280 + პანელი
  const wide = useMediaQuery(`(min-width: ${PANEL_MIN_VIEWPORT - PANEL_MIN_WIDTH + effectiveWidth}px)`)

  const setWidth = useCallback(
    (px: number) => {
      const next = clampPanelWidth(px, maxWidth)
      setWidthState(next)
      safeSet(WIDTH_KEY, String(next))
    },
    [maxWidth],
  )

  const resetWidth = useCallback(() => {
    setWidthState(null)
    safeRemove(WIDTH_KEY)
  }, [])

  /**
   * მრიცხველი, რომელიც **ყოველ ჩართვაზე** იზრდება.
   * ⚠️ საჭიროა იმიტომ, რომ „ჩართული ჩანაწერი" და „ჩართვის ფაქტი" სხვადასხვაა:
   * ერთი და იმავე სიმღერის ხელახლა ჩართვა მიმდინარეს არ ცვლის, დათვლა კი უნდა.
   */
  const [seq, setSeq] = useState(0)

  /**
   * ⚠️ `ended` ორჯერ რომ მოვიდეს (YouTube-ს ეს ახასიათებს), ერთი ტრეკი
   * გადაიხტებოდა — ამიტომ თითო ჩართვაზე მხოლოდ პირველი ითვლება.
   */
  const endedSeq = useRef(-1)

  const index = useMemo(() => queue.findIndex((entry) => entry.uid === currentUid), [queue, currentUid])
  const current = index >= 0 ? queue[index] : null
  /* ვიდეო: ფანჯრის ესკიზი თუ მისია და „გატანილი" არაა — ფანჯარაში,
     სხვაგან — მოტივტივე ჩარჩო (ვიწროზე — ზოლი); სიმღერა: ბუშტი · პანელი · ზოლი. */
  const here = !!current && !!anchor && anchor.key === itemKey(current)
  const layout: PlayerLayout | null = !current
    ? null
    : current.kind !== 'song'
      ? here && !popped
        ? 'inline'
        : narrow
          ? 'bar'
          : 'float'
      : bubbled
        ? 'bubble'
        : wide && dock === 'side'
          ? 'side'
          : 'bar'

  /* ფანჯრის ესკიზზე ჩამჯდარი ვიდეო ამ ფანჯარას ეკუთვნის (იხ. `release`) */
  useEffect(() => {
    if (layout === 'inline' && anchor?.window) ownerRef.current = anchor.window.id
  }, [layout, anchor])

  const start = useCallback((uid: number) => {
    setCurrentUid(uid)
    setPlaying(true)
    setSeq((n) => n + 1)
    reportProgress(null)
  }, [])

  /* ⚠️ ახალი რიგი „გატანას" აუქმებს: ბარათის „დაკვრა" ფანჯარას ხსნის და ვიდეო
     იქ უნდა ჩაჯდეს — წინა ვიდეოს „გატანა" ახალზე არ ვრცელდება. */
  const play = useCallback(
    (items: PlayerItem[], startAt = 0, label: string | null = null, from: string | null = null) => {
      if (!items.length) return
      const entries = items.map((item) => ({ ...item, uid: nextUid++ }))
      setQueue(entries)
      setSource(label)
      setOrigin(from)
      setPopped(false)
      poppedRef.current = false
      // ახალ რიგს მფლობელი ჯერ არ ჰყავს — ის ფანჯარაა, სადაც პირველად ჩაჯდება (`inline`)
      ownerRef.current = null
      start(entries[Math.min(Math.max(startAt, 0), entries.length - 1)].uid)
    },
    [start],
  )

  /* ⚠️ ref-callback-იდან მოდის: ესკიზი მონტაჟზე ირეგისტრირებს, დემონტაჟზე —
     მხოლოდ **საკუთარ** რეგისტრაციას შლის (ახალი ფანჯარა ძველზე ადრე შეიძლება
     დამონტაჟდეს, და მაშინ ძველის `null` ახალს წაშლიდა). */
  const registerAnchor = useCallback((key: string, el: HTMLElement | null, win: PlayerWindow | null = null) => {
    setAnchor((prev) =>
      el
        ? prev?.el === el && prev.key === key && prev.window === win
          ? prev
          : { key, el, window: win }
        : prev?.key === key
          ? null
          : prev,
    )
  }, [])

  /* „გატანა" — ჩარჩოში მაგრდება და ფანჯარას ხურავს (`PlayerWindowScope`-ის `onClose`);
     ⚠️ ჯერ ref, მერე დახურვა: ფანჯრის დემონტაჟი (`release`) უკვე გატანილს ხედავს */
  const popOut = useCallback(() => {
    poppedRef.current = true
    setPopped(true)
    anchorRef.current?.window?.popOut.current?.()
  }, [])
  const popIn = useCallback(() => {
    poppedRef.current = false
    setPopped(false)
  }, [])

  const jumpTo = useCallback(
    (to: number) => {
      const entry = queue[to]
      if (entry) start(entry.uid)
    },
    [queue, start],
  )

  /**
   * ⚠️ state-ის updater-ის შიგნით `setPlaying`/`setSeq` განზრახ **არ იწერება**:
   * updater სუფთა უნდა იყოს და StrictMode მას ორჯერ იძახებს, ე.ი. მრიცხველი
   * ორჯერ გაიზრდებოდა. ამიტომ მიმდინარე ადგილი პირდაპირ იკითხება.
   */
  const next = useCallback(() => {
    // რიგის ბოლო — ვჩერდებით, დამკვრელი ღია რჩება (თავიდან ჩართვა ერთ დაწკაპუნებაშია)
    const entry = index >= 0 ? queue[index + 1] : undefined
    if (!entry) {
      setPlaying(false)
      return
    }
    start(entry.uid)
  }, [index, queue, start])

  const prev = useCallback(() => {
    const entry = index > 0 ? queue[index - 1] : undefined
    if (entry) start(entry.uid)
  }, [index, queue, start])

  const close = useCallback(() => {
    setQueue([])
    setCurrentUid(null)
    setPlaying(false)
    setExpanded(false)
    setSource(null)
    setOrigin(null)
    setPopped(false)
    setBubbled(false)
    poppedRef.current = false
    ownerRef.current = null
    reportProgress(null)
  }, [])

  /* ფანჯარა დაიხურა: თუ მიმდინარე რიგის ვიდეო მასში უკრავდა და გატანილი არაა —
     დამკვრელიც იხურება (რიგი შემდეგზე გადასულიც); გატანილი რჩება */
  const release = useCallback(
    (id: string) => {
      if (ownerRef.current !== id) return
      ownerRef.current = null
      if (!poppedRef.current) close()
    },
    [close],
  )
  const windows = useMemo(() => ({ release }), [release])

  const remove = useCallback(
    (uid: number) => {
      const out = removeEntry(queue, uid, currentUid)
      if (out.queue === queue) return
      if (!out.queue.length) {
        close()
        return
      }

      setQueue(out.queue)
      if (out.restart && out.current !== null) start(out.current)
      else if (out.current !== currentUid) {
        /* ⚠️ ბოლო უკრავდა და ის ამოიღეს — რიგი დამთავრდა: წინაზე ვდგებით
           **პაუზაზე**. სცენა ახალ ფრეიმს `playing = false`-ით ქმნის, ე.ი.
           ავტოდაკვრის გარეშე (`PlayerStage`) — უკვე მოსმენილი თავიდან არ იწყება. */
        setCurrentUid(out.current)
        setPlaying(false)
      }
    },
    [queue, currentUid, close, start],
  )

  const reorder = useCallback(
    (uids: number[]) => {
      const ordered = reorderEntries(queue, uids)
      if (ordered) setQueue(ordered)
    },
    [queue],
  )

  const setDock = useCallback((value: PlayerLayout) => {
    setDockState(value)
    safeSet(DOCK_KEY, value)
  }, [])

  const toggle = useCallback(() => setPlaying((v) => !v), [])

  const report = useCallback(
    (event: EmbedEvent) => {
      if (event === 'playing') setPlaying(true)
      else if (event === 'paused') setPlaying(false)
      else if (event === 'ended') {
        if (endedSeq.current === seq) return
        endedSeq.current = seq
        next()
      }
    },
    [next, seq],
  )

  /* ---------- „მოსმენილად/ნანახად" ჩათვლა ----------
     ⚠️ ითვლება **ჩართვაზე** და არა დამთავრებაზე: ეს ზუსტად ის ქცევაა, რაც
     ღილაკს ადრე ჰქონდა, ავტომატურად ჩართული ტრეკიც ასევე ითვლება.
     ⚠️ შეცდომა ჩუმად იკარგება — მრიცხველის ჩავარდნას დაკვრა არ უნდა შეაწყვეტინოს. */
  useEffect(() => {
    if (!seq || !current) return
    const { kind, id } = current
    // ⚠️ ბმულს მრიცხველი არ აქვს — არც უნდა ჰქონდეს (იხ. `PlayerItem.kind`)
    if (kind === 'link') return

    const request = kind === 'song' ? markSongPlayed(id) : markVideoWatched(id)
    request
      .then(() => qc.invalidateQueries({ queryKey: [kind === 'song' ? 'songs' : 'videos'] }))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq])

  /* ---------- დამკვრელის ადგილი გვერდისთვის ----------
     ⚠️ `--player-w` / `--player-h` **ერთადერთი** გზაა, რომლითაც დანარჩენი გვერდი
     გებულობს, სად დგას დამკვრელი: `<main>` და ჰედერი მარჯვენა `padding`-ად
     კითხულობენ (პანელი გვერდს აწვება და არაფერს ფარავს), ტოსტები
     საკუთარ `right`/`bottom`-ს ამით წევენ. ორივე ერთდროულად არასდროს დგას.
     ⚠️ `useLayoutEffect` და არა `useEffect`: პანელის სიგანეც ამ ცვლადიდანაა,
     ე.ი. დახატვის შემდეგ რომ ჩაწერილიყო, ერთი კადრი ნულოვანი სიგანით გამოჩნდებოდა. */
  useLayoutEffect(() => {
    const style = document.documentElement.style
    style.removeProperty('--player-w')
    style.removeProperty('--player-h')
    if (layout === 'side') style.setProperty('--player-w', panelWidth)
    if (layout === 'bar') style.setProperty('--player-h', expanded ? BAR_HEIGHT.expanded : BAR_HEIGHT.compact)

    return () => {
      style.removeProperty('--player-w')
      style.removeProperty('--player-h')
    }
  }, [layout, expanded, panelWidth])

  const value = useMemo<PlayerApi>(
    () => ({
      queue,
      index,
      current,
      playing,
      expanded,
      source,
      layout,
      anchor: here ? (anchor?.el ?? null) : null,
      registerAnchor,
      origin,
      popped,
      popOut,
      popIn,
      bubbled,
      setBubbled,
      wide,
      dock,
      width,
      maxWidth,
      panelWidth,
      resizing,
      play,
      toggle,
      next,
      prev,
      jumpTo,
      remove,
      reorder,
      close,
      setExpanded,
      setDock,
      setWidth,
      resetWidth,
      setResizing,
      report,
    }),
    [
      queue,
      index,
      current,
      playing,
      expanded,
      source,
      layout,
      here,
      anchor,
      registerAnchor,
      origin,
      popped,
      popOut,
      popIn,
      bubbled,
      wide,
      dock,
      width,
      maxWidth,
      panelWidth,
      resizing,
      play,
      toggle,
      next,
      prev,
      jumpTo,
      remove,
      reorder,
      close,
      setDock,
      setWidth,
      resetWidth,
      report,
    ],
  )

  return (
    <PlayerContext.Provider value={value}>
      <PlayerWindowsContext.Provider value={windows}>{children}</PlayerWindowsContext.Provider>
    </PlayerContext.Provider>
  )
}

export function usePlayer(): PlayerApi {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>')
  return ctx
}

/**
 * **ფანჯრის ესკიზი, რომელზეც ვიდეო ჯდება** (ref-callback).
 *
 * ესკიზი ყოველთვის ირეგისტრირებს — „დაკვრაზე" ვიდეო მაშინვე იქ ჯდება;
 * ჩანართის შეცვლაზე რეგისტრაცია ქრება და ვიდეო მოტივტივე ჩარჩოში გადადის.
 * ესკიზი თავის ფანჯარას (`PlayerWindowScope`) იცნობს: „გატანა" მას ხურავს,
 * დახურვა კი გაუტანელ ვიდეოს. `null` — ესკიზი ცარიელია (არაფერი მისი არ უკრავს).
 */
export function usePlayerAnchor(item: Pick<PlayerItem, 'kind' | 'id'> | null) {
  const { registerAnchor } = usePlayer()
  const win = useContext(PlayerWindowContext)
  const fallback = useId()
  const key = item ? itemKey(item) : `idle:${fallback}`
  return useCallback((el: HTMLElement | null) => registerAnchor(key, el, win), [registerAnchor, key, win])
}

/**
 * **ფანჯრის საზღვარი დამკვრელისთვის** — `ModalShell` ახვევს თავის შიგთავსს.
 * ⚠️ `PlayerProvider`-ის გარეთ (ტესტები, საჯარო გვერდი) უბრალოდ შიგთავსს ხატავს.
 * ⚠️ დახურვა = დემონტაჟი და არა `onClose`: ფორმის „შეუნახავია, დავხურო?" კითხვაზე
 * უარი ფანჯარას ღიას ტოვებს და დამკვრელიც არ უნდა დაიხუროს.
 */
export function PlayerWindowScope({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const windows = useContext(PlayerWindowsContext)
  const id = useId()
  const popOut = useRef<(() => void) | null>(onClose)
  useLayoutEffect(() => {
    popOut.current = onClose
  }, [onClose])
  const value = useMemo<PlayerWindow>(() => ({ id, popOut }), [id])

  useEffect(() => () => windows?.release(id), [windows, id])

  return <PlayerWindowContext.Provider value={value}>{children}</PlayerWindowContext.Provider>
}
