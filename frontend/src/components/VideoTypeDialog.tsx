import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createVideoType,
  updateVideoType,
  type VideoType,
  type VideoTypeInput,
} from '@/api/videos'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { ICON_NAMES, ModuleIcon } from '@/components/ModuleIcon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   ვიდეოს ტიპის დამატება/რედაქტირება (Tasks 5.1).

   ერთი და იმავე მოდალი ორ ადგილას მუშაობს:
   · `/video-types` — სრული მართვა (ეტაპი 1)
   · ვიდეოს ფორმის select-ის გვერდით „+ ახალი ტიპი" (ეტაპი 2),
     კონტექსტიდან გაუსვლელად.
   ============================================================ */

export function VideoTypeDialog({
  type,
  onClose,
  onSaved,
}: {
  /** null = ახალი ტიპი */
  type: VideoType | null
  onClose: () => void
  onSaved?: (saved: VideoType) => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [form, setForm] = useState<VideoTypeInput>({
    name_ka: type?.name_ka ?? '',
    name_en: type?.name_en ?? '',
    icon: type?.icon ?? ICON_NAMES[0],
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = useMutation({
    mutationFn: (input: VideoTypeInput) =>
      type ? updateVideoType(type.id, input) : createVideoType(input),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['video-types'] })
      qc.invalidateQueries({ queryKey: ['videos'] })
      toast({ title: t('videoTypes.saved'), variant: 'success' })
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
    <ModalShell title={t(type ? 'videoTypes.edit' : 'videoTypes.add')} onClose={onClose} wide>
      <form onSubmit={submit} className="mt-4 space-y-4">
        {/* 2.3 — ველები ორ სვეტად, რომ მოდალი მაღალი არ გამოვიდეს */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="vt-ka">{t('genres.name_ka')}</Label>
            <Input
              id="vt-ka"
              autoFocus
              value={form.name_ka}
              onChange={(e) => setForm((f) => ({ ...f, name_ka: e.target.value }))}
            />
            {errors.name_ka && <p className="mt-1 text-xs text-destructive">{errors.name_ka}</p>}
          </div>
          <div>
            <Label htmlFor="vt-en">{t('genres.name_en')}</Label>
            <Input
              id="vt-en"
              value={form.name_en}
              onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))}
            />
            {errors.name_en && <p className="mt-1 text-xs text-destructive">{errors.name_en}</p>}
          </div>
        </div>

        <div>
          <Label>{t('videoTypes.icon')}</Label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {ICON_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setForm((f) => ({ ...f, icon: name }))}
                aria-label={name}
                aria-pressed={form.icon === name}
                className={cn(
                  'grid size-9 cursor-pointer place-items-center rounded-md border transition-colors',
                  form.icon === name
                    ? 'border-primary bg-secondary text-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <ModuleIcon name={name} className="size-4" />
              </button>
            ))}
          </div>
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
