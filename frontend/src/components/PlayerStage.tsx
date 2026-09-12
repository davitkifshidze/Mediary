import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import {
  embedCommand,
  embedEventFrom,
  embedHandshake,
  playableEmbedSrc,
  type EmbedEvent,
} from '@/lib/embed'
import type { PlayerItem } from '@/lib/player'
import { cn } from '@/lib/utils'

/* ============================================================
   სცენა — ერთადერთი ადგილი, სადაც მედია მართლა უკრავს (Tasks §7.2).

   ⚠️ **ფრეიმი ყოველ ჩანაწერზე თავიდან იქმნება** (`key`) და `autoplay=1`-ით
   ირთვება. ალტერნატივა (ერთი ფრეიმი + `loadVideoById`) უფრო გლუვია, მაგრამ
   რბოლას აჩენს: ბრძანება პლეერის მზადყოფნამდე რომ მივიდეს, ჩუმად იკარგება
   და ტრეკი საერთოდ არ ჩაირთვება. ხელახალი შექმნა კი „კონსტრუქციით სწორია" —
   ბრაუზერის sticky activation (მომხმარებელმა უკვე დააჭირა „დაკვრას")
   ავტოდაკვრას შვებს.

   ⚠️ **ნედლი HTML აქ არ შემოდის** — `src` მხოლოდ `playableEmbedSrc`-იდან
   მოდის, ე.ი. backend-ის allowlist-ზე გავლილი ბმულია.
   ============================================================ */

export function PlayerStage({
  item,
  playing,
  onEvent,
  className,
}: {
  item: PlayerItem
  playing: boolean
  onEvent: (event: EmbedEvent) => void
  className?: string
}) {
  const { t } = useTranslation()

  /* ---------- პირდაპირი ფაილი: `ended` ბრაუზერისავეა ---------- */
  if (item.platform === 'file') {
    return (
      <FileStage
        key={`${item.kind}-${item.id}`}
        item={item}
        playing={playing}
        onEvent={onEvent}
        className={className}
      />
    )
  }

  const src = playableEmbedSrc(item.embedUrl, item.platform)
  if (src) {
    return (
      <FrameStage
        key={`${item.kind}-${item.id}`}
        item={item}
        src={src}
        playing={playing}
        onEvent={onEvent}
        className={className}
      />
    )
  }

  /* ---------- ვერც ჩავაშენებთ: ცხადად ვამბობთ, რატომ ----------
     ⚠️ ცარიელი შავი კვადრატი „გატეხილად" იკითხებოდა; აქ წყარო უცნობია
     (`platform = other`), ე.ი. არც დაკვრა შეიძლება და არც ავტომატური გადასვლა. */
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-muted px-2 text-center text-[11px] text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      <ExternalLink className="size-4" />
      <span className="line-clamp-2">{t('playback.noEmbed')}</span>
    </a>
  )
}

/**
 * ⚠️ ეფექტები `onEvent`-ზე **არ უნდა იყოს დამოკიდებული**: ის პროვაიდერში
 * ყოველ ტრეკზე თავიდან იქმნება, ე.ი. მოსმენა და ხელის ჩამორთმევა ტყუილად
 * გადაიწერებოდა (ზოგჯერ დაკვრის შუაშიც).
 */
function useLatest<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}

/* ============================================================
   პირდაპირი ფაილი
   ============================================================ */

function FileStage({
  item,
  playing,
  onEvent,
  className,
}: {
  item: PlayerItem
  playing: boolean
  onEvent: (event: EmbedEvent) => void
  className?: string
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const report = useLatest(onEvent)

  // ჩვენი „ვუკრავ/პაუზა" ელემენტზე გადააქვს; ჩავარდნა (ავტოდაკვრის აკრძალვა)
  // პაუზად ითვლება — ბარი მაშინ სიმართლეს აჩვენებს და არა „ვუკრავ"-ს.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (playing) void el.play().catch(() => report.current('paused'))
    else el.pause()
  }, [playing, report])

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      ref={ref}
      src={item.url}
      controls
      autoPlay
      className={cn('rounded-lg bg-black', className)}
      onPlay={() => onEvent('playing')}
      onPause={() => onEvent('paused')}
      onEnded={() => onEvent('ended')}
    />
  )
}

/* ============================================================
   iframe + postMessage
   ============================================================ */

/** რამდენ ხანს ვიმეორებთ ხელის ჩამორთმევას (ms) — პლეერის ჩატვირთვა ნელია */
const HANDSHAKE_WINDOW = 6000
const HANDSHAKE_STEP = 600

function FrameStage({
  item,
  src,
  playing,
  onEvent,
  className,
}: {
  item: PlayerItem
  src: string
  playing: boolean
  onEvent: (event: EmbedEvent) => void
  className?: string
}) {
  const ref = useRef<HTMLIFrameElement>(null)
  const report = useLatest(onEvent)
  const origin = new URL(src).origin

  /* ---------- მოვლენების მოსმენა ----------
     ⚠️ `origin`-ის შემოწმება სავალდებულოა: `message` ნებისმიერ ფრეიმს
     შეუძლია გამოგვიგზავნოს, ე.ი. სხვისი შეტყობინება ტრეკს გადაახტუნებდა. */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin) return
      const event = embedEventFrom(e.data)
      if (event) report.current(event)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [origin, report])

  /* ---------- ხელის ჩამორთმევა ----------
     ⚠️ ერთი გაგზავნა არ კმარა: ფრეიმის `load`-მდე შეტყობინება უბრალოდ
     იკარგება, `load`-ის შემდეგაც პლეერს ინიციალიზაცია სჭირდება. ამიტომ
     რამდენიმე წამი ვიმეორებთ და შემდეგ ვჩერდებით — უსასრულო ტაიმერი
     ფონურ ჩანართს ტყუილად აწვალებდა. */
  useEffect(() => {
    const payloads = embedHandshake(item.platform)
    if (!payloads.length) return

    const send = () => {
      const win = ref.current?.contentWindow
      if (win) payloads.forEach((payload) => win.postMessage(payload, origin))
    }

    send()
    const timer = setInterval(send, HANDSHAKE_STEP)
    const stop = setTimeout(() => clearInterval(timer), HANDSHAKE_WINDOW)
    return () => {
      clearInterval(timer)
      clearTimeout(stop)
    }
  }, [item.platform, origin])

  /* ---------- დაკვრა/პაუზა ----------
     ⚠️ პირველ რენდერზეც იგზავნება და ეს განზრახაა: `autoplay=1` ისედაც
     ცდილობს, ბრძანება კი მას აძლიერებს. დაკარგული ბრძანება უვნებელია. */
  useEffect(() => {
    const payload = embedCommand(item.platform, playing ? 'play' : 'pause')
    if (!payload) return
    const win = ref.current?.contentWindow
    win?.postMessage(payload, origin)
  }, [playing, item.platform, origin])

  return (
    <iframe
      ref={ref}
      src={src}
      title={item.title}
      className={cn('rounded-lg bg-black', className)}
      allow="autoplay; accelerometer; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
    />
  )
}
