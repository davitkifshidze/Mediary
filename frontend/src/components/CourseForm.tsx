import { useState } from 'react'
import { SelectWithAdd } from '@/components/ui/inline-add'
import { useDictionaryAdd } from '@/lib/dictionaries'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
} from 'lucide-react'
import {
  COURSE_STATUSES,
  createCourse,
  fetchCourseCategories,
  fetchCourseMetadata,
  updateCourse,
  type Course,
  type CourseCategory,
  type CourseFileKind,
  type CourseInput,
  type CourseStatus,
  uploadCourseFiles,
} from '@/api/courses'
import { storageUrl } from '@/lib/api'
import { RICH_TEXT_MAX } from '@/lib/richText'
import { useModuleFields } from '@/lib/fields'
import { dedupeTags } from '@/lib/tags'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { hiddenPicks, pickErrors } from '@/lib/requiredPicks'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { PendingFilesSection } from '@/components/PendingFiles'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { PosterUploader } from '@/components/PosterUploader'
import { TagSelect } from '@/components/TagSelect'
import { RichText } from '@/components/ui/rich-text'
import { FieldLabel, joinHints } from '@/components/ui/field-label'
import { Input } from '@/components/ui/input'
import { FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
import { ModalShell } from '@/components/ui/modal-shell'
import { QuickFill } from '@/components/ui/quick-fill'
import { useRecordExtras } from '@/lib/customFieldDraft'
import { usePendingUploads } from '@/lib/pendingUploads'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **კურსის ფორმა** — დამატება და რედაქტირება.

   ⚠️ გვერდიდან (`pages/CoursesPage`) აქ იმიტომ გადმოვიდა, რომ მეორე ადგილიც
   ხსნის: ვიდეოს ფორმის „კურსის" ველის „+" — იგივე ფანჯარა და არა მისი
   შემოკლებული ასლი. `components/` გვერდს ვერ იმპორტირებს.
   ============================================================ */

const FORM_ID = 'course-form'

export function CourseForm({
  course,
  allTags = [],
  categories: given,
  onClose,
  onSaved,
}: {
  course: Course | null
  /** ცნობილი ტეგები — გვერდი თავის სიას აწვდის; მის გარეშე ფორმა ცარიელი სიით იწყებს */
  allTags?: string[]
  /** კატეგორიები — გვერდის გარეთ (ვიდეოს ფორმის „+") ფორმა თვითონ კითხულობს */
  categories?: CourseCategory[]
  onClose: () => void
  /** შენახული კურსი — გამომძახებელი მას მაშინვე ირჩევს */
  onSaved: (saved: Course) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { toast } = useToast()
  const addCategory = useDictionaryAdd('course-categories')
  // ⚠️ იგივე ქეში, რასაც გვერდი და კლასიფიკატორების ფანჯარა ანახლებს
  const ownCategories = useQuery({ queryKey: ['course-categories'], queryFn: fetchCourseCategories, enabled: !given })
  const categories = given ?? ownCategories.data ?? []
  const fields = useModuleFields('course')

  const [form, setForm] = useState({
    title: course?.title ?? '',
    url: course?.url ?? '',
    description: course?.description ?? '',
    // ⚠️ ცარიელი სტრიქონი და არა პირველი კატეგორია: ჩუმად წინასწარშევსებული
    // პასუხი არჩევანი არაა (2026-09-16-ის წესი)
    categoryId: course?.category_id ? String(course.category_id) : '',
    status: (course?.status ?? '') as CourseStatus | '',
    tags: course?.tags ?? [],
  })
  const [thumbnail, setThumbnail] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(
    course?.image ? (storageUrl(course.image) ?? course.image) : null,
  )
  const [removeThumb, setRemoveThumb] = useState(false)
  /* ბმულიდან ნაპოვნი ფოტო **იგზავნება** (ადრე მხოლოდ ჩანდა და შენახვისას
     იკარგებოდა): `undefined` — არ შეგვხებია · `null` — მოხსნილია · სტრიქონი — ახალი */
  const [imageUrl, setImageUrl] = useState<string | null | undefined>(undefined)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [probing, setProbing] = useState(false)
  const qc = useQueryClient()
  // დამატებითი ველები ახალ კურსზეც (აქამდე მხოლოდ რედაქტირებისას ჩანდა)
  const extras = useRecordExtras('course', course)
  /* ფაილები **შექმნისთანავე** (`lib/pendingUploads.ts`, ჩანაწერების
     პატერნი): შენახვამდე ბრაუზერშია, შენახვისას ჯერ კურსი, მერე ფაილები სათითაოდ.
     ⚠️ ჩავარდნა კურსს არ აუქმებს — ფანჯარა ღია რჩება, ჩავარდნილი მიზეზით, „შენახვა" ხელახლა ცდის. */
  const pending = usePendingUploads<CourseFileKind>()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  /**
   * ბმულის ჩასმისთანავე ვცდილობთ სათაურის წამოღებას.
   * ⚠️ ივსება **მხოლოდ ცარიელი ველები** — ხელით შეყვანილს არ ვაბათილებთ
   * (ვიდეოს/ბუკმარკის იგივე წესი).
   */
  const loadMeta = async (url: string) => {
    const clean = url.trim()
    if (!clean || !/^https?:\/\//i.test(clean)) return

    setProbing(true)
    try {
      const meta = await fetchCourseMetadata(clean)
      setForm((f) => ({
        ...f,
        title: f.title || (meta.title ?? ''),
        description: f.description || (meta.description ?? ''),
      }))
      if (!preview && meta.image_url) {
        setPreview(meta.image_url)
        setImageUrl(meta.image_url)
      }
    } catch {
      /* ⚠️ ჩუმად: კურსის გვერდი ბოტს ხშირად 403-ს აძლევს და ეს ხელით
         შევსებას არ უნდა უშლიდეს */
    } finally {
      setProbing(false)
    }
  }

  const save = useMutation({
    mutationFn: (input: CourseInput) =>
      extras.current ? updateCourse(extras.current.id, input) : createCourse(input),
    onSuccess: async (saved) => {
      const done = await extras.afterSave(saved)
      if (!done.ok) {
        qc.invalidateQueries({ queryKey: ['courses'] })
        toast({ title: done.message, variant: 'error' })

        return
      }

      if (pending.items.length) {
        const failed = await pending.run(
          (kind, file) => uploadCourseFiles(saved.id, kind, [file]),
          (done, total) => setProgress({ done, total }),
        )
        setProgress(null)
        qc.invalidateQueries({ queryKey: ['course-files', saved.id] })
        qc.invalidateQueries({ queryKey: ['courses'] })
        qc.invalidateQueries({ queryKey: ['storage'] })

        if (failed.length) {
          toast({ title: t('uploads.failed', { names: failed.map((f) => f.file.name).join(', ') }), variant: 'error' })

          return
        }
      }

      toast({ title: t('courses.saved'), variant: 'success' })
      onSaved(saved)
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()

    /* ⚠️ სტატუსიც და კატეგორიაც სავალდებულოა — შემოწმება ქსელამდე,
       backend-ის 422 მეორე კარიბჭეა. */
    const picked = pickErrors(
      { status: form.status, category_id: form.categoryId },
      t('validation.pickOne'),
    )

    if (Object.keys(picked).length > 0) {
      setErrors(picked)

      const hidden = hiddenPicks(Object.keys(picked), fields.shows)
      if (hidden.length > 0) {
        toast({
          title: t('validation.hiddenRequired', {
            fields: hidden.map((key) => fields.label(key)).join(', '),
          }),
          variant: 'error',
        })
      }

      return
    }

    setErrors({})

    // submit-ზე დუბლი უხმოდ იჭრება: `TagSelect` უკვე გააფრთხილა, აქ მხოლოდ გარანტიაა
    const { tags } = dedupeTags(form.tags)

    save.mutate({
      title: form.title,
      url: form.url || null,
      description: form.description || null,
      category_id: form.categoryId ? Number(form.categoryId) : null,
      status: form.status as CourseStatus,
      tags,
      image_url: imageUrl,
      thumbnail,
      remove_thumbnail: removeThumb,
    })
  }

  return (
    <ModalShell title={t(course ? 'courses.edit' : 'courses.add')} onClose={onClose} wide>
      <form id={FORM_ID} onSubmit={submit} className="mt-4 space-y-6">
        {/* ბმულიან მოდულში სწრაფი შევსება თვითონ ბმულის ველია.
            ⚠️ ბმული **არასავალდებულოა**: ოფლაინ კურსს მისამართი არ აქვს */}
        <QuickFill
          show={fields.shows('url')}
          title={fields.label('url')}
          htmlFor="c-url"
          required={fields.required('url')}
          hint={joinHints(fields.hint('url'), t('courses.urlHint'))}
          icon={<Link2 className="size-3.5 text-primary" />}
        >
          <div className="relative">
            <Input
              id="c-url"
              placeholder="https://www.udemy.com/course/…"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              onBlur={(e) => void loadMeta(e.target.value)}
              // paste-ზეც, არა მხოლოდ ველიდან გასვლაზე
              onPaste={(e) => void loadMeta(e.clipboardData.getData('text'))}
            />
            {probing && (
              <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          {errors.url && <p className="mt-1 text-xs text-destructive">{errors.url}</p>}
        </QuickFill>

        {/* მთავარი ფოტო ზემოთაა, სახელსა და აღწერასთან ერთად */}
        <FormSection
          title={t('form.sections.basic')}
          mediaVariant="wide"
          mediaLabel={
            <FieldLabel required={fields.required('thumbnail')} hint={fields.hint('thumbnail')}>
              {fields.label('thumbnail')}
            </FieldLabel>
          }
          media={
            fields.shows('thumbnail') && (
              <PosterUploader
                fill
                preview={preview}
                variant="wide"
                onSelect={(file) => {
                  setThumbnail(file)
                  setRemoveThumb(false)
                  setImageUrl(undefined)
                  setPreview(URL.createObjectURL(file))
                }}
                onClear={() => {
                  setThumbnail(null)
                  setRemoveThumb(true)
                  // ბმულიდან მოსული ფოტოც იხსნება, თორემ შენახვის შემდეგ ისევ ჩნდებოდა
                  setImageUrl(null)
                  setPreview(null)
                }}
              />
            )
          }
        >
          {/* ⚠️ სახელი `locked`-ია — ყოველთვის სავალდებულო */}
          <FormField {...fields.field('title')} required htmlFor="c-title" error={errors.title}>
            <Input
              id="c-title"
              autoFocus
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </FormField>

          <FormField {...fields.field('description')} htmlFor="c-description">
            <RichText
              id="c-description"
              label={fields.label('description')}
              maxLength={RICH_TEXT_MAX}
              placeholder={fields.placeholder('description')}
              value={form.description}
              onChange={(v) => setForm((f) => ({ ...f, description: v }))}
            />
          </FormField>
        </FormSection>

        {/* ⚠️ `required` აღარ წერია ხელით: ნიშანი ველების კონსტრუქტორიდან
            მოდის, როგორც დანარჩენ ფორმებში (სავალდებულობას `pickErrors` ამოწმებს) */}
        <FormSection title={t('form.sections.classification')}>
          <FormField size="half" {...fields.field('status')} htmlFor="c-status" error={errors.status}>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as CourseStatus }))}>
              <SelectTrigger id="c-status" className={errors.status ? 'border-destructive' : undefined}>
                <SelectValue placeholder={t('validation.choose')} />
              </SelectTrigger>
              <SelectContent>
                {COURSE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`courses.statuses.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField size="half" {...fields.field('category')} htmlFor="c-category" error={errors.category_id}>
            <SelectWithAdd
              id="c-category"
              value={form.categoryId}
              onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
              invalid={!!errors.category_id}
              addLabel={t('courseCategories.add')}
              dialog={addCategory}
            >
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {dictionaryName(c, lang)}
                </SelectItem>
              ))}
            </SelectWithAdd>
          </FormField>

          <FormField {...fields.field('tags')} htmlFor="c-tags">
            <TagSelect
              inputId="c-tags"
              value={form.tags}
              onChange={(v) => setForm((f) => ({ ...f, tags: v }))}
              options={allTags}
            />
          </FormField>
        </FormSection>

        {/* ფაილები ახალ კურსზე; არსებულს დეტალის ფანჯარაში აქვს */}
        {!course && (
          <PendingFilesSection
            pending={pending}
            title={t('courses.files')}
            hint={t('uploads.pendingHint')}
            kinds={[
              { kind: 'image', label: t('courses.fileKinds.image'), icon: ImageIcon },
              { kind: 'doc', label: t('courses.fileKinds.doc'), icon: FileText },
            ]}
          />
        )}
      </form>

      {/* დამატებითი ველები **ახალ კურსზეც** (აქამდე მხოლოდ
          რედაქტირებისას ჩანდა); ახალზე მონახაზია და კურსთან ერთად ინახება */}
      <CustomFieldsCard
        module="course"
        recordId={extras.current?.id ?? null}
        draft={extras.draft}
        className="mt-6"
      />

      {progress && (
        <p className="mt-3 text-xs text-muted-foreground">{t('uploads.progress', { done: progress.done, total: progress.total })}</p>
      )}

      {/* ⚠️ „ინახება…" შენახვისას — აქამდე „შენახვა" ეწერა და ღილაკი უმოქმედოს ჰგავდა */}
      <FormFooter formId={FORM_ID} onCancel={onClose} saving={save.isPending} />
    </ModalShell>
  )
}
