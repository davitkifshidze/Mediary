import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Check, ChevronDown, ChevronUp, Clock, Loader2, RotateCcw, SkipForward, X } from 'lucide-react'
import { mediaApi, syncItem, type SyncOptions, type SyncPlanItem } from '@/api/media'
import type { MediaType } from '@/lib/media'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'

/* ============================================================
   Queue — ფონური, არაბლოკირებადი რიგი ორი სახის სამუშაოსთვის:
     • `add`  — TMDB id-ით ჩანაწერის დამატება (აღმოაჩინე / მსახიობის გვერდი);
     • `sync` — არსებული ჩანაწერის სინქრონი (Tasks J3) — თითო ჩანაწერი = თითო
       მოკლე რექვესთი, ამიტომ სერვერი არ იბლოკება და გაჩერებაც შესაძლებელია.
   ნავიგაცია არ იბლოკება (რიგი გლობალურია); refresh/close კი აფრთხილებს.
   ============================================================ */

type QStatus = 'pending' | 'running' | 'done' | 'error'
type QKind = 'add' | 'sync'

interface QItem {
  id: number
  kind: QKind
  title: string
  mediaType: MediaType
  status: QStatus
  /** add — TMDB id */
  tmdbId?: number
  /** sync — ლოკალური ჩანაწერის id + პარამეტრები */
  itemId?: number
  opts?: SyncOptions
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
  isQueued: (tmdbId: number, mediaType?: MediaType) => boolean
  active: number
  isBusy: boolean
  /** დარჩენილის გაჩერება + მიმდინარე რექვესთის გაუქმება */
  cancelPending: () => void
}

const QueueContext = React.createContext<QueueApi>({
  enqueue: () => {},
  enqueueSync: () => {},
  isQueued: () => false,
  active: 0,
  isBusy: false,
  cancelPending: () => {},
})

export function useQueue() {
  return React.useContext(QueueContext)
}

let nextId = 1

export function QueueProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<QItem[]>([])
  const [expanded, setExpanded] = React.useState(false)
  const [tick, setTick] = React.useState(0)
  const qc = useQueryClient()
  const { t } = useTranslation()
  const { settings } = useSettings()
  const runningRef = React.useRef(false)
  const abortRef = React.useRef<AbortController | null>(null)
  const delayRef = React.useRef(settings.syncDelayMs)
  delayRef.current = settings.syncDelayMs

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

    const job: Promise<{ ok: boolean; error?: string; skipped?: boolean }> =
      next.kind === 'add'
        ? mediaApi(next.mediaType)
            .addFromTmdb(next.tmdbId!)
            .then(() => ({ ok: true }))
        : syncItem(next.mediaType, next.itemId!, next.opts ?? {}, ctrl.signal).then((r) => ({
            ok: r.ok,
            error: r.error ?? undefined,
            skipped: r.skipped,
          }))

    job
      .then(({ ok, error, skipped }) => {
        ;[next.mediaType, 'discover', 'actor', 'collection', 'genres', 'genre-items'].forEach((k) =>
          qc.invalidateQueries({ queryKey: [k] }),
        )
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
      .catch((e: { code?: string; message?: string }) => {
        const cancelled = ctrl.signal.aborted || e?.code === 'ERR_CANCELED'
        setItems((cur) =>
          cur.map((i) =>
            i.id === next.id
              ? {
                  ...i,
                  status: 'error',
                  error: cancelled ? 'cancelled' : e?.message,
                  ms: performance.now() - started,
                }
              : i,
          ),
        )
      })
      .finally(() => {
        abortRef.current = null
        // TMDB-ის rate-limit — პაუზა ჩანაწერებს შორის (პარამეტრებიდან, J5)
        const delay = next.kind === 'sync' ? delayRef.current : 0
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
    () => ({ enqueue, enqueueSync, isQueued, active, isBusy, cancelPending }),
    [enqueue, enqueueSync, isQueued, active, isBusy, cancelPending],
  )

  const total = items.length
  const done = items.filter((i) => i.status === 'done').length
  const errors = items.filter((i) => i.status === 'error').length
  const running = items.find((i) => i.status === 'running')
  const isSync = items.some((i) => i.kind === 'sync')

  // დარჩენილი დრო — დასრულებულების საშუალო × დარჩენილი (+ პაუზა)
  const remaining = React.useMemo(() => {
    const timed = items.filter((i) => i.ms != null)
    if (!timed.length || !active) return null
    const avg = timed.reduce((s, i) => s + (i.ms ?? 0), 0) / timed.length
    const perItem = avg + (isSync ? settings.syncDelayMs : 0)
    return Math.round((perItem * active) / 1000)
  }, [items, active, isSync, settings.syncDelayMs])

  const fmt = (s: number) => (s < 60 ? `${s}${t('queue.sec')}` : `${Math.round(s / 60)}${t('queue.min')}`)

  return (
    <QueueContext.Provider value={api}>
      {children}

      {total > 0 && (
        <div className="fb-toast pointer-events-auto fixed bottom-4 right-4 z-[70] w-[calc(100vw-2rem)] max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-lg">
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
                  {isBusy
                    ? isSync
                      ? t('queue.syncing')
                      : t('queue.adding')
                    : isSync
                      ? t('queue.syncDone')
                      : t('queue.doneTitle')}
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
                        {it.error === 'cancelled' ? t('queue.cancelled') : it.error || t('toast.error')}
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
