import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AppWindow,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GripVertical,
  ListMusic,
  MessageCircle,
  MoveDiagonal2,
  Music,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  PictureInPicture2,
  Play,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react'
import { storageUrl } from '@/lib/api'
import { LAYER_PLAYER, LAYER_PLAYER_TOP } from '@/lib/layers'
import { PANEL_MIN_WIDTH, reportProgress, usePlaybackProgress, usePlayer, type PlayerLayout } from '@/lib/player'
import {
  BUBBLE,
  EDGE,
  clampBubble,
  clampFrame,
  clipInset,
  handleOnLeft,
  pickLift,
  readBubble,
  readFrame,
  resizeFrame,
  saveBubble,
  saveFrame,
  snapBubble,
  viewport,
  type BubbleSpot,
  type FrameBox,
} from '@/lib/playerFrame'
import { formatDuration } from '@/lib/videoDuration'
import { PlayerQueue } from '@/components/PlayerQueue'
import { PlayerStage } from '@/components/PlayerStage'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/* ============================================================
   დამკვრელი — ერთი მთელ აპზე (Tasks §7.2 → §35 → §48).

   შენი სიტყვები: „„ყველას დაკვრისას" რაც იკვრება, ახლა ქვემოთ ზოლად
   ჩამოდის; მინდა, რომ მარჯვნივ, გვერდზე გამოვიდეს — ჩანდეს, რომელია შემდეგი
   და რომელზე ვდგავართ, YouTube-ის ფლეილისტის მსგავსად".

   - **გვერდითა პანელი** (ფართო ეკრანზე, `PANEL_MIN_VIEWPORT`-იდან): ზემოთ
     ვიდეო 16:9, ქვემოთ რიგი. გვერდს **აწვება** — `<main>` და ჰედერი
     `--player-w`-ს მარჯვენა `padding`-ად კითხულობენ, ე.ი. არაფერი იფარება (Q26).
   - **ქვედა ზოლი** — ვიწრო ეკრანზე და როცა პანელი ხელით ჩაკეცე; ეს
     არჩევანი ახსოვს (`lib/player.tsx`-ის `dock`).
   - Tasks §48 — **ვიდეო ფანჯარაში** (`inline`): დამკვრელი ფანჯრის ესკიზზე
     ჯდება (`fixed`, კოორდინატები ყოველ კადრზე — სქროლი, ზომა, გახსნის
     ანიმაცია); **მოტივტივე ჩარჩო** (`float`) — გადაითრევა, ზომა კუთხით
     იცვლება, ადგილი ახსოვს; **სიმღერის ბუშტი** (`bubble`) — მრგვალი, კიდეს
     ეკვრის, დაჭერით პანელი იშლება.

   ⚠️ **სცენა ყველა განლაგებაში ერთსა და იმავე ადგილას დგას ხეში** (§35.3):
   `<aside>`-ის პირველი შვილის `<div>`-ში. განლაგება **მხოლოდ კლასებით**
   იცვლება — სხვა კონტეინერში გადატანა React-ისთვის ახალი ელემენტი იქნებოდა,
   ე.ი. ფრეიმი თავიდან ჩაიტვირთებოდა და დაკვრა თავიდან დაიწყებდა. ამიტომაა
   `<aside>`-ის შვილები ყველგან ერთი რიგით და პირობითი ნაწილები მხოლოდ
   `&&`-ით — ადგილს არავის ართმევენ. ბუშტში ფრეიმი **1 px-ია** და არა
   `display: none` — ხმა არ წყდება.

   ⚠️ `AppShell`-შია ჩამონტაჟებული და არა გვერდზე: მარშრუტის შეცვლაზე რომ
   იშლებოდეს, „პლეილისტი ბოლომდე დაუკრავს"-ს ვერ დავპირდებოდით.
   ============================================================ */

/** `<aside>`-ის განლაგება */
const LAYOUT: Record<PlayerLayout, string> = {
  side: 'bottom-0 right-0 top-14 w-[var(--player-w)] flex-col border-l border-border bg-card',
  bar: 'inset-x-0 bottom-0 items-center gap-3 border-t border-border bg-card/95 px-3 py-2 shadow-[0_-2px_12px_rgba(0,0,0,0.12)] backdrop-blur',
  // ⚠️ კოორდინატებს `useInlinePlacement` წერს CSS-ცვლადებად — ჩასვლამდე უხილავია
  inline:
    'group left-[var(--ix,0px)] top-[var(--iy,0px)] h-[var(--ih,0px)] w-[var(--iw,0px)] overflow-hidden rounded-lg bg-black [clip-path:var(--iclip,none)] [visibility:var(--ivis,hidden)]',
  float: 'group flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl',
  bubble: '',
}

