import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Drama, Globe, Plus, RefreshCw, Search, Tags, Trash2, UserMinus } from 'lucide-react'
import {
  ACTOR_RECORD_STEPS,
  ACTOR_SORTS,
  ACTORS_KEY,
  detachActorEverywhere,
  fetchActors,
  trashActor,
  type ActorCard,
  type ActorListItem,
  type ActorFilters,
  type ActorSort,
} from '@/api/actors'
import { resyncActor } from '@/api/media'
import { relockRecord } from '@/api/locks'
import { actorLockBase, lockMenuActions } from '@/lib/locks'
import { RecordLockDialog } from '@/components/locks/RecordLock'
import { actorName, deptKey } from '@/lib/actors'
import { errorMessage } from '@/lib/errors'
import { useFilterDraft } from '@/lib/filters'
import { useContentLang } from '@/lib/settings'
import { ActorFormDialog } from '@/components/actors/ActorFormDialog'
import { ActorTagsDialog } from '@/components/actors/ActorTagsDialog'
import { ActorTile } from '@/components/actors/ActorTile'
import { FilterGroup, FilterOption, FilterOptionList, FilterPanel, FilterTrigger } from '@/components/FilterPanel'
import { WebImageDialog } from '@/components/WebImageDialog'
import { Button } from '@/components/ui/button'
import { CutTabs } from '@/components/ui/cut-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Pagination } from '@/components/ui/pagination'
import { LIST_PAGE_SIZE, usePagedList } from '@/lib/paged'
import { MENU_ICONS, type MenuAction } from '@/components/ui/record-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/* ============================================================
   **მსახიობების გვერდი `/actors`.**

   ყველა „ჩემი" მსახიობი — ვინც ჩემს ფილმზე, სერიალზე ან ანიმეზეა და ვისაც
   ჩემი ფოტო აქვს. ⚠️ ავზი ათასობითაა, ამიტომ ფილტრი, დახარისხება და გვერდები
   სერვერზეა (`GET /actors`); გვერდზე 10 — ნომრები + „მეტის ჩვენება", გვერდი `?page=`-შია.

   ⚠️ სქესი ჭრილებია მთვლელით („ყველა · ქალები · კაცები"), დანარჩენი ფილტრი —
   პანელში (მისამართში ინახება, ბრაუზერის „უკან" მუშაობს). `/gallery/actors`
   რჩება გალერეის ჭრილად — იქ მხოლოდ ფოტოიანები არიან.
   ============================================================ */

interface PanelFilters {
  known_for: string
  tag: string
  photos: string
  records: string
  synced: string
  /** `1` = მხოლოდ ჩემ მიერ ჩაკეტილები (დამალული — ბოქლომიანი ბარათით) */
  locked: string
}

const EMPTY_FILTERS: PanelFilters = { known_for: '', tag: '', photos: '', records: '', synced: '', locked: '' }
const PANEL_KEYS = Object.keys(EMPTY_FILTERS) as (keyof PanelFilters)[]

export function ActorsPage() {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const search = params.toString()

  const gender = params.get('gender') ?? 'all'
  const applied = useMemo<PanelFilters>(() => {
    const p = new URLSearchParams(search)
    return Object.fromEntries(PANEL_KEYS.map((key) => [key, p.get(key) ?? ''])) as unknown as PanelFilters
  }, [search])

  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [sort, setSort] = useState<ActorSort>('name')
  const [panelOpen, setPanelOpen] = useState(false)
  const [tagging, setTagging] = useState<ActorCard | null>(null)
  const [webFor, setWebFor] = useState<ActorCard | null>(null)
  // ჩაკეტვა / პაროლი მარჯვენა ღილაკიდან
  const [locking, setLocking] = useState<ActorCard | null>(null)
  // ახალი მსახიობი (TMDB-დან ან ხელით)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setTerm(q.trim()), 350)
    return () => clearTimeout(timer)
  }, [q])

  const filters: ActorFilters = {
    q: term || undefined,
    gender: gender === 'female' || gender === 'male' ? gender : undefined,
    known_for: applied.known_for || undefined,
    tag: applied.tag || undefined,
    photos: applied.photos === 'with' || applied.photos === 'without' ? applied.photos : undefined,
    records_min: applied.records ? Number(applied.records) : undefined,
    synced: applied.synced === 'yes' || applied.synced === 'no' ? applied.synced : undefined,
    locked: applied.locked === '1' ? true : undefined,
    sort,
    locale: lang === 'ka' ? 'ka' : 'en',
  }
  // ფილტრის/დახარისხების ცვლილება პირველ გვერდზე აბრუნებს (`usePagedList`)
  const query = usePagedList({
    queryKey: [ACTORS_KEY, filters],
    fetchPage: (page) =>
      fetchActors({ ...filters, page, per_page: LIST_PAGE_SIZE }).then((list) => ({ ...list, lastPage: list.last_page })),
  })

  const items = query.items
  const total = query.total
  const facets = query.first?.facets.gender
  const options = query.first?.options

  /** მისამართი = მოქმედი ფილტრი; სქესი ჭრილია და ცალკე ინახება */
  const write = (next: PanelFilters, nextGender = gender) => {
    const p = new URLSearchParams()
    if (nextGender !== 'all') p.set('gender', nextGender)
    PANEL_KEYS.forEach((key) => next[key] && p.set(key, next[key]))
    setPanelOpen(false)
    navigate({ pathname: '/actors', search: p.toString() })
  }

  const { draft, setDraft, dirty, apply, clear, activeCount } = useFilterDraft(applied, EMPTY_FILTERS, write)
  /** ერთი არჩევანი ჯგუფში — მეორედ დაჭერა ხსნის */
  const pick = (key: keyof PanelFilters, value: string, on: boolean) => setDraft((d) => ({ ...d, [key]: on ? value : '' }))

  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const resync = useMutation({
    mutationFn: (actor: ActorCard) => resyncActor(actor.id),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [ACTORS_KEY] })
      toast({ title: t(result.updated ? 'actors.synced' : 'actors.syncUnchanged'), variant: 'success' })
    },
    onError: fail,
  })

  const detach = useMutation({
    mutationFn: (actor: ActorCard) => detachActorEverywhere(actor.id),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [ACTORS_KEY] })
      toast({
        title: t('actors.removed', { count: result.removed }),
        description: result.skipped ? t('actors.removedSkipped', { count: result.skipped }) : undefined,
        variant: 'success',
      })
    },
    onError: fail,
  })

  /* ხელით შექმნილი ურნაში: ბმულებთან და ფოტოებთან ერთად */
  const trash = useMutation({
    mutationFn: (actor: ActorCard) => trashActor(actor.id),
    onSuccess: (_, actor) => {
      ;[ACTORS_KEY, 'trash', 'gallery'].forEach((key) => qc.invalidateQueries({ queryKey: [key] }))
      toast({ title: t('actors.deleted', { name: actorName(actor, lang).title }), variant: 'success' })
    },
    onError: fail,
  })

  const relock = useMutation({
    mutationFn: (actor: ActorCard) => relockRecord(actorLockBase(actor.id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ACTORS_KEY] })
      toast({ title: t('lock.relocked'), variant: 'success' })
    },
    onError: fail,
  })

  /* მარჯვენა ღილაკის მენიუ: გახსნა · ტეგები · ფოტოები ვებიდან · სინქრონი · ჩაკეტვა · — · წაშლა ჩემი ჩანაწერებიდან.
     ⚠️ დამალულს მენიუ არ აქვს — მისი ბარათი თვითონ გახსნის ფანჯარაა. */
  const actionsFor = (item: ActorListItem): MenuAction[] => {
    if (item.hidden) return []
    const actor = item
    const name = actorName(actor, lang).title

    return [
      { key: 'open', label: t('actions.open'), icon: MENU_ICONS.open, run: () => navigate(`/actors/${actor.id}`) },
      { key: 'tags', label: t('actors.menuTags'), icon: Tags, run: () => setTagging(actor) },
      { key: 'web', label: t('actors.menuWebPhotos'), icon: Globe, run: () => setWebFor(actor) },
      ...(actor.has_tmdb
        ? [{ key: 'sync', label: t('actors.menuSync'), icon: RefreshCw, disabled: resync.isPending, run: () => resync.mutate(actor) }]
        : []),
      ...lockMenuActions(!!actor.locked, { relock: () => relock.mutate(actor), manage: () => setLocking(actor) }, t),
      ...(actor.records > 0
        ? [
            {
              key: 'detach',
              label: t('actors.menuRemove'),
              icon: UserMinus,
              danger: true,
              separator: true,
              run: async () => {
                const ok = await confirm({
                  title: t('actors.removeTitle'),
                  description: t('actors.removeDesc', { name, count: actor.records }),
                  variant: 'destructive',
                })
                if (ok) detach.mutate(actor)
              },
            },
          ]
        : []),
      /* მხოლოდ ჩემი ხელით შექმნილი: მსახიობი თვითონ მიდის ურნაში */
      ...(actor.editable
        ? [
            {
              key: 'trash',
              label: t('actors.menuDelete'),
              icon: Trash2,
              danger: true,
              separator: actor.records === 0,
              run: async () => {
                const ok = await confirm({
                  title: t('actors.deleteTitle'),
                  description: t('actors.deleteDesc', { name, links: actor.records, photos: actor.photos }),
                  confirmText: t('confirm.delete'),
                  variant: 'destructive',
                })
                if (ok) trash.mutate(actor)
              },
            },
          ]
        : []),
    ]
  }

  const filtered = activeCount > 0 || !!term || gender !== 'all'

  return (
    <PageContainer>
      <PageHeader
        tool="actors"
        title={t('actors.title')}
        subtitle={t('actors.count', { count: total })}
        actions={
          <>
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('actors.searchPlaceholder')}
                className="w-full pl-9 sm:w-56"
              />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as ActorSort)}>
              <SelectTrigger className="w-44" aria-label={t('sort.label')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTOR_SORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`actors.sort.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FilterTrigger activeCount={activeCount} onClick={() => setPanelOpen(true)} />
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              {t('actors.form.add')}
            </Button>
          </>
        }
      />

      <div className="mb-5">
        <CutTabs
          layout="inline"
          value={gender}
          onChange={(key) => write(applied, key)}
          options={[
            { key: 'all', label: t('actors.gender.all'), count: facets?.all },
            { key: 'female', label: t('actors.gender.female'), count: facets?.female },
            { key: 'male', label: t('actors.gender.male'), count: facets?.male },
          ]}
        />
      </div>

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">{t('api.loading')}</p>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Drama className="size-6" />}
              title={filtered ? t('actors.emptyFiltered') : t('actors.empty')}
              hint={filtered ? t('empty.filteredHint') : t('actors.emptyHint')}
              actions={
                filtered ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQ('')
                      write(EMPTY_FILTERS, 'all')
                    }}
                  >
                    {t('filter.clear')}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" data-testid="actors-grid">
                {items.map((actor) => (
                  <ActorTile key={actor.id} actor={actor} actions={actionsFor(actor)} />
                ))}
              </div>
              <Pagination {...query.pagination} className="mt-8" />
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
          {!!options?.known_for.length && (
            <FilterGroup title={t('actors.filter.knownFor')} count={draft.known_for ? 1 : 0}>
              <FilterOptionList>
                {options.known_for.map((value) => (
                  <FilterOption
                    key={value}
                    label={t(`actors.dept.${deptKey(value)}`, { defaultValue: value })}
                    checked={draft.known_for === value}
                    onChange={(on) => pick('known_for', value, on)}
                  />
                ))}
              </FilterOptionList>
            </FilterGroup>
          )}

          {!!options?.tags.length && (
            <FilterGroup title={t('actors.filter.tag')} count={draft.tag ? 1 : 0}>
              <FilterOptionList>
                {options.tags.map((tag) => (
                  <FilterOption key={tag} label={tag} checked={draft.tag === tag} onChange={(on) => pick('tag', tag, on)} />
                ))}
              </FilterOptionList>
            </FilterGroup>
          )}

          <FilterGroup title={t('actors.filter.records')} count={draft.records ? 1 : 0}>
            {ACTOR_RECORD_STEPS.map((step) => (
              <FilterOption
                key={step}
                label={t('actors.filter.recordsMin', { count: step })}
                checked={draft.records === String(step)}
                onChange={(on) => pick('records', String(step), on)}
              />
            ))}
          </FilterGroup>

          <FilterGroup title={t('actors.filter.photos')} count={draft.photos ? 1 : 0}>
            {(['with', 'without'] as const).map((value) => (
              <FilterOption
                key={value}
                label={t(`actors.filter.photos_${value}`)}
                checked={draft.photos === value}
                onChange={(on) => pick('photos', value, on)}
              />
            ))}
          </FilterGroup>

          <FilterGroup title={t('actors.filter.synced')} count={draft.synced ? 1 : 0}>
            {(['yes', 'no'] as const).map((value) => (
              <FilterOption
                key={value}
                label={t(`actors.filter.synced_${value}`)}
                checked={draft.synced === value}
                onChange={(on) => pick('synced', value, on)}
              />
            ))}
          </FilterGroup>

          {/* ჩაკეტილი მსახიობი მხოლოდ აქ ჩანს */}
          <FilterGroup title={t('actors.filter.lock')} count={draft.locked ? 1 : 0}>
            <FilterOption label={t('actors.filter.lockedOnly')} checked={draft.locked === '1'} onChange={(on) => pick('locked', '1', on)} />
          </FilterGroup>
        </FilterPanel>
      </div>

      {locking && (
        <RecordLockDialog
          base={actorLockBase(locking.id)}
          record={{
            id: locking.id,
            name: actorName(locking, lang).title,
            locked: !!locking.locked,
            unlocked: locking.unlocked ?? true,
            lock_hint: locking.lock_hint ?? null,
            unlock_blocked_until: locking.unlock_blocked_until ?? null,
          }}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: [ACTORS_KEY] })
            qc.invalidateQueries({ queryKey: ['actor', String(locking.id)] })
          }}
          hint={t('lock.hintActor')}
          onClose={() => setLocking(null)}
        />
      )}

      {tagging && (
        <ActorTagsDialog
          actorId={tagging.id}
          name={actorName(tagging, lang).title}
          tags={tagging.tags}
          options={options?.tags ?? []}
          onClose={() => setTagging(null)}
        />
      )}

      {creating && (
        <ActorFormDialog
          onClose={() => setCreating(false)}
          onSaved={({ actor }) => {
            setCreating(false)
            navigate(`/actors/${actor.id}`)
          }}
        />
      )}

      {webFor && (
        <WebImageDialog
          target="cast_member"
          id={webFor.id}
          initialQuery={[webFor.name, ...webFor.tags].join(' ').trim()}
          title={t('web.searchPhotosFor', { name: actorName(webFor, lang).title })}
          context={{ base: webFor.name, attachesTo: actorName(webFor, lang).title }}
          onClose={() => setWebFor(null)}
          onImported={() => {
            qc.invalidateQueries({ queryKey: [ACTORS_KEY] })
            qc.invalidateQueries({ queryKey: ['gallery', 'cast', webFor.id] })
          }}
        />
      )}
    </PageContainer>
  )
}
