import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useRecordShare } from '@/components/share/RecordShare'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ExternalLink,
  GraduationCap,
  Plus,
  FilterX,
} from 'lucide-react'
import {
  COURSE_STATUSES,
  deleteCourse,
  fetchCourse,
  fetchCourseCategories,
  fetchCourses,
  setCourseStatus,
  toggleCourseFavorite,
  type Course,
  type CourseFilters,
  type CourseStatus,
} from '@/api/courses'
import { storageUrl } from '@/lib/api'
import { useDrillParams } from '@/lib/statsLinks'
import { useFilterDraft } from '@/lib/filters'
import { usePagedList } from '@/lib/paged'
import { usePageSize } from '@/lib/pageSize'
import { errorMessage } from '@/lib/errors'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { CourseDetail } from '@/components/CourseDetail'
import { ListSearch } from '@/components/ListSearch'
import { RecordActionBar } from '@/components/RecordActionBar'
import { EnumStatusMenu } from '@/components/StatusMenu'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import {
  FilterGroup,
  FilterOption,
  FilterOptionList,
  FilterPanel,
  FilterTrigger,
} from '@/components/FilterPanel'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { hostLabel } from '@/lib/platforms'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { RecordList, RecordView } from '@/components/RecordView'
import { ViewToggle } from '@/components/ui/view-toggle'
import { PageSizePick } from '@/components/ui/page-size-pick'
import { useRecordLayout } from '@/lib/recordLayout'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pagination } from '@/components/ui/pagination'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { favoriteAction, MENU_ICONS, type MenuAction } from '@/components/ui/record-menu'

/* ============================================================
   კურსების მოდული (`course`).

   ⚠️ **გარე წყარო არ არსებობს** — ბმულის probe მხოლოდ სათაურსა და
   სურათს ავსებს, „კანდიდატების" არჩევანი აქ არაფერია.

   ⚠️ **სტატუსი enum-ია** (ოთხი მნიშვნელობა), ე.ი. საიდბარის სექციები
   წიგნის/თამაშის რიგშია: „ყველა · რჩეული · დამატება", ხოლო
   სტატუსით ფილტრი პანელშია.
   ============================================================ */
