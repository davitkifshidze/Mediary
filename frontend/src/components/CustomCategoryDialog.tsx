import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createCustomCategory,
  customCategoriesKey,
  updateCustomCategory,
  type CustomCategory,
  type CustomCategoryInput,
} from '@/api/customRecords'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { useModuleFields } from '@/lib/fields'
import { Button } from '@/components/ui/button'
import { IconPicker } from '@/components/ui/icon-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **პირადი მოდულის კლასიფიკატორის რიგი** (Tasks §37) — ჟანრი, ტიპი ან
   კატეგორია; დამატება და რედაქტირება.

   ორ ადგილას მუშაობს (ბუკმარკის კატეგორიის ნიმუშით): კლასიფიკატორების
   გვერდზე და ჩანაწერის ფორმის ამრჩევის გვერდით „+ ახალი".

   ⚠️ სათაური მოდულის **საკუთარ** სიტყვას იყენებს (`noun`) — „ჟანრის
   დამატება" თუ „ტიპის დამატება" მფლობელმა აირჩია (Q30).
   ============================================================ */

export function CustomCategoryDialog({
  moduleKey,
  noun,
  category,
  onClose,
  onSaved,
}: {
  moduleKey: string
  /**
   * კლასიფიკაციის სახელი — „ჟანრი" / „ტიპი" / „კატეგორია" ან მფლობელის
   * გადარქმეული. გამოტოვებისას ველების კონსტრუქტორიდან იკითხება (Q30).
   */
  noun?: string
  /** null = ახალი */
  category: CustomCategory | null
  onClose: () => void
  onSaved?: (saved: CustomCategory) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const fields = useModuleFields(moduleKey)
  const title = noun ?? fields.label('category')

  const [form, setForm] = useState<CustomCategoryInput>({
    name_ka: category?.name_ka ?? '',
    name_en: category?.name_en ?? '',
    icon: category?.icon ?? 'Folder',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: (input: CustomCategoryInput) =>
      category ? updateCustomCategory(moduleKey, category.id, input) : createCustomCategory(moduleKey, input),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: customCategoriesKey(moduleKey) })
      qc.invalidateQueries({ queryKey: ['custom-records', moduleKey] })
      toast({ title: t('customModules.categorySaved'), variant: 'success' })
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
    // ⚠️ ერთი ენა საკმარისია — მეორე იგივე ჩაიწერება (ბაზაში ორივე სავალდებულოა)
    const nameKa = form.name_ka.trim() || form.name_en.trim()
    const nameEn = form.name_en.trim() || nameKa
    save.mutate({ ...form, name_ka: nameKa, name_en: nameEn })
  }

  return (
    <ModalShell
      title={t(category ? 'customModules.categoryEdit' : 'customModules.categoryAdd', { noun: title })}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="cc-ka">{t('genres.name_ka')}</Label>
            <Input
              id="cc-ka"
              autoFocus
              value={form.name_ka}
              onChange={(e) => setForm((f) => ({ ...f, name_ka: e.target.value }))}
            />
            {errors.name_ka && <p className="mt-1 text-xs text-destructive">{errors.name_ka}</p>}
          </div>
          <div>
            <Label htmlFor="cc-en">{t('genres.name_en')}</Label>
            <Input
              id="cc-en"
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

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending || (!form.name_ka.trim() && !form.name_en.trim())}>
            {save.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
        </ModalFooter>
      </form>
    </ModalShell>
  )
}
