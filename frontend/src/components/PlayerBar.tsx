import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ListMusic,
  Music,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react'
import { storageUrl } from '@/lib/api'
import { LAYER_PLAYER } from '@/lib/layers'
import { usePlayer } from '@/lib/player'
import { formatDuration } from '@/lib/videoDuration'
import { PlayerStage } from '@/components/PlayerStage'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/* ============================================================
   ქვედა ზოლი — ერთი დამკვრელი მთელ აპზე (Tasks §7.2).

   ⚠️ `AppShell`-შია ჩამონტაჟებული და არა გვერდზე: მარშრუტის შეცვლაზე რომ
   იშლებოდეს, „პლეილისტი ბოლომდე დაუკრავს"-ს ვერ დავპირდებოდით.

   ⚠️ სცენა ორივე მდგომარეობაში **ერთსა და იმავე ადგილას დგას ხეში** და
   მხოლოდ ზომა ეცვლება. მისი სხვა კონტეინერში გადატანა React-ისთვის ახალი
   ელემენტია, ე.ი. ფრეიმი თავიდან ჩაიტვირთებოდა და დაკვრა თავიდან დაიწყებდა.
   ============================================================ */

export function PlayerBar() {
  const { t } = useTranslation()
  const player = usePlayer()
  const [queueOpen, setQueueOpen] = useState(false)

  const { current, queue, index, playing, expanded } = player
  if (!current) return null

  const cover = storageUrl(current.thumbnail)
  const duration = formatDuration(current.duration)

  return (
    <div className={cn('fixed inset-x-0 bottom-0', LAYER_PLAYER)}>
      <div className="relative border-t border-border bg-card/95 px-3 py-2 shadow-[0_-2px_12px_rgba(0,0,0,0.12)] backdrop-blur">
        {/* ---------- რიგი ----------
            ⚠️ ზემოთ იშლება (`bottom-full`) და არა ზოლის შიგნით: შიგნით ზოლის
            სიმაღლე შეიცვლებოდა, `--player-h` კი იმავე რიცხვს ეუბნებოდა
            გვერდს — ე.ი. ქვედა ჩანაწერი ზოლის უკან მოექცეოდა. */}
        {queueOpen && (
          <ol className="absolute bottom-full right-3 mb-2 max-h-64 w-80 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg">
            {queue.map((item, i) => (
              <li key={`${item.kind}-${item.id}`}>
                <button
                  onClick={() => player.jumpTo(i)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted',
                    i === index && 'bg-muted font-medium',
                  )}
                >
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  {item.subtitle && (
                    <span className="max-w-[8rem] shrink-0 truncate text-xs text-muted-foreground">
                      {item.subtitle}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
        )}

        <div className="flex items-center gap-3">
          {/* ---------- სცენა ---------- */}
          <PlayerStage
            item={current}
            playing={playing}
            onEvent={player.report}
            className={cn(
              'shrink-0 transition-[height,width]',
              expanded ? 'h-36 w-64' : 'h-12 w-[5.3rem]',
            )}
          />

          {/* ---------- რა უკრავს ---------- */}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2">
              {cover && !expanded && (
                <img src={cover} alt="" loading="lazy" className="size-6 shrink-0 rounded object-cover" />
              )}
              <span className="min-w-0 truncate text-sm font-medium" title={current.title}>
                {current.title}
              </span>
            </p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 truncate text-xs text-muted-foreground">
              {current.subtitle && <span className="truncate">{current.subtitle}</span>}
              {player.source && (
                <span className="inline-flex items-center gap-1 truncate">
                  <Music className="size-3 shrink-0" />
                  {player.source}
                </span>
              )}
              {queue.length > 1 && (
                <span className="tabular-nums">
                  {t('playback.position', { index: index + 1, total: queue.length })}
                </span>
              )}
              {duration && <span className="tabular-nums">{duration}</span>}
            </p>
          </div>

          {/* ---------- მართვა ---------- */}
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              disabled={index === 0}
              onClick={player.prev}
              aria-label={t('playback.prev')}
              title={t('playback.prev')}
            >
              <SkipBack className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={player.toggle}
              aria-label={t(playing ? 'playback.pause' : 'playback.play')}
              title={t(playing ? 'playback.pause' : 'playback.play')}
            >
              {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={index >= queue.length - 1}
              onClick={player.next}
              aria-label={t('playback.next')}
              title={t('playback.next')}
            >
              <SkipForward className="size-4" />
            </Button>

            {queue.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setQueueOpen((v) => !v)}
                aria-label={t('playback.queue')}
                title={t('playback.queue')}
                className={cn(queueOpen && 'bg-muted')}
              >
                <ListMusic className="size-4" />
              </Button>
            )}
            <a
              href={current.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('playback.openSource')}
              title={t('playback.openSource')}
              className="grid size-10 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ExternalLink className="size-4" />
            </a>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => player.setExpanded(!expanded)}
              aria-label={t(expanded ? 'playback.collapse' : 'playback.expand')}
              title={t(expanded ? 'playback.collapse' : 'playback.expand')}
            >
              {expanded ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setQueueOpen(false)
                player.close()
              }}
              aria-label={t('playback.close')}
              title={t('playback.close')}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
