import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, Loader2, Paperclip, SlidersHorizontal, Trash2, Upload } from 'lucide-react'
import {
  CUSTOM_FIELD_MAX_FILES,
  deleteCustomFieldFile,
  fetchCustomFieldValues,
  fetchCustomFields,
  saveCustomFieldValues,
  uploadCustomFieldFile,
  type CustomFieldDefinition,
  type CustomFieldFile,
  type CustomFieldValues,
} from '@/api/account'
import { errorMessage } from '@/lib/errors'
import { cn, formatBytes } from '@/lib/utils'
import type { CustomFieldDraft } from '@/lib/customFieldDraft'
import type { PendingUpload } from '@/lib/pendingUploads'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField, FormGrid } from '@/components/ui/form-layout'
import { InfoHint } from '@/components/ui/info-hint'
import { PrivateFileLink, PrivateImage } from '@/components/PrivateFile'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   მორგებული ველები ჩანაწერზე (Tasks §6, ფაზა 3 → §26).

   ⚠️ **არსებულ ჩანაწერზე ბარათი თვითონ ინახავს თავს** და მშობელი ფორმის
   „შენახვას" არ ერევა: მნიშვნელობები **ცალკე ცხრილშია**, ე.ი. ჩანაწერის
   `PUT`-ში ისედაც არ მიდის.

   ⚠️ **ახალ ჩანაწერზე — მონახაზი** (Tasks §26.5): „ჯერ შეინახე" აღარ წერია.
   ველები მაშინვე ივსება და ფაილიც ემატება, ყველაფერი კი ბრაუზერშია
   (`useCustomFieldDraft`), სანამ მშობელი ფორმა ჩანაწერს შექმნის და
   `draft.flush(id)`-ს დაუძახებს. ⚠️ ამ რეჟიმში საკუთარი „შენახვა" არ
   არის — ორი ღილაკი ერთი ჩანაწერისთვის ორ ცალკე მოქმედებად წაიკითხებოდა.

   ⚠️ **ცალკე თეთრი ბარათია, ჩარჩოთი** — §26-მა ის ჩარჩოს გარეშე სექციად
   აქცია და ფორმა ერთ უწყვეტ სივრცედ იკითხებოდა; 2026-09-28-ს ძველი სახე
   დაბრუნდა (შენი მოთხოვნა). ლეიბლი და სავალდებულოს ნიშანი მაინც `FormField`/
   `FieldLabel`-იდან მოდის (ხელით დაწერილი `*` აღარ არის), ბადე — `FormGrid`.

   ⚠️ **ბარათი ქრება, თუ ველი არ არის** — ცარიელი სექცია ყველა ფორმაზე
   ხმაური იქნებოდა.
   ============================================================ */

