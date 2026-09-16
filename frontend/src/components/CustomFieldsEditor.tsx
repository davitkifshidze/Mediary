import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import {
  CUSTOM_FIELD_MODULES,
  CUSTOM_FIELD_TYPES,
  fetchCustomFields,
  saveCustomFields,
  type CustomFieldDefinition,
  type CustomFieldType,
} from '@/api/account'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   მორგებული ველების რედაქტორი (Tasks §6, ფაზა 3 · `DECISIONS.md` §2).

   ⚠️ **მთელი სია ერთ `PUT`-ში მიდის** — დამატება, გადარქმევა, გადალაგება და
   წაშლა ერთი ოპერაციაა. სხვაგვარად თანმიმდევრობა და შემადგენლობა შეიძლება
   ერთმანეთს აცდენოდა (იგივე ნიმუში, რაც `PUT /playlists/{id}/songs`-ს აქვს).

   ⚠️ **key არ იცვლება.** სახელის გადარქმევა ლეიბლს ცვლის; key ბაზაში
   დაწერილ მნიშვნელობებს აკავშირებს და მისი შეცვლა მათ ობლად დატოვებდა.

   ⚠️ **წაშლა მნიშვნელობასაც შლის** — backend სიიდან ამოღებულ key-ს
   `<module>_field_values`-იდანაც იღებს. ტექსტში ეს ცხადად წერია.

   ⚠️ **`ფაილი` ტიპზე წაშლა და ტიპის შეცვლაც ატვირთულ ფაილს იტანს** (ფაზა 4b):
   ის დისკზეა და კვოტიდან იხარჯება, ე.ი. „უბრალოდ აღარ იკითხება" აქ არ
   კმარა — ფაილი ობლად დარჩებოდა. ამიტომ გამაფრთხილებელი ტექსტი ორივეს ეხება.
   ============================================================ */

/** ლოკალური სამუშაო ასლი — `sort_order` სიის რიგიდან გამოითვლება */
type Draft = Omit<CustomFieldDefinition, 'sort_order'>

export function CustomFieldsEditor({
  moduleKey,
  enabled,
}: {
  moduleKey: string
  enabled: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const supported = (CUSTOM_FIELD_MODULES as readonly string[]).includes(moduleKey)

  const { data: fields = [] } = useQuery({
    queryKey: ['custom-fields', moduleKey],
    queryFn: () => fetchCustomFields(moduleKey),
    enabled: enabled && supported,
  })

  const [draft, setDraft] = useState<Draft[]>([])
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!dirty) setDraft(fields.map(({ sort_order: _sort, ...rest }) => rest))
  }, [fields, dirty])

  const save = useMutation({
    mutationFn: () =>
      saveCustomFields(
        moduleKey,
        draft.map((f, i) => ({ ...f, sort_order: (i + 1) * 10 })),
      ),
    onSuccess: (next) => {
      setDirty(false)
      qc.setQueryData(['custom-fields', moduleKey], next)
      // ფორმებიც ამ სიას კითხულობენ (`useModuleFields`)
      qc.invalidateQueries({ queryKey: ['module-fields', moduleKey] })
      toast({ title: t('customFields.saved'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  if (!enabled || !supported) return null

  const patch = (index: number, change: Partial<Draft>) => {
    setDirty(true)
    setDraft((d) => d.map((f, i) => (i === index ? { ...f, ...change } : f)))
  }

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= draft.length) return
    setDirty(true)
    setDraft((d) => {
      const next = [...d]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const add = () => {
    setDirty(true)
    setDraft((d) => [
      ...d,
      {
        key: '',
        type: 'text',
        label_ka: '',
        label_en: '',
        placeholder_ka: null,
        placeholder_en: null,
        enabled: true,
        required: false,
      },
    ])
  }

  const remove = (index: number) => {
    setDirty(true)
    setDraft((d) => d.filter((_, i) => i !== index))
  }

  return (
    <section className="mb-4 rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 font-display text-lg font-semibold tracking-tight">
            {t('customFields.editorTitle')}
            <InfoHint info={t('customFields.editorHint')} />
          </h2>
        </div>
        <Button variant="outline" size="sm" onClick={add}>
          <Plus className="size-4" />
          {t('customFields.add')}
        </Button>
      </div>

      {draft.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('customFields.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {draft.map((f, i) => (
            <li key={f.key || `new-${i}`} className="rounded-lg border border-border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`cfe-ka-${i}`}>{t('genres.name_ka')}</Label>
                  <Input
                    id={`cfe-ka-${i}`}
                    value={f.label_ka ?? ''}
                    onChange={(e) => patch(i, { label_ka: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`cfe-en-${i}`}>{t('genres.name_en')}</Label>
                  <Input
                    id={`cfe-en-${i}`}
                    value={f.label_en ?? ''}
                    onChange={(e) => patch(i, { label_en: e.target.value })}
                  />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="w-40">
                  <Label>{t('customFields.type')}</Label>
                  {/* ⚠️ ტიპი არსებულ ველზეც იცვლება, მაგრამ ძველი მნიშვნელობა
                      მაშინ აღარ იკითხება — backend ტიპს განსაზღვრებიდან იღებს */}
                  <Select
                    value={f.type}
                    onValueChange={(v) => patch(i, { type: v as CustomFieldType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CUSTOM_FIELD_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(`customFields.types.${type}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={f.enabled} onCheckedChange={(v) => patch(i, { enabled: v })} />
                  {t('fields.enabled')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={f.required} onCheckedChange={(v) => patch(i, { required: v })} />
                  {t('fields.required')}
                </label>

                <span className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label={t('fields.moveUp')}
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={i === draft.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={t('fields.moveDown')}
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => remove(i)}
                    aria-label={t('actions.delete')}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dirty && (
        <div className="mt-4 flex items-center justify-end gap-3 border-t border-border pt-3">
          {/* ⚠️ ცხადად ვამბობთ, რომ წაშლა მნიშვნელობებსაც წაიღებს */}
          <p className="text-xs text-muted-foreground">{t('customFields.deleteWarning')}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDirty(false)
              setDraft(fields.map(({ sort_order: _sort, ...rest }) => rest))
            }}
          >
            {t('actions.cancel')}
          </Button>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
        </div>
      )}
    </section>
  )
}
