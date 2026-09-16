import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { unlockGalleryAlbum, type GalleryAlbum } from '@/api/gallery'
import { errorMessage, isApiCode } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { PasswordInput } from '@/components/ui/secret-input'

/* ============================================================
   **ჩაკეტილი ალბომის გახსნა (2026-09-16).**

   ⚠️ **პაროლი სერვერზე მოწმდება და გახსნილობაც იქვე ინახება** (სესიაში).
   კლიენტში შენახული „გასაღები" devtools-ში ისევ სანახავი იქნებოდა და
   ბრაუზერის გადატვირთვასაც გადაურჩებოდა — ე.ი. სწორედ ის, რისი
   თავიდან აცილებაც ლოკის აზრია.

   ⚠️ **შეცდომის ტექსტი არ ამბობს, რამდენად ახლოს იყავი** — სერვერის
   პასუხი ერთი და იგივეა არასწორ პაროლზეც და უპაროლო ალბომზეც.

   ⚠️ **გახსნის შემდეგ გალერეის ყველა სია ძველდება**: ალბომი ფოტოებს
   მთელ გალერეაში აბრუნებს (შეჯამების რიცხვშიც), ე.ი. მარტო ამ ჯგუფის
   განახლება ცხრილს ნახევრად ძველს დატოვებდა.
   ============================================================ */

export function AlbumUnlockDialog({
  album,
  onClose,
  onUnlocked,
}: {
  album: GalleryAlbum | { id: number; name: string }
  onClose: () => void
  onUnlocked?: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [password, setPassword] = useState('')
  const [failed, setFailed] = useState(false)

  const unlock = useMutation({
    mutationFn: () => unlockGalleryAlbum(album.id, password),
    onSuccess: () => {
      ;['gallery', 'gallery-photos', 'gallery-groups', 'gallery-summary', 'gallery-albums'].forEach(
        (key) => qc.invalidateQueries({ queryKey: [key] }),
      )
      onUnlocked?.()
      onClose()
    },
    /* ⚠️ **„პაროლი არასწორია" და „ძალიან ბევრი მცდელობაა" სხვადასხვა
       პასუხია და ერთ ტექსტში ვერ ჩაჯდება**: პირველი ველთან იწერება და
       ველს ასუფთავებს, მეორეს კი (429, ბრუტფორსის ჭერი) სერვერის
       საკუთარი ტექსტი აქვს — `isApiCode` სწორედ ამ ორის გასარჩევადაა. */
    onError: (e) => {
      const wrong = isApiCode(e, 'album_password_wrong')
      setFailed(wrong)
      if (wrong) setPassword('')
    },
  })

  return (
    <ModalShell title={album.name} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (password) unlock.mutate()
        }}
        className="space-y-4"
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4 shrink-0" />
          {t('gallery.albumUnlockHint')}
        </div>

        <div>
          <Label htmlFor="album-unlock">{t('gallery.albumPassword')}</Label>
          <PasswordInput
            id="album-unlock"
            value={password}
            onChange={(v) => {
              setPassword(v)
              setFailed(false)
            }}
            autoComplete="off"
          />
          {failed && (
            <p className="mt-1.5 text-xs text-destructive">{t('gallery.albumPasswordWrong')}</p>
          )}
          {unlock.isError && !failed && (
            <p className="mt-1.5 text-xs text-destructive">{errorMessage(unlock.error)}</p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={!password || unlock.isPending}>
            {t('gallery.albumUnlock')}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}
