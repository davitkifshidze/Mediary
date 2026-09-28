import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { unlockPublicAlbum } from '@/api/publicProfile'
import { errorMessage, isApiCode } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { PasswordInput } from '@/components/ui/secret-input'

/* ============================================================
   **საჯარო პროფილის ჩაკეტილი ალბომის გახსნა** (Tasks §7.12 → §32).

   ⚠️ **პაროლი მფლობელისაა** — უცხოსთვის ალბომი პრაქტიკულად ჩაკეტილი
   რჩება; მექანიზმი კი უნდა არსებობდეს, თორემ მფლობელიც ვერ ნახავდა
   საკუთარ საჯარო ბმულზე. გახსნილობა **სერვერის სესიაშია** (BUG-02).

   ⚠️ **ერთი ფანჯარა ოთხივე ჭრილისთვის** — ჩაკეტილი ფილა „ყველა ფოტოშიც",
   ბიბლიოთეკის ჯგუფშიც და ალბომშიც შეიძლება იყოს. `PublicGalleryTab`
   მას ერთხელ ხატავს.

   ⚠️ **გახსნის შემდეგ მთელი საჯარო გალერეა ძველდება** (`['public-gallery',
   username]`): ალბომი ფოტოებს ყველა ჭრილში აბრუნებს, ესკიზებში და
   მთვლელებშიც — მარტო ერთი სიის განახლება ეკრანს ნახევრად ძველს დატოვებდა.

   ⚠️ **„პაროლი არასწორია" ველთან იწერება და ველს ასუფთავებს**, სხვა
   პასუხი (დროებითი ბლოკი, სესიის უქონლობა) კი თავისი ტექსტით — მფლობელის
   `AlbumUnlockDialog`-ის წესი.
   ============================================================ */

export function PublicAlbumUnlockDialog({
  username,
  albumId,
  onClose,
}: {
  username: string
  albumId: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [password, setPassword] = useState('')
  const [failed, setFailed] = useState(false)

  const unlock = useMutation({
    mutationFn: () => unlockPublicAlbum(username, albumId, password),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['public-gallery', username] })
      onClose()
    },
    onError: (e) => {
      const wrong = isApiCode(e, 'album_password_wrong')
      setFailed(wrong)
      if (wrong) setPassword('')
    },
  })

  return (
    <ModalShell title={t('gallery.albumUnlock')} onClose={onClose} hint={t('gallery.albumUnlockHint')}>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (password) unlock.mutate()
        }}
      >
        <div>
          <Label htmlFor="public-album-password" className="flex items-center gap-1.5">
            <Lock className="size-3.5" />
            {t('gallery.albumPassword')}
          </Label>
          <PasswordInput
            id="public-album-password"
            value={password}
            onChange={(v) => {
              setPassword(v)
              setFailed(false)
            }}
          />
          {failed && <p className="mt-1 text-xs text-destructive">{t('gallery.albumPasswordWrong')}</p>}
          {unlock.isError && !failed && (
            <p className="mt-1 text-xs text-destructive">{errorMessage(unlock.error)}</p>
          )}
        </div>

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={!password || unlock.isPending}>
            {t('gallery.albumUnlock')}
          </Button>
        </ModalFooter>
      </form>
    </ModalShell>
  )
}
