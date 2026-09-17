import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import {
  createNote,
  updateNote,
  type NoteCategory,
  type NoteEntry,
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
import { FieldLabel } from '@/components/ui/field-label'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { NoteRemindersDialog, NoteRemindersLink } from '@/components/NoteRemindersDialog'
import { NoteUploads } from '@/components/NoteUploads'
import { ModalShell } from '@/components/ui/modal-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/feedback'
import { keyRow, keyRows, unkeyRows, type Keyed } from '@/lib/rowKeys'
import { fromDateTimeLocal, toDateTimeLocal } from '@/lib/utils'

/* ============================================================
   ჩანაწერის ფორმა (Tasks §13.1).

   გარე წყარო არ არსებობს, ე.ი. „სწრაფი შევსება" აქ არაა — ეს user-ის
   საკუთარი ინფორმაციაა და არა კატალოგის ჩანაწერი.

   ფაილები და შეხსენებები **ფორმაში არ არის**: ორივე ჩანაწერის შენახვის
   შემდეგ ემატება (დეტალების მოდალში), რადგან ატვირთვას არსებული `note_id`
   სჭირდება — იგივე წესი, რაც წიგნსა და ბორდგეიმზეა.
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

  const save = useMutation({
    mutationFn: (input: NoteInput) => (note ? updateNote(note.id, input) : createNote(input)),
    onSuccess: (saved) => {
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
  if (reminders && note) {
    return (
      <NoteRemindersDialog
        note={note}
        onBack={() => setReminders(false)}
        onClose={() => setReminders(false)}
      />
    )
  }

  return (
    <ModalShell title={t(note ? 'notes.edit' : 'notes.add')} onClose={onClose} wide>
      {/* ⚠️ **მოქმედებების რიგი `<form>`-ის გარეთაა და ეკრანის ბოლოშია**
          (2026-09-14). აქამდე „შენახვა" ფორმის ბოლოში იდგა, ატვირთვები,
          შეხსენება და მორგებული ველები კი **მის ქვემოთ** — ე.ი. ღილაკი
          გვერდს შუაზე ჭრიდა და ქვემოთ დარჩენილი ნაწილი „შენახვის შემდეგ
          მოსულს" ჰგავდა. HTML5-ის `form="…"` სწორედ ამისთვისაა: ღილაკი
          ფორმის გარეთ დგას და მაინც მას უშვებს. */}
      <form id={FORM_ID} onSubmit={submit} className="mt-4 space-y-4">
        {/* ⚠️ სახელი `locked`-ია (§6.5) — მისი გარეშე ჩანაწერი არ ჩაიწერება;
            ჩაკეტვის მოხსნა ცხადი ქმედებაა (§4), ამიტომ `shows()` აქაც ისმის. */}
        <div className={fields.shows('title') ? undefined : 'hidden'}>
          <FieldLabel htmlFor="note-title" required>{fields.label('title')}</FieldLabel>
          <Input
            id="note-title"
            autoFocus
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className={fields.shows('category') ? undefined : 'hidden'}>
            {/* „რას ეხება" — კატეგორია, გვერდით „ახალი" */}
            <FieldLabel htmlFor="note-category" required={fields.required('category')} hint={fields.hint('category')}>
              {fields.label('category')}
            </FieldLabel>
            <div className="flex gap-1">
              <Select
                value={form.categoryId}
                onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
              >
                <SelectTrigger
                  id="note-category"
                  className={errors.category_id ? 'border-destructive' : undefined}
                >
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
            {errors.category_id && (
              <p className="mt-1 text-xs text-destructive">{errors.category_id}</p>
            )}
          </div>

          <div className={fields.shows('status') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="note-status" required={fields.required('status')} hint={fields.hint('status')}>
              {fields.label('status')}
            </FieldLabel>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof f.status }))}
            >
              <SelectTrigger
                id="note-status"
                className={errors.status ? 'border-destructive' : undefined}
              >
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
            {errors.status && <p className="mt-1 text-xs text-destructive">{errors.status}</p>}
          </div>

          {fields.shows('due_at') && (
            <div>
              {/* „როდისთვის მჭირდება" (§13.1) */}
              <FieldLabel htmlFor="note-due" required={fields.required('due_at')} hint={fields.hint('due_at')}>
                {fields.label('due_at')}
              </FieldLabel>
              {/* §2.8 — ნორმალური პიქერი; ფორმატი იგივეა, რაც
                  `datetime-local`-ს ჰქონდა, ე.ი. `fromDateTimeLocal` უცვლელია */}
              <DatePicker
                id="note-due"
                withTime
                value={form.dueAt || null}
                onChange={(v) => setForm((f) => ({ ...f, dueAt: v ?? '' }))}
              />
            </div>
          )}
        </div>

        {fields.shows('tags') && (
          <div>
            <FieldLabel htmlFor="note-tags" required={fields.required('tags')} hint={fields.hint('tags')}>
              {fields.label('tags')}
            </FieldLabel>
            <TagSelect
              inputId="note-tags"
              options={allTags}
              value={form.tags}
              onChange={(tags) => setForm((f) => ({ ...f, tags }))}
            />
            <p className="mt-1 text-xs text-muted-foreground">{t('notes.tagsHint')}</p>
          </div>
        )}

        <div className={fields.shows('description') ? undefined : 'hidden'}>
          <FieldLabel htmlFor="note-desc" required={fields.required('description')} hint={fields.hint('description')}>
            {fields.label('description')}
          </FieldLabel>
          <Textarea
            id="note-desc"
            rows={5}
            placeholder={t('notes.descriptionPlaceholder')}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>

        {/* რამდენიმე ბმული (§13.1) */}
        <div className={fields.shows('links') ? undefined : 'hidden'}>
          <FieldLabel required={fields.required('links')} hint={fields.hint('links')}>
            {fields.label('links')}
          </FieldLabel>
          <div className="mt-1.5 space-y-1.5">
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
        </div>

      </form>

      {/* ატვირთვები **დამატებაშიც და რედაქტირებაშიც** (2026-09-14) — იგივე
          კომპონენტი, რაც დეტალებშია. ⚠️ `</form>`-ის გარეთ დგას: ფაილს
          საკუთარი endpoint აქვს და ჩანაწერის `PUT`-ში არ მოგზაურობს. */}
      <div className="mt-4">
        <NoteUploads noteId={note?.id ?? null} />
      </div>

      {/* ⚠️ **შეხსენება ფორმის შიგნით არ დგას — არც ველებს შორის და არც
          „გაუქმება/შენახვის" რიგში** (შენი მითითება, 2026-09-14): ის
          `</form>`-ის **გარეთაა**, ცალკე რიგად, ხატულითა და ტექსტით.
          ე.ი. ჩანაწერის ფორმას ისევ ერთი საქმე აქვს, გვერდზე კი ცხადად
          ჩანს გასასვლელი შეხსენებებზე. იგივე, რასაც სიის ზარი აკეთებს. */}
      <div className="mt-4">
        <NoteRemindersLink note={note} onOpen={() => setReminders(true)} />
      </div>

      {/* §6 ფაზა 3 — მორგებული ველები (იხ. `CustomFieldsCard`: ბარათი თვითონ ინახავს თავს) */}
      <div className="mt-4">
        <CustomFieldsCard module="note" recordId={note?.id ?? null} />
      </div>

      {/* ⚠️ ბოლოში და ზედა ხაზით გამოყოფილი — ყველაფრის შემდეგ, რაც გვერდზეა */}
      <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button type="submit" form={FORM_ID} disabled={save.isPending}>
          {save.isPending ? t('actions.saving') : t('actions.save')}
        </Button>
      </div>

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
