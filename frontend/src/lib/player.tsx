import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { CustomRecord } from '@/api/customRecords'
import { markSongPlayed, type Song } from '@/api/songs'
import { markVideoWatched, type Video, type VideoPlatform } from '@/api/videos'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import type { EmbedEvent } from '@/lib/embed'
import { removeEntry, reorderEntries } from '@/lib/playerQueue'
import { safeGet, safeSet } from '@/lib/storage'

/* ============================================================
   ერთიანი დამკვრელი — მუსიკაც და ვიდეოც (Tasks §7.2 → §35).

   ⚠️ **რატომ არის გლობალური.** ამოცანის არსი „პლეილისტში ერთი დამთავრდება →
   შემდეგი ჩაირთოს"-ია, ე.ი. დაკვრა გვერდის გადართვას უნდა გადაურჩეს.
   მოდალში მჯდომი პლეერი (ძველი `SongPlayer`) ამას ვერ შეძლებდა — ამიტომ
   მდგომარეობა `AppShell`-ის დონეზეა, სცენა კი `components/Player.tsx`-შია.

   ⚠️ **ერთი წყარო უკრავს.** ორი ერთდროული embed ერთმანეთს ხმას აფარებს,
   ამიტომ `VideoDetail`-ს საკუთარი ჩაშენება აღარ აქვს (§35.6) — ის ჩანაწერს
   ამ რიგს გადასცემს.

   §35 — **ორი განლაგება, ერთი სცენა.** ფართო ეკრანზე დამკვრელი მარჯვენა
   პანელია (ზემოთ ვიდეო 16:9, ქვემოთ რიგი — YouTube-ის ფლეილისტივით) და
   გვერდს **აწვება** (`--player-w`); ვიწრო ეკრანზე და ჩაკეცილზე — ქვედა ზოლი
   (`--player-h`). განლაგებას აქ ვითვლით და მხოლოდ CSS იცვლება — იხ.
   `components/Player.tsx`.
   ============================================================ */

export interface PlayerItem {
  /**
   * რომელი მოდულიდან — მხოლოდ „მოსმენილად/ნანახად" ჩათვლა ჰკიდია.
   *
   * ⚠️ **`link` = მრიცხველი არ არსებობს** (§8.4): გალერეის ვიდეო ბმულია და
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
}

/**
 * რიგის ერთეული — `uid` **რიგში ჩასმისას** იბადება.
 * ⚠️ `kind-id` გასაღებად არ კმარა: ერთი ჩანაწერი რიგში ორჯერაც შეიძლება
 * იყოს, მიმდინარე კი `uid`-ით იცნობა (იხ. `lib/playerQueue.ts`).
 */
export interface QueueEntry extends PlayerItem {
  uid: number
}

/** სად დგას დამკვრელი: მარჯვენა პანელად თუ ქვედა ზოლად */
export type PlayerLayout = 'side' | 'bar'

/**
 * საიდან ჩნდება გვერდითა პანელი (px).
 *
 * ⚠️ **ზღვარი დათვლილია და არა შერჩეული** (Q26): პანელი გვერდს აწვება, ე.ი.
 * შევიწროებული გვერდი არ უნდა იყოს იმაზე ვიწრო, ვიდრე დღევანდელი ყველაზე
 * ვიწრო `xl`-განლაგებაა — 1280px ეკრანი, სადაც ბადეები უკვე 6/3/5 სვეტზეა
 * და ფილტრის პანელიც დგას. ⚠️ ბადეები **ეკრანის** სიგანეს კითხულობენ და არა
 * საკუთარს, ე.ი. პანელით შევიწროებულ გვერდზე სვეტების რიცხვი თავისით არ
 * იკლებს — ზღვარი სწორედ ამიტომაა მაღალი: 1280 + პანელის უმცირესი სიგანე
 * (24rem = 384px) = **1664px**. ზემოთ გვერდი ≥ 1040px რჩება (1280-ის ტოლი).
 */
export const PANEL_MIN_VIEWPORT = 1664

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
 * ფართო ეკრანზე მომხმარებლის არჩევანი — პანელი თუ ზოლი (Q26: „ახსოვს").
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
  /** ეკრანი საკმარისად ფართოა პანელისთვის */
  wide: boolean
  /** ფართო ეკრანზე არჩეული განლაგება */
  dock: PlayerLayout
  play: (items: PlayerItem[], startAt?: number, source?: string | null) => void
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
  }
}

/**
 * **პირადი მოდულის ჩანაწერი (Tasks §37.5)** — ბმული, რომელიც `VideoUrl`-მა
 * ამოიცნო (`platform` არა-`null`; `file` — პირდაპირი ფაილი `<video>`-ით).
 *
 * ⚠️ `kind: 'link'` — მრიცხველი არ არსებობს: „ნანახად ჩათვლა" ვიდეოს/სიმღერის
 * მოდულის ცნებაა, და პირადი ჩანაწერის id `videos`-ში არ დევს (გალერეის
 * ვიდეოს იგივე წესი, §8.4).
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
  const wide = useMediaQuery(`(min-width: ${PANEL_MIN_VIEWPORT}px)`)

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
  const layout: PlayerLayout | null = current ? (wide && dock === 'side' ? 'side' : 'bar') : null

  const start = useCallback((uid: number) => {
    setCurrentUid(uid)
    setPlaying(true)
    setSeq((n) => n + 1)
  }, [])

  const play = useCallback(
    (items: PlayerItem[], startAt = 0, label: string | null = null) => {
      if (!items.length) return
      const entries = items.map((item) => ({ ...item, uid: nextUid++ }))
      setQueue(entries)
      setSource(label)
      start(entries[Math.min(Math.max(startAt, 0), entries.length - 1)].uid)
    },
    [start],
  )

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
  }, [])

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
     კითხულობენ (პანელი გვერდს აწვება და არაფერს ფარავს — Q26), ტოსტები
     საკუთარ `right`/`bottom`-ს ამით წევენ. ორივე ერთდროულად არასდროს დგას.
     ⚠️ `useLayoutEffect` და არა `useEffect`: პანელის სიგანეც ამ ცვლადიდანაა,
     ე.ი. დახატვის შემდეგ რომ ჩაწერილიყო, ერთი კადრი ნულოვანი სიგანით გამოჩნდებოდა. */
  useLayoutEffect(() => {
    const style = document.documentElement.style
    style.removeProperty('--player-w')
    style.removeProperty('--player-h')
    if (layout === 'side') style.setProperty('--player-w', PANEL_WIDTH)
    if (layout === 'bar') style.setProperty('--player-h', expanded ? BAR_HEIGHT.expanded : BAR_HEIGHT.compact)

    return () => {
      style.removeProperty('--player-w')
      style.removeProperty('--player-h')
    }
  }, [layout, expanded])

  const value = useMemo<PlayerApi>(
    () => ({
      queue,
      index,
      current,
      playing,
      expanded,
      source,
      layout,
      wide,
      dock,
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
      wide,
      dock,
      play,
      toggle,
      next,
      prev,
      jumpTo,
      remove,
      reorder,
      close,
      setDock,
      report,
    ],
  )

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer(): PlayerApi {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>')
  return ctx
}
