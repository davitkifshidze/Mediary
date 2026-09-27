import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import {
  createNote,
  updateNote,
  uploadNoteFiles,
  type NoteCategory,
  type NoteEntry,
  type NoteFile,
  type NoteInput,
  type NoteLink,
} from '@/api/notes'
import { useModuleFields } from '@/lib/fields'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { hiddenPicks, pickErrors } from '@/lib/requiredPicks'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { statusName, useStatuses } from '@/lib/statuses'
import { NoteCategoryDialog } from '@/components/NoteCategoryDialog'
import { TagSelect } from '@/components/TagSelect'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { joinHints } from '@/components/ui/field-label'
import { FORM_TEXT_ROWS, FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { NoteRemindersDialog, NoteRemindersLink } from '@/components/NoteRemindersDialog'
import { NoteUploads } from '@/components/NoteUploads'
import { ModalShell } from '@/components/ui/modal-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/feedback'
import { keyRow, keyRows, unkeyRows, type Keyed } from '@/lib/rowKeys'
import { usePendingUploads } from '@/lib/pendingUploads'
import { useCustomFieldDraft } from '@/lib/customFieldDraft'
import { fromDateTimeLocal, toDateTimeLocal } from '@/lib/utils'

/* ============================================================
   ჩანაწერის ფორმა (Tasks §13.1).

   გარე წყარო არ არსებობს, ე.ი. „სწრაფი შევსება" აქ არაა — ეს user-ის
   საკუთარი ინფორმაციაა და არა კატალოგის ჩანაწერი.

   ⚠️ **ფაილები ახალ ჩანაწერზეც ემატება** (Tasks §23.4): შენახვამდე ისინი
   ბრაუზერშია, შენახვისას კი ჩანაწერის შემდეგ სათითაოდ ადის. ⚠️ **შეხსენება
   კი შექმნის შემდეგ რჩება** (§23.5, შენი სიტყვით) — მას `note_entry_id`
   სჭირდება და ფანჯარა ამას i-ით ამბობს.

   Tasks §26 — ფორმის საერთო ჩონჩხი (`ui/form-layout.tsx`): სექციები
   სათაურით, 12-სვეტიანი ბადე და მიმაგრებული ქვედა ზოლი; დამატებითი
   ველებიც ახალ ჩანაწერზე ივსება (§26.5 — იგივე მექანიზმი, რაც ფაილებს).
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
  // §6 — რომელი არჩევითი ველი ჩანს ამ ფორმაზე
  const fields = useModuleFields('note')

  const [form, setForm] = useState({
    title: note?.title ?? '',
    description: note?.description ?? '',
    categoryId: note?.category_id ? String(note.category_id) : '',
    tags: note?.tags ?? [],
    // §6.4 — გასაღები; ცარიელი = ნაგულისხმევი (backend დაადებს)
    status: note?.status?.key ?? '',
    dueAt: toDateTimeLocal(note?.due_at),
  })
  /* ⚠️ სტრიქონს **საკუთარი გასაღები** აქვს და არა ინდექსი (Tasks BUG-11):
     ინდექსზე შუა სტრიქონის წაშლა ფოკუსსა და კარეტს მეზობელ ბმულზე გადაიტანდა.
     `unkeyRows()` გასაღებს payload-ში ჭრის. */
  const [links, setLinks] = useState<Keyed<NoteLink>[]>(() => keyRows(note?.links ?? []))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [newCategory, setNewCategory] = useState(false)
  const [reminders, setReminders] = useState(false)
  const qc = useQueryClient()

  /* ---------- §23.4 — ფაილები ახალ ჩანაწერზე ----------
     ⚠️ შენახვამდე ფაილი ბრაუზერშია (`pending`); შენახვისას ჯერ ჩანაწერი
     იქმნება, მერე ფაილები **სათითაოდ**, პროგრესით. ⚠️ ჩავარდნა ჩანაწერს არ
     აუქმებს: ფანჯარა ღია რჩება და **შექმნილის რედაქტირებად** გადადის
     (`created`), ჩავარდნილი ფაილი კი მიზეზით რჩება — „შენახვა" მას ხელახლა ცდის. */
  const pending = usePendingUploads<NoteFile['kind']>()
  // §26.5 — დამატებითი ველები ახალ ჩანაწერზე (იგივე წესი, რაც ფაილებს)
  const customDraft = useCustomFieldDraft('note')
  const [created, setCreated] = useState<NoteEntry | null>(null)
  const current = note ?? created
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const save = useMutation({
    mutationFn: (input: NoteInput) => (current ? updateNote(current.id, input) : createNote(input)),
    onSuccess: async (saved) => {
      const problems: string[] = []

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


  /* ⚠️ **დამალულ ველზე წითელი ტექსტი არავის უნახავს** (Tasks §4.1): ბლოკი
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
      // ⚠️ ლოკალური input → UTC (`fromDateTimeLocal` ერთადერთი გზაა)
      due_at: fromDateTimeLocal(form.dueAt),
      status: form.status || undefined,
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
      {/* ⚠️ **მოქმედებების რიგი `<form>`-ის გარეთაა და ეკრანის ბოლოშია**
          (2026-09-14 → §26.1): ატვირთვები, შეხსენება და დამატებითი ველები
          ღილაკების ზემოთ დგას და არა მათ ქვემოთ. HTML5-ის `form="…"` სწორედ
          ამისთვისაა: ღილაკი ფორმის გარეთ დგას და მაინც მას უშვებს. */}
      <form id={FORM_ID} onSubmit={submit} className="mt-4 space-y-6">
        <FormSection title={t('form.sections.basic')}>
          {/* ⚠️ სახელი `locked`-ია (§6.5) — მისი გარეშე ჩანაწერი არ ჩაიწერება;
              ჩაკეტვის მოხსნა ცხადი ქმედებაა (§4), ამიტომ `shows()` აქაც ისმის. */}
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
            <Textarea
              id="note-desc"
              rows={FORM_TEXT_ROWS}
              placeholder={t('notes.descriptionPlaceholder')}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </FormField>
        </FormSection>

        <FormSection title={t('form.sections.classification')}>
          {/* „რას ეხება" — კატეგორია, გვერდით „ახალი" */}
          <FormField size="third" {...fields.field('category')} htmlFor="note-category" error={errors.category_id}>
            <div className="flex gap-1">
              <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
                <SelectTrigger id="note-category" className={errors.category_id ? 'border-destructive' : undefined}>
                  <SelectValue placeholder={t('validation.choose')} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {dictionaryName(category, lang)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => setNewCategory(true)}
                title={t('noteCategories.add')}
                aria-label={t('noteCategories.add')}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </FormField>

          <FormField size="third" {...fields.field('status')} htmlFor="note-status" error={errors.status}>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof f.status }))}
            >
              <SelectTrigger id="note-status" className={errors.status ? 'border-destructive' : undefined}>
                <SelectValue placeholder={t('validation.choose')} />
              </SelectTrigger>
              <SelectContent>
                {/* §6.4 — სტატუსები per-user ლექსიკონიდან */}
                {statuses.map((s) => (
                  <SelectItem key={s.id} value={s.key}>
                    {statusName(s, lang)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* „როდისთვის მჭირდება" (§13.1); §2.8 — ნორმალური პიქერი, ფორმატი
              იგივეა, რაც `datetime-local`-ს ჰქონდა, ე.ი. `fromDateTimeLocal` უცვლელია */}
          <FormField size="third" {...fields.field('due_at')} htmlFor="note-due">
            <DatePicker
              id="note-due"
              withTime
              value={form.dueAt || null}
              onChange={(v) => setForm((f) => ({ ...f, dueAt: v ?? '' }))}
            />
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

        {/* რამდენიმე ბმული (§13.1) */}
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
                  <Input
                    placeholder="https://…"
                    value={link.url}
                    onChange={(e) =>
                      setLinks((all) => all.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
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

      {/* ⚠️ **შეხსენება ფორმის შიგნით არ დგას — არც ველებს შორის და არც
          „გაუქმება/შენახვის" რიგში** (შენი მითითება, 2026-09-14): ის
          `</form>`-ის **გარეთაა**, ცალკე რიგად, ხატულითა და ტექსტით.
          ე.ი. ჩანაწერის ფორმას ისევ ერთი საქმე აქვს, გვერდზე კი ცხადად
          ჩანს გასასვლელი შეხსენებებზე. იგივე, რასაც სიის ზარი აკეთებს. */}
      <div className="mt-6">
        <NoteRemindersLink note={current} onOpen={() => setReminders(true)} />
      </div>

      {/* §6 ფაზა 3 → §26.5 — დამატებითი ველები; ახალ ჩანაწერზე მონახაზი */}
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

      {/* სწრაფი „ახალი კატეგორია" — შენახვისთანავე select-ში ირჩევა */}
      {newCategory && (
        <NoteCategoryDialog
          category={null}
          onClose={() => setNewCategory(false)}
          onSaved={(saved) => setForm((f) => ({ ...f, categoryId: String(saved.id) }))}
        />
      )}
    </ModalShell>
  )
}
