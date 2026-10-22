import { useTranslation } from 'react-i18next'
import { AppWindow, Play } from 'lucide-react'
import { usePlayer, usePlayerAnchor } from '@/lib/player'
import { cn } from '@/lib/utils'

/* ============================================================
   **ვიდეოს ადგილი ფანჯარაში** — ესკიზი, რომელზეც აპის დამკვრელი ჯდება.

   ერთი კომპონენტი სამ ფანჯარაზე: ვიდეოს ფანჯარა, კურსის ფანჯარა (პლეილისტის
   ზემოთ) და გალერეის ვიდეოების სია (ბუკმარკი, წიგნი, თამაში, ადგილი…).
   - არაფერი მისი არ უკრავს → ესკიზი და „დაკვრა" (რიგს გამომძახებელი აწყობს);
   - მისი უკრავს და ფანჯარაშია → დამკვრელი ზუსტად ამ ადგილზე იხატება
     (`Player` → `inline`), აქ მხოლოდ შავი ფონი რჩება;
   - მისი უკრავს, მაგრამ გატანილია (მოტივტივე ჩარჩო) → „ფანჯარაში დაბრუნება".

   ⚠️ **„მისი" გამომძახებელი წყვეტს** (`live`): ვიდეოს ფანჯარა — იგივე ვიდეო,
   კურსი და გალერეის სია — რიგის `origin` (კურსის პოზიციები და გალერეის id-ები
   სხვა კურსის/სიის ერთეულებს ემთხვევა, ე.ი. მარტო გასაღები ვერ გაარჩევდა).
   ⚠️ ფანჯრის წესები (`lib/player.tsx`): „გატანა" ფანჯარას ხურავს, ფანჯრის
   დახურვა — გაუტანელ ვიდეოს.
   ============================================================ */

export function PlayerSpot({
  thumbnail,
  live,
  onPlay,
  className,
}: {
  /** ესკიზი (უკვე გახსნილი მისამართი) */
  thumbnail: string | null | undefined
  /** მიმდინარე რიგის ერთეული ამ ადგილს ეკუთვნის */
  live: boolean
  /** დაკვრის დაწყება — რიგს გამომძახებელი აწყობს */
  onPlay: () => void
  className?: string
}) {
  const { t } = useTranslation()
  const player = usePlayer()
  const anchor = usePlayerAnchor(live ? player.current : null)
  const inline = live && player.layout === 'inline'

  return (
    <div ref={anchor} data-player-spot className={cn('relative aspect-video w-full overflow-hidden rounded-lg bg-black', className)}>
      {!inline && (
        <button
          type="button"
          onClick={live ? player.popIn : onPlay}
          className="group absolute inset-0 block cursor-pointer"
          data-testid="player-spot"
        >
          {thumbnail && (
            <img src={thumbnail} alt="" className="size-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
          )}
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/30 text-white">
            {live ? <AppWindow className="size-12 drop-shadow" /> : <Play className="size-12 fill-current drop-shadow" />}
            <span className="rounded-md bg-black/60 px-3 py-1.5 text-sm font-medium">
              {live ? t('playback.popIn') : t('playback.play')}
            </span>
          </span>
        </button>
      )}
    </div>
  )
}
