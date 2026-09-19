import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createPlaceCategory,
  updatePlaceCategory,
  type PlaceCategory,
  type PlaceCategoryInput,
} from '@/api/places'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { IconPicker } from '@/components/ui/icon-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   ადგილის კატეგორიის დამატება/რედაქტირება.

   იგივე მოდალი ორ ადგილას მუშაობს (ვიდეოს ტიპების ნიმუშით):
   · `/dictionaries/place-categories` — სრული მართვა
   · ადგილის ფორმის select-ის გვერდით „+ ახალი კატეგორია".
   ============================================================ */

export function PlaceCategoryDialog({
  category,
  onClose,
  onSaved,
}: {
  /** null = ახალი კატეგორია */
  category: PlaceCategory | null
  onClose: () => void
  onSaved?: (saved: PlaceCategory) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [form, setForm] = useState<PlaceCategoryInput>({
    name_ka: category?.name_ka ?? '',
    name_en: category?.name_en ?? '',
    icon: category?.icon ?? 'MapPin',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: (input: PlaceCategoryInput) =>
      category ? updatePlaceCategory(category.id, input) : createPlaceCategory(input),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['place-categories'] })
      qc.invalidateQueries({ queryKey: ['places'] })
      toast({ title: t('placeCategories.saved'), variant: 'success' })
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
    <ModalShell
      title={t(category ? 'placeCategories.edit' : 'placeCategories.add')}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="pc-ka">{t('genres.name_ka')}</Label>
            <Input
              id="pc-ka"
              autoFocus
              value={form.name_ka}
              onChange={(e) => setForm((f) => ({ ...f, name_ka: e.target.value }))}
            />
            {errors.name_ka && <p className="mt-1 text-xs text-destructive">{errors.name_ka}</p>}
          </div>
          <div>
            <Label htmlFor="pc-en">{t('genres.name_en')}</Label>
            <Input
              id="pc-en"
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