/** სცენის გარსი — ⚠️ ყოველთვის `<aside>`-ის პირველი შვილი */
const STAGE_WRAP: Record<PlayerLayout, string> = {
  side: 'relative shrink-0 px-3 pt-3',
  bar: 'relative shrink-0',
  inline: 'relative size-full',
  float: 'relative shrink-0',
  bubble: 'pointer-events-none absolute left-0 top-0 size-px overflow-hidden opacity-0',
}

/** ინლაინ-განლაგების CSS-ცვლადები (`useInlinePlacement`) */
const INLINE_VARS = ['--ix', '--iy', '--iw', '--ih', '--iclip', '--ivis'] as const

export function Player() {
  const { t } = useTranslation()
  const player = usePlayer()
  const [queueOpen, setQueueOpen] = useState(false)
  const asideRef = useRef<HTMLElement>(null)

  /* §48.2/§48.4 — ადგილი მოწყობილობაზე ინახება (`lib/playerFrame.ts`) */
  const [frame, setFrame] = useState<FrameBox>(() => readFrame(viewport()))
  const [bubble, setBubble] = useState<BubbleSpot>(() => readBubble(viewport()))
  /** ბუშტის გადათრევა — თავისუფალი ადგილი; გაშვებისას კიდეს ეკვრის */
  const [bubbleDrag, setBubbleDrag] = useState<{ x: number; y: number } | null>(null)

  const { current, queue, playing, expanded, layout } = player

  useInlinePlacement(asideRef, player.anchor, layout === 'inline')
  useViewportClamp(setFrame, setBubble)
  usePickLift(layout === 'float' ? frame : null)

  if (!current || !layout) return null

  const side = layout === 'side'
  const panel = side || layout === 'bar'
  const many = queue.length > 1

  const style: CSSProperties | undefined =
    layout === 'float'
      ? { left: frame.x, top: frame.y, width: frame.w }
      : layout === 'bubble'
        ? bubbleDrag
          ? { left: bubbleDrag.x, top: bubbleDrag.y, width: BUBBLE, height: BUBBLE }
          : { top: bubble.y, [bubble.side]: EDGE, width: BUBBLE, height: BUBBLE }
        : undefined

  return (
    <aside
      ref={asideRef}
      data-player
      data-layout={layout}
      aria-label={t('playback.player')}
      style={style}
      className={cn(
        // ⚠️ `pointer-events-auto`: Radix-ის მოდალი `body`-ს მოვლენებს უკეტავს — ფანჯრის თავზე მდგარი ვიდეო დაჭერას ვერ მიიღებდა
        'fb-player pointer-events-auto fixed flex',
        layout === 'inline' || layout === 'float' ? LAYER_PLAYER_TOP : LAYER_PLAYER,
        LAYOUT[layout],
      )}
    >
      {/* ---------- სცენა (ყოველთვის პირველი შვილი — იხ. ზემოთ) ----------
          ⚠️ Tasks §20.1 — გადათრევისას სცენას გამჭვირვალე ფენა ეფარება: iframe
          მაუსის მოვლენებს „ჭამს" და სახელური მასზე გადასვლისას დაკარგავდა. */}
      <div className={STAGE_WRAP[layout]}>
        {player.resizing && <div aria-hidden className="absolute inset-0 z-10 cursor-move" />}
        <PlayerStage
          item={current}
          playing={playing}
          onEvent={player.report}
          onProgress={reportProgress}
          className={cn(
            side && 'aspect-video w-full',
            layout === 'bar' && cn('transition-[height,width]', expanded ? 'h-36 w-64' : 'h-12 w-[5.3rem]'),
            layout === 'inline' && 'size-full rounded-none',
            layout === 'float' && 'aspect-video w-full rounded-none',
            layout === 'bubble' && 'h-px w-px',
          )}
        />
      </div>

      {/* ---------- პანელი / ზოლი: რა უკრავს + მართვა ---------- */}
      {panel && (
        <PanelControls side={side} queueOpen={queueOpen} onQueue={() => setQueueOpen((v) => !v)} onClose={() => setQueueOpen(false)} />
      )}

      {/* ---------- §48.2 — ფანჯარაში: „გატანა" ვიდეოს კუთხეში ---------- */}
      {layout === 'inline' && (
        <button
          type="button"
          onClick={player.popOut}
          aria-label={t('playback.popOut')}
          title={t('playback.popOut')}
          className="absolute right-2 top-2 z-20 grid size-8 cursor-pointer place-items-center rounded-md bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <PictureInPicture2 className="size-4" />
        </button>
      )}

      {/* ---------- §48.2 — მოტივტივე ჩარჩოს ზოლი ---------- */}
      {layout === 'float' && <FloatBar frame={frame} onFrame={setFrame} />}

      {/* ---------- §48.4 — სიმღერის ბუშტი ---------- */}
      {layout === 'bubble' && (
        <BubbleFace
          spot={bubble}
          onDrag={setBubbleDrag}
          onDrop={(next) => {
            setBubbleDrag(null)
            setBubble(next)
            saveBubble(next)
          }}
        />
      )}

      {/* ---------- რიგი ----------
          ⚠️ ზოლზე ზემოთ იშლება (`bottom-full`) და არა ზოლის შიგნით: შიგნით
          ზოლის სიმაღლე შეიცვლებოდა, `--player-h` კი იმავე რიცხვს ეუბნებოდა
          გვერდს — ე.ი. ქვედა ჩანაწერი ზოლის უკან მოექცეოდა. */}
      {(side || (layout === 'bar' && queueOpen && many)) && <PlayerQueue layout={layout} />}

      {/* ---------- Tasks §20 — სიგანის სახელური (მხოლოდ გვერდითა პანელზე) ----------
          მარცხენა კიდეზე 6 px ზონა, `cursor: col-resize`; მარცხნივ გაწევა
          აფართოებს. სიგანე `usePlayer().setWidth`-ით იწერება და `--player-w`
          მხოლოდ პროვაიდერის `useLayoutEffect`-იდან მოდის — გვერდი და ჰედერი
          თავისით მიჰყვებიან. ორმაგი დაწკაპუნება — ნაგულისხმევზე. */}
      {side && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t('playback.resize')}
          title={t('playback.resizeHint', { max: player.maxWidth })}
          data-resize-handle
          onDoubleClick={player.resetWidth}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            const startX = e.clientX
            // ⚠️ გაუზომავზე (0) — მიმდინარე რიცხვითი სიგანე ან მინიმუმი, არა ჭერი
            const measured = asideRef.current?.getBoundingClientRect().width ?? 0
            const startWidth = measured > 0 ? measured : (player.width ?? PANEL_MIN_WIDTH)
            drag(e, player.setResizing, 'col-resize', (ev) => player.setWidth(startWidth + (startX - ev.clientX)))
          }}
          className={cn(
            'absolute inset-y-0 left-0 w-1.5 cursor-col-resize transition-colors hover:bg-primary/40',
            player.resizing && 'bg-primary/40',
          )}
        />
      )}
    </aside>
  )
}

