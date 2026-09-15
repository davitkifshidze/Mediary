import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Check, ChevronDown, ChevronUp, Clock, Loader2, RotateCcw, Server, SkipForward, X } from 'lucide-react'
import { purgeItem, type PurgePlanItem, type PurgeTarget } from '@/api/account'
import { startBatch, type BatchKind } from '@/api/batches'
import { errorMessage } from '@/lib/errors'
import { useToast } from '@/components/ui/feedback'
import {
  fetchActorGalleryImages,
  fetchGalleryItem,
  type GalleryOptions,
  type GalleryPlanItem,
} from '@/api/gallery'
import { mediaApi, syncItem, type SyncOptions, type SyncPlanItem } from '@/api/media'
import {
  translateGenres,
  translateItem,
  type TranslationPlanItem,
  type TranslationSource,
} from '@/api/translations'
import type { MediaType } from '@/lib/media'
import { isMediaKey } from '@/lib/modules'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'

/* ============================================================
   Queue — ფონური, არაბლოკირებადი რიგი სამი სახის სამუშაოსთვის:
     • `add`     — TMDB id-ით ჩანაწერის დამატება (აღმოაჩინე / მსახიობის გვერდი);
     • `sync`    — არსებული ჩანაწერის სინქრონი (Tasks J3) — თითო ჩანაწერი = თითო
       მოკლე რექვესთი, ამიტომ სერვერი არ იბლოკება და გაჩერებაც შესაძლებელია;
     • `gallery` — ფოტოების ჩამოტვირთვა (Tasks 10), იმავე per-item მოდელით;
     • `translate` — ნაკლული თარგმანების შევსება (Tasks 7). ჟანრების ლექსიკონი
       აქ **ერთი ერთეულია** (`genresDict`) — ის გლობალურია და ერთ რექვესთში მუშავდება.
     • `purge`   — მასობრივი წაშლა (Tasks 20.2). ⚠️ დესტრუქციულია, ამიტომ
       რიგში მხოლოდ `/purge`-ის ცხადი დადასტურების შემდეგ ჯდება.
   ნავიგაცია არ იბლოკება (რიგი გლობალურია); refresh/close კი აფრთხილებს.
   ============================================================ */

type QStatus = 'pending' | 'running' | 'done' | 'error'
type QKind = 'add' | 'sync' | 'gallery' | 'translate' | 'purge'

/** `purge`-ის ერთეულის კონტექსტი — რას ვშლით და ვისთან (20.2) */
export interface PurgeQueueOptions {
  target: PurgeTarget
  media_type?: 'movie' | 'series'
  user_id?: number
}

