import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock, LockOpen, ShieldAlert } from 'lucide-react'
import {
  createGalleryAlbum,
  updateGalleryAlbum,
  type GalleryAlbum,
} from '@/api/gallery'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { PasswordInput } from '@/components/ui/secret-input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **ალბომის დამატება/რედაქტირება — მოდალი (შენი მითითება, 2026-09-16).**

   ⚠️ **ადრე ეს ინლაინ ველი იყო ხელსაწყოების ზოლში** და სწორედ ამიტომ
   ითხოვდი მოდალს: ერთი პატარა ინპუტი ბარათების თავზე არც სახელს
   იტევდა, არც აღწერას, არც ლოკს — ე.ი. ალბომს მხოლოდ სახელი შეიძლებოდა
   ჰქონოდა, და რედაქტირებისას ფოკუსი ეკრანის სულ სხვა კუთხეში ხტებოდა.

   ⚠️ **ლოკი აქვეა და არა ცალკე ფანჯარაში**: „ალბომის პარამეტრები" ერთი
   კითხვაა. ცალკე რომ ყოფილიყო, „პაროლი დავადე თუ არა" ორ ადგილას
   იკითხებოდა.

   ⚠️ **პაროლის შეცვლა/მოხსნა მოქმედი პაროლის ცოდნას ითხოვს** (`current_password`)
   — გარდა იმ შემთხვევისა, როცა ალბომი ამ სესიაში უკვე გახსნილია, ე.ი.
   პაროლი ისედაც შეიყვანე. სერვერზეც ზუსტად ეს წესია; აქ მხოლოდ იმას
   ვწყვეტთ, ველი გამოჩნდეს თუ არა.
   ============================================================ */

export function AlbumDialog({
  album,
  onClose,
}: {
  /** `null` — ახალი ალბომი */
  album: GalleryAlbum | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [name, setName] = useState(album?.name ?? '')
  const [description, setDescription] = useState(album?.description ?? '')

  /** ლოკის ბლოკი: ახალი პაროლი · მისი გამეორება · მოქმედი პაროლი */
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [current, setCurrent] = useState('')
  const [removing, setRemoving] = useState(false)

  const locked = !!album?.locked
  /** მოქმედი პაროლი მაშინ ჰკითხე, როცა ლოკი უკვე დგას და სესია ღია არაა */
  const needsCurrent = locked && !album?.unlocked

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim()

      if (!album) {
        return createGalleryAlbum({
          name: trimmed,
          description: description.trim() || null,
          password: password ? password : undefined,
        })
      }

      return updateGalleryAlbum(album.id, {
        name: trimmed,
        description: description.trim() || null,
        ...(removing
          ? { remove_password: true }
          : password
            ? { password }
            : {}),
        ...(needsCurrent && (removing || password) ? { current_password: current } : {}),
      })
    },
    onSuccess: () => {
      // ლოკი ფოტოების ხილვადობას ცვლის, ე.ი. გალერეის ყველა სია ძველდება
      ;['gallery', 'gallery-photos', 'gallery-groups', 'gallery-summary', 'gallery-albums'].forEach(
        (key) => qc.invalidateQueries({ queryKey: [key] }),
      )
      toast({ title: t('gallery.albumSaved'), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const mismatch = !!password && password !== repeat
  const ready =
    !!name.trim() &&
    !mismatch &&
    (!needsCurrent || !(removing || password) || !!current)

  return (
    <ModalShell title={t(album ? 'gallery.albumEdit' : 'gallery.albumAdd')} onClose={onClose}>
      <form
        id="album-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (ready) save.mutate()
        }}
        className="space-y-4"
      >
        <div>
          <Label htmlFor="album-name">{t('gallery.albumName')}</Label>
          <Input
            id="album-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
        </div>

        <div>
          <Label htmlFor="album-desc">{t('gallery.albumDescription')}</Label>
          <Textarea
            id="album-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={255}
          />
        </div>

        {/* ---------- ლოკი ---------- */}
        <section className="rounded-md border border-border p-3">
          <div className="mb-2 flex items-center gap-2">
            {locked ? (
              <Lock className="size-4 text-primary" />
            ) : (
              <LockOpen className="size-4 text-muted-foreground" />
            )}
            <h3 className="text-sm font-semibold">{t('gallery.albumLockTitle')}</h3>
          </div>

          <p className="mb-3 text-xs text-muted-foreground">
            {t(locked ? 'gallery.albumLockedHint' : 'gallery.albumLockHint')}
          </p>

          {needsCurrent && (removing || password) && (
            <div className="mb-3">
              <Label htmlFor="album-current">{t('gallery.albumCurrentPassword')}</Label>
              <PasswordInput id="album-current" value={current} onChange={setCurrent} />
            </div>
          )}

          {removing ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
              <ShieldAlert className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">{t('gallery.albumRemoveLockHint')}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRemoving(false)}>
                {t('actions.cancel')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="album-password">
                    {t(locked ? 'gallery.albumNewPassword' : 'gallery.albumPassword')}
                  </Label>
                  <PasswordInput
                    id="album-password"
                    value={password}
                    onChange={setPassword}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <Label htmlFor="album-repeat">{t('gallery.albumRepeatPassword')}</Label>
                  <PasswordInput id="album-repeat" value={repeat} onChange={setRepeat} />
                </div>
              </div>

              {mismatch && (
                <p className="text-xs text-destructive">{t('gallery.albumPasswordMismatch')}</p>
              )}

              {locked && (
                <Button type="button" variant="outline" size="sm" onClick={() => setRemoving(true)}>
                  <LockOpen className="size-4" />
                  {t('gallery.albumRemoveLock')}
                </Button>
              )}
            </div>
          )}
        </section>
      </form>

      {/* ⚠️ მოქმედებების რიგი `</form>`-ის შემდეგაა და `form=`-ით უკავშირდება —
          პროექტის არსებული წესი: ღილაკები ბოლოში დგანან და არა შუაში */}
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button type="submit" form="album-form" disabled={!ready || save.isPending}>
          {t('actions.save')}
        </Button>
      </div>
    </ModalShell>
  )
}