/* ============================================================
   გადათრევის საერთო ნაწილი — pointer capture, სცენის ფენა, კურსორი
   ============================================================ */

function drag(
  e: React.PointerEvent<HTMLElement>,
  setResizing: (value: boolean) => void,
  cursor: string,
  onMove: (ev: PointerEvent) => void,
  onEnd?: () => void,
) {
  e.preventDefault()
  const target = e.currentTarget
  if (typeof target.setPointerCapture === 'function') target.setPointerCapture(e.pointerId)
  setResizing(true)
  document.body.style.cursor = cursor
  document.body.style.userSelect = 'none'

  const stop = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    setResizing(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    onEnd?.()
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', stop)
}

/* ============================================================
   პანელი და ზოლი (Tasks §35)
   ============================================================ */

function PanelControls({
  side,
  queueOpen,
  onQueue,
  onClose,
}: {
  side: boolean
  queueOpen: boolean
  onQueue: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const player = usePlayer()
  const { current, queue, index, playing, expanded, wide } = player
  if (!current) return null

  const cover = storageUrl(current.thumbnail)
  const duration = formatDuration(current.duration)
  const many = queue.length > 1
  const song = current.kind === 'song'

  return (
    <div className={side ? 'shrink-0 border-b border-border px-3 pb-2 pt-3' : 'flex min-w-0 flex-1 items-center gap-3'}>
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
            <span className="tabular-nums">{t('playback.position', { index: index + 1, total: queue.length })}</span>
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
            onClick={onQueue}
            aria-label={t('playback.queue')}
            aria-pressed={queueOpen}
            title={t('playback.queue')}
            className={cn(queueOpen && 'text-primary')}
          >
            <ListMusic className="size-4" />
          </Button>
        )}
        {/* §48.5 — ვიწრო ეკრანზე ვიდეოს ზოლიდანაც ფანჯარაში დაბრუნება */}
        {!song && <ReturnButton className="grid size-10 place-items-center rounded-md text-muted-foreground hover:text-foreground" />}
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

        {/* §48.4 — სიმღერა ბუშტად იკეცება (ხმა არ წყდება) */}
        {song && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => player.setBubbled(true)}
            aria-label={t('playback.toBubble')}
            title={t('playback.toBubble')}
          >
            <MessageCircle className="size-4" />
          </Button>
        )}

        {/* ⚠️ ფართო ეკრანზე ღილაკი **განლაგებას** ცვლის (პანელი ↔ ზოლი) და
            არჩევანი ახსოვს; ვიწროზე პანელი ვერ დაეტევა, ე.ი. იქ ზოლის სცენა იზრდება. */}
        {wide && song ? (
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
            onClose()
            player.close()
          }}
          aria-label={t('playback.close')}
          title={t('playback.close')}
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  )
}