interface QItem {
  id: number
  kind: QKind
  title: string
  mediaType: MediaType
  status: QStatus
  /** add — TMDB id */
  tmdbId?: number
  /** sync/gallery — ლოკალური ჩანაწერის id + პარამეტრები */
  itemId?: number
  opts?: SyncOptions
  /** gallery — რა ჩამოვიდეს (Tasks 10) */
  galleryOpts?: GalleryOptions
  /**
   * gallery — ერთეული **მსახიობია** და არა ჩანაწერი.
   *
   * ⚠️ ცალკე დროშა და არა `mediaType: 'actor'`: `mediaType` ქეშის
   * გასუფთავებას ემსახურება და `MediaType`-ია, ხოლო მსახიობი მედია-დომენი
   * არ არის. დუბლის გასაღებშიც ეს გვჭირდება — მსახიობის id-ს და ფილმის
   * id-ს ერთი და იგივე რიცხვი შეიძლება ჰქონდეს.
   */
  galleryActor?: boolean
  /** translate — ჟანრების ლექსიკონი (ჩანაწერი არ აქვს, `itemId` ცარიელია) */
  genresDict?: boolean
  /**
   * translate — არჩეული წყაროები (`tmdb` · `gemini`).
   *
   * ⚠️ **არჩევანი ერთეულს მიჰყვება და არა დიალოგს** (შენი მითითება,
   * 2026-09-14): რიგი თითო ჩანაწერს ცალკე რექვესთად აგზავნის, ე.ი. აქ რომ
   * არ ეწეროს, მეორე ჩანაწერიდან სერვერი ნაგულისხმევზე დაბრუნდებოდა და
   * „მარტო TMDB-ით" ჩუმად „ორივეთი" გაიქცეოდა.
   */
  sources?: TranslationSource[]
  /**
   * translate — TMDB-ის ქართული აღწერა გადამოწმდეს თუ არა (2026-09-14).
   *
   * ⚠️ `sources`-ის იგივე მიზეზით ზის **ერთეულზე** და არა დიალოგზე: ეს
   * ერთადერთი რეჟიმია, რომელიც არსებულ ტექსტს წერს, ე.ი. მისი „ჩუმად
   * ჩართვაც" და „ჩუმად ჩაქრობაც" ერთნაირად ცუდია.
   */
  review?: boolean
  /** purge — რა სამიზნეზე და ვისთან იშლება (20.2) */
  purgeOpts?: PurgeQueueOptions
  /** ჩავარდნის მიზეზი (J5) ან 'cancelled' */
  error?: string
  /** შესრულების დრო — დარჩენილი დროის შესაფასებლად */
  ms?: number
  /** ჩანაწერზე არაფერი შეიცვალა (მაგ. მედია უკვე ადგილზე იყო) */
  skipped?: boolean
}

interface QueueApi {
  enqueue: (items: { tmdbId: number; title: string }[], mediaType?: MediaType) => void
  /** სინქრონის რიგში ჩაყრა — `plan`-ის ჩანაწერები + ერთი და იგივე პარამეტრები */
  enqueueSync: (items: SyncPlanItem[], opts: SyncOptions) => void
  /** გალერეის ჩამოტვირთვა (Tasks 10) — იგივე მოდელი, რაც სინქრონზე */
  enqueueGallery: (items: GalleryPlanItem[], opts: GalleryOptions) => void
  /** თარგმანების შევსება (Tasks 7); `genres` — ლექსიკონიც ერთ ერთეულად */
  enqueueTranslate: (
    items: TranslationPlanItem[],
    genres?: boolean,
    sources?: TranslationSource[],
    review?: boolean,
  ) => void
  /** ⚠️ მასობრივი წაშლა (20.2) — მხოლოდ დადასტურებული სკოუპით */
  enqueuePurge: (items: PurgePlanItem[], opts: PurgeQueueOptions) => void
  isQueued: (tmdbId: number, mediaType?: MediaType) => boolean
  active: number
  isBusy: boolean
  /** დარჩენილის გაჩერება + მიმდინარე რექვესთის გაუქმება */
  cancelPending: () => void
}

const QueueContext = React.createContext<QueueApi>({
  enqueue: () => {},
  enqueueSync: () => {},
  enqueueGallery: () => {},
  enqueueTranslate: () => {},
  enqueuePurge: () => {},
  isQueued: () => false,
  active: 0,
  isBusy: false,
  cancelPending: () => {},
})

export function useQueue() {
  return React.useContext(QueueContext)
}

let nextId = 1

/**
 * რიგის სათაური სახეობის მიხედვით. ერთი ცხრილი ღრმა ternary-ს ნაცვლად —
 * ახალი სახეობის დამატება ერთი რიგია.
 */
const HEADLINES: Record<QKind, { busy: string; done: string }> = {
  purge: { busy: 'queue.purging', done: 'queue.purgeDone' },
  gallery: { busy: 'queue.galleryRunning', done: 'queue.galleryDone' },
  translate: { busy: 'queue.translating', done: 'queue.translateDone' },
  sync: { busy: 'queue.syncing', done: 'queue.syncDone' },
  add: { busy: 'queue.adding', done: 'queue.doneTitle' },
}

