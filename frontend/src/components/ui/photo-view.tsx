import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Grid2x2, Grid3x3, Rows3 } from 'lucide-react'
import { safeGet, safeSet } from '@/lib/storage'
import { cn } from '@/lib/utils'

/* ============================================================
   **ფოტოების ბადის ხედი** — დიდი · პატარა ბადე · სტრიქონები.

   ⚠️ ხედი ერთი და იმავე ფოტოების სამი გამოსახულებაა და არა ფილტრი; არჩევანი ბრაუზერს
   ახსოვს — ერთი ყველა ბადეზე, სადაც გადამრთველი დგას (მსახიობის გვერდი, ჩანაწერის
   მსახიობების „არეულად").

   ⚠️ `transition-transform` განზრახ არაა — `index.css`-ის გლობალური წესი ხატულებს hover-ზე
   ამოძრავებს (`LayoutToggle`-ის იგივე შენიშვნა).
   ============================================================ */

const PHOTO_VIEWS = ['large', 'small', 'rows'] as const
export type PhotoView = (typeof PHOTO_VIEWS)[number]

const KEY = 'photo-grid.view'

const ICON = { large: Grid2x2, small: Grid3x3, rows: Rows3 } as const satisfies Record<PhotoView, unknown>

function isPhotoView(value: unknown): value is PhotoView {
  return (PHOTO_VIEWS as readonly unknown[]).includes(value)
}

/** არჩეული ხედი — ბრაუზერში; უცნობი მნიშვნელობა „დიდია" */
export function usePhotoView(): readonly [PhotoView, (next: PhotoView) => void] {
  const [view, setView] = useState<PhotoView>(() => {
    const stored = safeGet(KEY)
    return isPhotoView(stored) ? stored : 'large'
  })

  const change = useCallback((next: PhotoView) => {
    setView(next)
    safeSet(KEY, next)
  }, [])

  return [view, change] as const
}

export function PhotoViewToggle({
  value,
  onChange,
  className,
}: {
  value: PhotoView
  onChange: (next: PhotoView) => void
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <div className={cn('flex items-center gap-0.5 rounded-md border border-border p-0.5', className)} data-testid="photo-view-toggle">
      {PHOTO_VIEWS.map((view) => {
        const Icon = ICON[view]

        return (
          <button
            data-kind="tab"
            key={view}
            type="button"
            aria-pressed={value === view}
            aria-label={t(`photos.view.${view}`)}
            title={t(`photos.view.${view}`)}
            onClick={() => onChange(view)}
            className={cn(
              'flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors',
              value === view ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" />
          </button>
        )
      })}
    </div>
  )
}