/* ============================================================
   §48.2 — „ფანჯარაში დაბრუნება"
   ============================================================ */

/**
 * ფანჯარა ღიაა (ესკიზი რეგისტრირებულია) — ვიდეო იქ ბრუნდება; დახურულია —
 * ფანჯარა თავიდან იხსნება (`href`, მაგ. `/videos?open=12`) და ვიდეო მასში ჯდება.
 * ⚠️ ცალკე კომპონენტია: `useNavigate` როუტერს ითხოვს, ბმულის გარეშე ჩანაწერს
 * (გალერეის ვიდეო) კი ღილაკი საერთოდ არ აქვს.
 */
function ReturnButton({ className }: { className: string }) {
  const { t } = useTranslation()
  const player = usePlayer()
  const href = player.current?.href
  if (!player.anchor && !href) return null
  return <ReturnLink href={player.anchor ? null : (href ?? null)} className={className} label={t('playback.popIn')} onReturn={player.popIn} />
}

function ReturnLink({ href, className, label, onReturn }: { href: string | null; className: string; label: string; onReturn: () => void }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => {
        onReturn()
        if (href) navigate(href)
      }}
      aria-label={label}
      title={label}
      className={cn('cursor-pointer', className)}
    >
      <AppWindow className="size-4" />
    </button>
  )
}

/* ============================================================
   §48.2 — მოტივტივე ჩარჩო
   ============================================================ */