export function CustomFieldsCard({
  module,
  recordId,
  draft,
  className,
}: {
  module: string
  /** `null` = ჩანაწერი ჯერ არ შენახულა */
  recordId: number | null
  /** ახალი ჩანაწერის მონახაზი (§26.5) — არსებულ ჩანაწერზე არ გადაეცემა */
  draft?: CustomFieldDraft
  /** ⚠️ დაშორება აქ გადაეცემა და არა გარე `div`-ზე — ველების გარეშე ბარათი ქრება და ცარიელი დაშორება დარჩებოდა */
  className?: string
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const ka = i18n.language === 'ka'

  const defsQ = useQuery({
    queryKey: ['custom-fields', module],
    queryFn: () => fetchCustomFields(module),
  })
  const fields = useMemo(() => (defsQ.data ?? []).filter((f) => f.enabled), [defsQ.data])

  /* ⚠️ მონახაზის რეჟიმი ჩავარდნის შემდეგაც რჩება (`done` ჯერ არ არის),
     თორემ ჩანაწერის id-ის გაჩენისთანავე ბარათი სერვერის ცარიელ
     მნიშვნელობებზე გადავიდოდა და აკრეფილი ჩუმად გაქრებოდა. */
  const drafting = draft != null && !draft.done
  const existing = !drafting && recordId != null

  const valuesQ = useQuery({
    queryKey: ['custom-field-values', module, recordId],
    queryFn: () => fetchCustomFieldValues(module, recordId!),
    enabled: existing && fields.length > 0,
  })

  const [values, setValues] = useState<CustomFieldValues>({})
  const [dirty, setDirty] = useState(false)

  // სერვერიდან მოსული მნიშვნელობები — მხოლოდ სანამ არაფერი შეცვლილა
  useEffect(() => {
    if (valuesQ.data && !dirty) setValues(valuesQ.data)
  }, [valuesQ.data, dirty])

  const save = useMutation({
    mutationFn: () => saveCustomFieldValues(module, recordId!, values),
    onSuccess: (saved) => {
      setValues(saved)
      setDirty(false)
      qc.setQueryData(['custom-field-values', module, recordId], saved)
      toast({ title: t('customFields.saved'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  if (!fields.length) return null
  // ⚠️ არც ახალი და არც არსებული — ჩანაწერი ჯერ არ არის და მონახაზიც არ მოგვცეს
  if (!drafting && recordId == null) return null

  const current = drafting ? draft.values : values
  const label = (f: CustomFieldDefinition) =>
    (ka ? f.label_ka || f.label_en : f.label_en || f.label_ka) || f.key
  const placeholder = (f: CustomFieldDefinition) => (ka ? f.placeholder_ka : f.placeholder_en) ?? undefined

  const set = (key: string, value: unknown) => {
    if (drafting) {
      draft.set(key, value)

      return
    }

    setDirty(true)
    setValues((v) => ({ ...v, [key]: value }))
  }

  return (
    <section className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <SlidersHorizontal className="size-4 text-muted-foreground" />
        {t('customFields.title')}
        <InfoHint info={drafting ? t('customFields.draftHint') : undefined} />
      </h3>

      <FormGrid className="gap-3">
        {drafting && draft.error && (
          <p className="col-span-12 flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="size-3.5 shrink-0" />
            {draft.error}
          </p>
        )}

        {fields.map((f) => (
          <FormField
            key={f.key}
            size={f.type === 'list' || f.type === 'file' ? 'full' : 'half'}
            label={label(f)}
            htmlFor={`cf-${f.key}`}
            required={f.required}
          >
            {f.type === 'file' ? (
              drafting ? (
                <PendingFileField fieldKey={f.key} items={draft.files.of(f.key)} draft={draft} />
              ) : (
                /* ⚠️ ატვირთვა `values`-ს გვერდს უვლის — იხ. ფაილის შენიშვნა ქვემოთ */
                <FileField
                  module={module}
                  recordId={recordId!}
                  fieldKey={f.key}
                  /* §7.3 — ⚠️ backend ყოველთვის **სიას** აბრუნებს, ერთ ფაილზეც.
                     `?? []` მაინც რჩება: ველი შეიძლება საერთოდ არ იყოს შევსებული. */
                  value={(values[f.key] as CustomFieldFile[] | undefined) ?? []}
                  onChange={(next) => {
                    // ⚠️ ქეშიც ერთდროულად — თორემ მომდევნო refetch ატვირთულს
                    // ან წაშლილს უკან დააბრუნებდა (`dirty` აქ არ ირთვება)
                    setValues((v) => ({ ...v, [f.key]: next }))
                    qc.setQueryData<CustomFieldValues>(['custom-field-values', module, recordId], (prev) => ({
                      ...(prev ?? {}),
                      [f.key]: next,
                    }))
                  }}
                />
              )
            ) : f.type === 'switch' ? (
              <div className="flex h-10 items-center">
                <Switch id={`cf-${f.key}`} checked={Boolean(current[f.key])} onCheckedChange={(v) => set(f.key, v)} />
              </div>
            ) : f.type === 'list' ? (
              /* სია — თითო ხაზი ერთი ელემენტი. ⚠️ მძიმით გაყოფა განზრახ
                 არაა: მნიშვნელობაში მძიმე ხშირია („გია, ნინო"). */
              <Textarea
                id={`cf-${f.key}`}
                rows={2}
                placeholder={placeholder(f) ?? t('customFields.listHint')}
                value={Array.isArray(current[f.key]) ? (current[f.key] as string[]).join('\n') : ''}
                onChange={(e) =>
                  set(
                    f.key,
                    e.target.value
                      .split('\n')
                      .map((v) => v.trim())
                      .filter(Boolean),
                  )
                }
              />
            ) : (
              <Input
                id={`cf-${f.key}`}
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                inputMode={f.type === 'number' ? 'decimal' : undefined}
                placeholder={placeholder(f)}
                value={current[f.key] == null ? '' : String(current[f.key])}
                onChange={(e) => set(f.key, e.target.value)}
              />
            )}
          </FormField>
        ))}
      </FormGrid>

      {/* ⚠️ არსებულ ჩანაწერზე ბარათი თვითონ ინახავს თავს — ღილაკი ბოლოს,
          მარჯვნივ (როგორც §26-მდე). მონახაზზე ღილაკი არ არის: მნიშვნელობები
          ჩანაწერთან ერთად ინახება. */}
      {existing && (
        <div className="mt-3 flex items-center justify-end gap-2">
          {dirty && <span className="text-xs text-muted-foreground">{t('customFields.unsaved')}</span>}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {save.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
        </div>
      )}
    </section>
  )
}

/* ============================================================
   `ფაილი` ტიპის ველი — **ახალ ჩანაწერზე** (Tasks §26.5).

   ⚠️ ფაილი ბრაუზერშია და ჩანაწერის შექმნის შემდეგ ადის სათითაოდ
   (`draft.flush`). ჩავარდნილი აქვე ჩანს მიზეზით — წაშლა ან ხელახლა
   „შენახვა" შეიძლება.
   ============================================================ */
function PendingFileField({
  fieldKey,
  items,
  draft,
}: {
  fieldKey: string
  items: PendingUpload<string>[]
  draft: CustomFieldDraft
}) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const full = items.length >= CUSTOM_FIELD_MAX_FILES
  const busy = items.some((i) => i.status === 'uploading')

  return (
    <div className="space-y-1.5">
      <input
        ref={input}
        id={`cf-${fieldKey}`}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          // ჭერზე ზედმეტს ვჭრით — იგივე წესი, რაც არსებულ ჩანაწერზე
          const files = Array.from(e.target.files ?? []).slice(0, CUSTOM_FIELD_MAX_FILES - items.length)
          if (files.length) draft.files.add(fieldKey, files)
          e.target.value = ''
        }}
      />

      {items.map((item) => (
        <div key={item.key} className="flex flex-wrap items-center gap-2">
          {item.preview && (
            <img src={item.preview} alt="" className="size-12 rounded-md border border-border object-cover" />
          )}
          <span className="inline-flex max-w-[16rem] items-center gap-1.5 truncate text-sm">
            <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{item.file.name}</span>
          </span>
          <span className="text-xs text-muted-foreground">{formatBytes(item.file.size)}</span>
          {item.status === 'uploading' && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          {item.status === 'error' && <span className="text-xs text-destructive">{item.error}</span>}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto text-destructive"
            disabled={item.status === 'uploading'}
            onClick={() => draft.files.remove(item.key)}
            aria-label={t('actions.delete')}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || full}
          onClick={() => input.current?.click()}
        >
          <Upload className="size-4" />
          {t('customFields.addFiles')}
        </Button>
        <span className="text-xs text-muted-foreground">
          {full ? t('customFields.fileLimit', { max: CUSTOM_FIELD_MAX_FILES }) : t('customFields.fileHint')}
        </span>
      </div>
    </div>
  )
}

/* ============================================================
   `ფაილი` ტიპის ველი — არსებულ ჩანაწერზე (ფაზა 4b · 🔗 §17).

   ⚠️ **ატვირთვა/წაშლა მაშინვე ხდება** და მშობლის „შენახვას" არ ელოდება:
   ბაიტები კვოტიდან უკვე იხარჯება, ე.ი. „შეუნახავი ფაილი" ისეთ მდგომარეობას
   ნიშნავდა, რომელიც ადგილს იკავებს, მაგრამ ველზე არ ჩანს.

   ⚠️ **ჩვენება `PrivateFile`-ზე გადის და არა `/storage/…`-ზე.** `notes/fields`
   პრივატულ დისკზეა (§17.5), დანარჩენიც აქედან გამოდის — ორი განსხვავებული
   გზა ერთ დღეს პრივატულ ფაილს საჯარო url-ით გამოაჩენდა.
   ============================================================ */
function FileField({
  module,
  recordId,
  fieldKey,
  value,
  onChange,
}: {
  module: string
  recordId: number
  fieldKey: string
  value: CustomFieldFile[]
  onChange: (value: CustomFieldFile[]) => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const input = useRef<HTMLInputElement>(null)

  const upload = useMutation({
    mutationFn: (files: File[]) => uploadCustomFieldFile(module, recordId, fieldKey, files),
    onSuccess: (next) => onChange(next),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /** ⚠️ `fileId` სავალდებულოა — სხვაგვარად backend **ველის ყველა** ფაილს იღებს */
  const remove = useMutation({
    mutationFn: (fileId: number) => deleteCustomFieldFile(module, recordId, fieldKey, fileId),
    onSuccess: (_r, fileId) => onChange(value.filter((f) => f.id !== fileId)),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const busy = upload.isPending || remove.isPending
  const full = value.length >= CUSTOM_FIELD_MAX_FILES

  return (
    <div className="space-y-1.5">
      <input
        ref={input}
        id={`cf-${fieldKey}`}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          // §7.3 — რამდენიმე არჩეული ერთ რექვესთად მიდის; ჭერზე ზედმეტს ვჭრით
          const files = Array.from(e.target.files ?? []).slice(0, CUSTOM_FIELD_MAX_FILES - value.length)
          if (files.length) upload.mutate(files)
          // ⚠️ ველი იცარიელდეს, თორემ იმავე ფაილის ხელახლა არჩევა
          // `change`-ს არ ისვრის და „არ მუშაობს"-ის შთაბეჭდილება რჩება
          e.target.value = ''
        }}
      />

      {value.map((file) => (
        <div key={file.id} className="flex flex-wrap items-center gap-2">
          {file.mime?.startsWith('image/') && (
            <PrivateImage
              url={file.url}
              alt={file.name ?? fieldKey}
              className="size-12 rounded-md border border-border object-cover"
            />
          )}
          <PrivateFileLink
            url={file.url}
            name={file.name}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/70"
          >
            <Paperclip className="size-3.5" />
            <span className="max-w-[16rem] truncate">{file.name ?? fieldKey}</span>
          </PrivateFileLink>
          <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto text-destructive"
            disabled={busy}
            onClick={() => remove.mutate(file.id)}
            aria-label={t('actions.delete')}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy || full} onClick={() => input.current?.click()}>
          {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {upload.isPending ? t('actions.saving') : t('customFields.addFiles')}
        </Button>
        {/* ⚠️ ჭერი ცხადად წერია — 422/413 ატვირთვის შემდეგ გვიანია */}
        <span className="text-xs text-muted-foreground">
          {full ? t('customFields.fileLimit', { max: CUSTOM_FIELD_MAX_FILES }) : t('customFields.fileHint')}
        </span>
      </div>
    </div>
  )
}