import { CourseForm } from '@/components/CourseForm'

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
  const share = useRecordShare()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  // ხედი მოდულზე ინახება; ნაგულისხმევი — ახლანდელი ხედი
  const [layout, setLayout] = useRecordLayout('course', 'rows')
  const [pageSize, setPageSize, columns] = usePageSize('course', layout)

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

  /* `?open=<id>` — კურსის ფანჯარა (მოტივტივე ჩარჩოს „ფანჯარაში დაბრუნება" აქ მოდის,
     ვიდეოების `?open=`-ის წესით); პარამეტრი მაშინვე იშლება, რომ „უკან" ხელახლა არ გახსნას */
  useEffect(() => {
    const open = Number(params.get('open'))
    if (!open) return
    const next = new URLSearchParams(params)
    next.delete('open')
    setParams(next, { replace: true })
    fetchCourse(open)
      .then(setDetail)
      .catch((e) => toast({ title: errorMessage(e), variant: 'error' }))
  }, [params, setParams, toast])

  const drill = useDrillParams()
  const filters: CourseFilters = {
    q: term || undefined,
    category_id: categories.length ? categories.join(',') : undefined,
    tag: tags.length ? tags.join(',') : undefined,
    status: statuses.length ? statuses.join(',') : undefined,
    favorite: view === 'favorite' ? true : undefined,
    sort: sort === 'newest' ? undefined : sort,
    // სტატისტიკის ზოლიდან მოსული ჭრილი (თვე, წელი, შენი ქულა)
    ...drill,
  }

  // გვერდზე 10: ნომრები + „მეტის ჩვენება"; მიმდინარე გვერდი `?page=`-შია
  const query = usePagedList({
    queryKey: ['courses', filters],
    fetchPage: (page, per_page) => fetchCourses({ ...filters, page, per_page }),
    pageSize,
  })
  const categoriesQ = useQuery({ queryKey: ['course-categories'], queryFn: fetchCourseCategories })

  const courses = query.items
  /** ⚠️ **გაფილტრული სიის** ჯამი და არა ჩატვირთულის — სათაურიც ამას წერს */
  const total = query.total
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
            {/* ბარათები · ბადე · სტრიქონები (მოდულზე ინახება) */}
            <ViewToggle value={layout} onChange={setLayout} />
            {/* „გვერდზე რამდენი“ — ხედის სვეტების ჯერადი, მოდულზე ინახება */}
            <PageSizePick value={pageSize} onChange={setPageSize} columns={columns} />
            <ListSearch value={q} onChange={setQ} placeholder={t('search.inModule.course')} />
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
            <EmptyState kind={activeCount > 0 || term ? 'search' : undefined}
              icon={<GraduationCap className="size-6" />}
              title={activeCount > 0 || term ? t('courses.emptyFiltered') : t('courses.empty')}
              hint={activeCount > 0 || term ? t('courses.emptyFilteredHint') : t('courses.emptyHint')}
              actions={
                activeCount > 0 || term ? (
                  <Button variant="outline" onClick={() => { setQ(''); clear() }}>
                    <FilterX className="size-4" />
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
              <RecordList layout={layout}>
                {courses.map((course) => {
                  const askDelete = async () => {
                    if (
                      await confirm({
                        title: t('courses.delete'),
                        description: t('courses.deleteHint', { name: course.title }),
                        variant: 'destructive',
                      })
                    ) {
                      remove.mutate(course.id)
                    }
                  }
                  const fav = {
                    active: course.is_favorite,
                    pending: favorite.isPending && favorite.variables === course.id,
                    onToggle: () => favorite.mutate(course.id),
                  }
                  /* მარჯვენა ღილაკის მენიუ: გახსნა · ბმული · სტატუსი ▸ · რჩეული · — · რედაქტირება · წაშლა */
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
                    share.action({ domain: 'course', id: course.id, title: course.title }),
                    { key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, separator: true, run: () => setEditing(course) },
                    { key: 'delete', label: t('actions.delete'), icon: MENU_ICONS.delete, danger: true, run: askDelete },
                  ]
                  return (
                    /* ერთი აღწერა სამ განლაგებაში; სტატუსი მხოლოდ ზოლშია */
                    <RecordView
                      key={course.id}
                      title={course.title}
                      onOpen={() => setDetail(course)}
                      openLabel={course.title}
                      photo={course.image ? (storageUrl(course.image) ?? course.image) : null}
                      rowPhotoClassName="size-16"
                      placeholder={<GraduationCap className="size-6" />}
                      titleAside={<VisibilityBadge value={course.visibility} />}
                      meta={[
                        // ჰოსტის ნაცვლად პლატფორმის სახელი („YouTube“), უცნობზე ჰოსტივე
                        hostLabel(course.platform, t),
                        course.category ? dictionaryName(course.category, lang) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      tags={course.tags}
                      actions={actions}
                      onDelete={askDelete}
                      favorite={fav}
                      onEdit={() => setEditing(course)}
                      /* ერთი ზოლი ყველა სიაზე: სტატუსი (ჩამოსაშლელი) · რჩეული · ფაილები ·
                         ბმული (უბმულოზე უხილავი სლოტი) · რედაქტირება · წაშლა — ყველა h-9 */
                      bar={
                        <RecordActionBar
                          status={
                            <EnumStatusMenu
                              domain="course"
                              value={course.status}
                              options={COURSE_STATUSES}
                              label={t('courses.status')}
                              onChange={(next) => status.mutate({ id: course.id, next })}
                            />
                          }
                          favorite={fav}
                          files={{ count: course.files_count ?? 0, onOpen: () => setDetail(course) }}
                          link={{ href: course.url, label: t('actions.link'), icon: ExternalLink, title: course.url ?? undefined }}
                          onEdit={() => setEditing(course)}
                          onDelete={askDelete}
                        />
                      }
                    />
                  )
                })}
              </RecordList>

              <Pagination {...query.pagination} />
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
              (წიგნი/თამაში/სამაგიდო) სექციები არ აქვთ. */}
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

      {/* სია ახლდება რჩეულის/ფაილის შემდეგ, მოდალს ახალი ობიექტი უნდა მიუვიდეს */}
      {detail && <CourseDetail course={courses.find((c) => c.id === detail.id) ?? detail} onClose={() => setDetail(null)} />}

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
