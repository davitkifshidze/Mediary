import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createBoardGameGenre,
  updateBoardGameGenre,
  type BoardGameGenre,
  type BoardGameGenreInput,
} from '@/api/boardGames'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { IconPicker } from '@/components/ui/icon-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   ბორდგეიმის ჟანრის დამატება/რედაქტირება.

   იგივე მოდალი ორ ადგილას მუშაობს (როგორც წიგნებსა და სიმღერებზე):
   `/board-game-genres` და ფორმის „+ ახალი ჟანრი".
   ============================================================ */

export function BoardGameGenreDialog({
  genre,
  onClose,
  onSaved,
}: {
  /** null = ახალი ჟანრი */
  genre: BoardGameGenre | null
  onClose: () => void
  onSaved?: (saved: BoardGameGenre) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [form, setForm] = useState<BoardGameGenreInput>({
    name_ka: genre?.name_ka ?? '',
    name_en: genre?.name_en ?? '',
    icon: genre?.icon ?? 'Dices',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: (input: BoardGameGenreInput) =>
      genre ? updateBoardGameGenre(genre.id, input) : createBoardGameGenre(input),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['board-game-genres'] })
      qc.invalidateQueries({ queryKey: ['board-games'] })
      toast({ title: t('boardGameGenres.saved'), variant: 'success' })
      onSaved?.(saved)
      onClose()
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    save.mutate(form)
  }

  return (
    <ModalShell title={t(genre ? 'boardGameGenres.edit' : 'boardGameGenres.add')} onClose={onClose} wide>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="bgg-ka">{t('genres.name_ka')}</Label>
            <Input
              id="bgg-ka"
              autoFocus
              value={form.name_ka}
              onChange={(e) => setForm((f) => ({ ...f, name_ka: e.target.value }))}
            />
            {errors.name_ka && <p className="mt-1 text-xs text-destructive">{errors.name_ka}</p>}
          </div>
          <div>
            <Label htmlFor="bgg-en">{t('genres.name_en')}</Label>
            <Input
              id="bgg-en"
              value={form.name_en}
              onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
            />
            {errors.name_en && <p className="mt-1 text-xs text-destructive">{errors.name_en}</p>}
          </div>
        </div>

        <div>
          <Label>{t('videoTypes.icon')}</Label>
          <IconPicker
            value={form.icon}
            onChange={(icon) => setForm((f) => ({ ...f, icon }))}
            className="mt-1"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}
