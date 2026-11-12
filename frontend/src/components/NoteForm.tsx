import { useEffect, useState } from 'react'
import { SelectWithAdd } from '@/components/ui/inline-add'
import { useDictionaryAdd, useStatusAdd } from '@/lib/dictionaries'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import {
  createNote,
  setNotePhoto,
  updateNote,
  uploadNoteFiles,
  type NoteCategory,
  type NoteEntry,
  type NoteFile,
  type NoteInput,
  type NoteLink,
} from '@/api/notes'
import { useModuleFields } from '@/lib/fields'
import { RICH_TEXT_MAX } from '@/lib/richText'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { hiddenPicks, pickErrors } from '@/lib/requiredPicks'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { statusName, useStatuses } from '@/lib/statuses'
import { TagSelect } from '@/components/TagSelect'
import { Button } from '@/components/ui/button'
import { RichText } from '@/components/ui/rich-text'
import { Input } from '@/components/ui/input'
import { FieldLabel, joinHints } from '@/components/ui/field-label'
import { FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
import { ColorPick } from '@/components/ui/color-pick'
import { IconPicker } from '@/components/ui/icon-picker'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { useNotePhoto } from '@/components/NoteFace'
import { PosterUploader } from '@/components/PosterUploader'
import { NoteRemindersDialog, NoteRemindersLink } from '@/components/NoteRemindersDialog'
import { NoteUploads } from '@/components/NoteUploads'
import { ModalShell } from '@/components/ui/modal-shell'
import { SelectItem } from '@/components/ui/select'
import { useToast } from '@/components/ui/feedback'
import { keyRow, keyRows, unkeyRows, type Keyed } from '@/lib/rowKeys'
import { usePendingUploads } from '@/lib/pendingUploads'
import { useCustomFieldDraft } from '@/lib/customFieldDraft'
import { LinkField } from '@/components/ui/link-field'

/* ============================================================
   ჩანაწერის ფორმა.

   გარე წყარო არ არსებობს, ე.ი. „სწრაფი შევსება" აქ არაა — ეს user-ის
   საკუთარი ინფორმაციაა და არა კატალოგის ჩანაწერი.

   ⚠️ **ფაილები ახალ ჩანაწერზეც ემატება**: შენახვამდე ისინი
   ბრაუზერშია, შენახვისას კი ჩანაწერის შემდეგ სათითაოდ ადის. ⚠️ **შეხსენება
   კი შექმნის შემდეგ რჩება** (შენი სიტყვით) — მას `note_entry_id`
   სჭირდება და ფანჯარა ამას i-ით ამბობს.

   ფორმის საერთო ჩონჩხი (`ui/form-layout.tsx`): სექციები
   სათაურით, 12-სვეტიანი ბადე და მიმაგრებული ქვედა ზოლი; დამატებითი
   ველებიც ახალ ჩანაწერზე ივსება (იგივე მექანიზმი, რაც ფაილებს).
   ============================================================ */

/** ⚠️ `form="…"`-ს სჭირდება id; ერთი მოდალი ერთ ფორმას შეიცავს, ე.ი. მუდმივია */
const FORM_ID = 'note-form'

export function NoteForm({
  note,
  allTags,
  categories,
  onClose,
  onSaved,
}: {
  note: NoteEntry | null
  allTags: string[]
  categories: NoteCategory[]
  onClose: () => void
  onSaved: (saved: NoteEntry) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { data: statuses = [] } = useStatuses('note')
  const { toast } = useToast()
  // რომელი არჩევითი ველი ჩანს ამ ფორმაზე
  const fields = useModuleFields('note')

  const [form, setForm] = useState({
    title: note?.title ?? '',
    description: note?.description ?? '',
    categoryId: note?.category_id ? String(note.category_id) : '',
    tags: note?.tags ?? [],
    // გასაღები; ცარიელი = ნაგულისხმევი (backend დაადებს)
    status: note?.status?.key ?? '',
    // იერი: საკუთარი აიქონი (ცარიელი — კატეგორიისა) და ფონის ფერი
    icon: note?.icon ?? null,
    color: note?.color ?? null,
  })
  /* ---------- მთავარი ფოტო ----------
     ⚠️ ფოტო პრივატულ დისკზეა: შენახული — blob-ად იკითხება (`useNotePhoto`), ახლად არჩეული —
     ბრაუზერის `blob:` მისამართია. ატვირთვა ჩანაწერის შენახვის **შემდეგ** მიდის (ფაილების წესი):
     ახალ ჩანაწერს id ჯერ არ აქვს, JSON-ის ფორმა კი ფაილს ვერ წაიღებს. */
  const savedPhoto = useNotePhoto(note)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  // არჩეული ფაილის `blob:` მისამართი ფანჯრის დახურვაზე ან შეცვლაზე თავისუფლდება
  useEffect(() => () => void (photoPreview && URL.revokeObjectURL(photoPreview)), [photoPreview])
  /* ⚠️ სტრიქონს **საკუთარი გასაღები** აქვს და არა ინდექსი:
     ინდექსზე შუა სტრიქონის წაშლა ფოკუსსა და კარეტს მეზობელ ბმულზე გადაიტანდა.
     `unkeyRows()` გასაღებს payload-ში ჭრის. */
  const [links, setLinks] = useState<Keyed<NoteLink>[]>(() => keyRows(note?.links ?? []))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const addCategory = useDictionaryAdd('note-categories')
  const addStatus = useStatusAdd('note')
  const [reminders, setReminders] = useState(false)
  const qc = useQueryClient()

  /* ---------- ფაილები ახალ ჩანაწერზე ----------
     ⚠️ შენახვამდე ფაილი ბრაუზერშია (`pending`); შენახვისას ჯერ ჩანაწერი
     იქმნება, მერე ფაილები **სათითაოდ**, პროგრესით. ⚠️ ჩავარდნა ჩანაწერს არ
     აუქმებს: ფანჯარა ღია რჩება და **შექმნილის რედაქტირებად** გადადის
     (`created`), ჩავარდნილი ფაილი კი მიზეზით რჩება — „შენახვა" მას ხელახლა ცდის. */
  const pending = usePendingUploads<NoteFile['kind']>()
  // დამატებითი ველები ახალ ჩანაწერზე (იგივე წესი, რაც ფაილებს)
  const customDraft = useCustomFieldDraft('note')
  const [created, setCreated] = useState<NoteEntry | null>(null)
  const current = note ?? created
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const save = useMutation({
    mutationFn: (input: NoteInput) => (current ? updateNote(current.id, input) : createNote(input)),
    onSuccess: async (saved) => {
      const problems: string[] = []

      // მთავარი ფოტო — ჩანაწერის შემდეგ; ჩავარდნა (კვოტა, ფორმატი) ჩანაწერს არ აუქმებს
      if (photoFile) {
        try {
          saved = await setNotePhoto(saved.id, photoFile)
          setPhotoFile(null)
          qc.invalidateQueries({ queryKey: ['storage'] })
          qc.invalidateQueries({ queryKey: ['me'] })
        } catch (e) {
          problems.push(t('notes.photoFailed', { reason: errorMessage(e) }))
        }
      }

      if (pending.items.length) {
        const failed = await pending.run(
          (kind, file) => uploadNoteFiles(saved.id, kind, [file]),
          (done, total) => setProgress({ done, total }),
        )
        setProgress(null)
        qc.invalidateQueries({ queryKey: ['note-files', saved.id] })
        qc.invalidateQueries({ queryKey: ['storage'] })
        qc.invalidateQueries({ queryKey: ['me'] })

        if (failed.length) {
          problems.push(t('notes.uploadsFailed', { names: failed.map((f) => f.file.name).join(', ') }))
        }
      }

      // ⚠️ `done`-ის შემდეგ აღარ — ბარათი უკვე თვითონ ინახავს თავს
      if (!note && !customDraft.done) {
        const extra = await customDraft.flush(saved.id)
        if (!extra.ok) problems.push(extra.message)
      }

      if (problems.length) {
        setCreated(saved)
        qc.invalidateQueries({ queryKey: ['notes'] })
        toast({ title: problems.join(' '), variant: 'error' })

        return
      }

      toast({ title: t('notes.saved'), variant: 'success' })
      onSaved(saved)
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })


  /* ⚠️ **დამალულ ველზე წითელი ტექსტი არავის უნახავს**: ბლოკი
     `hidden`-ითაა, ე.ი. შეცდომა DOM-შია და ეკრანზე არა — ღილაკი „შენახვა"
     ვიზუალურად არაფერს აკეთებდა. ამიტომ ასეთი ველი თოსტით სახელდება. */
  const warnHidden = (missing: string[]) => {
    const hidden = hiddenPicks(missing, fields.shows)

    if (hidden.length > 0) {
      toast({
        title: t('validation.hiddenRequired', {
          fields: hidden.map((key) => fields.label(key)).join(', '),
        }),
        variant: 'error',
      })
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()

    /* ⚠️ სტატუსიც და კატეგორიაც სავალდებულოა. შემოწმება ქსელამდეა,
       რათა პასუხი იმავე წამს იყოს და ველი გაწითლდეს; backend-ის 422 მეორე კარიბჭეა.
       გასაღებები იგივეა, რაც backend-ის შეცდომებისა, ე.ი. შეცდომის ჩვენება ერთია. */
    const picked = pickErrors(
      { category_id: form.categoryId, status: form.status },
      t('validation.pickOne'),
    )
    if (Object.keys(picked).length > 0) {
      setErrors(picked)
      warnHidden(Object.keys(picked))

      return
    }

    setErrors({})

    save.mutate({
      title: form.title,
      description: form.description || null,
      category_id: form.categoryId ? Number(form.categoryId) : null,
      tags: form.tags,
      links: unkeyRows(links.filter((l) => l.url.trim())),
      status: form.status || undefined,
      icon: form.icon,
      color: form.color,
      // ახალი ფოტო ძველს თვითონ ცვლის — „მოშორება" მხოლოდ მაშინ მიდის, როცა ახალი არ არის
      ...(removePhoto && !photoFile ? { remove_photo: true } : {}),
    })
  }

  /* ⚠️ **შეხსენებების ფანჯარა ფორმის მოდალს ცვლის და არ ეფარება** (2026-09-14,
     შენი არჩევანი: „ის გაქრეს, ეს გამოჩნდეს; დახურავ — პირიქით"). ორი ერთმანეთზე
     დადებული მოდალი ერთი სიგანისა იყო, ე.ი. ქვედა კიდეებიდან მოჩანდა.

     ⚠️ **ფორმა მონტირებული რჩება** — მხოლოდ მისი `ModalShell` იცვლება, ე.ი.
     შევსებული ველები ადგილზეა, როცა ფანჯრიდან ბრუნდები. სწორედ ამიტომ უჭირავს
     მდგომარეობა ფორმას და არა ღილაკს. */
  if (reminders && current) {
    return (
      <NoteRemindersDialog
        note={current}
        onBack={() => setReminders(false)}
        onClose={() => setReminders(false)}
      />
    )
  }

  return (
    <ModalShell title={t(note ? 'notes.edit' : 'notes.add')} onClose={onClose} wide>
      {/* ⚠️ **მოქმედებების რიგი `<form>`-ის გარეთაა და ეკრანის ბოლოშია**:
          ატვირთვები, შეხსენება და დამატებითი ველები
          ღილაკების ზემოთ დგას და არა მათ ქვემოთ. HTML5-ის `form="…"` სწორედ
          ამისთვისაა: ღილაკი ფორმის გარეთ დგას და მაინც მას უშვებს. */}
      {/* **შემხსენებლების ზოლი თავშია, სათაურის ზემოთ** (შენი ახალი
          მითითება, 2026-10-02; ის 2026-09-14-ის „`</form>`-ის შემდეგ დარჩეს"-ს ცვლის).
          ⚠️ `<form>`-ის **გარეთ** ისევ: შეხსენებას საკუთარი endpoint აქვს და ჩანაწერის
          `PUT`-ში არ მოგზაურობს. ახალ ჩანაწერზე ზოლი თავშივე დგას, გამორთული, `i`-ით
          „ჯერ შეინახე" — შეხსენებას `note_entry_id` სჭირდება. */}
      <div className="mt-4" data-testid="note-reminders-bar">
        <NoteRemindersLink note={current} onOpen={() => setReminders(true)} />
      </div>

      <form id={FORM_ID} onSubmit={submit} className="mt-4 space-y-6">
        {/* მარცხნივ მთავარი ფოტო, მარჯვნივ — სახელი და აღწერა */}
        <FormSection
          title={t('form.sections.basic')}
          mediaVariant="wide"
          mediaLabel={
            <FieldLabel required={fields.required('photo')} hint={fields.hint('photo')}>
              {fields.label('photo')}
            </FieldLabel>
          }
          media={
            fields.shows('photo') && (
              <PosterUploader
                fill
                variant="wide"
                preview={photoPreview ?? (removePhoto ? null : savedPhoto)}
                hint={t('notes.photoHint')}
                onSelect={(file) => {
                  setPhotoFile(file)
                  setPhotoPreview(URL.createObjectURL(file))
                  setRemovePhoto(false)
                }}
                onClear={() => {
                  setPhotoFile(null)
                  setPhotoPreview(null)
                  setRemovePhoto(true)
                }}
              />
            )
          }
        >
          {/* ⚠️ სახელი `locked`-ია — მისი გარეშე ჩანაწერი არ ჩაიწერება;
              ჩაკეტვის მოხსნა ცხადი ქმედებაა, ამიტომ `shows()` აქაც ისმის. */}
          <FormField
            show={fields.shows('title')}
            label={fields.label('title')}
            htmlFor="note-title"
            required
            error={errors.title}
          >
            <Input
              id="note-title"
              autoFocus
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </FormField>

          <FormField {...fields.field('description')} htmlFor="note-desc">
            <RichText
              id="note-desc"
              label={fields.label('description')}
              maxLength={RICH_TEXT_MAX}
              placeholder={t('notes.descriptionPlaceholder')}
              value={form.description}
              onChange={(v) => setForm((f) => ({ ...f, description: v }))}
            />
          </FormField>
        </FormSection>

        {/* იერი: საკუთარი აიქონი და ფონის ფერი — ფოტოს გარეშე ბარათზე სწორედ ეს ჩანს */}
        <FormSection
          title={t('notes.look')}
          hint={t('notes.lookHint')}
          className={fields.shows('icon') || fields.shows('color') ? undefined : 'hidden'}
        >
          <FormField
            {...fields.field('icon')}
            action={
              form.icon && (
                <Button type="button" variant="outline" size="xs" onClick={() => setForm((f) => ({ ...f, icon: null }))} data-testid="note-icon-clear">
                  <X className="size-3" />
                  {t('notes.iconClear')}
                </Button>
              )
            }
          >
            <IconPicker value={form.icon} onChange={(icon) => setForm((f) => ({ ...f, icon }))} />
          </FormField>

          <FormField {...fields.field('color')}>
            <ColorPick value={form.color} onChange={(color) => setForm((f) => ({ ...f, color }))} noneLabel={t('notes.colorNone')} />
          </FormField>
        </FormSection>

        <FormSection title={t('form.sections.classification')}>
          {/* „რას ეხება" — კატეგორია, გვერდით „ახალი" */}
          <FormField size="half" {...fields.field('category')} htmlFor="note-category" error={errors.category_id}>
            <SelectWithAdd
              id="note-category"
              value={form.categoryId}
              onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
              invalid={!!errors.category_id}
              addLabel={t('noteCategories.add')}
              dialog={addCategory}
            >
              {categories.map((category) => (
                <SelectItem key={category.id} value={String(category.id)}>
                  {dictionaryName(category, lang)}
                </SelectItem>
              ))}
            </SelectWithAdd>
          </FormField>

          <FormField size="half" {...fields.field('status')} htmlFor="note-status" error={errors.status}>
            <SelectWithAdd
              id="note-status"
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof f.status }))}
              invalid={!!errors.status}
              addLabel={t('statuses.add')}
              dialog={addStatus}
            >
              {/* სტატუსები per-user ლექსიკონიდან */}
              {statuses.map((s) => (
                <SelectItem key={s.id} value={s.key}>
                  {statusName(s, lang)}
                </SelectItem>
              ))}
            </SelectWithAdd>
          </FormField>

          <FormField
            {...fields.field('tags')}
            hint={joinHints(fields.hint('tags'), t('notes.tagsHint'))}
            htmlFor="note-tags"
          >
            <TagSelect
              inputId="note-tags"
              options={allTags}
              value={form.tags}
              onChange={(tags) => setForm((f) => ({ ...f, tags }))}
            />
          </FormField>
        </FormSection>

        {/* რამდენიმე ბმული */}
        <FormSection title={t('form.sections.details')} className={fields.shows('links') ? undefined : 'hidden'}>
          <FormField {...fields.field('links')}>
            <div className="space-y-1.5">
              {links.map((link, i) => (
                <div key={link._key} className="flex gap-1.5">
                  <Input
                    className="w-32 shrink-0"
                    placeholder={t('books.linkLabel')}
                    value={link.label ?? ''}
                    onChange={(e) =>
                      setLinks((all) => all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                    }
                  />
                  {/* ცარიელი წარწერა გვერდის სათაურით ივსება */}
                  <LinkField
                    className="min-w-0 flex-1"
                    value={link.url}
                    onChange={(url) => setLinks((all) => all.map((x, j) => (j === i ? { ...x, url } : x)))}
                    onFound={(p) =>
                      setLinks((all) => all.map((x, j) => (j === i ? { ...x, label: x.label || (p.title ?? '') } : x)))
                    }
                    onApply={(p) =>
                      setLinks((all) => all.map((x, j) => (j === i ? { ...x, label: p.title ?? x.label } : x)))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setLinks((all) => all.filter((_, j) => j !== i))}
                    aria-label={t('actions.delete')}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLinks((all) => [...all, keyRow({ label: '', url: '' })])}
              >
                <Plus className="size-3.5" />
                {t('notes.addLink')}
              </Button>
            </div>
          </FormField>
        </FormSection>
      </form>

      {/* ატვირთვები **დამატებაშიც და რედაქტირებაშიც** (2026-09-14) — იგივე
          კომპონენტი, რაც დეტალებშია. ⚠️ `</form>`-ის გარეთ დგას: ფაილს
          საკუთარი endpoint აქვს და ჩანაწერის `PUT`-ში არ მოგზაურობს. */}
      <FormSection title={t('form.sections.media')} plain className="mt-6">
        <NoteUploads noteId={current?.id ?? null} pending={pending} />
      </FormSection>

      {/* დამატებითი ველები; ახალ ჩანაწერზე მონახაზი */}
      <CustomFieldsCard
        module="note"
        recordId={current?.id ?? null}
        draft={note ? undefined : customDraft}
        className="mt-6"
      />

      <FormFooter
        formId={FORM_ID}
        onCancel={onClose}
        saving={save.isPending}
        savingLabel={
          progress ? t('notes.uploadingProgress', { done: progress.done + 1, total: progress.total }) : undefined
        }
      />

    </ModalShell>
  )
}
