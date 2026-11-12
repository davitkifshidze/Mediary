import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { Trash2, X } from 'lucide-react'
import { deleteGalleryAlbum, type AlbumPhotosFate, type GalleryAlbum } from '@/api/gallery'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/feedback'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/* ============================================================
   **ჩაკეტილი ალბომის წაშლა — რა ვუყოთ ფოტოებს.**

   ჩვეულებრივი ალბომის წაშლა ფოტოებს ალბომის გარეშე ტოვებს და ეს უვნებელია. ჩაკეტილზე
   იგივე ერთი დაჭერით ყველა დამალულ ფოტოს გახსნიდა — ამიტომ ფანჯარა ცხადად კითხულობს:

   - **ფოტოებიც ურნაში** (ნაგულისხმევი) — ფოტოები ალბომს თან მიჰყვება და ჩაკეტილი
     რჩება; ალბომის აღდგენა მათაც აბრუნებს;
   - **სხვა ალბომში გადატანა** — ფოტოები არჩეული ალბომის წესს იღებს;
   - **ფოტოები გაიხსნას და დარჩეს** — პაროლი იხსნება, ფოტოები გალერეაში ჩანს.

   ⚠️ ნაგულისხმევი არასდროს ხსნის: გახსნა მხოლოდ ცხადი არჩევანია.
   ============================================================ */

const FATES: AlbumPhotosFate[] = ['trash', 'move', 'release']

export function AlbumDeleteDialog({
  album,
  photos,
  others,
  onClose,
  onDeleted,
}: {
  album: GalleryAlbum
  /** რამდენი ფოტოა ალბომში */
  photos: number
  /** სხვა ალბომები — გადატანის მიზნები */
  others: GalleryAlbum[]
  onClose: () => void
  onDeleted: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [fate, setFate] = useState<AlbumPhotosFate>('trash')
  const [target, setTarget] = useState('')

  const remove = useMutation({
    mutationFn: () => deleteGalleryAlbum(album.id, { photos: fate, moveTo: fate === 'move' ? Number(target) : null }),
    onSuccess: () => {
      toast({ title: t(`gallery.albumDelete.done.${fate}`), variant: 'success' })
      onDeleted()
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const ready = fate !== 'move' || target !== ''

  return (
    <ModalShell title={t('gallery.albumDeleteTitle')} onClose={onClose} hint={t('gallery.albumDelete.hint')}>
      <p className="text-sm text-muted-foreground" data-testid="album-delete-count">
        {t('gallery.albumDelete.count', { name: album.name, count: photos })}
      </p>

      <RadioGroup value={fate} onValueChange={(next) => setFate(next as AlbumPhotosFate)} className="mt-4 gap-2">
        {FATES.map((key) => (
          <div
            key={key}
            className={`rounded-md border p-3 transition-colors ${fate === key ? 'border-primary bg-secondary/40' : 'border-border'}`}
            data-fate={key}
          >
            <label className="flex cursor-pointer items-start gap-3">
              <RadioGroupItem value={key} className="mt-0.5" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t(`gallery.albumDelete.${key}`)}</span>
                <span className="block text-xs text-muted-foreground">{t(`gallery.albumDelete.${key}Hint`)}</span>
              </span>
            </label>
            {key === 'move' && fate === 'move' && (
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger className="mt-2 h-9" aria-label={t('gallery.albumDelete.pickAlbum')}>
                  <SelectValue placeholder={t('gallery.albumDelete.pickAlbum')} />
                </SelectTrigger>
                <SelectContent>
                  {others.map((other) => (
                    <SelectItem key={other.id} value={String(other.id)}>
                      {other.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        ))}
      </RadioGroup>

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          <X className="size-4" />
          {t('actions.cancel')}
        </Button>
        <Button variant="destructive" disabled={!ready || remove.isPending} onClick={() => remove.mutate()} data-testid="album-delete-confirm">
          <Trash2 className="size-4" />
          {t('confirm.delete')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
