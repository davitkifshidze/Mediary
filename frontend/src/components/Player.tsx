import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ListMusic,
  Music,
  PanelRightClose,
  PanelRightOpen,
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
import { PlayerQueue } from '@/components/PlayerQueue'
import { PlayerStage } from '@/components/PlayerStage'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/* ============================================================
   დამკვრელი — ერთი მთელ აპზე, ორი განლაგებით (Tasks §7.2 → §35).

   შენი სიტყვები: „„ყველას დაკვრისას" რაც იკვრება, ახლა ქვემოთ ზოლად
   ჩამოდის; მინდა, რომ მარჯვნივ, გვერდზე გამოვიდეს — ჩანდეს, რომელია შემდეგი
   და რომელზე ვდგავართ, YouTube-ის ფლეილისტის მსგავსად".

   - **გვერდითა პანელი** (ფართო ეკრანზე, `PANEL_MIN_VIEWPORT`-იდან): ზემოთ
     ვიდეო 16:9, ქვემოთ რიგი. გვერდს **აწვება** — `<main>` და ჰედერი
     `--player-w`-ს მარჯვენა `padding`-ად კითხულობენ, ე.ი. არაფერი იფარება (Q26).
   - **ქვედა ზოლი** — ვიწრო ეკრანზე და როცა პანელი ხელით ჩაკეცე; ეს
     არჩევანი ახსოვს (`lib/player.tsx`-ის `dock`).

   ⚠️ **სცენა ორივე განლაგებაში ერთსა და იმავე ადგილას დგას ხეში** (§35.3):
   `<aside>`-ის პირველი შვილის `<div>`-ში. განლაგება **მხოლოდ კლასებით**
   იცვლება — სხვა კონტეინერში გადატანა React-ისთვის ახალი ელემენტი იქნებოდა,
   ე.ი. ფრეიმი თავიდან ჩაიტვირთებოდა და დაკვრა თავიდან დაიწყებდა. ამიტომაა
   `<aside>`-ის შვილები ორივეგან ერთი რიგით და პირობითი ნაწილები მხოლოდ
   **ბოლოში** ან `&&`-ით — ადგილს არავის ართმევენ.

   ⚠️ `AppShell`-შია ჩამონტაჟებული და არა გვერდზე: მარშრუტის შეცვლაზე რომ
   იშლებოდეს, „პლეილისტი ბოლომდე დაუკრავს"-ს ვერ დავპირდებოდით.
   ============================================================ */

export function Player() {
  const { t } = useTranslation()
  const player = usePlayer()
  const [queueOpen, setQueueOpen] = useState(false)

  const { current, queue, index, playing, expanded, layout, wide } = player
  if (!current || !layout) return null

  const side = layout === 'side'
  const cover = storageUrl(current.thumbnail)
  const duration = formatDuration(current.duration)
  const many = queue.length > 1

  return (
    <aside
      data-player
      data-layout={layout}
      aria-label={t('playback.player')}
      className={cn(
        'fb-player fixed flex',
        LAYER_PLAYER,
        side
          ? 'bottom-0 right-0 top-14 w-[var(--player-w)] flex-col border-l border-border bg-card'
          : 'inset-x-0 bottom-0 items-center gap-3 border-t border-border bg-card/95 px-3 py-2 shadow-[0_-2px_12px_rgba(0,0,0,0.12)] backdrop-blur',
      )}
    >
      {/* ---------- სცენა (ყოველთვის პირველი შვილი — იხ. ზემოთ) ---------- */}
      <div className={side ? 'shrink-0 px-3 pt-3' : 'shrink-0'}>
        <PlayerStage
          item={current}
          playing={playing}
          onEvent={player.report}
          className={cn(
            side
              ? 'aspect-video w-full'
              : cn('transition-[height,width]', expanded ? 'h-36 w-64' : 'h-12 w-[5.3rem]'),
          )}
        />
      </div>

      {/* ---------- რა უკრავს + მართვა ---------- */}
      <div
        className={
          side ? 'shrink-0 border-b border-border px-3 pb-2 pt-3' : 'flex min-w-0 flex-1 items-center gap-3'
        }
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            {cover && !side && !expanded && (
              <img src={cover} alt="" loading="lazy" className="size-6 shrink-0 rounded object-cover" />
            )}
            <span
              className={cn('min-w-0 font-medium', side ? 'line-clamp-2 text-[15px] leading-snug' : 'truncate text-sm')}
              title={current.title}
            >
              {current.title}
            </span>
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 truncate text-xs text-muted-foreground">
            {current.subtitle && <span className="truncate">{current.subtitle}</span>}
            {/* გვერდით პანელში წყარო და ადგილი რიგის სათაურშია — აქ ორჯერ არ ვწერთ */}
            {!side && player.source && (
              <span className="inline-flex items-center gap-1 truncate">
                <Music className="size-3 shrink-0" />
                {player.source}
              </span>
            )}
            {!side && many && (
              <span className="tabular-nums">
                {t('playback.position', { index: index + 1, total: queue.length })}
              </span>
            )}
            {duration && <span className="tabular-nums">{duration}</span>}
          </p>
        </div>

        <div className={cn('flex shrink-0 items-center gap-0.5', side && '-mx-2 mt-1.5')}>
          <Button
            variant="ghost"
            size="icon"
            disabled={index <= 0}
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

          {side && <span className="flex-1" />}

          {/* ქვედა ზოლზე რიგი ზემოთ ამოსახტომია; პანელში ის ისედაც ჩანს */}
          {!side && many && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setQueueOpen((v) => !v)}
              aria-label={t('playback.queue')}
              aria-pressed={queueOpen}
              title={t('playback.queue')}
              className={cn(queueOpen && 'text-primary')}
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
            className="grid size-10 place-items-center rounded-md text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-4" />
          </a>

          {/* ⚠️ ფართო ეკრანზე ღილაკი **განლაგებას** ცვლის (პანელი ↔ ზოლი) და
              არჩევანი ახსოვს; ვიწროზე პანელი ვერ დაეტევა, ე.ი. იქ ზოლის სცენა იზრდება. */}
          {wide ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => player.setDock(side ? 'bar' : 'side')}
              aria-label={t(side ? 'playback.toBar' : 'playback.toSide')}
              title={t(side ? 'playback.toBar' : 'playback.toSide')}
            >
              {side ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => player.setExpanded(!expanded)}
              aria-label={t(expanded ? 'playback.collapse' : 'playback.expand')}
              title={t(expanded ? 'playback.collapse' : 'playback.expand')}
            >
              {expanded ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
            </Button>
          )}
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

      {/* ---------- რიგი ----------
          ⚠️ ზოლზე ზემოთ იშლება (`bottom-full`) და არა ზოლის შიგნით: შიგნით
          ზოლის სიმაღლე შეიცვლებოდა, `--player-h` კი იმავე რიცხვს ეუბნებოდა
          გვერდს — ე.ი. ქვედა ჩანაწერი ზოლის უკან მოექცეოდა. */}
      {(side || (queueOpen && many)) && <PlayerQueue layout={layout} />}
    </aside>
  )
}
