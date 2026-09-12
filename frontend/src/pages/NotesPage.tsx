import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useListLimit } from '@/lib/paged'
import { ShowMore } from '@/components/ui/show-more'
import {
  BellRing,
  CalendarClock,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Search,
  Settings2,
  Star,
  Tags,
  Trash2,
} from 'lucide-react'
import {
  deleteNote,
  fetchNoteCategories,
  fetchNotes,
  toggleNoteFavorite,
  type NoteEntry,
  type NoteFilters,
} from '@/api/notes'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { statusByKey, statusName, statusTone, useStatuses } from '@/lib/statuses'
import { STATUS_BADGE } from '@/lib/statusStyles'
import { NoteChannelsDialog } from '@/components/NoteChannelsDialog'
import { NoteNotificationsDialog } from '@/components/NoteNotificationsDialog'
import { NoteDetail } from '@/components/NoteDetail'
import { NoteForm } from '@/components/NoteForm'
import { ModuleIcon } from '@/components/ModuleIcon'
import {
  FilterGroup,
  FilterOption,
  FilterOptionList,
  FilterPanel,
  FilterTrigger,
} from '@/components/FilterPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   ჩანაწერების მოდული (`note`, Tasks §13).

   იგივე მოდელი, რაც წიგნებსა და ბორდგეიმებზე: **სტატუსი საიდბარის
   სექციაა** (`?view=`), პანელი კი კატეგორიასა და ტეგებს ფილტრავს.
   ============================================================ */

const SORTS = ['newest', 'oldest', 'title', 'due', 'updated'] as const

/* ⚠️ სტატუსების სია აღარ წერია კოდში (§6.4) — ის per-user ლექსიკონია.
   ფერი `statusTone()`-იდან მოდის, ე.ი. ხელით დამატებულიც ფერადია. */

