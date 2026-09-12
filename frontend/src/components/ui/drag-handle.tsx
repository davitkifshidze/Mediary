import { useTranslation } from 'react-i18next'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * გადათრევის სახელური (Tasks §2.4) — ერთი სახე ყველა სიაზე.
 *
 * ⚠️ ეს **მხოლოდ ნიშანია**: `draggable` და მოვლენები `<li>`-ზე ჯდება
 * (`useDragReorder().handlers(id)`), თორემ მთელი რიგის ნაცვლად მხოლოდ
 * აიქონი გაითრევდა.
 *
 * ⚠️ ისრიანი ღილაკები **რჩება** — native drag & drop კლავიატურით
 * მიუწვდომელია (იხ. `lib/dragReorder.ts`).
 */
export function DragHandle({ className }: { className?: string }) {
  const { t } = useTranslation()

  return (
    <span
      className={cn('shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing', className)}
      title={t('actions.drag')}
      aria-hidden
    >
      <GripVertical className="size-4" />
    </span>
  )
}
