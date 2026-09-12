import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { markSongPlayed, type Song } from '@/api/songs'
import { markVideoWatched, type Video, type VideoPlatform } from '@/api/videos'
import type { EmbedEvent } from '@/lib/embed'

/* ============================================================
   ერთიანი დამკვრელი — მუსიკაც და ვიდეოც (Tasks §7.2).

   ⚠️ **რატომ არის გლობალური.** ამოცანის არსი „პლეილისტში ერთი დამთავრდება →
   შემდეგი ჩაირთოს"-ია, ე.ი. დაკვრა გვერდის გადართვას უნდა გადაურჩეს.
   მოდალში მჯდომი პლეერი (ძველი `SongPlayer`) ამას ვერ შეძლებდა — ამიტომ
   მდგომარეობა `AppShell`-ის დონეზეა და სცენა ეკრანის ქვედა ზოლშია.

   ⚠️ **ერთი წყარო უკრავს.** ორი ერთდროული embed ერთმანეთს ხმას აფარებს,
   ამიტომ `VideoDetail`/სიმღერის მოდალი დაკვრას აღარ შეიცავს — ისინი
   ჩანაწერს ამ რიგში აგდებენ.
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

interface PlayerApi {
  queue: PlayerItem[]
  index: number
  current: PlayerItem | null
  /** ჩვენი რწმენა — სცენიდან მოსული მოვლენებით სწორდება */
  playing: boolean
  expanded: boolean
  /** რიგის სახელი ბარისთვის („პლეილისტი X", „სიმღერები") */
  source: string | null
  play: (items: PlayerItem[], startAt?: number, source?: string | null) => void
  toggle: () => void
  next: () => void
  prev: () => void
  jumpTo: (index: number) => void
  close: () => void
  setExpanded: (value: boolean) => void
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

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()

  const [queue, setQueue] = useState<PlayerItem[]>([])
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [source, setSource] = useState<string | null>(null)

  /**
   * მრიცხველი, რომელიც **ყოველ ჩართვაზე** იზრდება.
   * ⚠️ საჭიროა იმიტომ, რომ „ჩართული ჩანაწერი" და „ჩართვის ფაქტი" სხვადასხვაა:
   * ერთი და იმავე სიმღერის ხელახლა ჩართვა `index`-ს არ ცვლის, დათვლა კი უნდა.
   */
  const [seq, setSeq] = useState(0)

  /**
   * ⚠️ `ended` ორჯერ რომ მოვიდეს (YouTube-ს ეს ახასიათებს), ერთი ტრეკი
   * გადაიხტებოდა — ამიტომ თითო ჩართვაზე მხოლოდ პირველი ითვლება.
   */
  const endedSeq = useRef(-1)

  const current = queue[index] ?? null

  const start = useCallback((at: number) => {
    setIndex(at)
    setPlaying(true)
    setSeq((n) => n + 1)
  }, [])

  const play = useCallback(
    (items: PlayerItem[], startAt = 0, label: string | null = null) => {
      if (!items.length) return
      setQueue(items)
      setSource(label)
      start(Math.min(Math.max(startAt, 0), items.length - 1))
    },
    [start],
  )

  const jumpTo = useCallback(
    (to: number) => {
      if (to < 0 || to >= queue.length) return
      start(to)
    },
    [queue.length, start],
  )

  /**
   * ⚠️ `setIndex(i => …)`-ის შიგნით `setPlaying`/`setSeq` განზრახ **არ იწერება**:
   * updater სუფთა უნდა იყოს და StrictMode მას ორჯერ იძახებს, ე.ი. მრიცხველი
   * ორჯერ გაიზრდებოდა. ამიტომ მიმდინარე `index` პირდაპირ იკითხება.
   */
  const next = useCallback(() => {
    // რიგის ბოლო — ვჩერდებით, ბარი ღია რჩება (თავიდან ჩართვა ერთ დაწკაპუნებაშია)
    if (index + 1 >= queue.length) {
      setPlaying(false)
      return
    }
    start(index + 1)
  }, [index, queue.length, start])

  const prev = useCallback(() => {
    if (index > 0) start(index - 1)
  }, [index, start])

  const close = useCallback(() => {
    setQueue([])
    setIndex(0)
    setPlaying(false)
    setExpanded(false)
    setSource(null)
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

  /* ---------- ბარის სიმაღლე გვერდისთვის ----------
     ⚠️ `--player-h` **ერთადერთი** გზაა, რომლითაც დანარჩენი გვერდი გებულობს,
     რომ ქვემოთ ზოლი დგას: `AppShell` მას ქვედა padding-ად კითხულობს, რიგის
     ტოსტი კი საკუთარ `bottom`-ს ამით ზრდის. კომპონენტების პირდაპირი ცოდნა
     ერთმანეთზე აქ სულ ორ მიმართულებას გააჩენდა. */
  useEffect(() => {
    const root = document.documentElement
    if (!current) root.style.removeProperty('--player-h')
    else root.style.setProperty('--player-h', expanded ? '11rem' : '5.5rem')
    return () => {
      root.style.removeProperty('--player-h')
    }
  }, [current, expanded])

  const value = useMemo<PlayerApi>(
    () => ({
      queue,
      index,
      current,
      playing,
      expanded,
      source,
      play,
      toggle,
      next,
      prev,
      jumpTo,
      close,
      setExpanded,
      report,
    }),
    [
      queue,
      index,
      current,
      playing,
      expanded,
      source,
      play,
      toggle,
      next,
      prev,
      jumpTo,
      close,
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
