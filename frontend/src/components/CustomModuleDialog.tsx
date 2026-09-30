import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import {
  CUSTOM_CLASSIFICATIONS,
  CUSTOM_FIELD_TYPES,
  createCustomModule,
  updateCustomModule,
  type CustomClassification,
  type CustomFieldDraft,
  type CustomStatusPreset,
  type ModuleInfo,
} from '@/api/account'
import { classificationKey } from '@/lib/customModules'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { keyRow, unkeyRows, type Keyed } from '@/lib/rowKeys'
import { ModuleIcon } from '@/components/ModuleIcon'
import { TagSelect } from '@/components/TagSelect'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { IconPicker } from '@/components/ui/icon-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { RadioGroup } from '@/components/ui/radio-group'
import { ScopeRow } from '@/components/ui/scope-row'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StepSection } from '@/components/ui/step-section'
import { useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   **ახალი მოდულის ოსტატი (Tasks §37.2).**

   შენი სიტყვები: „მოდულებში შეიძლებოდეს ახალი მოდულის დამატება და მისი
   ქვემენიუების დამატება… ასევე ველები (ჟანრი, ტიპი, კატეგორია) —
   მოდულებიდან იწერებოდეს".

   ⚠️ **ოთხი ნაბიჯი ერთ ფანჯარაში და არა გვერდებად** (`StepSection`, ვებძებნის
   დიალოგის წესი): რა რის შემდეგ კეთდება, ნომერი ამბობს, ხოლო ყველაფერი
   ერთდროულად ჩანს — სახელის გასწორება ველების შემდეგ „უკან დაბრუნებას"
   აღარ ითხოვს.

   ⚠️ **რედაქტირებისას მხოლოდ პირველი ორი ნაბიჯია.** სტატუსების ნაკრები
   მხოლოდ საწყისი იყო (შემდეგ მას კლასიფიკატორების გვერდი მართავს), ველები
   კი მოდულის გვერდზეა — იმავე რედაქტორით, რაც ყველა სხვა მოდულს აქვს.

   ⚠️ **ველის რიგებს `_key` აქვს** (`lib/rowKeys.ts`, BUG-11): შუა რიგის
   წაშლა ინდექსით დაკავშირებულ DOM-ს შემდეგ რიგს გადასცემდა (ფოკუსი,
   გახსნილი ამრჩევი).
   ============================================================ */

/** ფერის წინასწარი არჩევანი — საბაზისო მოდულების ფერებისგან განსხვავებული ტონები */
const COLORS = ['#6366f1', '#0891b2', '#16a34a', '#ca8a04', '#ea580c', '#dc2626', '#db2777', '#7c3aed', '#475569']

/** ნაგულისხმევი აიქონი — „ყუთები" (ზოგადი კოლექცია) */
const DEFAULT_ICON = 'Boxes'

export function CustomModuleDialog({
  module,
  onClose,
}: {
  /** რედაქტირება — `null`/გამოტოვებული = ახალი მოდული */
  module?: ModuleInfo | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { toast } = useToast()
  const editing = !!module

  const [nameKa, setNameKa] = useState(module?.name_ka ?? '')
  const [nameEn, setNameEn] = useState(module?.name_en ?? '')
  const [descKa, setDescKa] = useState(module?.description_ka ?? '')
  const [descEn, setDescEn] = useState(module?.description_en ?? '')
  const [icon, setIcon] = useState(module?.icon ?? DEFAULT_ICON)
  const [color, setColor] = useState<string | null>(module?.color ?? COLORS[0])
  const [classification, setClassification] = useState<CustomClassification | 'none'>(
    module?.definition?.classification ?? (editing ? 'none' : 'category'),
  )
  const [categories, setCategories] = useState<string[]>([])
  const [statuses, setStatuses] = useState<CustomStatusPreset>('default')
  const [fields, setFields] = useState<Keyed<CustomFieldDraft>[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  const done = () => {
    qc.invalidateQueries({ queryKey: ['modules'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
    // ⚠️ მფლობელის უფლებების რუკა (`permissions`) ახალ გასაღებს `/auth/me`-იდან იღებს
    qc.invalidateQueries({ queryKey: ['me'] })
  }

  const save = useMutation({
    mutationFn: () => {
      const kind = classification === 'none' ? null : classification
      const details = {
        name_ka: nameKa.trim() || nameEn.trim(),
        name_en: nameEn.trim() || nameKa.trim(),
        description_ka: descKa.trim() || null,
        description_en: descEn.trim() || null,
        icon,
        color,
        classification: kind,
      }

      if (module) return updateCustomModule(module.key, details)

      return createCustomModule({
        ...details,
        statuses,
        categories: kind ? categories : [],
        // ⚠️ უსახელო რიგი იგზავნება არა — backend მას ისედაც გადააგდებდა
        fields: unkeyRows(fields).filter((f) => (f.label_ka ?? '').trim() || (f.label_en ?? '').trim()),
      })
    },
    onSuccess: (saved) => {
      done()
      toast({ title: t(editing ? 'customModules.saved' : 'customModules.created'), variant: 'success' })
      onClose()
      if (!editing) navigate(saved.route_base)
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  const nameMissing = !nameKa.trim() && !nameEn.trim()

  const patchField = (key: string, change: Partial<CustomFieldDraft>) =>
    setFields((rows) => rows.map((row) => (row._key === key ? { ...row, ...change } : row)))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    save.mutate()
  }

  return (
    <ModalShell
      title={t(editing ? 'customModules.editTitle' : 'customModules.createTitle')}
      hint={t(editing ? 'customModules.editHint' : 'customModules.createHint')}
      onClose={onClose}
      wide
    >
      <form id="custom-module-form" onSubmit={submit} className="mt-4 space-y-4">
        {/* ---------- 1. სახელი და იერსახე ---------- */}
        <StepSection step={1} title={t('customModules.stepLook')} hint={t('customModules.stepLookHint')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="cm-ka">{t('customModules.nameKa')}</Label>
              <Input id="cm-ka" autoFocus value={nameKa} onChange={(e) => setNameKa(e.target.value)} maxLength={60} />
              {errors.name_ka && <p className="mt-1 text-xs text-destructive">{errors.name_ka}</p>}
            </div>
            <div>
              <Label htmlFor="cm-en">{t('customModules.nameEn')}</Label>
              <Input id="cm-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} maxLength={60} />
              {errors.name_en && <p className="mt-1 text-xs text-destructive">{errors.name_en}</p>}
            </div>
            <div>
              <Label htmlFor="cm-dka">{t('customModules.descriptionKa')}</Label>
              <Input id="cm-dka" value={descKa} onChange={(e) => setDescKa(e.target.value)} maxLength={255} />
            </div>
            <div>
              <Label htmlFor="cm-den">{t('customModules.descriptionEn')}</Label>
              <Input id="cm-den" value={descEn} onChange={(e) => setDescEn(e.target.value)} maxLength={255} />
            </div>
          </div>

          <div className="mt-4">
            <Label>{t('customModules.color')}</Label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className={cn(
                    'size-8 cursor-pointer rounded-md border-2 transition-transform hover:scale-110',
                    color === c ? 'border-foreground' : 'border-transparent',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                aria-label={t('customModules.colorCustom')}
                value={color ?? COLORS[0]}
                onChange={(e) => setColor(e.target.value)}
                className="size-8 cursor-pointer rounded-md border border-border bg-card p-0.5"
              />
            </div>
          </div>

          <div className="mt-4">
            <Label className="flex items-center gap-2">
              {t('videoTypes.icon')}
              <span
                className="grid size-7 place-items-center rounded-md"
                style={{ backgroundColor: color ? `color-mix(in oklab, ${color} 18%, transparent)` : undefined }}
              >
                <ModuleIcon name={icon} className="size-4" />
              </span>
            </Label>
            <IconPicker value={icon} onChange={setIcon} className="mt-1" />
          </div>
        </StepSection>

        {/* ---------- 2. კლასიფიკაცია ---------- */}
        <StepSection step={2} title={t('customModules.stepClassification')} hint={t('customModules.stepClassificationHint')}>
          <RadioGroup
            value={classification}
            onValueChange={(v) => setClassification(v as CustomClassification | 'none')}
            className="grid gap-2"
          >
            <ScopeRow value="none" active={classification} label={t('customModules.classificationNone')} hint={t('customModules.classificationNoneHint')} />
            {CUSTOM_CLASSIFICATIONS.map((kind) => (
              <ScopeRow key={kind} value={kind} active={classification} label={t(classificationKey(kind))}>
                {!editing && (
                  <div>
                    <Label htmlFor="cm-cats" className="text-xs text-muted-foreground">
                      {t('customModules.initialEntries')}
                    </Label>
                    <TagSelect
                      inputId="cm-cats"
                      options={[]}
                      value={categories}
                      onChange={setCategories}
                      placeholder={t('customModules.initialEntriesPlaceholder')}
                    />
                  </div>
                )}
              </ScopeRow>
            ))}
          </RadioGroup>
          {editing && <p className="mt-2 text-xs text-muted-foreground">{t('customModules.classificationEditNote')}</p>}
        </StepSection>

        {!editing && (
          <>
            {/* ---------- 3. სტატუსები ---------- */}
            <StepSection step={3} title={t('customModules.stepStatuses')} hint={t('customModules.stepStatusesHint')}>
              <RadioGroup
                value={statuses}
                onValueChange={(v) => setStatuses(v as CustomStatusPreset)}
                className="grid gap-2"
              >
                <ScopeRow
                  value="default"
                  active={statuses}
                  label={t('customModules.statusesDefault')}
                  hint={t('customModules.statusesDefaultHint')}
                />
                <ScopeRow
                  value="none"
                  active={statuses}
                  label={t('customModules.statusesNone')}
                  hint={t('customModules.statusesNoneHint')}
                />
              </RadioGroup>
            </StepSection>

            {/* ---------- 4. დამატებითი ველები ---------- */}
            <StepSection
              step={4}
              title={t('customModules.stepFields')}
              hint={t('customModules.stepFieldsHint')}
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFields((rows) => [...rows, keyRow({ type: 'text', label_ka: '', label_en: '', required: false })])}
                >
                  <Plus className="size-4" />
                  {t('customFields.add')}
                </Button>
              }
            >
              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('customModules.fieldsEmpty')}</p>
              ) : (
                <ul className="space-y-2">
                  {fields.map((row) => (
                    <li key={row._key} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
                      <Select value={row.type} onValueChange={(v) => patchField(row._key, { type: v as CustomFieldDraft['type'] })}>
                        <SelectTrigger className="w-36">
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
                      <Input
                        className="min-w-32 flex-1"
                        placeholder={t('customModules.nameKa')}
                        aria-label={t('customModules.nameKa')}
                        value={row.label_ka ?? ''}
                        onChange={(e) => patchField(row._key, { label_ka: e.target.value })}
                      />
                      <Input
                        className="min-w-32 flex-1"
                        placeholder={t('customModules.nameEn')}
                        aria-label={t('customModules.nameEn')}
                        value={row.label_en ?? ''}
                        onChange={(e) => patchField(row._key, { label_en: e.target.value })}
                      />
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                        <Checkbox
                          checked={!!row.required}
                          onCheckedChange={(v) => patchField(row._key, { required: v === true })}
                        />
                        {t('fields.required')}
                      </label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 text-destructive"
                        aria-label={t('actions.delete')}
                        onClick={() => setFields((rows) => rows.filter((r) => r._key !== row._key))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </StepSection>
          </>
        )}

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending || nameMissing}>
            {save.isPending
              ? t('actions.saving')
              : t(editing ? 'actions.save' : 'customModules.create')}
          </Button>
        </ModalFooter>
      </form>
    </ModalShell>
  )
}
