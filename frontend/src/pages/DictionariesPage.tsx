import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  SquarePen,
  Plus,
  Trash2,
} from 'lucide-react'
import type { ModuleInfo } from '@/api/account'
import { saveStatusSections, type SectionsLayout } from '@/api/statuses'
import type { Status } from '@/api/types'
import { DICTIONARIES, type DictionaryDef, type DictionaryItem } from '@/lib/dictionaries'
import { errorMessage } from '@/lib/errors'
import { dragRowClass, useDragReorder } from '@/lib/dragReorder'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { moduleName, useModules } from '@/lib/modules'
import { useContentLang } from '@/lib/settings'
import {
  PSEUDO_SECTIONS,
  SECTIONS_SETTING,
  arrangeSections,
  layoutFor,
  placementFromRows,
  toggleHidden,
  type SectionRow,
} from '@/lib/statusSections'
import { ModuleIcon } from '@/components/ModuleIcon'
import { Button } from '@/components/ui/button'
import { DragHandle } from '@/components/ui/drag-handle'
import { EmptyState } from '@/components/ui/empty-state'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   **ლექსიკონები** — `/dictionaries` (ბარათები) და `/dictionaries/:key` (შიგთავსი).

   ⚠️ **ეტაპი 8: ზემოთ ~14 პილულის რიგი ბარათების ინდექსად იქცა.** გადამრჩევი
   ერთ ხაზზე ყველა ლექსიკონს ერთნაირ წონით აჩვენებდა, ე.ი. „ფილმის
   სტატუსები" და „ბორდგეიმის ჟანრები" ერთმანეთისგან არ გაირჩეოდა, და
   გადართვა სწორედ ის იყო, რაც მომხმარებელს „ძაან ცუდი" ჩანდა. ახლა
   ინდექსი შიდა მენიუა (ორ ჯგუფად: სტატუსები · ჟანრები/ტიპები/კატეგორიები),
   ბარათზე შიგნით შედიხ, და „უკან" ინდექსზე აბრუნებს.

   ⚠️ **სტატუსების სიაში „ყველა" და „რჩეული" (ვიდეოზე — „ჩამოწერილებიც")
   რიგებად ჩანს** — ზუსტად ისე, როგორც საიდბარში. ისინი სტატუსები არაა
   (არც რედაქტირდება, არც იშლება), მაგრამ მათი ადგილი და ხილვადობა
   იქვე იმართება: რიგი `lib/statusSections.ts`-იდან იწყობა, რომელსაც
   საიდბარიც ეკითხება.

   ⚠️ **გადამრჩევში მხოლოდ ჩართული მოდულებია** — `useModules().has()` იგივე
   წყაროა, რითაც საიდბარი და მარშრუტები იწყობა.

   ⚠️ **ძველი მისამართები ცოცხალია** (`/book-genres` → `/dictionaries/book-genres`).
   ============================================================ */

export function DictionariesPage() {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { key } = useParams()
  const { has, loading } = useModules()

  /** ⚠️ გამორთული მოდული ინდექსშიც არ ჩანს და მისი ლექსიკონიც არ იხსნება */
  const available = useMemo(() => DICTIONARIES.filter((d) => has(d.module)), [has])

  if (!available.length) {
    return (
      <PageContainer>
        <PageHeader tool="dictionaries" title={t('dictionaries.title')} />
        <p className="text-sm text-muted-foreground">
          {loading ? t('common.loading') : t('dictionaries.noModules')}
        </p>
      </PageContainer>
    )
  }

  if (!key) return <DictionaryIndex available={available} lang={lang} />

  const current = available.find((d) => d.key === key)

  // ⚠️ უცნობი/გამორთული — ინდექსზე, და **არა „პირველ" ლექსიკონზე**: ძველი
  // ქცევა ჩუმად სხვა ლექსიკონს ხსნიდა და მომხმარებელი არ ხვდებოდა, სად აღმოჩნდა
  if (!current) return <Navigate to="/dictionaries" replace />

  return (
    <PageContainer>
      <Link
        to="/dictionaries"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('dictionaries.backToIndex')}
      </Link>

      {/* ⚠️ `key` აიძულებს რეაქტს, სია ნულიდან ააწყოს — თორემ გადართვისას
          გადათრევის მდგომარეობა ძველ id-ებზე დარჩებოდა */}
      <DictionaryList key={current.key} def={current} lang={lang} />
    </PageContainer>
  )
}

/* ---------- ინდექსი: ბარათები ---------- */

