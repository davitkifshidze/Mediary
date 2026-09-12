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
import { ModalShell } from '@/components/ui/modal-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/feedback'
import { fromDateTimeLocal, toDateTimeLocal } from '@/lib/utils'

/* ============================================================
   ჩანაწერის ფორმა (Tasks §13.1).

   გარე წყარო არ არსებობს, ე.ი. „სწრაფი შევსება" აქ არაა — ეს user-ის
   საკუთარი ინფორმაციაა და არა კატალოგის ჩანაწერი.

   ფაილები და შეხსენებები **ფორმაში არ არის**: ორივე ჩანაწერის შენახვის
   შემდეგ ემატება (დეტალების მოდალში), რადგან ატვირთვას არსებული `note_id`
   სჭირდება — იგივე წესი, რაც წიგნსა და ბორდგეიმზეა.
   ============================================================ */

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
  const [links, setLinks] = useState<NoteLink[]>(note?.links ?? [])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [newCategory, setNewCategory] = useState(false)

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

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    save.mutate({
      title: form.title,
      description: form.description || null,
      category_id: form.categoryId ? Number(form.categoryId) : null,
      tags: form.tags,
      links: links.filter((l) => l.url.trim()),
      // ⚠️ ლოკალური input → UTC (`fromDateTimeLocal` ერთადერთი გზაა)
      due_at: fromDateTimeLocal(form.dueAt),
      status: form.status || undefined,
    })
  }

  return (
    <ModalShell title={t(note ? 'notes.edit' : 'notes.add')} onClose={onClose} wide>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div>
          {/* ⚠️ სახელი `locked`-ია (§6.5) — მისი გარეშე ჩანაწერი არ ჩაიწერება */}
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
                value={form.categoryId || 'none'}
                onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v === 'none' ? '' : v }))}
              >
                <SelectTrigger id="note-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('noteCategories.none')}</SelectItem>
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
          </div>

          <div className={fields.shows('status') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="note-status" required={fields.required('status')} hint={fields.hint('status')}>
              {fields.label('status')}
            </FieldLabel>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof f.status }))}
            >
              <SelectTrigger id="note-status">
                <SelectValue />
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
              <div key={i} className="flex gap-1.5">
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
              onClick={() => setLinks((all) => [...all, { label: '', url: '' }])}
            >
              <Plus className="size-3.5" />
              {t('notes.addLink')}
            </Button>
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

      {/* §6 ფაზა 3 — მორგებული ველები (იხ. `CustomFieldsCard`: ბარათი თვითონ ინახავს თავს) */}
      <div className="mt-4">
        <CustomFieldsCard module="note" recordId={note?.id ?? null} />
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
