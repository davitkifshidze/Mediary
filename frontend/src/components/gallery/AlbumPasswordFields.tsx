import { useTranslation } from 'react-i18next'
import { ALBUM_PASSWORD_MIN } from '@/api/gallery'
import { albumPasswordProblem } from '@/lib/albumPassword'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/secret-input'

/* ============================================================
   **ალბომის ახალი პაროლი — ველი და მისი გამეორება (Tasks §17.2).**

   ⚠️ **ერთი კომპონენტი ორ ადგილას**: ალბომის ფანჯარაში (`AlbumDialog`) და
   ალბომის ამრჩევში, სადაც ალბომი გადატანისასვე იქმნება (`AlbumPicker`).
   ორი ასლი ერთ დღეს სხვადასხვა წესს დაიცავდა — ერთი მოკლე პაროლს
   გაატარებდა და შეცდომას სერვერის toast-ში გაიგებდი.

   ⚠️ **„რა უშლის ხელს" ერთი ფუნქციაა** (`lib/albumPassword.ts`): ღილაკის
   გათიშვაც და ველთან დაწერილი მიზეზიც მას კითხულობს, ე.ი. „ღილაკი
   გათიშულია და არ ვიცი, რატომ" ვერ მოხდება.
   ============================================================ */

export function AlbumPasswordFields({
  idPrefix,
  password,
  repeat,
  onPassword,
  onRepeat,
  replacing = false,
}: {
  /** ⚠️ ერთ გვერდზე ორი ასეთი ბლოკი შეიძლება იდგეს (ფანჯარა ფანჯარაში) — id უნიკალური უნდა იყოს */
  idPrefix: string
  password: string
  repeat: string
  onPassword: (value: string) => void
  onRepeat: (value: string) => void
  /** ალბომს პაროლი უკვე ადევს — ველს „ახალი პაროლი" ჰქვია */
  replacing?: boolean
}) {
  const { t } = useTranslation()
  const problem = albumPasswordProblem(password, repeat)

  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${idPrefix}-password`}>
            {t(replacing ? 'gallery.albumNewPassword' : 'gallery.albumPassword')}
          </Label>
          <PasswordInput
            id={`${idPrefix}-password`}
            value={password}
            onChange={onPassword}
            autoComplete="new-password"
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-repeat`}>{t('gallery.albumRepeatPassword')}</Label>
          <PasswordInput
            id={`${idPrefix}-repeat`}
            value={repeat}
            onChange={onRepeat}
            autoComplete="new-password"
          />
        </div>
      </div>

      {problem && (
        <p className="text-xs text-destructive">
          {problem === 'short'
            ? t('gallery.albumPasswordShort', { min: ALBUM_PASSWORD_MIN })
            : t('gallery.albumPasswordMismatch')}
        </p>
      )}
    </div>
  )
}
