import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ExternalLink,
  GraduationCap,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  Search,
  SquarePen,
  Star,
  Trash2,
} from 'lucide-react'
import {
  COURSE_STATUSES,
  createCourse,
  deleteCourse,
  fetchCourseCategories,
  fetchCourseMetadata,
  fetchCourses,
  setCourseStatus,
  toggleCourseFavorite,
  updateCourse,
  type Course,
  type CourseCategory,
  type CourseFilters,
  type CourseInput,
  type CourseStatus,
} from '@/api/courses'
import { storageUrl } from '@/lib/api'
import { useModuleFields } from '@/lib/fields'
import { useFilterDraft } from '@/lib/filters'
import { useListLimit } from '@/lib/paged'
import { dedupeTags } from '@/lib/tags'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { hiddenPicks, pickErrors } from '@/lib/requiredPicks'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { CourseDetail } from '@/components/CourseDetail'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { PosterUploader } from '@/components/PosterUploader'
import { TagSelect } from '@/components/TagSelect'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import {
  FilterGroup,
  FilterOption,
  FilterOptionList,
  FilterPanel,
  FilterTrigger,
} from '@/components/FilterPanel'
import { EnumStatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldLabel, joinHints } from '@/components/ui/field-label'
import { Input } from '@/components/ui/input'
import { FORM_TEXT_ROWS, FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
import { ModalShell } from '@/components/ui/modal-shell'
import { QuickFill } from '@/components/ui/quick-fill'
import { useRecordExtras } from '@/lib/customFieldDraft'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ShowMore } from '@/components/ui/show-more'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { favoriteAction, MENU_ICONS, RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'
import { cn } from '@/lib/utils'

/* ============================================================
   კურსების მოდული (`course`, FEAT-25).

   ⚠️ **გარე წყარო არ არსებობს** — ბმულის probe მხოლოდ სათაურსა და
   სურათს ავსებს, „კანდიდატების" არჩევანი აქ არაფერია.

   ⚠️ **სტატუსი enum-ია** (ოთხი მნიშვნელობა), ე.ი. საიდბარის სექციები
   წიგნის/თამაშის რიგშია: „ყველა · რჩეული · დამატება" (§6.1), ხოლო
   სტატუსით ფილტრი პანელშია.
   ============================================================ */

const SORTS = ['newest', 'oldest', 'title', 'finished'] as const

interface PanelFilters {
  categories: string[]
  tags: string[]
  statuses: string[]
}

const EMPTY_FILTERS: PanelFilters = { categories: [], tags: [], statuses: [] }

export function CoursesPage() {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const view = params.get('view') ?? 'all'
  const search = params.toString()

  const categories = useMemo(
    () => new URLSearchParams(search).get('category')?.split(',').filter(Boolean) ?? [],
    [search],
  )
  const tags = useMemo(
    () => new URLSearchParams(search).get('tag')?.split(',').filter(Boolean) ?? [],
    [search],
  )
  const statuses = useMemo(
    () => new URLSearchParams(search).get('status')?.split(',').filter(Boolean) ?? [],
    [search],
  )

  const [panelOpen, setPanelOpen] = useState(false)
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [sort, setSort] = useState<(typeof SORTS)[number]>('newest')
  const [editing, setEditing] = useState<Course | 'new' | null>(null)
  const [detail, setDetail] = useState<Course | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setTerm(q.trim()), 350)
    return () => clearTimeout(timer)
  }, [q])

  const filters: CourseFilters = {
    q: term || undefined,
    category_id: categories.length ? categories.join(',') : undefined,
    tag: tags.length ? tags.join(',') : undefined,
    status: statuses.length ? statuses.join(',') : undefined,
    favorite: view === 'favorite' ? true : undefined,
    sort: sort === 'newest' ? undefined : sort,
  }

  const { limit, showMore } = useListLimit(JSON.stringify(filters))
  const query = useQuery({
    queryKey: ['courses', filters, limit],
    queryFn: () => fetchCourses({ ...filters, per_page: limit }),
    placeholderData: keepPreviousData,
  })
  const categoriesQ = useQuery({ queryKey: ['course-categories'], queryFn: fetchCourseCategories })

  const courses = useMemo(() => query.data?.items ?? [], [query.data])
  /** ⚠️ **გაფილტრული სიის** ჯამი და არა ჩატვირთულის — სათაურიც ამას წერს */
  const total = query.data?.total ?? 0
  const allCategories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data])

  // საიდბარის „დამატება" → `?new=1`
  useEffect(() => {
    if (params.get('new')) {
      setEditing('new')
      navigate({ pathname: '/courses', search: '' }, { replace: true })
    }
  }, [params, navigate])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['courses'] })
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const favorite = useMutation({ mutationFn: toggleCourseFavorite, onSuccess: invalidate, onError: fail })
  const status = useMutation({
    mutationFn: ({ id, next }: { id: number; next: CourseStatus }) => setCourseStatus(id, next),
    onSuccess: invalidate,
    onError: fail,
  })
  const remove = useMutation({
    mutationFn: deleteCourse,
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['course-categories'] })
      toast({ title: t('courses.deleted'), variant: 'success' })
    },
    onError: fail,
  })

  const knownTags = useMemo(() => {
    const set = new Map<string, string>()
    courses.forEach((c) => c.tags.forEach((tag) => set.set(tag.toLowerCase(), tag)))
    tags.forEach((tag) => set.set(tag.toLowerCase(), tag))
    return [...set.values()].sort((a, b) => a.localeCompare(b))
  }, [courses, tags])

  /** მონახაზის გაშვება = ახალი მისამართი; მიმდინარე სექცია (`?view=`) ინახება */
  const writeFilters = (next: PanelFilters) => {
    const p = new URLSearchParams()
    if (view !== 'all') p.set('view', view)
    if (next.categories.length) p.set('category', next.categories.join(','))
    if (next.tags.length) p.set('tag', next.tags.join(','))
    if (next.statuses.length) p.set('status', next.statuses.join(','))
    setPanelOpen(false)
    navigate({ pathname: '/courses', search: p.toString() })
  }

  const applied = useMemo<PanelFilters>(
    () => ({ categories, tags, statuses }),
    [categories, tags, statuses],
  )
  const { draft, setDraft, dirty, apply, clear, activeCount } = useFilterDraft(
    applied,
    EMPTY_FILTERS,
    writeFilters,
  )

  const toggle = (key: keyof PanelFilters, value: string, on: boolean) =>
    setDraft((d) => ({
      ...d,
      [key]: on ? [...d[key], value] : d[key].filter((x) => x !== value),
    }))

  return (
    <PageContainer>
      <PageHeader
        module="course"
        title={view === 'favorite' ? t('filter.favorite') : t('courses.title')}
        subtitle={t('courses.count', { count: total })}
        actions={
          <>
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('search.placeholder')}
                className="w-full pl-9 sm:w-56"
              />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as (typeof SORTS)[number])}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`courses.sort_${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FilterTrigger activeCount={activeCount} onClick={() => setPanelOpen(true)} />
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              {t('courses.add')}
            </Button>
          </>
        }
      />

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">{t('api.loading')}</p>
          ) : courses.length === 0 ? (
            <EmptyState
              icon={<GraduationCap className="size-6" />}
              title={activeCount > 0 || term ? t('courses.emptyFiltered') : t('courses.empty')}
              hint={activeCount > 0 || term ? t('courses.emptyFilteredHint') : t('courses.emptyHint')}
              actions={
                activeCount > 0 || term ? (
                  <Button variant="outline" onClick={() => { setQ(''); clear() }}>
                    {t('filter.clear')}
                  </Button>
                ) : (
                  <Button onClick={() => setEditing('new')}>
                    <Plus className="size-4" />
                    {t('courses.add')}
                  </Button>
                )
              }
            />
          ) : (
            <>
              <ul className="space-y-3">
                {courses.map((course) => {
                  /* Tasks §7 — მარჯვენა ღილაკის მენიუ: გახსნა · ბმული · სტატუსი ▸ · რჩეული · — · რედაქტირება · წაშლა */
                  const actions: MenuAction[] = [
                    { key: 'open', label: t('actions.open'), icon: MENU_ICONS.open, run: () => setDetail(course) },
                    ...(course.url
                      ? [{ key: 'link', label: t('actions.openLink'), icon: MENU_ICONS.link, run: () => window.open(course.url!, '_blank', 'noopener,noreferrer') }]
                      : []),
                    {
                      key: 'status',
                      label: t('courses.status'),
                      sub: COURSE_STATUSES.map((s) => ({
                        key: `status:${s}`,
                        label: t(`courses.statuses.${s}`),
                        checked: course.status === s,
                        run: () => status.mutate({ id: course.id, next: s }),
                      })),
                    },
                    favoriteAction(course.is_favorite, () => favorite.mutate(course.id), t),
                    { key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, separator: true, run: () => setEditing(course) },
                    {
                      key: 'delete',
                      label: t('actions.delete'),
                      icon: MENU_ICONS.delete,
                      danger: true,
                      run: async () => {
                        if (
                          await confirm({
                            title: t('courses.delete'),
                            description: t('courses.deleteHint', { name: course.title }),
                            variant: 'destructive',
                          })
                        ) {
                          remove.mutate(course.id)
                        }
                      },
                    },
                  ]
                  return (
                  <RecordContextMenu key={course.id} actions={actions}>
                  <li
                    className="flex gap-4 rounded-xl border border-border bg-card p-4"
                  >
                    <button
                      type="button"
                      onClick={() => setDetail(course)}
                      className="size-16 shrink-0 overflow-hidden rounded-md bg-muted"
                      aria-label={course.title}
                    >
                      {course.image ? (
                        <img
                          src={storageUrl(course.image) ?? course.image}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <span className="grid size-full place-items-center">
                          <GraduationCap className="size-6 text-muted-foreground" />
                        </span>
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDetail(course)}
                          className="min-w-0 truncate text-left font-medium hover:text-primary"
                        >
                          {course.title}
                        </button>
                        <EnumStatusBadge domain="course" status={course.status} />
                        <VisibilityBadge value={course.visibility} />
                      </div>

                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[
                          course.platform,
                          course.category ? dictionaryName(course.category, lang) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>

                      {course.tags.length > 0 && (
                        <p className="mt-1.5 truncate text-xs text-muted-foreground">
                          {course.tags.map((tag) => `#${tag}`).join(' ')}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-start gap-1">
                      <Select
                        value={course.status}
                        onValueChange={(v) => status.mutate({ id: course.id, next: v as CourseStatus })}
                      >
                        <SelectTrigger className="h-9 w-32" aria-label={t('courses.status')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COURSE_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {t(`courses.statuses.${s}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* ⚠️ `<a>` და არა `Button asChild` — `ui/button.tsx`-ს
                          `asChild` არ აქვს; გარე ბმული ბუკმარკის იგივე ფორმაშია. */}
                      {course.url && (
                        <a
                          href={course.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={t('courses.open')}
                          className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <ExternalLink className="size-4" />
                        </a>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDetail(course)}
                        aria-label={t('courses.files')}
                      >
                        <Paperclip className="size-4" />
                        <span className="w-3 text-[11px] tabular-nums">
                          {course.files_count || ''}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => favorite.mutate(course.id)}
                        aria-label={t('filter.favorite')}
                      >
                        <Star
                          className={cn('size-4', course.is_favorite && 'fill-current text-[var(--favorite)]')}
                        />
                      </Button>
                      <Button
                        variant="edit"
                        size="sm"
                        onClick={() => setEditing(course)}
                      >
                        <SquarePen className="size-3.5" />
                        {t('actions.edit')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={async () => {
                          if (
                            await confirm({
                              title: t('courses.delete'),
                              description: t('courses.deleteHint', { name: course.title }),
                              variant: 'destructive',
                            })
                          ) {
                            remove.mutate(course.id)
                          }
                        }}
                        aria-label={t('actions.delete')}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                  </RecordContextMenu>
                  )
                })}
              </ul>

              <ShowMore
                shown={courses.length}
                total={total}
                onMore={showMore}
                loading={query.isFetching}
              />
            </>
          )}
        </div>

        <FilterPanel
          activeCount={activeCount}
          dirty={dirty}
          onApply={() => apply(draft)}
          onClear={clear}
          open={panelOpen}
          onOpenChange={setPanelOpen}
        >
          {/* ⚠️ სტატუსი **აქ არის და არა საიდბარში**: enum-სტატუსიან მოდულებს
              (წიგნი/თამაში/სამაგიდო) სექციები არ აქვთ — §6.1-ის წესი. */}
          <FilterGroup title={t('courses.status')} count={draft.statuses.length}>
            <FilterOptionList>
              {COURSE_STATUSES.map((s) => (
                <FilterOption
                  key={s}
                  label={t(`courses.statuses.${s}`)}
                  checked={draft.statuses.includes(s)}
                  onChange={(on) => toggle('statuses', s, on)}
                />
              ))}
            </FilterOptionList>
          </FilterGroup>

          <FilterGroup title={t('courses.categories')} count={draft.categories.length}>
            <FilterOptionList>
              {allCategories.map((c) => (
                <FilterOption
                  key={c.id}
                  label={dictionaryName(c, lang)}
                  count={c.courses_count}
                  checked={draft.categories.includes(String(c.id))}
                  onChange={(on) => toggle('categories', String(c.id), on)}
                />
              ))}
            </FilterOptionList>
          </FilterGroup>

          {knownTags.length > 0 && (
            <FilterGroup title={t('filter.tags')} count={draft.tags.length}>
              <FilterOptionList>
                {knownTags.map((tag) => (
                  <FilterOption
                    key={tag}
                    label={tag}
                    checked={draft.tags.includes(tag)}
                    onChange={(on) => toggle('tags', tag, on)}
                  />
                ))}
              </FilterOptionList>
            </FilterGroup>
          )}
        </FilterPanel>
      </div>

      {detail && <CourseDetail course={detail} onClose={() => setDetail(null)} />}

      {editing && (
        <CourseForm
          course={editing === 'new' ? null : editing}
          allTags={knownTags}
          categories={allCategories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate()
            qc.invalidateQueries({ queryKey: ['course-categories'] })
            setEditing(null)
          }}
        />
      )}
    </PageContainer>
  )
}

/* ---------- ფორმა ---------- */

/** ⚠️ ზოლი `<form>`-ის გარეთაა და ფორმას `form="…"`-ით უშვებს */
const FORM_ID = 'course-form'

function CourseForm({
  course,
  allTags,
  categories,
  onClose,
  onSaved,
}: {
  course: Course | null
  allTags: string[]
  categories: CourseCategory[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { toast } = useToast()
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
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [probing, setProbing] = useState(false)
  const qc = useQueryClient()
  // §26.5 — დამატებითი ველები ახალ კურსზეც (აქამდე მხოლოდ რედაქტირებისას ჩანდა)
  const extras = useRecordExtras('course', course)

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
      if (!preview && meta.image_url) setPreview(meta.image_url)
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

      toast({ title: t('courses.saved'), variant: 'success' })
      onSaved()
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

    const { tags, removed } = dedupeTags(form.tags)
    if (removed > 0) {
      setForm((f) => ({ ...f, tags }))
      toast({ title: t('tags.duplicate', { count: removed }), variant: 'info' })
    }

    save.mutate({
      title: form.title,
      url: form.url || null,
      description: form.description || null,
      category_id: form.categoryId ? Number(form.categoryId) : null,
      status: form.status as CourseStatus,
      tags,
      thumbnail,
      remove_thumbnail: removeThumb,
    })
  }

  return (
    <ModalShell title={t(course ? 'courses.edit' : 'courses.add')} onClose={onClose} wide>
      <form id={FORM_ID} onSubmit={submit} className="mt-4 space-y-6">
        {/* §26.2 — ბმულიან მოდულში სწრაფი შევსება თვითონ ბმულის ველია.
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
            />
            {probing && (
              <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          {errors.url && <p className="mt-1 text-xs text-destructive">{errors.url}</p>}
        </QuickFill>

        {/* §26 — მთავარი ფოტო ზემოთაა, სახელსა და აღწერასთან ერთად */}
        <FormSection
          title={t('form.sections.basic')}
          media={
            fields.shows('thumbnail') && (
              <>
                <FieldLabel required={fields.required('thumbnail')} hint={fields.hint('thumbnail')}>
                  {fields.label('thumbnail')}
                </FieldLabel>
                <PosterUploader
                  preview={preview}
                  variant="wide"
                  onSelect={(file) => {
                    setThumbnail(file)
                    setRemoveThumb(false)
                    setPreview(URL.createObjectURL(file))
                  }}
                  onClear={() => {
                    setThumbnail(null)
                    setRemoveThumb(true)
                    setPreview(null)
                  }}
                />
              </>
            )
          }
        >
          {/* ⚠️ სახელი `locked`-ია (§6.5) — ყოველთვის სავალდებულო */}
          <FormField {...fields.field('title')} required htmlFor="c-title" error={errors.title}>
            <Input
              id="c-title"
              autoFocus
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </FormField>

          <FormField {...fields.field('description')} htmlFor="c-description">
            <Textarea
              id="c-description"
              rows={FORM_TEXT_ROWS}
              autoGrow
              placeholder={fields.placeholder('description')}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </FormField>
        </FormSection>

        {/* ⚠️ §26 — `required` აღარ წერია ხელით: ნიშანი ველების კონსტრუქტორიდან
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
            <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}>
              <SelectTrigger id="c-category" className={errors.category_id ? 'border-destructive' : undefined}>
                <SelectValue placeholder={t('validation.choose')} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {dictionaryName(c, lang)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
      </form>

      {/* §6 ფაზა 3 → §26.5 — დამატებითი ველები **ახალ კურსზეც** (აქამდე მხოლოდ
          რედაქტირებისას ჩანდა); ახალზე მონახაზია და კურსთან ერთად ინახება */}
      <CustomFieldsCard
        module="course"
        recordId={extras.current?.id ?? null}
        draft={extras.draft}
        className="mt-6"
      />

      {/* ⚠️ „ინახება…" შენახვისას — აქამდე „შენახვა" ეწერა და ღილაკი უმოქმედოს ჰგავდა */}
      <FormFooter formId={FORM_ID} onCancel={onClose} saving={save.isPending} />
    </ModalShell>
  )
}
