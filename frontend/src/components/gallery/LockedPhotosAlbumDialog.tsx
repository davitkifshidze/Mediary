import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import { albumPasswordProblem } from '@/lib/albumPassword'
import { Button } from '@/components/ui/button'
import { FormSection } from '@/components/ui/form-layout'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { AlbumPasswordFields } from '@/components/gallery/AlbumPasswordFields'

/* ============================================================
   **„ჩაკეტილი ფოტოები" — სისტემური ალბომის პაროლი.**

   ფოტოს პირველი ჩაკეტვისას ალბომი ჯერ არ არსებობს (სერვერი 409
   `locked_album_password_required`-ით პასუხობს) — აქ პაროლი ირჩევა, და იგივე
   მოთხოვნა მეორდება. ⚠️ ალბომის ფორმის იგივე ველები (`AlbumPasswordFields`):
   ორი ლოკი ერთ აპში ორ სხვადასხვა ჩვევას არ უნდა ითხოვდეს.
   ============================================================ */

export function LockedPhotosAlbumDialog({
  count,
  busy,
  onSubmit,
  onClose,
}: {
  /** რამდენი ფოტო ჩაიკეტება */
  count: number
  busy: boolean
  onSubmit: (password: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const ready = !!password && !albumPasswordProblem(password, repeat)

  return (
    <ModalShell title={t('lock.photosAlbumTitle')} onClose={onClose} hint={t('lock.photosAlbumHint')}>
      <form
        id="locked-photos-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (ready) onSubmit(password)
        }}
      >
        {/* ⚠️ `plain`: პაროლის წყვილს თავისი ორსვეტიანი განლაგება აქვს — ბადის უჯრაში ის 1/12 სიგანეზე იჭყლიტებოდა */}
        <FormSection plain>
          <AlbumPasswordFields idPrefix="locked-photos" password={password} repeat={repeat} onPassword={setPassword} onRepeat={setRepeat} />
        </FormSection>
      </form>

      <ModalFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button type="submit" form="locked-photos-form" disabled={!ready || busy}>
          <Lock className="size-4" />
          {count > 1 ? t('lock.photos', { count }) : t('lock.photo')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
