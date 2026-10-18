import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, PenLine } from 'lucide-react'
import {
  deletePersonalMedia,
  fetchPersonalMedia,
  PERSONAL_KEY,
  togglePersonalFavorite,
  updatePersonalMedia,
  type PersonalMedia,
  type PersonalMediaFilters,
} from '@/api/personal'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { usePages } from '@/lib/paged'
import { invalidatePersonal, personalPhotoItem } from '@/lib/personal'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { FormField, FormSection } from '@/components/ui/form-layout'
import { Input } from '@/components/ui/input'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { PHOTO_PAGE_ALL, PHOTO_PAGE_DEFAULT, PhotoGrid } from '@/components/ui/photo-grid'
import { Pagination } from '@/components/ui/pagination'
import { GalleryStackSkeleton } from '@/components/gallery/GalleryPhotoGrid'
import { PersonalMoveDialog } from '@/components/personal/PersonalMoveDialog'

/* ============================================================
   **ფოტოებისა და ვიდეოების ბადე** — ერთი კომპონენტი
   ყველა ადგილისთვის: „ფოტო & ვიდეო", ადამიანის ჩანართები, ალბომი, ჯგუფი.

   ⚠️ **`PhotoGrid`-ზე დგას** (გალერეის ბადე): მონიშვნა, ლაითბოქსი, ჩამოტვირთვა,
   კონტექსტური მენიუ — და პირადი გალერეის დამატებები: ვიდეო ლაითბოქსში, რჩეული,
   გადატანა ადამიანში/ალბომში, „მთავარად დაყენება" ადამიანზე/ალბომზე,
   წარწერა. მესამე ბადის დაწერა ზუსტად ის ასლი იქნებოდა, რომელიც სხვაგვარად
   მოიქცეოდა.

   ⚠️ **გვერდები სერვერისაა** (ნომრები + „მეტის ჩვენება", `usePages`), ბადე კი
   მიღებულს ერთად ხატავს. ⚠️ გვერდზე ფოტოს ბადის ნაგულისხმევი 20-ია და არა სიის 10 —
   ფოტოს რაოდენობა ცალკე გადაწყვეტილებაა („რამდენი გამოჩნდეს", `PhotoGrid`).
   ============================================================ */

export function PersonalMediaGrid({
  filters,
  primary,
  emptyText,
  emptyHint,
  emptyActions,
  extraTools,
}: {
  filters: PersonalMediaFilters
  /** ადამიანის/ალბომის მთავარი ფოტო — „მთავარად დაყენება" და ვარსკვლავის ნიშანი */
  primary?: { id: number | null; set: (mediaId: number) => void }
  emptyText?: string
  emptyHint?: ReactNode
  emptyActions?: ReactNode
  extraTools?: ReactNode
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { toast } = useToast()
  const { date } = useDateFormat()

  const [moving, setMoving] = useState<number[] | null>(null)
  const [captioning, setCaptioning] = useState<PersonalMedia | null>(null)

  // ⚠️ ჩადგმული სიაა (ჩანართი, ალბომი) — გვერდი მისამართს არ ეხება
  const mediaQ = usePages({
    queryKey: [PERSONAL_KEY, 'media', filters],
    fetchPage: (page) => fetchPersonalMedia({ ...filters, page, per_page: PHOTO_PAGE_DEFAULT }),
  })

  const media = mediaQ.items
  const items = useMemo(() => media.map((m) => personalPhotoItem(m, t, date)), [media, t, date])

  const favorite = useMutation({
    mutationFn: (id: number) => togglePersonalFavorite(id),
    onSuccess: () => invalidatePersonal(qc),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const remove = async (ids: number[]) => {
    const ok = await confirm({
      title: t('personal.media.deleteTitle', { count: ids.length }),
      description: t('personal.media.deleteHint'),
      confirmText: t('confirm.delete'),
      variant: 'destructive',
    })
    if (!ok) return

    try {
      await deletePersonalMedia(ids)
      invalidatePersonal(qc)
      toast({ title: t('personal.media.deleted', { count: ids.length }), variant: 'success' })
    } catch (e) {
      toast({ title: errorMessage(e), variant: 'error' })
    }
  }

  if (mediaQ.isLoading) return <GalleryStackSkeleton />

  return (
    <>
      <PhotoGrid
        items={items}
        pageSize={PHOTO_PAGE_ALL}
        onDelete={(ids) => void remove(ids)}
        onMove={(ids) => setMoving(ids)}
        onFavorite={(id) => favorite.mutate(id)}
        onPrimary={primary ? (id) => primary.set(id) : undefined}
        primaryId={primary?.id ?? null}
        extraActions={(item, targets) =>
          targets.length === 1
            ? [
                {
                  key: 'caption',
                  label: t('personal.media.caption'),
                  icon: PenLine,
                  run: () => setCaptioning(media.find((m) => m.id === item.id) ?? null),
                },
              ]
            : []
        }
        extraTools={extraTools}
        emptyText={emptyText ?? t('personal.media.empty')}
        emptyIcon={<ImagePlus className="size-6" />}
        emptyHint={emptyHint}
        emptyActions={emptyActions}
      />

      <Pagination {...mediaQ.pagination} />

      {moving && <PersonalMoveDialog ids={moving} onClose={() => setMoving(null)} />}
      {captioning && <CaptionDialog media={captioning} onClose={() => setCaptioning(null)} />}
    </>
  )
}

/** წარწერა და გადაღების თარიღი — ფაილი არ იცვლება */
function CaptionDialog({ media, onClose }: { media: PersonalMedia; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [caption, setCaption] = useState(media.caption ?? '')
  const [taken, setTaken] = useState<string | null>(media.taken_at ? media.taken_at.slice(0, 10) : null)

  const save = useMutation({
    mutationFn: () => updatePersonalMedia(media.id, { caption: caption.trim() || null, taken_at: taken }),
    onSuccess: () => {
      invalidatePersonal(qc)
      toast({ title: t('personal.media.saved'), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <ModalShell title={t('personal.media.caption')} onClose={onClose}>
      <form
        id="personal-caption-form"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <FormSection>
          <FormField label={t('personal.media.captionLabel')} htmlFor="personal-caption">
            <Input id="personal-caption" autoFocus value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={500} />
          </FormField>
          <FormField label={t('personal.media.taken')} size="half" htmlFor="personal-taken">
            <DatePicker id="personal-taken" value={taken} onChange={setTaken} />
          </FormField>
        </FormSection>
      </form>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button type="submit" form="personal-caption-form" disabled={save.isPending}>
          {t(save.isPending ? 'actions.saving' : 'actions.save')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
