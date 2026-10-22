import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Lock, PenLine } from 'lucide-react'
import {
  deletePersonalMedia,
  fetchPersonalMedia,
  lockPersonalMedia,
  PERSONAL_KEY,
  togglePersonalFavorite,
  updatePersonalMedia,
  type PersonalMedia,
  type PersonalMediaFilters,
} from '@/api/personal'
import { useDateFormat } from '@/lib/dates'
import { errorMessage, isApiCode } from '@/lib/errors'
import { usePages } from '@/lib/paged'
import { invalidatePersonal, personalPhotoItem } from '@/lib/personal'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { FormField, FormSection } from '@/components/ui/form-layout'
import { Input } from '@/components/ui/input'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { PhotoGrid } from '@/components/ui/photo-grid'
import { usePhotoPageSize } from '@/lib/pageSize'
import { Pagination } from '@/components/ui/pagination'
import { GalleryStackSkeleton } from '@/components/gallery/GalleryPhotoGrid'
import { LockedPhotosAlbumDialog } from '@/components/gallery/LockedPhotosAlbumDialog'
import { PersonalMoveDialog } from '@/components/personal/PersonalMoveDialog'

/* ============================================================
   **ფოტოებისა და ვიდეოების ბადე** — ერთი კომპონენტი
   ყველა ადგილისთვის: „ფოტო & ვიდეო", პიროვნების ჩანართები, ალბომი, ჯგუფი.

   ⚠️ **`PhotoGrid`-ზე დგას** (გალერეის ბადე): მონიშვნა, ლაითბოქსი, ჩამოტვირთვა,
   კონტექსტური მენიუ — და პირადი გალერეის დამატებები: ვიდეო ლაითბოქსში, რჩეული,
   გადატანა პიროვნებაში/ალბომში, „მთავარად დაყენება" პიროვნებაზე/ალბომზე,
   წარწერა. მესამე ბადის დაწერა ზუსტად ის ასლი იქნებოდა, რომელიც სხვაგვარად
   მოიქცეოდა.

   ⚠️ **„ჩაკეტვა" — გალერეის წესით** (`lockPersonalMedia`): ფოტო/ვიდეო სისტემურ
   „ჩაკეტილ ფოტოებში" გადადის და ბადიდან ქრება; პირველად სერვერი 409-ით
   ითხოვს პაროლს და იგივე ფანჯარა (`LockedPhotosAlbumDialog`) იმავე ფაილებს
   ხელახლა აგზავნის. მონიშნულზე — ყველა მონიშნული.

   ⚠️ **„წარწერა" ფილის ღილაკიცაა** (`quick` — „რჩეული · წარწერა · წაშლა" + ⋯)
   და გახსნილ ფოტოზე ლაითბოქსის ზოლშიც — მენიუში დამალული აღარ არის.

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
  /** პიროვნების/ალბომის მთავარი ფოტო — „მთავარად დაყენება" და ვარსკვლავის ნიშანი */
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
  /** რომლის ჩაკეტვას ელოდება „ჩაკეტილი ფოტოების" პაროლი (პირველი ჩაკეტვა) */
  const [lockingIds, setLockingIds] = useState<number[] | null>(null)

  // ⚠️ ჩადგმული სიაა (ჩანართი, ალბომი) — გვერდი მისამართს არ ეხება; ზომა ფოტოს ბადის არჩევანია
  const [pageSize, setPageSize] = usePhotoPageSize()
  const mediaQ = usePages({
    queryKey: [PERSONAL_KEY, 'media', filters],
    fetchPage: (page, per_page) => fetchPersonalMedia({ ...filters, page, per_page }),
    pageSize,
  })

  const media = mediaQ.items
  const items = useMemo(() => media.map((m) => personalPhotoItem(m, t, date)), [media, t, date])

  const favorite = useMutation({
    mutationFn: (id: number) => togglePersonalFavorite(id),
    onSuccess: () => invalidatePersonal(qc),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const lock = useMutation({
    mutationFn: ({ ids, password }: { ids: number[]; password?: string }) => lockPersonalMedia(ids, password),
    onSuccess: (result) => {
      invalidatePersonal(qc)
      setLockingIds(null)
      toast({ title: t('lock.photosDone', { count: result.locked }), variant: 'success' })
    },
    onError: (e, vars) => {
      if (isApiCode(e, 'locked_album_password_required')) {
        setLockingIds(vars.ids)
        return
      }
      toast({ title: errorMessage(e), variant: 'error' })
    },
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

  const caption = (id: number) => setCaptioning(media.find((m) => m.id === id) ?? null)

  if (mediaQ.isLoading) return <GalleryStackSkeleton />

  return (
    <>
      <PhotoGrid
        items={items}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        total={mediaQ.total}
        onDelete={(ids) => void remove(ids)}
        onMove={(ids) => setMoving(ids)}
        onFavorite={(id) => favorite.mutate(id)}
        onPrimary={primary ? (id) => primary.set(id) : undefined}
        primaryId={primary?.id ?? null}
        extraActions={(item, targets) => [
          ...(targets.length === 1
            ? [
                {
                  key: 'caption',
                  label: t('personal.media.captionLabel'),
                  icon: PenLine,
                  run: () => caption(item.id),
                  quick: true,
                },
              ]
            : []),
          {
            key: 'lock',
            label: targets.length > 1 ? t('lock.photos', { count: targets.length }) : t('lock.photo'),
            icon: Lock,
            run: () => lock.mutate({ ids: targets }),
          },
        ]}
        lightboxExtra={(item, close) => (
          <button
            type="button"
            className="yarl__button flex items-center gap-1.5 text-sm"
            data-testid="lightbox-caption"
            onClick={() => {
              close()
              caption(item.id)
            }}
          >
            <PenLine className="size-4" />
            {t('personal.media.captionLabel')}
          </button>
        )}
        extraTools={extraTools}
        emptyText={emptyText ?? t('personal.media.empty')}
        emptyIcon={<ImagePlus className="size-6" />}
        emptyHint={emptyHint}
        emptyActions={emptyActions}
      />

      <Pagination {...mediaQ.pagination} />

      {moving && <PersonalMoveDialog ids={moving} onClose={() => setMoving(null)} />}
      {captioning && <CaptionDialog media={captioning} onClose={() => setCaptioning(null)} />}
      {lockingIds && (
        <LockedPhotosAlbumDialog
          count={lockingIds.length}
          busy={lock.isPending}
          onSubmit={(password) => lock.mutate({ ids: lockingIds, password })}
          onClose={() => setLockingIds(null)}
        />
      )}
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