/** ჩარჩოს ზოლის ღილაკი — 32 px, რომ 240 px-იან ჩარჩოშიც დაეტიოს */
function BarButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function FloatBar({ frame, onFrame }: { frame: FrameBox; onFrame: (box: FrameBox) => void }) {
  const { t } = useTranslation()
  const player = usePlayer()
  /* ⚠️ ზომის შეცვლისას სახელურის მხარე იყინება — მარცხნიდან ზრდისას ჩარჩოს ცენტრი
     ეკრანის შუას გადაკვეთდა და სახელური ხელიდან მეორე მხარეს გადახტებოდა */
  const [frozen, setFrozen] = useState<boolean | null>(null)
  const { current, queue, index, playing } = player
  if (!current) return null

  const fromLeft = frozen ?? handleOnLeft(frame, viewport())

  /** სათაურით გადათრევა — ეკრანიდან ვერ გავა; გაშვებისას ადგილი ინახება */
  const move = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    const sx = e.clientX
    const sy = e.clientY
    let last = frame
    drag(
      e,
      player.setResizing,
      'grabbing',
      (ev) => {
        last = clampFrame({ ...frame, x: frame.x + ev.clientX - sx, y: frame.y + ev.clientY - sy }, viewport())
        onFrame(last)
      },
      () => saveFrame(last),
    )
  }

  /** კუთხით ზომა — მოპირდაპირე კიდე ადგილზე რჩება */
  const resize = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    const sx = e.clientX
    let last = frame
    setFrozen(fromLeft)
    drag(
      e,
      player.setResizing,
      fromLeft ? 'nesw-resize' : 'nwse-resize',
      (ev) => {
        last = resizeFrame(frame, ev.clientX - sx, fromLeft, viewport())
        onFrame(last)
      },
      () => {
        setFrozen(null)
        saveFrame(last)
      },
    )
  }

  const grip = (
    <button
      type="button"
      aria-label={t('playback.resizeFrame')}
      title={t('playback.resizeFrame')}
      onPointerDown={resize}
      data-frame-resize
      className={cn(
        'grid size-8 shrink-0 touch-none place-items-center rounded-md text-muted-foreground hover:text-foreground',
        fromLeft ? 'cursor-nesw-resize' : 'cursor-nwse-resize',
      )}
    >
      <MoveDiagonal2 className={cn('size-3.5', fromLeft && '-scale-x-100')} />
    </button>
  )

  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 border-t border-border px-1">
      {fromLeft && grip}
      <div
        onPointerDown={move}
        data-frame-move
        title={t('playback.moveFrame')}
        className="flex min-w-0 flex-1 cursor-grab touch-none select-none items-center gap-1 px-1 active:cursor-grabbing"
      >
        <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-xs font-medium" title={current.title}>
          {current.title}
        </span>
      </div>
      <BarButton label={t('playback.prev')} onClick={player.prev} disabled={index <= 0}>
        <SkipBack className="size-4" />
      </BarButton>
      <BarButton label={t(playing ? 'playback.pause' : 'playback.play')} onClick={player.toggle}>
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </BarButton>
      <BarButton label={t('playback.next')} onClick={player.next} disabled={index >= queue.length - 1}>
        <SkipForward className="size-4" />
      </BarButton>
      <ReturnButton className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground" />
      <a
        href={current.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('playback.openSource')}
        title={t('playback.openSource')}
        className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
      >
        <ExternalLink className="size-4" />
      </a>
      <BarButton label={t('playback.close')} onClick={player.close}>
        <X className="size-4" />
      </BarButton>
      {!fromLeft && grip}
    </div>
  )
}

/* ============================================================
   §48.4 — სიმღერის ბუშტი
   ============================================================ */

/** რგოლის რადიუსი და გარშემოწერილობა (56 px-იან ბუშტზე, 3 px ხაზით) */
const RING_R = 26
const RING_C = 2 * Math.PI * RING_R

function BubbleFace({
  spot,
  onDrag,
  onDrop,
}: {
  spot: BubbleSpot
  onDrag: (pos: { x: number; y: number } | null) => void
  onDrop: (spot: BubbleSpot) => void
}) {
  const { t } = useTranslation()
  const player = usePlayer()
  const progress = usePlaybackProgress()
  const moved = useRef(false)
  const { current, playing } = player
  if (!current) return null

  const cover = storageUrl(current.thumbnail)

  /* ⚠️ დაჭერა და გადათრევა ერთ ღილაკზეა: 4 px-ზე ნაკლები მოძრაობა — დაჭერაა
     (პანელი იშლება), მეტი — გადათრევა, გაშვებისას კიდეს ეკვრის და ინახება. */
  const press = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    const vp = viewport()
    const sx = e.clientX
    const sy = e.clientY
    const x0 = spot.side === 'left' ? EDGE : vp.w - BUBBLE - EDGE
    const y0 = spot.y
    let pos = { x: x0, y: y0 }
    moved.current = false
    drag(
      e,
      player.setResizing,
      'grabbing',
      (ev) => {
        const dx = ev.clientX - sx
        const dy = ev.clientY - sy
        if (!moved.current && Math.hypot(dx, dy) < 4) return
        moved.current = true
        pos = {
          x: Math.min(Math.max(x0 + dx, EDGE), vp.w - BUBBLE - EDGE),
          y: Math.min(Math.max(y0 + dy, EDGE), vp.h - BUBBLE - EDGE),
        }
        onDrag(pos)
      },
      () => {
        if (moved.current) onDrop(snapBubble(pos.x, pos.y, viewport()))
      },
    )
  }

  return (
    <button
      type="button"
      onPointerDown={press}
      onClick={() => {
        if (moved.current) return
        player.setBubbled(false)
      }}
      aria-label={`${t('playback.fromBubble')} — ${current.title}`}
      title={current.title}
      data-bubble
      className="relative grid size-full cursor-pointer touch-none select-none place-items-center rounded-full bg-card shadow-lg ring-1 ring-border"
    >
      {cover ? (
        <img src={cover} alt="" draggable={false} className="size-12 rounded-full object-cover" />
      ) : (
        <Music className={cn('size-5 text-muted-foreground', playing && 'text-primary')} />
      )}
      {/* პროგრესის რგოლი — წყარო თუ არ ამბობს, მხოლოდ ფონის რგოლი ჩანს */}
      <svg aria-hidden viewBox="0 0 56 56" className="pointer-events-none absolute inset-0 size-full -rotate-90">
        <circle cx="28" cy="28" r={RING_R} fill="none" stroke="var(--border)" strokeWidth="3" />
        {progress !== null && (
          <circle
            cx="28"
            cy="28"
            r={RING_R}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - progress)}
            data-progress={progress.toFixed(3)}
          />
        )}
      </svg>
    </button>
  )
}