export function QueueProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<QItem[]>([])
  const [expanded, setExpanded] = React.useState(false)
  const [tick, setTick] = React.useState(0)
  const qc = useQueryClient()
  const { t } = useTranslation()
  const { settings } = useSettings()
  const runningRef = React.useRef(false)
  const abortRef = React.useRef<AbortController | null>(null)

  /**
   * პაუზა ერთეულის **სახეობის** მიხედვით (Tasks 7):
   * `add`/`purge` — ჩვენივე ბაზაა, ლოდინი არ სჭირდება; `translate` — Gemini-ის
   * ლიმიტი, ამიტომ ცალკე პარამეტრი; `sync`/`gallery` — TMDB.
   */
  const paceOf = React.useCallback(
    (kind: QKind) =>
      kind === 'add' || kind === 'purge'
        ? 0
        : kind === 'translate'
          ? settings.translateDelayMs
          : settings.syncDelayMs,
    [settings.translateDelayMs, settings.syncDelayMs],
  )
  const paceRef = React.useRef(paceOf)
  paceRef.current = paceOf

  /** ახალი პარტიის დაწყებამდე — ჩაკეცვა + წინა (დასრულებული) პარტიის გასუფთავება */
  const freshBase = (cur: QItem[]) => {
    const running = cur.filter((i) => i.status === 'pending' || i.status === 'running')
    return running.length ? cur : running
  }

  const enqueue = React.useCallback(
    (toAdd: { tmdbId: number; title: string }[], mediaType: MediaType = 'movie') => {
      setExpanded(false)
      setItems((cur) => {
        const base = freshBase(cur)
        const busy = new Set(
          cur
            .filter((i) => i.kind === 'add' && (i.status === 'pending' || i.status === 'running'))
            .map((i) => `${i.mediaType}:${i.tmdbId}`),
        )
        const fresh = toAdd
          .filter((a) => !busy.has(`${mediaType}:${a.tmdbId}`))
          .map((a) => ({
            id: nextId++,
            kind: 'add' as QKind,
            tmdbId: a.tmdbId,
            title: a.title,
            mediaType,
            status: 'pending' as QStatus,
          }))
        return fresh.length ? [...base, ...fresh] : base
      })
    },
    [],
  )

  const enqueueSync = React.useCallback((toSync: SyncPlanItem[], opts: SyncOptions) => {
    setExpanded(true) // სინქრონი გრძელია — პროგრესი მაშინვე ჩანს
    setItems((cur) => {
      const base = freshBase(cur)
      const busy = new Set(
        cur
          .filter((i) => i.kind === 'sync' && (i.status === 'pending' || i.status === 'running'))
          .map((i) => `${i.mediaType}:${i.itemId}`),
      )
      const fresh = toSync
        .filter((s) => !busy.has(`${s.type}:${s.id}`))
        .map((s) => ({
          id: nextId++,
          kind: 'sync' as QKind,
          itemId: s.id,
          title: s.year ? `${s.title} (${s.year})` : s.title,
          mediaType: s.type,
          status: 'pending' as QStatus,
          opts,
        }))
      return fresh.length ? [...base, ...fresh] : base
    })
  }, [])

  /**
   * გალერეის ჩამოტვირთვა — **ერთეული ან ჩანაწერია, ან მსახიობი**
   * (`item.type === 'actor'`). ერთი მეთოდი განზრახ: სახეობა თვითონ
   * ერთეულზეა დაწერილი, ე.ი. შერეული პარტიაც (ჩანაწერები + მსახიობები)
   * ერთ რიგში ჯდება და პროგრესიც ერთია.
   */
  const enqueueGallery = React.useCallback((toFetch: GalleryPlanItem[], opts: GalleryOptions) => {
    setExpanded(true) // ჩამოტვირთვა გრძელია — პროგრესი მაშინვე ჩანს
    setItems((cur) => {
      const base = freshBase(cur)
      const busy = new Set(
        cur
          .filter((i) => i.kind === 'gallery' && (i.status === 'pending' || i.status === 'running'))
          .map((i) => `${i.galleryActor ? 'actor' : i.mediaType}:${i.itemId}`),
      )
      const fresh = toFetch
        .filter((g) => !busy.has(`${g.type}:${g.id}`))
        .map((g) => ({
          id: nextId++,
          kind: 'gallery' as QKind,
          itemId: g.id,
          title: g.year ? `${g.title} (${g.year})` : g.title,
          // მსახიობი მედია-დომენი არ არის — `mediaType` მხოლოდ ქეშის გასუფთავებაა
          mediaType: (isMediaKey(g.type) ? g.type : 'movie') as MediaType,
          galleryActor: g.type === 'actor',
          status: 'pending' as QStatus,
          galleryOpts: opts,
        }))
      return fresh.length ? [...base, ...fresh] : base
    })
  }, [])

  const enqueueTranslate = React.useCallback((
    toRun: TranslationPlanItem[],
    genres = false,
    sources?: TranslationSource[],
    review = false,
  ) => {
    setExpanded(true) // თარგმანი გრძელია — პროგრესი მაშინვე ჩანს
    setItems((cur) => {
      const base = freshBase(cur)
      const busy = new Set(
        cur
          .filter((i) => i.kind === 'translate' && (i.status === 'pending' || i.status === 'running'))
          .map((i) => (i.genresDict ? 'genres' : `${i.mediaType}:${i.itemId}`)),
      )
      const fresh: QItem[] = toRun
        .filter((r) => !busy.has(`${r.type}:${r.id}`))
        .map((r) => ({
          id: nextId++,
          kind: 'translate' as QKind,
          itemId: r.id,
          title: r.year ? `${r.title} (${r.year})` : r.title,
          mediaType: r.type,
          status: 'pending' as QStatus,
          sources,
          review,
        }))
      // ჟანრები ბოლოს — ერთი რექვესთი მთელ ლექსიკონზე
      if (genres && !busy.has('genres')) {
        fresh.push({
          id: nextId++,
          kind: 'translate' as QKind,
          title: t('genres.title'),
          mediaType: 'movie',
          status: 'pending' as QStatus,
          genresDict: true,
          sources,
          /* ⚠️ ჟანრებზე `review` **განზრახ არ გადადის**: ჟანრის სახელი
             ერთი-ორი სიტყვაა და TMDB-ის ოფიციალური სიიდან მოდის — მისი
             „გადამოწმება" ხარჯია და არა შემოწმება. */
        })
      }
      return fresh.length ? [...base, ...fresh] : base
    })
  }, [t])

  /**
   * ⚠️ მასობრივი წაშლა (20.2). დადასტურება `/purge`-ზე უკვე მოხდა, აქ
   * მხოლოდ ციკლს ვატარებთ — id-ები `plan`-იდან მოვიდა და აღარ გადაითვლება.
   */
  const enqueuePurge = React.useCallback((toPurge: PurgePlanItem[], opts: PurgeQueueOptions) => {
    setExpanded(true) // წაშლა დესტრუქციულია — პროგრესი მაშინვე ჩანს
    setItems((cur) => {
      const base = freshBase(cur)
      // დუბლის გასაღები **სამიზნეზეა** და არა `mediaType`-ზე: ვიდეოსა და
      // ფილმს ერთი და იგივე id შეიძლება ჰქონდეს
      const busy = new Set(
        cur
          .filter((i) => i.kind === 'purge' && (i.status === 'pending' || i.status === 'running'))
          .map((i) => `${i.purgeOpts?.target}:${i.itemId}`),
      )
      const fresh = toPurge
        .filter((p) => !busy.has(`${opts.target}:${p.id}`))
        .map((p) => ({
          id: nextId++,
          kind: 'purge' as QKind,
          itemId: p.id,
          title: p.year ? `${p.title} (${p.year})` : p.title,
          // ⚠️ ვიდეო `MediaType` არ არის — ის მხოლოდ ქეშის გასუფთავებას ემსახურება
          mediaType: (isMediaKey(p.type) ? p.type : 'movie') as MediaType,
          status: 'pending' as QStatus,
          purgeOpts: opts,
        }))
      return fresh.length ? [...base, ...fresh] : base
    })
  }, [])

  const cancelPending = React.useCallback(() => {
    setItems((cur) => cur.filter((i) => i.status !== 'pending'))
    abortRef.current?.abort()
  }, [])

  const cancelOne = React.useCallback((qid: number) => {
    setItems((cur) => cur.filter((i) => !(i.id === qid && i.status === 'pending')))
  }, [])

  const retryFailed = React.useCallback(() => {
    setItems((cur) =>
      cur.map((i) => (i.status === 'error' ? { ...i, status: 'pending' as QStatus, error: undefined } : i)),
    )
  }, [])

  // თანმიმდევრული დამმუშავებელი — ერთდროულად ერთი ჩანაწერი
  React.useEffect(() => {
    if (runningRef.current) return
    const next = items.find((i) => i.status === 'pending')
    if (!next) return

    runningRef.current = true
    setItems((cur) => cur.map((i) => (i.id === next.id ? { ...i, status: 'running' } : i)))

    const started = performance.now()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    const job: Promise<{
      ok: boolean
      error?: string
      skipped?: boolean
    }> = next.kind === 'add'
        ? mediaApi(next.mediaType)
            .addFromTmdb(next.tmdbId!)
            .then(() => ({ ok: true }))
        : next.kind === 'gallery'
          ? (next.galleryActor
              ? // მსახიობის ფოტოები ჩანაწერზე არ გადის — თავისი endpoint-ია
                fetchActorGalleryImages(
                  next.itemId!,
                  {
                    per_actor: next.galleryOpts?.per_actor,
                    // ⚠️ პორტრეტს თავისი ზომა აქვს (§3.2) — უამისოდ რიგი
                    // ყოველთვის ნაგულისხმევს ჩამოწერდა და ტაბის არჩევანი
                    // ჩუმად იკარგებოდა
                    cast_size: next.galleryOpts?.cast_size,
                    /* §8.2 — წყაროც არჩევანია (პორტრეტები · კადრები ფილმებიდან);
                       მისი გამოტოვება ტაბის არჩევანს ჩუმად კარგავდა, ზუსტად
                       ისე, როგორც ადრე `cast_size`-ს კარგავდა */
                    cast_source: next.galleryOpts?.cast_source,
                  },
                  ctrl.signal,
                )
              : fetchGalleryItem(next.mediaType, next.itemId!, next.galleryOpts ?? {}, ctrl.signal)
            ).then((r) => ({
              ok: r.ok,
              error: r.error ?? undefined,
              // ახალი ფოტო არ მოვიდა (ყველა უკვე გვქონდა) — „გამოტოვებულია"
              skipped: r.added === 0,
            }))
          : next.kind === 'translate'
            ? (next.genresDict
                ? translateGenres(next.sources, ctrl.signal)
                : translateItem(next.mediaType, next.itemId!, next.sources, next.review, ctrl.signal)
              ).then((r) => ({ ok: r.ok, error: r.error ?? undefined, skipped: r.skipped }))
            : next.kind === 'purge'
              ? purgeItem(next.purgeOpts!, next.itemId!, ctrl.signal).then((r) => ({
                  ok: r.ok,
                  error: r.error ?? undefined,
                  skipped: r.skipped,
                }))
              : syncItem(next.mediaType, next.itemId!, next.opts ?? {}, ctrl.signal).then((r) => ({
                  ok: r.ok,
                  error: r.error ?? undefined,
                  skipped: r.skipped,
                }))

    job
      .then(({ ok, error, skipped }) => {
        ;[
          next.mediaType,
          'discover',
          'actor',
          'collection',
          'genres',
          'genre-items',
          'gallery',
          'storage',
          'translations',
          // წაშლა ყველა მოდულს ეხება და დეშბორდის მრიცხველებსაც (20.2)
          ...(next.kind === 'purge'
            ? ['video', 'videos', 'songs', 'books', 'board-games', 'playlists', 'dashboard', 'purge-plan']
            : []),
        ].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
        setItems((cur) =>
          cur.map((i) =>
            i.id === next.id
              ? {
                  ...i,
                  status: ok ? 'done' : 'error',
                  error,
                  skipped,
                  ms: performance.now() - started,
                }
              : i,
          ),
        )
      })
      .catch((e: { code?: string; message?: string; response?: { status?: number } }) => {
        const cancelled = ctrl.signal.aborted || e?.code === 'ERR_CANCELED'
        // 17.3 — კვოტა გავსდა: ნაკადი **ჩერდება** და არ აგრძელებს ცდას
        const quotaFull = e?.response?.status === 413
        if (quotaFull) qc.invalidateQueries({ queryKey: ['storage'] })
        setItems((cur) =>
          cur
            .filter((i) => !(quotaFull && i.status === 'pending'))
            .map((i) =>
              i.id === next.id
                ? {
                    ...i,
                    status: 'error',
                    error: quotaFull ? 'quota' : cancelled ? 'cancelled' : e?.message,
                    ms: performance.now() - started,
                  }
                : i,
            ),
        )
      })
      .finally(() => {
        abortRef.current = null
        // rate-limit — პაუზა ჩანაწერებს შორის (პარამეტრებიდან, J5 / Tasks 7)
        const delay = paceRef.current(next.kind)
        if (delay > 0) {
          window.setTimeout(() => {
            runningRef.current = false
            setTick((x) => x + 1)
          }, delay)
        } else {
          runningRef.current = false
        }
      })
  }, [items, tick, qc])

  // idle + უშეცდომოდ → ინდიკატორის ავტო-გაქრობა
  React.useEffect(() => {
    const anyActive = items.some((i) => i.status === 'pending' || i.status === 'running')
    const anyError = items.some((i) => i.status === 'error')
    if (items.length && !anyActive && !anyError) {
      const id = setTimeout(() => setItems([]), 4000)
      return () => clearTimeout(id)
    }
  }, [items])

  const active = items.filter((i) => i.status === 'pending' || i.status === 'running').length
  const isBusy = active > 0

  /* §D1 — რიგის სერვერზე გადაცემა.

     ⚠️ **მხოლოდ ერთგვაროვანი ნარჩენი გადადის.** პარტიას ერთი `kind` აქვს,
     ე.ი. შერეული რიგი (სინქრონი + თარგმანი ერთად) ორ პარტიად უნდა
     დაიშალოს — ეს გაურკვევლობაა და ღილაკი ასეთ დროს უბრალოდ არ ჩანს.
     ⚠️ `add`/`purge` არასდროს გადადის: პირველი ერთ რექვესთში სრულდება,
     მეორე კი დესტრუქციულია და ცხად დადასტურებაზე დგას. */
  const { toast } = useToast()
  const [handingOff, setHandingOff] = React.useState(false)

  const pendingItems = items.filter((i) => i.status === 'pending')
  const handoffKinds = new Set(pendingItems.map((i) => i.kind))
  const handoffKind =
    handoffKinds.size === 1 &&
    pendingItems.length > 0 &&
    ['sync', 'gallery', 'translate'].includes(pendingItems[0].kind) &&
    // ⚠️ მსახიობის ფოტოებს თავისი endpoint აქვს და ჩანაწერის პარტიაში არ ჯდება
    !pendingItems.some((i) => i.galleryActor)
      ? (pendingItems[0].kind as BatchKind)
      : null

  const handOff = async () => {
    if (!handoffKind) return
    setHandingOff(true)

    try {
      const first = pendingItems[0]
      await startBatch(
        handoffKind,
        pendingItems.map((i) => ({ type: i.mediaType, id: i.itemId! })),
        /* ⚠️ პარამეტრები **პირველი ერთეულიდან** მოდის: რიგი ერთი დიალოგიდან
           იბადება, ე.ი. ისინი მთელ პარტიაზე ერთი და იგივეა. */
        handoffKind === 'sync'
          ? { ...(first.opts ?? {}) }
          : handoffKind === 'gallery'
            ? { ...(first.galleryOpts ?? {}) }
            : { sources: first.sources, review: first.review },
      )

      // გადაცემულები კლიენტის რიგიდან ქრება — ორჯერ დამუშავება არ გვინდა
      setItems((cur) => cur.filter((i) => i.status !== 'pending'))
      toast({ title: t('queue.handedOff', { count: pendingItems.length }) })
    } catch (e) {
      toast({ title: errorMessage(e), variant: 'error' })
    } finally {
      setHandingOff(false)
    }
  }

  // refresh/close გაფრთხილება, სანამ რიგი აქტიურია
  React.useEffect(() => {
    if (!isBusy) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isBusy])

  const queuedIds = React.useMemo(
    () =>
      new Set(
        items
          .filter((i) => i.kind === 'add' && (i.status === 'pending' || i.status === 'running'))
          .map((i) => `${i.mediaType}:${i.tmdbId}`),
      ),
    [items],
  )
  const isQueued = React.useCallback(
    (tmdbId: number, mediaType: MediaType = 'movie') => queuedIds.has(`${mediaType}:${tmdbId}`),
    [queuedIds],
  )

  const api = React.useMemo<QueueApi>(
    () => ({
      enqueue,
      enqueueSync,
      enqueueGallery,
      enqueueTranslate,
      enqueuePurge,
      isQueued,
      active,
      isBusy,
      cancelPending,
    }),
    [
      enqueue,
      enqueueSync,
      enqueueGallery,
      enqueueTranslate,
      enqueuePurge,
      isQueued,
      active,
      isBusy,
      cancelPending,
    ],
  )

  const total = items.length
  const done = items.filter((i) => i.status === 'done').length
  const errors = items.filter((i) => i.status === 'error').length
  const running = items.find((i) => i.status === 'running')
  /** სათაურის სახეობა — შერეულ რიგში ყველაზე „ხმამაღალი" იმარჯვებს */
  const headlineKind: QKind =
    (['purge', 'gallery', 'translate', 'sync'] as QKind[]).find((k) => items.some((i) => i.kind === k)) ?? 'add'

  /**
   * დარჩენილი დრო — დასრულებულების საშუალო × დარჩენილი + **თითოეულის პაუზა**.
   * პაუზა სახეობაზეა მიბმული (`paceOf`), ე.ი. შერეული რიგიც სწორად ითვლება:
   * თარგმანი შეიძლება 5 წმ-ზე იდგეს, სინქრონი — 0.2-ზე.
   */
  const remaining = React.useMemo(() => {
    const timed = items.filter((i) => i.ms != null)
    if (!timed.length || !active) return null
    const avg = timed.reduce((s, i) => s + (i.ms ?? 0), 0) / timed.length
    const ms = items
      .filter((i) => i.status === 'pending' || i.status === 'running')
      .reduce((s, i) => s + avg + paceOf(i.kind), 0)
    return Math.round(ms / 1000)
  }, [items, active, paceOf])

  const fmt = (s: number) => (s < 60 ? `${s}${t('queue.sec')}` : `${Math.round(s / 60)}${t('queue.min')}`)

  return (
    <QueueContext.Provider value={api}>
      {children}

      {/* ⚠️ `--player-h` — დამკვრელის ზოლი (§7.2) ქვემოთ დგას; ცვლადი მხოლოდ
          მაშინ არსებობს, როცა რამე უკრავს, სხვა დროს `bottom-4` რჩება. */}
      {total > 0 && (
        <div className="fb-toast pointer-events-auto fixed bottom-[calc(1rem+var(--player-h,0px))] right-4 z-[70] w-[calc(100vw-2rem)] max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          {/* header — ერთ ხაზზე; მთელი ზოლი ჩაკეცვა/ამოკეცვის ტოგლია */}
          <div className="flex items-center gap-2 pr-2">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              title={t('queue.details')}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-muted/50"
            >
              <span className="shrink-0">
                {isBusy ? (
                  <Loader2 className="size-4 animate-spin text-status-watching" />
                ) : errors ? (
                  <AlertCircle className="size-4 text-destructive" />
                ) : (
                  <Check className="size-4 text-status-watched" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {t(HEADLINES[headlineKind][isBusy ? 'busy' : 'done'])}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {done}/{total}
                    {errors > 0 && ` · ${t('queue.failed', { count: errors })}`}
                    {remaining != null && ` · ~${fmt(remaining)}`}
                  </span>
                </p>
                {/* მიმდინარე ჩანაწერის სახელი (J3) */}
                {running && <p className="truncate text-xs text-muted-foreground">{running.title}</p>}
              </span>
              <span className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground">
                {expanded ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
              </span>
            </button>
            {!isBusy && (
              <button
                onClick={() => setItems([])}
                aria-label="dismiss"
                className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* ამოშლილი სია — რომელი მუშავდება ახლა, რომელია რიგში */}
          {expanded && (
            <div className="max-h-80 overflow-y-auto border-t border-border">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-2.5 px-3.5 py-2">
                  <span className="grid size-4 shrink-0 place-items-center">
                    {it.status === 'running' ? (
                      <Loader2 className="size-3.5 animate-spin text-status-watching" />
                    ) : it.status === 'done' ? (
                      it.skipped ? (
                        <SkipForward className="size-3.5 text-muted-foreground" />
                      ) : (
                        <Check className="size-3.5 text-status-watched" />
                      )
                    ) : it.status === 'error' ? (
                      <AlertCircle className="size-3.5 text-destructive" />
                    ) : (
                      <Clock className="size-3.5 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-sm',
                        it.status === 'done' && 'text-muted-foreground line-through',
                      )}
                    >
                      {it.title}
                    </span>
                    {/* ჩავარდნის მიზეზი — რომ ბრმად არ ვცადოთ ხელახლა (J5) */}
                    {it.status === 'error' && (
                      <span className="block truncate text-xs text-destructive">
                        {it.error === 'cancelled'
                          ? t('queue.cancelled')
                          : it.error === 'quota'
                            ? t('queue.quotaStopped')
                            : it.error || t('toast.error')}
                      </span>
                    )}
                  </span>
                  {it.status === 'pending' && (
                    <button
                      onClick={() => cancelOne(it.id)}
                      aria-label={t('queue.cancelOne')}
                      title={t('queue.cancelOne')}
                      className="grid size-5 shrink-0 cursor-pointer place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}

              {/* §D1 — **სერვერზე გადაცემა.** კლიენტის რიგი ტაბის დახურვაზე
                  ჩერდება; ეს ღილაკი დარჩენილ ერთეულებს სერვერს აბარებს და
                  ბრაუზერი აღარაფერს წყვეტს. ⚠️ ჩანს მხოლოდ მაშინ, როცა
                  დარჩენილში **გადასატანი სახის** სამუშაოა: `add` და `purge`
                  ფონურად არ მიდის (პირველი მყისიერია, მეორე დესტრუქციული). */}
              {handoffKind && (
                <div className="border-t border-border p-2">
                  <button
                    onClick={handOff}
                    disabled={handingOff}
                    className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
                  >
                    {handingOff ? <Loader2 className="size-3.5 animate-spin" /> : <Server className="size-3.5" />}
                    {t('queue.handOff')}
                  </button>
                </div>
              )}

              {(active > 0 || errors > 0) && (
                <div className="flex gap-2 border-t border-border p-2">
                  {errors > 0 && (
                    <button
                      onClick={retryFailed}
                      className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <RotateCcw className="size-3.5" />
                      {t('queue.retryFailed', { count: errors })}
                    </button>
                  )}
                  {active > 0 && (
                    <button
                      onClick={cancelPending}
                      className="flex-1 cursor-pointer rounded-md px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      {t('queue.cancel')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </QueueContext.Provider>
  )
}
