import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Check, ChevronDown, ChevronUp, Clock, Loader2, X } from 'lucide-react'
import { mediaApi } from '@/api/media'
import type { MediaType } from '@/lib/media'
import { cn } from '@/lib/utils'

/* ============================================================
   Queue — ფონური, არაბლოკირებადი ფილმის დამატების რიგი.
   enqueue-ს დაუყოვნებლივ ვამატებთ; მუშავდება თანმიმდევრობით.
   ნავიგაცია არ იბლოკება (რიგი გლობალურია); refresh/close კი აფრთხილებს.
   ============================================================ */

type QStatus = 'pending' | 'running' | 'done' | 'error'
interface QItem {
  id: number
  tmdbId: number
  title: string
  mediaType: MediaType
  status: QStatus
}

interface QueueApi {
  enqueue: (items: { tmdbId: number; title: string }[], mediaType?: MediaType) => void
  isQueued: (tmdbId: number, mediaType?: MediaType) => boolean
  active: number
  isBusy: boolean
  cancelPending: () => void
}

const QueueContext = React.createContext<QueueApi>({
  enqueue: () => {},
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
  const qc = useQueryClient()
  const { t } = useTranslation()
  const runningRef = React.useRef(false)

  const enqueue = React.useCallback(
    (toAdd: { tmdbId: number; title: string }[], mediaType: MediaType = 'movie') => {
      setItems((cur) => {
        const busy = new Set(
          cur
            .filter((i) => i.status === 'pending' || i.status === 'running')
            .map((i) => `${i.mediaType}:${i.tmdbId}`),
        )
        const fresh = toAdd
          .filter((a) => !busy.has(`${mediaType}:${a.tmdbId}`))
          .map((a) => ({
            id: nextId++,
            tmdbId: a.tmdbId,
            title: a.title,
            mediaType,
            status: 'pending' as QStatus,
          }))
        return fresh.length ? [...cur, ...fresh] : cur
      })
    },
    [],
  )

  const cancelPending = React.useCallback(() => {
    setItems((cur) => cur.filter((i) => i.status !== 'pending'))
  }, [])

  const cancelOne = React.useCallback((qid: number) => {
    setItems((cur) => cur.filter((i) => !(i.id === qid && i.status === 'pending')))
  }, [])

  // თანმიმდევრული დამმუშავებელი
  React.useEffect(() => {
    if (runningRef.current) return
    const next = items.find((i) => i.status === 'pending')
    if (!next) return

    runningRef.current = true
    setItems((cur) => cur.map((i) => (i.id === next.id ? { ...i, status: 'running' } : i)))

    mediaApi(next.mediaType)
      .addFromTmdb(next.tmdbId)
      .then(() => {
        ;[next.mediaType, 'discover', 'actor', 'collection', 'genres'].forEach((k) =>
          qc.invalidateQueries({ queryKey: [k] }),
        )
        setItems((cur) => cur.map((i) => (i.id === next.id ? { ...i, status: 'done' } : i)))
      })
      .catch(() => {
        setItems((cur) => cur.map((i) => (i.id === next.id ? { ...i, status: 'error' } : i)))
      })
      .finally(() => {
        runningRef.current = false
      })
  }, [items, qc])

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
          .filter((i) => i.status === 'pending' || i.status === 'running')
          .map((i) => `${i.mediaType}:${i.tmdbId}`),
      ),
    [items],
  )
  const isQueued = React.useCallback(
    (tmdbId: number, mediaType: MediaType = 'movie') => queuedIds.has(`${mediaType}:${tmdbId}`),
    [queuedIds],
  )

  const api = React.useMemo<QueueApi>(
    () => ({ enqueue, isQueued, active, isBusy, cancelPending }),
    [enqueue, isQueued, active, isBusy, cancelPending],
  )

  const total = items.length
  const done = items.filter((i) => i.status === 'done').length
  const errors = items.filter((i) => i.status === 'error').length

  return (
    <QueueContext.Provider value={api}>
      {children}

      {total > 0 && (
        <div className="fb-toast pointer-events-auto fixed bottom-4 right-4 z-[70] w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          {/* header — ერთ ხაზზე */}
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span className="shrink-0">
              {isBusy ? (
                <Loader2 className="size-4 animate-spin text-status-watching" />
              ) : errors ? (
                <AlertCircle className="size-4 text-destructive" />
              ) : (
                <Check className="size-4 text-status-watched" />
              )}
            </span>
            <p className="min-w-0 flex-1 truncate text-sm font-medium">
              {isBusy ? t('queue.adding') : t('queue.doneTitle')}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {done}/{total}
                {errors > 0 && ` · ${t('queue.failed', { count: errors })}`}
              </span>
            </p>
            <button
              onClick={() => setExpanded((e) => !e)}
              aria-label={t('queue.details')}
              title={t('queue.details')}
              className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {expanded ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
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

          {/* ამოშლილი სია — რომელი ემატება ახლა, რომელია რიგში */}
          {expanded && (
            <div className="max-h-56 overflow-y-auto border-t border-border">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="grid size-4 shrink-0 place-items-center">
                    {it.status === 'running' ? (
                      <Loader2 className="size-3.5 animate-spin text-status-watching" />
                    ) : it.status === 'done' ? (
                      <Check className="size-3.5 text-status-watched" />
                    ) : it.status === 'error' ? (
                      <AlertCircle className="size-3.5 text-destructive" />
                    ) : (
                      <Clock className="size-3.5 text-muted-foreground" />
                    )}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-xs',
                      it.status === 'done' && 'text-muted-foreground line-through',
                    )}
                  >
                    {it.title}
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

              {active > 0 && (
                <div className="border-t border-border p-2">
                  <button
                    onClick={cancelPending}
                    className="w-full cursor-pointer rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    {t('queue.cancel')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </QueueContext.Provider>
  )
}
