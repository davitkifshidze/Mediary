import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Film } from 'lucide-react'
import { fetchPersonalMedia, PERSONAL_KEY, reorderPersonalMedia, type PersonalMediaFilters } from '@/api/personal'
import { errorMessage } from '@/lib/errors'
import { invalidatePersonal } from '@/lib/personal'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/feedback'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { Sortable, SortableItem } from '@/components/ui/sortable'
import { PrivateImage } from '@/components/PrivateFile'

/* ============================================================
   **ალბომის რიგი გადათრევით (Tasks §33.6 ← §11).**

   ⚠️ **ცალკე ფანჯარაა და არა ბადე** — ბადეს ლაითბოქსი, მონიშვნა და
   კონტექსტური მენიუ აქვს, და გადათრევა მის დაჭერას ეჯახებოდა; აქ პატარა
   ესკიზებია, მთელი ალბომი ერთად (`all=1`), და ყოველი ჩაგდება მთელ რიგს
   ინახავს (`POST /personal/media/reorder`) — `sort_order` თანმიმდევრული რჩება.
   ============================================================ */

export function PersonalReorderDialog({
  filters,
  onClose,
}: {
  filters: PersonalMediaFilters
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const query = { ...filters, sort: 'manual' as const, all: true }
  const mediaQ = useQuery({
    queryKey: [PERSONAL_KEY, 'media', query],
    queryFn: () => fetchPersonalMedia(query),
  })

  const [order, setOrder] = useState<number[]>([])

  useEffect(() => {
    if (mediaQ.data) setOrder(mediaQ.data.items.map((m) => m.id))
  }, [mediaQ.data])

  const save = useMutation({
    mutationFn: reorderPersonalMedia,
    onSuccess: () => invalidatePersonal(qc),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const byId = new Map((mediaQ.data?.items ?? []).map((m) => [m.id, m]))

  return (
    <ModalShell title={t('personal.reorder.title')} onClose={onClose} size="wide" hint={t('personal.reorder.hint')}>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
        <Sortable
          ids={order}
          layout="grid"
          onReorder={(ids) => {
            setOrder(ids)
            save.mutate(ids)
          }}
        >
          {order.map((id) => {
            const media = byId.get(id)

            return (
              <SortableItem key={id} id={id} className="aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                {media?.thumb ? (
                  <PrivateImage url={media.thumb} alt={media.caption ?? media.original_name} className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center text-muted-foreground">
                    <Film className="size-6" />
                  </span>
                )}
              </SortableItem>
            )
          })}
        </Sortable>
      </ul>

      <ModalFooter>
        <Button onClick={onClose}>{t('actions.close')}</Button>
      </ModalFooter>
    </ModalShell>
  )
}
