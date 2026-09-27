import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/* ============================================================
   გვერდების გადამრთველი — „გვერდი 2 / 5 · სულ 93" (Tasks §19.4).

   ⚠️ **ერთი ასლი ყველა ბადისთვის.** ის `GroupPhotos`-ში ეწერა და იქიდან
   იმპორტდებოდა (მოდულების ჭრილი, ვიდეოები), `PhotoGrid`-ს კი თავისი
   ხელნაწერი ასლი ჰქონდა — ვებძებნის შედეგებს მესამე დასჭირდებოდა.
   ⚠️ გალერეის ჯგუფის ფაილიდან იმპორტი ვებძებნის დიალოგს მთელ ჯგუფის
   ბადეს (lightbox-ით) გადააბამდა — ამიტომ `ui/`-შია.
   ============================================================ */

export function Pager({
  page,
  lastPage,
  total,
  onChange,
  className,
}: {
  page: number
  lastPage: number
  total: number
  onChange: (page: number) => void
  className?: string
}) {
  const { t } = useTranslation()

  return (
    <div className={cn('mt-5 flex flex-wrap items-center justify-center gap-2', className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="text-xs tabular-nums text-muted-foreground">
        {t('gallery.pageOf', { page, last: lastPage, total })}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={page >= lastPage}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )
}
