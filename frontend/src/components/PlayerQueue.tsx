import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, AudioLines, ExternalLink, ListMusic, ListVideo, ListX, Music, Play, Video } from 'lucide-react'
import { storageUrl } from '@/lib/api'
import { dragRowClass, useDragReorder, type DragReorder } from '@/lib/dragReorder'
import { usePlayer, type PlayerLayout, type QueueEntry } from '@/lib/player'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/videoDuration'
import { ActionMenu, ActionMenuClose, actionItemClass } from '@/components/ui/action-menu'
import { DragHandle } from '@/components/ui/drag-handle'

/* ============================================================
   დამკვრელის რიგი — YouTube-ის ფლეილისტის ყალიბით (Tasks §35.2).

   შენი სიტყვები: „ჩანდეს, რომელია შემდეგი და რომელზე ვდგავართ,
   YouTube-ის ფლეილისტის მსგავსად".

   ⚠️ **ერთი სია ორივე განლაგებაში.** გვერდით პანელში რიგი პანელის ქვედა
   ნაწილია, ქვედა ზოლზე — ზემოთ ამოსახტომი; რიგები ერთნაირია, ე.ი.
   „მიმდინარე", „შემდეგი" და მოქმედებები ორ ადგილას არ იწერება.

   ⚠️ **სია მიმდინარეზე თვითონ გადაიხვევა** — ოღონდ მხოლოდ **სიის შიგნით**
   (`scrollTo` თვითონ `<ol>`-ზე). `scrollIntoView` ყველა წინაპარს
   გადაახვევდა, ე.ი. ტრეკის შეცვლაზე მთელი გვერდი ახტებოდა.

   ⚠️ **გადალაგება `useDragReorder`-ითაა + „ერთით წინ/უკან" მენიუში** —
   native drag & drop კლავიატურით მიუწვდომელია (პროექტის წესი).
   ============================================================ */

export function PlayerQueue({ layout }: { layout: PlayerLayout }) {
  const { t } = useTranslation()
  const player = usePlayer()
  const { queue, index, playing, source, current } = player
  const side = layout === 'side'

  const uids = useMemo(() => queue.map((entry) => entry.uid), [queue])
  const drag = useDragReorder(uids, player.reorder)

  const listRef = useRef<HTMLOListElement>(null)
  const scrolled = useRef(false)
  const currentUid = current?.uid ?? null

  /* ---------- მიმდინარეზე გადახვევა ----------
     ⚠️ პირველად — მყისიერად (სია ახლახან გამოჩნდა და „მოცურება" ზემოდან
     ხტუნვად აღიქმებოდა), შემდეგ — რბილად. ⚠️ `scrollTo` jsdom-ს არ აქვს,
     ამიტომ მისი არქონა უბრალოდ `scrollTop`-ის ჩაწერაა. */
  useEffect(() => {
    const list = listRef.current
    if (!list || currentUid === null) return
    const row = list.querySelector<HTMLElement>(`[data-uid="${currentUid}"]`)
    if (!row) return

    const top = Math.max(row.offsetTop - 4, 0)
    const behavior: ScrollBehavior = scrolled.current ? 'smooth' : 'auto'
    scrolled.current = true
    if (typeof list.scrollTo === 'function') list.scrollTo({ top, behavior })
    else list.scrollTop = top
  }, [currentUid])

  const Icon = current && current.kind !== 'song' ? ListVideo : ListMusic

  return (
    <section
      aria-label={t('playback.queue')}
      className={cn(
        'flex min-h-0 flex-col',
        side
          ? 'flex-1'
          : 'absolute bottom-full right-3 mb-2 max-h-[min(28rem,60vh)] w-[26rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-border bg-card shadow-lg',
      )}
    >
      {/* ---------- სათაური: საიდანაა რიგი და სად ვდგავართ ---------- */}
      <header className="flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-2.5">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{source ?? t('playback.queue')}</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {t('playback.queue')} · {t('playback.position', { index: index + 1, total: queue.length })}
          </p>
        </div>
      </header>

      <ol ref={listRef} className="fb-scroll relative min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5">
        {queue.map((entry, i) => (
          <QueueRow
            key={entry.uid}
            entry={entry}
            position={i}
            last={i === queue.length - 1}
            active={i === index}
            upNext={index >= 0 && i === index + 1}
            playing={playing}
            drag={drag}
            onJump={() => player.jumpTo(i)}
            onRemove={() => player.remove(entry.uid)}
          />
        ))}
      </ol>
    </section>
  )
}

