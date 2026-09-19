import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ExternalLink,
  GraduationCap,
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
  setCourseProgress,
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldLabel } from '@/components/ui/field-label'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ShowMore } from '@/components/ui/show-more'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   კურსების მოდული (`course`, FEAT-25).

   ⚠️ **გარე წყარო არ არსებობს** — ბმულის probe მხოლოდ სათაურსა და
   სურათს ავსებს, „კანდიდატების" არჩევანი აქ არაფერია.

   ⚠️ **სტატუსი enum-ია** (ოთხი მნიშვნელობა), ე.ი. საიდბარის სექციები
   წიგნის/თამაშის რიგშია: „ყველა · რჩეული · დამატება" (§6.1), ხოლო
   სტატუსით ფილტრი პანელშია.
   ============================================================ */

const SORTS = ['newest', 'oldest', 'title', 'rating', 'progress', 'finished'] as const

interface PanelFilters {
  categories: string[]
  tags: string[]
  statuses: string[]
}

const EMPTY_FILTERS: PanelFilters = { categories: [], tags: [], statuses: [] }

/** სტატუსის ტონი — მწვანე დასრულებულს, ნაცრისფერი მიტოვებულს */
const STATUS_TONE: Record<CourseStatus, string> = {
  to_take: 'bg-secondary text-muted-foreground',
  taking: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  done: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  dropped: 'bg-secondary text-muted-foreground line-through',
}

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
  const progress = useMutation({
    mutationFn: ({ id, done }: { id: number; done: number }) => setCourseProgress(id, done),
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
                {courses.map((course) => (
                  <li
                    key={course.id}
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
                        <Badge className={STATUS_TONE[course.status]}>
                          {t(`courses.statuses.${course.status}`)}
                        </Badge>
                        {course.rating && <Badge className="bg-secondary">★ {course.rating}</Badge>}
                        <VisibilityBadge value={course.visibility} />
                      </div>

                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[
                          course.platform,
                          course.instructor,
                          course.category ? dictionaryName(course.category, lang) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>

                      {/* პროგრესი — მხოლოდ მაშინ, როცა გაკვეთილების რაოდენობა ცნობილია */}
                      {course.percent != null && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-md bg-secondary">
                            <div
                              className="h-full rounded-md bg-primary"
                              style={{ width: `${course.percent}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {course.lessons_done} / {course.lessons_total}
                          </span>
                          {/* ერთი გაკვეთილი წინ — ყველაზე ხშირი ქმედება */}
                          {course.lessons_done < (course.lessons_total ?? 0) && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={progress.isPending}
                              onClick={() =>
                                progress.mutate({ id: course.id, done: course.lessons_done + 1 })
                              }
                            >
                              +1
                            </Button>
                          )}
                        </div>
                      )}

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
                          className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditing(course)}
                        aria-label={t('actions.edit')}
                      >
                        <SquarePen className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
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
                ))}
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
    instructor: course?.instructor ?? '',
    description: course?.description ?? '',
    // ⚠️ ცარიელი სტრიქონი და არა პირველი კატეგორია: ჩუმად წინასწარშევსებული
    // პასუხი არჩევანი არაა (2026-09-16-ის წესი)
    categoryId: course?.category_id ? String(course.category_id) : '',
    status: (course?.status ?? '') as CourseStatus | '',
    lessonsTotal: course?.lessons_total != null ? String(course.lessons_total) : '',
    lessonsDone: String(course?.lessons_done ?? 0),
    minutes: course?.minutes != null ? String(course.minutes) : '',
    rating: course?.rating ?? '',
    tags: course?.tags ?? [],
  })
  const [thumbnail, setThumbnail] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(
    course?.image ? (storageUrl(course.image) ?? course.image) : null,
  )
  const [removeThumb, setRemoveThumb] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [probing, setProbing] = useState(false)

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
      course ? updateCourse(course.id, input) : createCourse(input),
    onSuccess: () => {
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
      instructor: form.instructor || null,
      description: form.description || null,
      category_id: form.categoryId ? Number(form.categoryId) : null,
      status: form.status as CourseStatus,
      lessons_total: form.lessonsTotal ? Number(form.lessonsTotal) : null,
      lessons_done: Number(form.lessonsDone) || 0,
      minutes: form.minutes ? Number(form.minutes) : null,
      rating: form.rating ? Number(form.rating) : null,
      tags,
      thumbnail,
      remove_thumbnail: removeThumb,
    })
  }

  return (
    <ModalShell title={t(course ? 'courses.edit' : 'courses.add')} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className={fields.shows('title') ? undefined : 'hidden'}>
          <FieldLabel htmlFor="c-title" required hint={fields.hint('title')}>
            {fields.label('title')}
          </FieldLabel>
          <Input
            id="c-title"
            autoFocus
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title}</p>}
        </div>

        {/* ⚠️ ბმული **არასავალდებულოა**: ოფლაინ კურსსაც მისამართი არ აქვს */}
        <div className={fields.shows('url') ? undefined : 'hidden'}>
          <FieldLabel htmlFor="c-url" hint={fields.hint('url')}>
            {fields.label('url')}
          </FieldLabel>
          <Input
            id="c-url"
            placeholder="https://www.udemy.com/course/…"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            onBlur={(e) => void loadMeta(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">{t('courses.urlHint')}</p>
          {probing && (
            <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t('videos.metaLoading')}
            </p>
          )}
          {errors.url && <p className="mt-1 text-xs text-destructive">{errors.url}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className={fields.shows('status') ? undefined : 'hidden'}>
            <FieldLabel required hint={fields.hint('status')}>{fields.label('status')}</FieldLabel>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as CourseStatus }))}
            >
              <SelectTrigger>
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
            {errors.status && <p className="mt-1 text-xs text-destructive">{errors.status}</p>}
          </div>

          <div className={fields.shows('category') ? undefined : 'hidden'}>
            <FieldLabel required hint={fields.hint('category')}>{fields.label('category')}</FieldLabel>
            <Select
              value={form.categoryId}
              onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
            >
              <SelectTrigger>
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
            {errors.category_id && (
              <p className="mt-1 text-xs text-destructive">{errors.category_id}</p>
            )}
          </div>

          <div className={fields.shows('instructor') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="c-instructor">{fields.label('instructor')}</FieldLabel>
            <Input
              id="c-instructor"
              value={form.instructor}
              onChange={(e) => setForm((f) => ({ ...f, instructor: e.target.value }))}
            />
          </div>

          <div className={fields.shows('rating') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="c-rating">{fields.label('rating')}</FieldLabel>
            <Input
              id="c-rating"
              type="number"
              min={0}
              max={10}
              step="0.1"
              value={form.rating}
              onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value }))}
            />
          </div>

          <div className={fields.shows('lessons') ? undefined : 'hidden'}>
            <FieldLabel>{fields.label('lessons')}</FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={9999}
                aria-label={t('courses.lessonsDone')}
                value={form.lessonsDone}
                onChange={(e) => setForm((f) => ({ ...f, lessonsDone: e.target.value }))}
              />
              <span className="text-muted-foreground">/</span>
              <Input
                type="number"
                min={0}
                max={9999}
                aria-label={t('courses.lessonsTotal')}
                value={form.lessonsTotal}
                onChange={(e) => setForm((f) => ({ ...f, lessonsTotal: e.target.value }))}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t('courses.lessonsHint')}</p>
          </div>

          <div className={fields.shows('minutes') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="c-minutes">{fields.label('minutes')}</FieldLabel>
            <Input
              id="c-minutes"
              type="number"
              min={0}
              value={form.minutes}
              onChange={(e) => setForm((f) => ({ ...f, minutes: e.target.value }))}
            />
            {/* ⚠️ ერთეული **წუთია** მთელ პროექტში (§2.5) — ეს ცხადად წერია */}
            <p className="mt-1 text-xs text-muted-foreground">{t('courses.minutesHint')}</p>
          </div>
        </div>

        <div className={fields.shows('thumbnail') ? undefined : 'hidden'}>
          <Label>{fields.label('thumbnail')}</Label>
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
        </div>

        <div className={fields.shows('description') ? undefined : 'hidden'}>
          <FieldLabel htmlFor="c-description">{fields.label('description')}</FieldLabel>
          <Textarea
            id="c-description"
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>

        <div className={fields.shows('tags') ? undefined : 'hidden'}>
          <FieldLabel>{fields.label('tags')}</FieldLabel>
          <TagSelect
            value={form.tags}
            onChange={(v) => setForm((f) => ({ ...f, tags: v }))}
            options={allTags}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            {t('actions.save')}
          </Button>
        </div>
      </form>

      {/* §6 ფაზა 3 — მორგებული ველები საკუთარ თავს ინახავს (ფორმის გარეთ) */}
      {course && <CustomFieldsCard module="course" recordId={course.id} />}
    </ModalShell>
  )
}