function DictionaryIndex({ available, lang }: { available: DictionaryDef[]; lang: string }) {
  const { t } = useTranslation()
  const { all } = useModules()

  /* ⚠️ **იგივე ქეშის გასაღებები**, რაც შიდა გვერდსა და საიდბარს —
     ბარათზე შესვლა მაშინვე ხატავს, და ინდექსი ახალ ქეშს არ ბადებს */
  const results = useQueries({
    queries: available.map((def) => ({ queryKey: def.queryKey, queryFn: def.list })),
  })

  const groups = [
    {
      key: 'statuses',
      title: t('dictionaries.groupStatuses'),
      hint: t('dictionaries.groupStatusesHint'),
      defs: available.filter((d) => d.statusDomain),
    },
    {
      key: 'other',
      title: t('dictionaries.groupOther'),
      hint: t('dictionaries.groupOtherHint'),
      defs: available.filter((d) => !d.statusDomain),
    },
  ].filter((g) => g.defs.length)

  return (
    <PageContainer>
      {/* ⚠️ ორი გასაღები ერთდება იმიტომ, რომ **პირველი წინადადება საიდბარშიც
          წერია** (ეტაპი 9) — ერთი წყარო, თორემ ორი ტექსტი გაშორდებოდა */}
      <PageHeader
        tool="dictionaries"
        title={t('dictionaries.title')}
        hint={<InfoHint info={`${t('dictionaries.navHint')} ${t('dictionaries.indexAction')}`} />}
      />

      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.key}>
            <div className="mb-3">
              <h2 className="font-semibold">{group.title}</h2>
              <p className="text-sm text-muted-foreground">{group.hint}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.defs.map((def) => {
                const q = results[available.indexOf(def)]
                const items = q.data ?? []

                // ⚠️ „დამალული" განლაგებიდან, **ცხრილის რიგებზე გადაკლილი** —
                // წაშლილი სტატუსის ძველი გასაღები რიცხვს არ უნდა ზრდოს
                const hiddenCount = def.statusDomain
                  ? arrangeSections(
                      items as unknown as Status[],
                      PSEUDO_SECTIONS[def.statusDomain],
                      layoutFor(all, def.statusDomain),
                    ).filter((row) => row.hidden).length
                  : 0

                return (
                  <DictionaryCard
                    key={def.key}
                    def={def}
                    module={all.find((m) => m.key === def.module)}
                    items={items}
                    loading={q.isLoading}
                    hiddenCount={hiddenCount}
                    lang={lang}
                  />
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </PageContainer>
  )
}

/** ბარათზე რამდენი ერთეული ჩანს — დანარჩენი „+N" */
const PREVIEW = 5

function DictionaryCard({
  def,
  module,
  items,
  loading,
  hiddenCount,
  lang,
}: {
  def: DictionaryDef
  module: ModuleInfo | undefined
  items: DictionaryItem[]
  loading: boolean
  hiddenCount: number
  lang: string
}) {
  const { t, i18n } = useTranslation()
  // მოდულის ფერი — `PageHeader`-ის იგივე წყარო (`modules.color`), ე.ი. ბარათი და შიდა გვერდი ერთ ტონშია
  const color = module?.color ?? null

  return (
    <Link
      to={`/dictionaries/${def.key}`}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary focus-visible:border-primary focus-visible:outline-none"
    >
      <div className="flex items-center gap-3">
        <span
          className={cn('grid size-10 shrink-0 place-items-center rounded-lg', !color && 'bg-muted')}
          style={color ? { backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)` } : undefined}
        >
          <ModuleIcon name={module?.icon ?? null} className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          {module && (
            <span className="block truncate text-xs text-muted-foreground">
              {moduleName(module, i18n.language)}
            </span>
          )}
          <span className="block truncate font-medium">{t(def.titleKey)}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
      ) : items.length ? (
        <div className="flex flex-wrap gap-1.5">
          {items.slice(0, PREVIEW).map((item) => (
            <span
              key={item.id}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
            >
              <ModuleIcon name={item.icon} className="size-3 shrink-0" />
              <span className="truncate">{dictionaryName(item, lang)}</span>
            </span>
          ))}
          {items.length > PREVIEW && (
            <span className="px-1 py-0.5 text-xs text-muted-foreground">+{items.length - PREVIEW}</span>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t('dictionaries.empty')}</p>
      )}

      <p className="mt-auto text-xs text-muted-foreground">
        {t('dictionaries.entries', { count: items.length })}
        {hiddenCount > 0 && <> · {t('dictionaries.hiddenCount', { count: hiddenCount })}</>}
      </p>
    </Link>
  )
}

/* ---------- ერთი ლექსიკონის სია ---------- */

/** სტატუსის ლექსიკონზე — `SectionRow`; დანარჩენ შვიდზე — უბრალო ერთეული */
type ListRow = SectionRow | { kind: 'item'; id: number; item: DictionaryItem; hidden: false }

function DictionaryList({ def, lang }: { def: DictionaryDef; lang: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { all } = useModules()

  const [editing, setEditing] = useState<DictionaryItem | 'new' | null>(null)
  const [deleting, setDeleting] = useState<DictionaryItem | null>(null)

  const { data: items = [], isLoading } = useQuery({
    queryKey: def.queryKey,
    queryFn: def.list,
  })

  const domain = def.statusDomain
  const layout = domain ? layoutFor(all, domain) : null

  const rows: ListRow[] =
    domain && layout
      ? arrangeSections(items as unknown as Status[], PSEUDO_SECTIONS[domain], layout)
      : items.map((item) => ({ kind: 'item', id: item.id, item, hidden: false }))

  const reorder = useMutation({
    mutationFn: def.reorder,
    // ⚠️ მაშინვე — თორემ ჩამოგდებული რიგი პასუხის მოსვლამდე უკან ხტება
    onMutate: (ids: number[]) => {
      const byId = new Map(items.map((x) => [x.id, x]))
      qc.setQueryData(
        def.queryKey,
        ids.flatMap((id) => byId.get(id) ?? []),
      )
    },
    onSuccess: (next) => qc.setQueryData(def.queryKey, next),
    onError: (e) => {
      qc.invalidateQueries({ queryKey: def.queryKey })
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  /* საიდბარის განლაგება — `modules`-ის ქეშში მაშინვე, რომ საიდბარიც
     იმავე წამს შეიცვალოს (ის `useModules()`-იდან კითხულობს) */
  const sections = useMutation({
    mutationFn: (next: SectionsLayout) => saveStatusSections(domain!, next),
    onMutate: (next) => {
      qc.setQueryData<ModuleInfo[]>(['modules'], (old) =>
        old?.map((m) =>
          m.key === domain ? { ...m, user_settings: { ...m.user_settings, [SECTIONS_SETTING]: next } } : m,
        ),
      )
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['modules'] }),
  })

  /**
   * გადალაგება: drag & drop **და** ისრები — ორივე ერთსა და იმავე ფუნქციას
   * იძახებს (§2.4).
   *
   * ⚠️ **სტატუსის ლექსიკონზე ერთ რიგმა ორ ფაქტს შეიძლება ცვლოს**:
   * სტატუსების ურთიერთ რიგს (`sort_order`) და ფსევდო-განყოფილების ანკერს.
   * ორივე **მხოლოდ მაშინ** იგზავნება, თუ მართლა შეიცვალა — სტატუსი „რჩეულის"
   * მეორე მხარეს რომ გადაიტანო, სტატუსების რიგი შეიძლება უცვლელი დარჩეს.
   */
  const onReorder = (nextIds: (string | number)[]) => {
    if (!domain || !layout) {
      reorder.mutate(nextIds as number[])
      return
    }

    const byId = new Map(rows.map((r) => [r.id, r as SectionRow]))
    const next = nextIds.flatMap((id) => byId.get(id) ?? [])

    const statusIds = next.flatMap((r) => (r.kind === 'status' ? [r.status.id] : []))
    if (statusIds.join() !== items.map((x) => x.id).join()) reorder.mutate(statusIds)

    const placement = placementFromRows(next)
    if (JSON.stringify(placement) !== JSON.stringify(placementFromRows(rows as SectionRow[]))) {
      sections.mutate({ ...layout, placement })
    }
  }

  const drag = useDragReorder<string | number>(
    rows.map((r) => r.id),
    onReorder,
  )

  const busy = reorder.isPending || sections.isPending

  return (
    <>
      <PageHeader
        tool="dictionaries"
        module={def.module}
        title={t(def.titleKey)}
        hint={<InfoHint info={t(domain ? 'dictionaries.subtitleStatuses' : 'dictionaries.subtitle')} />}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(def.recordsRoute)}>
              {t('dictionaries.backToRecords')}
            </Button>
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              {t('dictionaries.add')}
            </Button>
          </>
        }
      />

      {domain && <p className="mb-3 text-sm text-muted-foreground">{t('dictionaries.sectionsHint')}</p>}

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}

      {!isLoading && !items.length && (
        <EmptyState
          title={t('dictionaries.empty')}
          actions={
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              {t('dictionaries.add')}
            </Button>
          }
        />
      )}

      {!isLoading && (
        <ul className={cn('space-y-2', !items.length && 'mt-4')}>
          {rows.map((row, i) => {
            // ⚠️ სტატუსი და ერთეული ერთი ფორმისაა; ფსევდო-განყოფილებას ერთეული არ აქვს
            const item =
              row.kind === 'item' ? row.item : row.kind === 'status' ? (row.status as unknown as DictionaryItem) : null
            const pseudo = row.kind === 'pseudo' ? row.pseudo : null

            return (
              <li
                key={row.id}
                {...drag.handlers(row.id)}
                className={cn(
                  'flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3',
                  dragRowClass(drag, row.id),
                  row.hidden && 'bg-muted/40',
                )}
              >
                <DragHandle />
                <span
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-md',
                    pseudo ? 'border border-dashed border-border' : 'bg-muted',
                    row.hidden && 'opacity-50',
                  )}
                >
                  <ModuleIcon name={pseudo ? pseudo.icon : item?.icon} className="size-4" />
                </span>

                <span className={cn('min-w-0 flex-1', row.hidden && 'opacity-60')}>
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {pseudo ? t(pseudo.labelKey) : item && dictionaryName(item, lang)}
                    </span>
                    {row.hidden && (
                      <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {t('dictionaries.hidden')}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {pseudo
                      ? t('dictionaries.pseudoHint')
                      : item && (
                          <>
                            {lang === 'ka' ? item.name_en : item.name_ka} ·{' '}
                            {t(def.countKey, { count: def.count(item) })}
                          </>
                        )}
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={i === 0 || busy}
                    onClick={() => drag.moveBy(row.id, -1)}
                    aria-label={t('videoTypes.moveUp')}
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={i === rows.length - 1 || busy}
                    onClick={() => drag.moveBy(row.id, 1)}
                    aria-label={t('videoTypes.moveDown')}
                  >
                    <ChevronDown className="size-4" />
                  </Button>

                  {layout && (
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={sections.isPending}
                      onClick={() => sections.mutate(toggleHidden(layout, String(row.id)))}
                      aria-label={t(row.hidden ? 'dictionaries.show' : 'dictionaries.hide')}
                      title={t(row.hidden ? 'dictionaries.show' : 'dictionaries.hide')}
                    >
                      {row.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                  )}

                  {item && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(item)}>
                        <SquarePen className="size-3.5" />
                        {t('actions.edit')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setDeleting(item)}
                        aria-label={t('actions.delete')}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {/* რედაქტირების დიალოგი თითო ლექსიკონს თავისი აქვს — თავის endpoint-ზე წერს */}
      {editing && def.dialog(editing === 'new' ? null : editing, () => setEditing(null))}

      {deleting && (
        <DeleteDictionaryEntry
          def={def}
          item={deleting}
          others={items.filter((x) => x.id !== deleting.id)}
          lang={lang}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  )
}

/* ---------- წაშლა: გადატანა · ცარიელად დატოვება · ჩანაწერების წაშლაც ---------- */

type DeleteMode = 'reassign' | 'empty' | 'delete'

/** `PurgePage`-ის იგივე სიტყვა — შეუქცევადი წაშლის ერთი ჩვევა მთელ აპში */
const CONFIRM_WORD = 'DELETE'

function DeleteDictionaryEntry({
  def,
  item,
  others,
  lang,
  onClose,
}: {
  def: DictionaryDef
  item: DictionaryItem
  others: DictionaryItem[]
  lang: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  // ⚠️ გადასატანი არსად — ნაგულისხმევი „ცარიელი", თორემ მონიშნული იყო გამორთული ვარიანტი
  const [mode, setMode] = useState<DeleteMode>(others.length ? 'reassign' : 'empty')
  const [moveTo, setMoveTo] = useState('')
  const [confirmWord, setConfirmWord] = useState('')

  const count = def.count(item)

  const remove = useMutation({
    mutationFn: () =>
      def.remove(
        item.id,
        mode === 'delete'
          ? { deleteRecords: true }
          : { moveTo: mode === 'reassign' && moveTo ? Number(moveTo) : null },
      ),
    onSuccess: ({ moved, deleted }) => {
      qc.invalidateQueries({ queryKey: def.queryKey })
      qc.invalidateQueries({ queryKey: [def.recordsQueryKey] })

      // ჩანაწერი ფაილებით წაიშალა — მრიცხველები და კვოტაც შეიცვალა
      if (deleted) {
        qc.invalidateQueries({ queryKey: ['dashboard'] })
        qc.invalidateQueries({ queryKey: ['storage'] })
        qc.invalidateQueries({ queryKey: ['me'] })
      }
      // წაშლილი სტატუსი საიდბარის განლაგებიდანაც ამოდის (backend)
      if (def.statusDomain) qc.invalidateQueries({ queryKey: ['modules'] })

      toast({
        title: deleted
          ? t('dictionaries.recordsDeleted', { count: deleted })
          : moved
            ? t('dictionaries.moved', { count: moved })
            : t('dictionaries.deleted'),
        variant: 'success',
      })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /* ⚠️ „გადატანა" მიზნის გარეშე ჩუმად „ცარიელად დატოვებას" ნიშნავდა, „წაშლა"
     კი სიტყვის ჩაწერის გარეშე — ერთი დაჭერით ასობით ჩანაწერს. ორივეზე
     ღილაკი გამორთულია, სანამ პირობა არ შესრულდა. */
  const confirmDisabled =
    remove.isPending ||
    (count > 0 && mode === 'reassign' && (!others.length || !moveTo)) ||
    (count > 0 && mode === 'delete' && confirmWord.trim() !== CONFIRM_WORD)

  return (
    <ModalShell title={t('dictionaries.deleteTitle')} onClose={onClose} destructive>
      {count === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t('dictionaries.deleteSimple', { name: dictionaryName(item, lang) })}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('dictionaries.inUse', { name: dictionaryName(item, lang), count })}
          </p>

          <RadioGroup value={mode} onValueChange={(v) => setMode(v as DeleteMode)} className="gap-3">
            {/* ⚠️ select **არ ჯდება** `<label>`-ში — მასზე დაჭერა radio-ს
                ააქტიურებდა და მენიუ იხურებოდა (`GenresPage`-ის იგივე ხაფანგი) */}
            <div
              className={cn(
                'rounded-lg border p-3 transition-colors',
                mode === 'reassign' ? 'border-primary bg-secondary/50' : 'border-border',
                !others.length && 'pointer-events-none opacity-50',
              )}
            >
              <label className="flex cursor-pointer items-center gap-3">
                <RadioGroupItem value="reassign" disabled={!others.length} />
                <span className="text-sm font-medium">{t('dictionaries.moveTo')}</span>
              </label>
              {mode === 'reassign' && others.length > 0 && (
                <div className="mt-2 pl-8">
                  <Label className="sr-only">{t('dictionaries.moveTo')}</Label>
                  <Select value={moveTo} onValueChange={setMoveTo}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('dictionaries.movePick')} />
                    </SelectTrigger>
                    <SelectContent>
                      {others.map((o) => (
                        <SelectItem key={o.id} value={String(o.id)}>
                          {dictionaryName(o, lang)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <label
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                mode === 'empty' ? 'border-primary bg-secondary/50' : 'border-border hover:bg-muted',
              )}
            >
              <RadioGroupItem value="empty" />
              <span className="text-sm font-medium">{t('dictionaries.moveNone')}</span>
            </label>

            {/* ეტაპი 8 — ჩანაწერებიც. ⚠️ ველი label-ის **გარეთ**აა, იგივე მიზეზით, რაც select */}
            <div
              className={cn(
                'rounded-lg border p-3 transition-colors',
                mode === 'delete' ? 'border-destructive bg-destructive/5' : 'border-border',
              )}
            >
              <label className="flex cursor-pointer items-center gap-3">
                <RadioGroupItem value="delete" />
                <span className="text-sm font-medium text-destructive">
                  {t('dictionaries.deleteRecords', { count })}
                </span>
              </label>
              {mode === 'delete' && (
                <div className="mt-2 space-y-2 pl-8">
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <span>
                      {t('dictionaries.deleteRecordsWarning', { count })}
                      {def.multi && <> {t('dictionaries.deleteRecordsMulti')}</>}
                    </span>
                  </p>
                  <Label htmlFor="dictionary-delete-confirm">
                    {t('dictionaries.confirmLabel', { word: CONFIRM_WORD })}
                  </Label>
                  <Input
                    id="dictionary-delete-confirm"
                    value={confirmWord}
                    onChange={(e) => setConfirmWord(e.target.value)}
                    placeholder={CONFIRM_WORD}
                    autoComplete="off"
                  />
                </div>
              )}
            </div>
          </RadioGroup>
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button variant="destructive" disabled={confirmDisabled} onClick={() => remove.mutate()}>
          <Trash2 className="size-4" />
          {t('actions.delete')}
        </Button>
      </div>
    </ModalShell>
  )
}