function QueueRow({
  entry,
  position,
  last,
  active,
  upNext,
  playing,
  drag,
  onJump,
  onRemove,
}: {
  entry: QueueEntry
  position: number
  last: boolean
  active: boolean
  upNext: boolean
  playing: boolean
  drag: DragReorder<number>
  onJump: () => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const thumb = storageUrl(entry.thumbnail)
  const time = formatDuration(entry.duration)
  const Fallback = entry.kind === 'song' ? Music : Video

  return (
    <li
      data-uid={entry.uid}
      {...drag.handlers(entry.uid)}
      className={cn(
        'group flex items-center gap-1 rounded-lg border px-1 py-1',
        dragRowClass(drag, entry.uid, 'border-transparent'),
        active ? 'bg-primary/10' : 'hover:bg-muted/60',
      )}
    >
      <DragHandle className="opacity-40 transition-opacity group-hover:opacity-100" />

      {/* ⚠️ მენიუ ღილაკის **გარეთაა** — ჩადგმული ინტერაქტიული ელემენტი
          არასწორი HTML-ია და ერთი დაჭერა ორივეს გაუშვებდა */}
      <button
        type="button"
        onClick={onJump}
        aria-current={active ? 'true' : undefined}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
      >
        {/* მიმდინარე — ხატულა (უკრავს / პაუზაზეა), დანარჩენი — ნომერი */}
        <span className="flex w-5 shrink-0 justify-center text-xs tabular-nums text-muted-foreground">
          {active ? (
            playing ? (
              <AudioLines className="size-3.5 text-primary" />
            ) : (
              <Play className="size-3 fill-current text-primary" />
            )
          ) : (
            position + 1
          )}
        </span>

        <span className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
          {thumb ? (
            // ⚠️ `draggable={false}` — სურათი თავისთავად ითრევა და რიგის ნაცვლად ბმულს წაიღებდა
            <img
              src={thumb}
              alt=""
              loading="lazy"
              draggable={false}
              referrerPolicy="no-referrer"
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center text-muted-foreground">
              <Fallback className="size-4" />
            </span>
          )}
          {time && (
            <span className="absolute bottom-0.5 right-0.5 rounded bg-black/75 px-1 text-[10px] leading-4 tabular-nums text-white">
              {time}
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className={cn('line-clamp-2 text-[13px] leading-snug', active && 'font-semibold')} title={entry.title}>
            {entry.title}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {/* ⚠️ „სად ვდგავართ" და „რა მოდის" **სიტყვითაც** ითქმის და არა მხოლოდ
                ფონით — ფერი მარტო ფერის აღქმის გარეშე არაფერს ამბობს */}
            {active && (
              <span className="shrink-0 rounded bg-primary/15 px-1.5 py-px text-[10px] font-medium text-primary">
                {t(playing ? 'playback.nowPlaying' : 'playback.paused')}
              </span>
            )}
            {upNext && (
              <span className="shrink-0 rounded bg-secondary px-1.5 py-px text-[10px] font-medium text-foreground">
                {t('playback.upNext')}
              </span>
            )}
            {entry.subtitle && <span className="truncate">{entry.subtitle}</span>}
          </span>
        </span>
      </button>

      {/* ⚠️ რასაც ვერ გააკეთებ, ის არ იხატება (და არა გამორთულად) — პირველს „წინ" არ აქვს */}
      <ActionMenu label={t('playback.itemActions')}>
        {position > 0 && (
          <ActionMenuClose asChild>
            <button type="button" onClick={() => drag.moveBy(entry.uid, -1)} className={actionItemClass()}>
              <ArrowUp className="size-4" />
              {t('playback.moveEarlier')}
            </button>
          </ActionMenuClose>
        )}
        {!last && (
          <ActionMenuClose asChild>
            <button type="button" onClick={() => drag.moveBy(entry.uid, 1)} className={actionItemClass()}>
              <ArrowDown className="size-4" />
              {t('playback.moveLater')}
            </button>
          </ActionMenuClose>
        )}
        {entry.url && (
          <a href={entry.url} target="_blank" rel="noopener noreferrer" className={actionItemClass()}>
            <ExternalLink className="size-4" />
            {t('playback.openSource')}
          </a>
        )}
        <ActionMenuClose asChild>
          <button type="button" onClick={onRemove} className={actionItemClass('destructive')}>
            <ListX className="size-4" />
            {t('playback.removeFromQueue')}
          </button>
        </ActionMenuClose>
      </ActionMenu>
    </li>
  )
}
