import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, Paperclip, SlidersHorizontal, Trash2, Upload } from 'lucide-react'
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
import { formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PrivateFileLink, PrivateImage } from '@/components/PrivateFile'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   მორგებული ველები ჩანაწერზე (Tasks §6, ფაზა 3).

   ⚠️ **ბარათი თვითონ ინახავს თავს** და მშობელი ფორმის „შენახვას" არ ერევა.
   მიზეზი: მნიშვნელობები **ცალკე ცხრილშია** (`DECISIONS.md` §2), ე.ი. ისინი
   ჩანაწერის `PUT`-ში ისედაც არ მიდის; ერთ ღილაკზე გაერთიანება ნიშნავდა,
   რომ შვიდივე ფორმის შენახვის გზა უნდა გადაწერილიყო.

   ⚠️ **ახალ ჩანაწერზე ბარათი მინიშნებაა და არა ველები** — მნიშვნელობას
   `record_id` სჭირდება, რომელიც ჯერ არ არსებობს.

   ⚠️ **ბარათი ქრება, თუ ველი არ არის** — ცარიელი სექცია ყველა ფორმაზე
   ხმაური იქნებოდა.

   ⚠️ **`ფაილი` ველი მონახაზში არ ჯდება** (ფაზა 4b): ატვირთვას თავისი
   endpoint აქვს და მაშინვე ხდება, „შენახვის" ღილაკს კი მხოლოდ დანარჩენი
   ტიპები ეხება. მიზეზი კვოტაა — ბაიტები დისკზე უკვე დაწერილია, ე.ი.
   „შეუნახავი ფაილი" ისეთ მდგომარეობას ნიშნავდა, რომელიც ადგილს იკავებს,
   მაგრამ არსად ჩანს.
   ============================================================ */

export function CustomFieldsCard({
  module,
  recordId,
}: {
  module: string
  /** `null` = ჩანაწერი ჯერ არ შენახულა */
  recordId: number | null
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const ka = i18n.language === 'ka'

  const defsQ = useQuery({
    queryKey: ['custom-fields', module],
    queryFn: () => fetchCustomFields(module),
  })
  const fields = useMemo(
    () => (defsQ.data ?? []).filter((f) => f.enabled),
    [defsQ.data],
  )

  const valuesQ = useQuery({
    queryKey: ['custom-field-values', module, recordId],
    queryFn: () => fetchCustomFieldValues(module, recordId!),
    enabled: recordId != null && fields.length > 0,
  })

  const [draft, setDraft] = useState<CustomFieldValues>({})
  const [dirty, setDirty] = useState(false)

  // სერვერიდან მოსული მნიშვნელობები მონახაზში — მხოლოდ სანამ არაფერი შეცვლილა
  useEffect(() => {
    if (valuesQ.data && !dirty) setDraft(valuesQ.data)
  }, [valuesQ.data, dirty])

  const save = useMutation({
    mutationFn: () => saveCustomFieldValues(module, recordId!, draft),
    onSuccess: (values) => {
      setDraft(values)
      setDirty(false)
      qc.setQueryData(['custom-field-values', module, recordId], values)
      toast({ title: t('customFields.saved'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  if (!fields.length) return null

  const label = (f: CustomFieldDefinition) =>
    (ka ? f.label_ka || f.label_en : f.label_en || f.label_ka) || f.key
  const placeholder = (f: CustomFieldDefinition) =>
    (ka ? f.placeholder_ka : f.placeholder_en) ?? undefined

  const set = (key: string, value: unknown) => {
    setDirty(true)
    setDraft((d) => ({ ...d, [key]: value }))
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <SlidersHorizontal className="size-4 text-muted-foreground" />
        {t('customFields.title')}
      </h3>

      {recordId == null ? (
        <p className="text-xs text-muted-foreground">{t('customFields.saveFirst')}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <div
                key={f.key}
                className={f.type === 'list' || f.type === 'file' ? 'sm:col-span-2' : undefined}
              >
                <Label htmlFor={`cf-${f.key}`}>
                  {label(f)}
                  {f.required && <span className="ml-0.5 text-destructive">*</span>}
                </Label>

                {f.type === 'file' ? (
                  /* ⚠️ ატვირთვა `draft`-ს გვერდს უვლის — იხ. ფაილის შენიშვნა თავში */
                  <FileField
                    module={module}
                    recordId={recordId}
                    fieldKey={f.key}
                    /* §7.3 — ⚠️ backend ყოველთვის **სიას** აბრუნებს, ერთ ფაილზეც.
                       `?? []` მაინც რჩება: ველი შეიძლება საერთოდ არ იყოს შევსებული. */
                    value={(draft[f.key] as CustomFieldFile[] | undefined) ?? []}
                    onChange={(next) => {
                      // ⚠️ ქეშიც ერთდროულად — თორემ მომდევნო refetch ატვირთულს
                      // ან წაშლილს უკან დააბრუნებდა (`dirty` აქ არ ირთვება)
                      setDraft((d) => ({ ...d, [f.key]: next }))
                      qc.setQueryData<CustomFieldValues>(
                        ['custom-field-values', module, recordId],
                        (prev) => ({ ...(prev ?? {}), [f.key]: next }),
                      )
                    }}
                  />
                ) : f.type === 'switch' ? (
                  <div className="mt-1.5 flex h-9 items-center">
                    <Switch
                      id={`cf-${f.key}`}
                      checked={Boolean(draft[f.key])}
                      onCheckedChange={(v) => set(f.key, v)}
                    />
                  </div>
                ) : f.type === 'list' ? (
                  /* სია — თითო ხაზი ერთი ელემენტი. ⚠️ მძიმით გაყოფა განზრახ
                     არაა: მნიშვნელობაში მძიმე ხშირია („გია, ნინო"). */
                  <Textarea
                    id={`cf-${f.key}`}
                    rows={2}
                    placeholder={placeholder(f) ?? t('customFields.listHint')}
                    value={Array.isArray(draft[f.key]) ? (draft[f.key] as string[]).join('\n') : ''}
                    onChange={(e) =>
                      set(
                        f.key,
                        e.target.value.split('\n').map((v) => v.trim()).filter(Boolean),
                      )
                    }
                  />
                ) : (
                  <Input
                    id={`cf-${f.key}`}
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                    inputMode={f.type === 'number' ? 'decimal' : undefined}
                    placeholder={placeholder(f)}
                    value={draft[f.key] == null ? '' : String(draft[f.key])}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            {dirty && <span className="text-xs text-muted-foreground">{t('customFields.unsaved')}</span>}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate()}
            >
              <Check className="size-4" />
              {save.isPending ? t('actions.saving') : t('actions.save')}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

/* ============================================================
   `ფაილი` ტიპის ველი (ფაზა 4b · 🔗 §17).

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
    <div className="mt-1.5 space-y-1.5">
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
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || full}
          onClick={() => input.current?.click()}
        >
          {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {upload.isPending ? t('actions.saving') : t('customFields.addFiles')}
        </Button>
        {/* ⚠️ ჭერი ცხადად წერია — 422/413 ატვირთვის შემდეგ გვიანია */}
        <span className="text-xs text-muted-foreground">
          {full
            ? t('customFields.fileLimit', { max: CUSTOM_FIELD_MAX_FILES })
            : t('customFields.fileHint')}
        </span>
      </div>
    </div>
  )
}