export function NotesPage() {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  // §6.4 — სექციებისა და ბეჯების ერთადერთი წყარო
  const { data: statuses = [] } = useStatuses('note')
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const fmt = useDateFormat()

  const [params, setParams] = useSearchParams()
  const search = params.toString()
  const view = params.get('view') ?? 'all'

  const categories = useMemo(
    () => new URLSearchParams(search).get('category')?.split(',').filter(Boolean) ?? [],
    [search],
  )
  const tags = useMemo(
    () => new URLSearchParams(search).get('tag')?.split(',').filter(Boolean) ?? [],
    [search],
  )
  const overdue = new URLSearchParams(search).get('overdue') === '1'

  const [draft, setDraft] = useState({ categories, tags, overdue })
  const [panelOpen, setPanelOpen] = useState(false)
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [sort, setSort] = useState<(typeof SORTS)[number]>('newest')
  const [editing, setEditing] = useState<NoteEntry | 'new' | null>(null)
  const [opened, setOpened] = useState<NoteEntry | null>(null)
  const [channels, setChannels] = useState(false)
  // §8.2 — შეხსენებების ჟურნალი: ელფოსტის არხის ჩამნაცვლებელი
  const [log, setLog] = useState(false)

  useEffect(() => {
    setDraft({ categories, tags, overdue })
  }, [categories, tags, overdue])

  useEffect(() => {
    const timer = setTimeout(() => setTerm(q.trim()), 350)
    return () => clearTimeout(timer)
  }, [q])

  const filters: NoteFilters = {
    q: term || undefined,
    category_id: categories.length ? categories.join(',') : undefined,
    tag: tags.length ? tags.join(',') : undefined,
    overdue: overdue || undefined,
    favorite: view === 'favorite' ? true : undefined,
    // „რჩეული" და „ყველა" სტატუსს არ ნიშნავს — დანარჩენი სექცია სტატუსია
    // „ყველა"/„რჩეული" სტატუსები არაა; დანარჩენი ლექსიკონის გასაღებია
    status: view !== 'all' && view !== 'favorite' ? view : undefined,
    sort: sort === 'newest' ? undefined : sort,
  }

  const { limit, showMore } = useListLimit(JSON.stringify(filters))
  const query = useQuery({
    queryKey: ['notes', filters, limit],
    queryFn: () => fetchNotes({ ...filters, per_page: limit }),
    // „მეტის ჩვენებაზე" ბადე არ უნდა დაიცალოს და თავიდან აეწყოს
    placeholderData: keepPreviousData,
  })
  const categoriesQ = useQuery({ queryKey: ['note-categories'], queryFn: fetchNoteCategories })
  const notes = useMemo(() => query.data?.items ?? [], [query.data])
  /** ⚠️ **გაფილტრული სიის** ჯამი და არა ჩატვირთულის — სათაურიც ამას წერს */
  const total = query.data?.total ?? 0
  const allCategories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data])

  // საიდბარის „დამატება" → `?new=1`
  useEffect(() => {
    if (params.get('new')) {
      setEditing('new')
      const next = new URLSearchParams(params)
      next.delete('new')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['notes'] })
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const favorite = useMutation({ mutationFn: toggleNoteFavorite, onSuccess: invalidate, onError: fail })
  const remove = useMutation({
    mutationFn: deleteNote,
    onSuccess: () => {
      invalidate()
      // ფაილები ჩანაწერთან ერთად იშლება — კვოტის ინდიკატორიც უნდა განახლდეს
      qc.invalidateQueries({ queryKey: ['storage'] })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
    onError: fail,
  })

  /** ფორმის ტეგების შემოთავაზებები — ყველა სექციიდან დანახული გროვდება */
  const [knownTags, setKnownTags] = useState<string[]>([])
  useEffect(() => {
    if (!notes.length) return
    setKnownTags((prev) => {
      const merged = new Set([...prev, ...notes.flatMap((n) => n.tags)])
      return merged.size === prev.length ? prev : [...merged].sort((a, b) => a.localeCompare(b))
    })
  }, [notes])

  const tagOptions = useMemo(() => {
    const set = new Set([...knownTags, ...notes.flatMap((n) => n.tags), ...tags])
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [knownTags, notes, tags])

  /* ---------- ფილტრის გაშვება ---------- */

  const activeCount = categories.length + tags.length + (overdue ? 1 : 0)
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))
  const dirty =
    !same(draft.categories, categories) || !same(draft.tags, tags) || draft.overdue !== overdue

  /** მიმდინარე სექცია (`?view=`) ინახება — პანელი მას არ ცვლის (Tasks 3) */
  const applyDraft = (next: typeof draft) => {
    const p = new URLSearchParams()
    if (view !== 'all') p.set('view', view)
    if (next.categories.length) p.set('category', next.categories.join(','))
    if (next.tags.length) p.set('tag', next.tags.join(','))
    if (next.overdue) p.set('overdue', '1')
    setPanelOpen(false)
    navigate({ pathname: '/notes', search: p.toString() })
  }

  const toggle = (key: 'categories' | 'tags', value: string, on: boolean) =>
    setDraft((d) => ({
      ...d,
      [key]: on ? [...d[key], value] : d[key].filter((x) => x !== value),
    }))

  const onlyCategory =
    categories.length === 1 ? allCategories.find((x) => String(x.id) === categories[0]) : undefined
  const heading =
    view === 'favorite'
      ? t('filter.favorite')
      : statusByKey(statuses, view)
        ? statusName(statusByKey(statuses, view), lang)
        : onlyCategory
          ? dictionaryName(onlyCategory, lang)
          : t('notes.title')

  const isOverdue = (note: NoteEntry) =>
    // ⚠️ „ვადაგადაცილებული" **როლით** იზომება — სტატუსს სახელი გადაერქმევა
    !!note.due_at && note.status?.role === 'todo' && new Date(note.due_at) < new Date()

  return (
    <PageContainer>
      <PageHeader
        module="note"
        title={heading}
        subtitle={t('notes.count', { count: total })}
        actions={
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="w-56 pl-9"
                    placeholder={t('notes.searchPlaceholder')}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  {query.isFetching && term !== '' && (
                    <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-sm">
                {t('notes.searchHint')}
              </TooltipContent>
            </Tooltip>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`notes.sort.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FilterTrigger activeCount={activeCount} onClick={() => setPanelOpen(true)} />
            {/* §8.2 — ჟურნალი: ყოველი გასროლილი შეხსენება აქ რჩება, ე.ი.
                დახურული აპი აღარ ნიშნავს დაკარგულ შეხსენებას (ეს ხვრელი
                ელფოსტის არხს ჰქონდა დახურული, ის კი ამოღებულია) */}
            <Button variant="outline" size="icon" onClick={() => setLog(true)} title={t('notes.logTitle')}>
              <BellRing className="size-4" />
            </Button>
            {/* §13.3 — არხების პარამეტრები (`module_user.settings`) */}
            <Button variant="outline" size="icon" onClick={() => setChannels(true)} title={t('notes.channelsTitle')}>
              <Settings2 className="size-4" />
            </Button>
            <Link
              to="/dictionaries/note-categories"
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Tags className="size-4" />
              {t('noteCategories.manage')}
            </Link>
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              {t('notes.add')}
            </Button>
          </>
        }
      />

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          {query.isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {/* ⚠️ §2.4 — ცარიელი სექცია **თავს ხსნის**: ადრე ერთი ნაცრისფერი
              წინადადება ეწერა და არ ჩანდა, ფილტრმა ჩამოჭრა თუ მართლა ცარიელია. */}
          {!query.isLoading && !notes.length && (
            <EmptyState
              title={term ? t('notes.noResults', { q: term }) : t('notes.empty')}
              hint={term || activeCount > 0 ? t('empty.filteredHint') : t('empty.addHint')}
              actions={
                <>
                  {activeCount > 0 && (
                    <Button variant="outline" onClick={() => applyDraft({ categories: [], tags: [], overdue: false })}>
                      {t('filter.clear')}
                    </Button>
                  )}
                  <Button onClick={() => setEditing('new')}>
                    <Plus className="size-4" />
                    {t('notes.add')}
                  </Button>
                </>
              }
            />
          )}

          <ul className="space-y-2">
            {notes.map((note) => (
              <li
                key={note.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2"
              >
                <button
                  onClick={() => setOpened(note)}
                  aria-label={t('notes.open')}
                  className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-md bg-muted"
                >
                  <ModuleIcon
                    name={note.category?.icon ?? 'NotebookPen'}
                    className="size-5 text-muted-foreground"
                  />
                </button>

                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => setOpened(note)}
                    className="block max-w-full cursor-pointer truncate text-left text-sm font-medium hover:underline"
                    title={note.title}
                  >
                    {note.title}
                  </button>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 truncate text-xs text-muted-foreground">
                    {note.category && (
                      <span className="inline-flex items-center gap-1">
                        <ModuleIcon name={note.category.icon} className="size-3" />
                        {dictionaryName(note.category, lang)}
                      </span>
                    )}
                    {note.due_at && (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1',
                          isOverdue(note) && 'font-medium text-destructive',
                        )}
                      >
                        <CalendarClock className="size-3" />
                        {fmt.date(note.due_at)}
                      </span>
                    )}
                    {(note.reminders_count ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <BellRing className="size-3" />
                        {note.reminders_count}
                      </span>
                    )}
                    {(note.files_count ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <FileText className="size-3" />
                        {note.files_count}
                      </span>
                    )}
                    {note.links.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <ExternalLink className="size-3" />
                        {note.links.length}
                      </span>
                    )}
                  </p>

                  {note.tags.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {note.tags.slice(0, 6).map((tag) => (
                        <span key={tag} className="rounded-[5px] bg-secondary px-1.5 py-0.5 text-[11px]">
                          {tag}
                        </span>
                      ))}
                    </p>
                  )}
                </div>

                <span className="flex shrink-0 items-center gap-1">
                  <span
                    className={cn(
                      'mr-1 rounded-[5px] px-1.5 py-0.5 text-xs',
                      STATUS_BADGE[statusTone(note.status)] ?? 'bg-secondary',
                    )}
                  >
                    {statusName(note.status, lang)}
                  </span>
                  <button
                    onClick={() => favorite.mutate(note.id)}
                    aria-label={t(note.is_favorite ? 'actions.unfavorite' : 'actions.favorite')}
                    className="grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-gold"
                  >
                    <Star className={cn('size-4', note.is_favorite && 'fill-gold text-gold')} />
                  </button>
                  {note.links[0]?.url && (
                    <a
                      href={note.links[0].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t('books.openLink')}
                      title={note.links[0].label || note.links[0].url}
                      className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setEditing(note)}>
                    <Pencil className="size-3.5" />
                    {t('actions.edit')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={async () => {
                      const ok = await confirm({
                        title: t('notes.deleteTitle'),
                        description: t('notes.deleteHint', { name: note.title }),
                        variant: 'destructive',
                      })
                      if (ok) remove.mutate(note.id)
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>

          <ShowMore shown={notes.length} total={total} onMore={showMore} loading={query.isFetching} />
        </div>

        {/* ---------- ფილტრები ---------- */}
        <FilterPanel
          activeCount={activeCount}
          dirty={dirty}
          onApply={() => applyDraft(draft)}
          onClear={() => applyDraft({ categories: [], tags: [], overdue: false })}
          open={panelOpen}
          onOpenChange={setPanelOpen}
        >
          {/* სტატუსი აქ განზრახ არ არის (Tasks 3) — ის საიდბარის სექციაა */}
          <FilterGroup title={t('notes.dueFilter')} count={draft.overdue ? 1 : 0}>
            <div className="px-1.5 py-1">
              <FilterOption
                label={t('notes.overdueOnly')}
                checked={draft.overdue}
                onChange={(on) => setDraft((d) => ({ ...d, overdue: on }))}
              />
            </div>
          </FilterGroup>

          <FilterGroup title={t('notes.category')} count={draft.categories.length}>
            <FilterOptionList>
              {allCategories.map((category) => (
                <FilterOption
                  key={category.id}
                  label={dictionaryName(category, lang)}
                  count={category.note_entries_count}
                  checked={draft.categories.includes(String(category.id))}
                  onChange={(on) => toggle('categories', String(category.id), on)}
                />
              ))}
            </FilterOptionList>
          </FilterGroup>

          <FilterGroup title={t('notes.tags')} count={draft.tags.length}>
            {tagOptions.length ? (
              <FilterOptionList>
                {tagOptions.map((tag) => (
                  <FilterOption
                    key={tag}
                    label={tag}
                    checked={draft.tags.includes(tag)}
                    onChange={(on) => toggle('tags', tag, on)}
                  />
                ))}
              </FilterOptionList>
            ) : (
              <p className="px-1.5 py-1 text-xs text-muted-foreground">{t('notes.noTags')}</p>
            )}
          </FilterGroup>
        </FilterPanel>
      </div>

      {opened && (
        <NoteDetail
          // სია განახლდება ატვირთვის შემდეგ — მოდალს ახალი ობიექტი უნდა
          note={notes.find((n) => n.id === opened.id) ?? opened}
          onClose={() => setOpened(null)}
        />
      )}

      {editing && (
        <NoteForm
          note={editing === 'new' ? null : editing}
          allTags={knownTags}
          categories={allCategories}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            invalidate()
            qc.invalidateQueries({ queryKey: ['note-categories'] })
            setEditing(null)
            // ახლად შექმნილს მაშინვე ვხსნით — ფაილები და შეხსენებები იქაა
            if (editing === 'new') setOpened(saved)
          }}
        />
      )}

      {channels && <NoteChannelsDialog onClose={() => setChannels(false)} />}
      {log && <NoteNotificationsDialog onClose={() => setLog(false)} />}
    </PageContainer>
  )
}