/* ============================================================
   §48.1 — ფანჯრის ესკიზზე ჩასმა
   ============================================================ */

/**
 * დამკვრელი ფანჯრის ესკიზის კოორდინატებზე — **ყოველ კადრზე** (`requestAnimationFrame`).
 *
 * ⚠️ ერთი მარყუჟი ყველაფერს ფარავს: ფანჯრის გადახვევას, ზომის შეცვლას,
 * გახსნის ანიმაციას (`scale` — მას `ResizeObserver` ვერ ხედავს) და
 * ფანჯრების დასტას (ქვედა ფანჯარა `display: none`-ით იმალება → ესკიზის
 * ზომა 0 → ვიდეო უხილავია, მაგრამ **უკრავს**). ერთ კადრზე ორი
 * `getBoundingClientRect` იაფია და მხოლოდ ფანჯარაში დაკვრისას მუშაობს.
 * ⚠️ ცვლადებად იწერება და არა `style.top`-ად: React მოტივტივე ჩარჩოს
 * ადგილს იმავე `style`-ში წერს, და გასუფთავება მას წაშლიდა.
 */
function useInlinePlacement(aside: RefObject<HTMLElement | null>, anchor: HTMLElement | null, active: boolean) {
  useLayoutEffect(() => {
    const el = aside.current
    if (!active || !el || !anchor) return
    const clipper = scrollParent(anchor)
    let raf = 0
    let last = ''

    const place = () => {
      const rect = anchor.getBoundingClientRect()
      const hidden = !anchor.isConnected || rect.width === 0 || rect.height === 0
      const inset = !hidden && clipper ? clipInset(rect, clipper.getBoundingClientRect()) : null
      const next = hidden ? 'hidden' : `${rect.left}|${rect.top}|${rect.width}|${rect.height}|${inset}`

      if (next !== last) {
        last = next
        el.style.setProperty('--ivis', hidden ? 'hidden' : 'visible')
        if (!hidden) {
          el.style.setProperty('--ix', `${rect.left}px`)
          el.style.setProperty('--iy', `${rect.top}px`)
          el.style.setProperty('--iw', `${rect.width}px`)
          el.style.setProperty('--ih', `${rect.height}px`)
          el.style.setProperty('--iclip', inset ?? 'none')
        }
      }
      raf = requestAnimationFrame(place)
    }

    place()
    return () => {
      cancelAnimationFrame(raf)
      INLINE_VARS.forEach((name) => el.style.removeProperty(name))
    }
  }, [aside, anchor, active])
}

/** ესკიზის უახლოესი გადასახვევი წინაპარი (ფანჯრის სხეული) — მის მიღმა ვიდეო იჭრება */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'hidden') return node
  }
  return null
}

/** ფანჯრის ზომის შეცვლაზე ჩარჩო და ბუშტი ეკრანში რჩება */
function useViewportClamp(setFrame: (fn: (box: FrameBox) => FrameBox) => void, setBubble: (fn: (spot: BubbleSpot) => BubbleSpot) => void) {
  useEffect(() => {
    const onResize = () => {
      const vp = viewport()
      setFrame((box) => clampFrame(box, vp))
      setBubble((spot) => clampBubble(spot, vp))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [setFrame, setBubble])
}

/** §48.5 — მოტივტივე ჩარჩო კამათლის კუთხეს თუ ფარავს, კამათელი მის ზემოთ ადის (`--player-lift`) */
function usePickLift(frame: FrameBox | null) {
  useLayoutEffect(() => {
    const style = document.documentElement.style
    const lift = frame ? pickLift(frame, viewport()) : 0
    if (lift) style.setProperty('--player-lift', `${lift}px`)
    else style.removeProperty('--player-lift')
    return () => {
      style.removeProperty('--player-lift')
    }
  }, [frame])
}
