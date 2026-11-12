import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { reorderGalleryImages, type GalleryImage } from '@/api/gallery'
import { storageUrl } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/feedback'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { Sortable, SortableItem } from '@/components/ui/sortable'

/* ============================================================
   **მსახიობის ფოტოების ხელით დალაგება** — გადათრევით; რიგი ყოველ გადატანაზე ინახება.

   ⚠️ ცალკე ფანჯარაა და არა ბადის რეჟიმი: ბადის უჯრას მონიშვნა, მენიუ და ლაითბოქსი აქვს —
   გადათრევა მათ ერეოდა. აქ უჯრა მხოლოდ ესკიზია და მხოლოდ ითრევა.

   ⚠️ ჩაკეტილი ალბომის ფოტო აქ არ ჩანს (ბილიკი პასუხში არ მოსულა) და თავის ძველ ადგილზე რჩება.
   ⚠️ პირად დისკზე მდგარი (სესიაში გახსნილი ჩაკეტილი ალბომის) ფოტო ესკიზის გარეშე ითრევა —
   `/storage/*` მას ვერ კითხულობს.
   ============================================================ */

export function ActorPhotoOrderDialog({
  castId,
  images,
  onClose,
}: {
  castId: number
  /** ხელით რიგით დალაგებული, ჩაკეტილების გარეშე */
  images: GalleryImage[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [order, setOrder] = useState(() => images.map((image) => image.id))

  const byId = new Map(images.map((image) => [image.id, image]))

  const save = useMutation({
    mutationFn: (ids: number[]) => reorderGalleryImages(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gallery', 'cast', castId] }),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const reorder = (ids: number[]) => {
    setOrder(ids)
    save.mutate(ids)
  }

  return (
    <ModalShell size="wide" title={t('actorPhotos.orderTitle')} hint={t('actorPhotos.orderHint')} onClose={onClose}>
      <Sortable ids={order} onReorder={reorder} layout="grid">
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6" data-testid="actor-photo-order">
          {order.map((id) => {
            const image = byId.get(id)
            if (!image) return null

            return (
              <SortableItem
                key={id}
                id={id}
                className="aspect-square cursor-grab overflow-hidden rounded-md border border-border bg-muted"
                aria-label={image.original_name ?? String(id)}
              >
                {!image.private && (
                  <img src={storageUrl(image.url) ?? image.url} alt="" draggable={false} className="size-full object-cover" />
                )}
              </SortableItem>
            )
          })}
        </ul>
      </Sortable>

      <ModalFooter>
        <Button type="button" onClick={onClose}>
          <X className="size-4" />
          {t('actions.close')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
