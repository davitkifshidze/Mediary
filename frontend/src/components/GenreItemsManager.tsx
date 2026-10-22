import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowRightLeft, Plus, Replace, Search, Unlink, type LucideIcon } from 'lucide-react'
import {
  GENRE_ITEM_BUCKET,
  fetchGenreItems,
  mediaApi,
  updateGenreItems,
  type GenreItemsInput,
} from '@/api/media'
import type { Genre, MovieListItem } from '@/api/types'
import type { MediaType } from '@/lib/media'
import { genreName, movieTitle } from '@/lib/display'
import { moduleName, useModules } from '@/lib/modules'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { CutTabs } from '@/components/ui/cut-tabs'
import { InfoHint } from '@/components/ui/info-hint'
import { Label } from '@/components/ui/label'
import { ModalFooter } from '@/components/ui/modal-shell'
import { ScopeCard } from '@/components/ui/scope-card'
import { GenreSingleSelect } from '@/components/GenreSelect'
import { ModuleIcon } from '@/components/ModuleIcon'
import { MovieMultiSelect } from '@/components/MovieMultiSelect'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { useContentLang } from '@/lib/settings'

/* ============================================================
   ჟანრზე მიბმული ჩანაწერების მართვა — ჟანრი გაზიარებულია
   მედია-დომენებს შორის, ამიტომ დომენი ბარათით ირჩევა.

   მოდალის შიგნით სექციებად დაიყო; „ჩანაწერები" და „ქმედებები"
   **ერთ სექციად გაერთიანდა** — მონიშვნა და მასზე შესასრულებელი ქმედება ერთ
   ეკრანზეა (ადრე ერთ ტაბზე ნიშნავდი, ქმედებას მეორეზე ეძებდი).
   კომპონენტი ყოველთვის დამონტაჟებულია — მონიშვნა და დომენი სექციებს შორის
   გადართვისას არ იკარგება.

   ⚠️ **ბარათ-ჩანართები.** დომენის გადამრთველი ხელით
   აწყობილი ორი პილულა იყო — ახლა `CutTabs`-ია მოდულის ფერით, ხატულით და
   რიცხვით, და ანიმეც ჩანს (ჟანრი სამივეს ეკუთვნის, სერვერი სამივეს
   იცნობს — `MediaDomain`; აქ მხოლოდ ორი იყო ჩამოწერილი). სამი მოქმედება
   (ჩახსნა · გადატანა · ჩანაცვლება) **სამი თანაბარი ბარათია**: აიქონი +
   სათაური, ახსნა `i`-ში; არჩევა — ბარათით, შესრულება — ერთი „გამოყენება
   (N)" ქვედა ზოლში. ადრე ყოველ მოქმედებას თავისი ღილაკი ჰქონდა ახსნის
   გვერდით და ტექსტი ღილაკს ვერ უსწორდებოდა.

   ⚠️ **„ჩანაწერების" სია საძიებო და შემოფარგლულია** („238 ფილმი… ამხელა
   სიაა — სქროლიანი და სერჩიანი მონაკვეთი"): ძებნა სათაურსა და წელში
   (მონაცემი უკვე აქაა), `max-h-96` სქროლი, 50 სტრიქონი და „კიდევ N";
   „ყველას მონიშვნა" სქროლის თავში წებოვანია და **ნაპოვნზე** მოქმედებს.

   ⚠️ **ქვედა ზოლი აქ იხატება და არა `GenresPage`-ში**: მონიშვნა და არჩეული
   მოქმედება ამ კომპონენტის მდგომარეობაა. ამიტომ ფანჯარა თავის „შენახვას"
   მხოლოდ სახელების ჩანართზე ხატავს.
   ============================================================ */

/** რამდენი სტრიქონი ჩანს ერთბაშად — დანარჩენი „კიდევ N"-ით */
const VISIBLE = 50

/** რომელი სექცია ჩანს; `names` — სახელების ჩანართია, აქ არაფერი იხატება */
export type GenreSection = 'names' | 'records' | 'add'

type ItemAction = 'detach' | 'move' | 'replace'

/** მოქმედების სახე — ხატულა, ტონი (წითელი — ის, რაც ჟანრს ართმევს), სათაური და `i`-ს ახსნა */
const ACTIONS: { key: ItemAction; icon: LucideIcon; color: string; label: string; hint: string }[] = [
  { key: 'detach', icon: Unlink, color: 'var(--destructive)', label: 'genres.actDetach', hint: 'genres.actHintDetach' },
  { key: 'move', icon: ArrowRightLeft, color: 'var(--icon-info)', label: 'genres.actMove', hint: 'genres.actHintMove' },
  { key: 'replace', icon: Replace, color: 'var(--icon-warn)', label: 'genres.actReplace', hint: 'genres.actHintReplace' },
]

/** ბიბლიოთეკის სია ჟანრში დასამატებლად (მხოლოდ ისინი, რაც ჟანრზე არ არის) */
function useAttachPool(type: MediaType, attached: MovieListItem[]) {
  const q = useQuery({
    queryKey: ['genre-attach-pool', type],
    // ⚠️ `all` — ჟანრის მიბმა მთელ ბიბლიოთეკაზე ითვლება
    queryFn: () => mediaApi(type).list({ all: true }).then((p) => p.items),
  })
  const attachedIds = useMemo(() => new Set(attached.map((m) => m.id)), [attached])

  return {
    isLoading: q.isLoading,
    pool: useMemo(() => (q.data ?? []).filter((m) => !attachedIds.has(m.id)), [q.data, attachedIds]),
  }
}

export function GenreItemsManager({
  genre,
  allGenres,
  section,
}: {
  genre: Genre
  allGenres: Genre[]
  section: GenreSection
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { mediaModules } = useModules()

  const [type, setType] = useState<MediaType>('movie')
  const [selected, setSelected] = useState<number[]>([])
  const [action, setAction] = useState<ItemAction | null>(null)
  const [target, setTarget] = useState('')
  const [addIds, setAddIds] = useState<number[]>([])
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(VISIBLE)

  const itemsQ = useQuery({ queryKey: ['genre-items', genre.id], queryFn: () => fetchGenreItems(genre.id) })
  const items = useMemo(
    () => (itemsQ.data?.[GENRE_ITEM_BUCKET[type]] as MovieListItem[] | undefined) ?? [],
    [itemsQ.data, type],
  )
  const { pool, isLoading: poolLoading } = useAttachPool(type, items)
  const others = allGenres.filter((g) => g.id !== genre.id)
  const targetGenre = others.find((g) => String(g.id) === target)
  const countOf = (d: MediaType) => (itemsQ.data?.[`${GENRE_ITEM_BUCKET[d]}_count`] as number | undefined) ?? 0

  const switchType = (v: MediaType) => {
    setType(v)
    setSelected([])
    setAddIds([])
    setSearch('')
    setLimit(VISIBLE)
  }

  /* ნაპოვნი — სათაური (ორივე ენაზე) ან წელი */
  const found = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return items
    return items.filter((m) =>
      [m.title_ka, m.title_en, movieTitle(m, lang), m.year != null ? String(m.year) : null]
        .some((text) => !!text && text.toLowerCase().includes(needle)),
    )
  }, [items, search, lang])
  const shown = found.slice(0, limit)

  const mut = useMutation({
    mutationFn: (input: GenreItemsInput) => updateGenreItems(genre.id, input),
    onSuccess: ({ affected }) => {
      // ჟანრების მთვლელები, ჟანრის ჩანაწერები, ბიბლიოთეკები და დეტალური გვერდები
      ;['genres', 'genre-items', 'genre-attach-pool', 'movie', 'series', 'anime'].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      )
      toast({ title: t('genres.itemsDone', { count: affected }), variant: 'success' })
      setSelected([])
      setAddIds([])
    },
    onError: () => toast({ title: t('toast.error'), variant: 'error' }),
  })

  const toggle = (id: number) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  /* „ყველას მონიშვნა" **ნაპოვნზე** მოქმედებს: ძებნით შევიწროებული სიის
     მონიშვნა/მოხსნა სხვა (ახლა უხილავ) მონიშვნას არ ეხება */
  const foundIds = found.map((m) => m.id)
  const allSelected = foundIds.length > 0 && foundIds.every((id) => selected.includes(id))
  const toggleAll = () =>
    setSelected((cur) =>
      allSelected ? cur.filter((id) => !foundIds.includes(id)) : [...new Set([...cur, ...foundIds])],
    )

  const needsTarget = action === 'move' || action === 'replace'
  const busy = mut.isPending
  /** რატომ არ ეშვება „გამოყენება" — ქვედა ზოლი ამას ცხადად ამბობს */
  const blocker =
    selected.length === 0
      ? t('genres.actNeedSelection')
      : !action
        ? t('genres.actNeedAction')
        : needsTarget && !targetGenre
          ? t('genres.actNeedTarget')
          : null

  const apply = async () => {
    if (blocker || busy || !action) return
    if (action === 'detach') {
      const ok = await confirm({
        title: t('genres.detachConfirm'),
        description: t('genres.detachConfirmDesc', { count: selected.length }),
        confirmText: t('genres.actDetach'),
        cancelText: t('confirm.cancel'),
      })
      if (ok) mut.mutate({ type, action: 'detach', ids: selected })
      return
    }
    if (!targetGenre) return
    if (action === 'move') {
      mut.mutate({ type, action: 'move', ids: selected, target_genre_id: targetGenre.id })
      return
    }
    const ok = await confirm({
      title: t('genres.replaceConfirm'),
      description: t('genres.replaceConfirmDesc', {
        count: selected.length,
        name: genreName(targetGenre, lang),
      }),
      confirmText: t('genres.actReplace'),
      cancelText: t('confirm.cancel'),
    })
    if (ok) mut.mutate({ type, action: 'replace', ids: selected, target_genre_id: targetGenre.id })
  }

  // სახელების ჩანართზე არაფერი გვაქვს საჩვენებელი, მაგრამ კომპონენტი დამონტაჟებული რჩება
  // (მონიშვნა/დომენი არ იკარგება ჩანართებს შორის გადართვისას)
  if (section === 'names') return null

  const ApplyIcon = ACTIONS.find((a) => a.key === action)?.icon ?? null

  return (
    <>
      <div className="mt-4 space-y-4">
        {/* დომენი ბარათით, მოდულის ფერით და ჟანრზე მიბმულების რიცხვით */}
        <CutTabs
          label={t('genres.items')}
          layout="inline"
          size="sm"
          value={type}
          onChange={(key) => switchType(key as MediaType)}
          options={mediaModules.map((m) => ({
            key: m.type,
            label: moduleName(m, i18n.language),
            count: countOf(m.type),
            color: m.color,
            node: <ModuleIcon name={m.icon} className="size-4 text-[var(--mod)]" />,
          }))}
        />

        {/* ---------- ჩანაწერები: სია მონიშვნით + მოქმედებები იმავე ეკრანზე ---------- */}
        {section === 'records' &&
          (itemsQ.isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t('genres.itemsLoading')}</div>
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
              {t('genres.itemsEmpty')}
            </div>
          ) : (
            <>
              <div data-testid="genre-records">
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      setLimit(VISIBLE)
                    }}
                    placeholder={t('genres.itemsSearch')}
                    aria-label={t('genres.itemsSearch')}
                    className="pl-8"
                    data-testid="genre-records-search"
                  />
                </div>

                {/* სქროლი შემოფარგლულია; „ყველას მონიშვნა" მის თავში წებოვანია */}
                <div className="fb-scroll max-h-96 overflow-y-auto rounded-md border border-border" data-testid="genre-records-list">
                  <label className="sticky top-0 z-10 flex cursor-pointer items-center gap-2.5 border-b border-border bg-background px-2 py-2 text-sm font-medium">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    {t('genres.selectAll')}
                    <span className="text-muted-foreground">({found.length})</span>
                    <span className="ml-auto text-xs font-normal text-muted-foreground" data-testid="genre-records-state">
                      {t('genres.itemsFound', { selected: selected.length, found: found.length })}
                    </span>
                  </label>
                  {found.length === 0 ? (
                    <p className="px-2 py-4 text-center text-sm text-muted-foreground">{t('genres.itemsNoMatch')}</p>
                  ) : (
                    shown.map((m) => (
                      <label
                        key={m.id}
                        className="flex cursor-pointer items-center gap-2.5 px-2 py-1.5 text-sm hover:bg-muted/50"
                      >
                        <Checkbox checked={selected.includes(m.id)} onCheckedChange={() => toggle(m.id)} />
                        <span className="min-w-0 flex-1 truncate">{movieTitle(m, lang)}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{m.year ?? '—'}</span>
                      </label>
                    ))
                  )}
                  {found.length > shown.length && (
                    <div className="p-2">
                      <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setLimit((n) => n + VISIBLE)}>
                        {t('purge.itemsMore', { count: found.length - shown.length })}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* სამი თანაბარი ბარათი; ახსნა `i`-ში, შესრულება — ქვედა ზოლიდან */}
              <div className="border-t border-border pt-4">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('genres.actPick')}</p>
                <div className="grid gap-2 sm:grid-cols-3" data-testid="genre-actions">
                  {ACTIONS.map(({ key, icon: Icon, color, label, hint }) => (
                    <ScopeCard
                      key={key}
                      active={action === key}
                      color={color}
                      icon={<Icon className="size-4 text-[var(--mod)]" />}
                      label={t(label)}
                      info={t(hint)}
                      onClick={() => setAction(key)}
                    />
                  ))}
                </div>

                {needsTarget && (
                  <div className="mt-3">
                    <Label className="mb-1.5 flex items-center gap-1.5">{t('genres.actTarget')}</Label>
                    <GenreSingleSelect
                      genres={others}
                      value={target}
                      onChange={setTarget}
                      placeholder={t('genres.optReassignPick')}
                    />
                  </div>
                )}
              </div>
            </>
          ))}

        {/* ---------- დამატება: ჟანრზე არმიბმულები ---------- */}
        {section === 'add' && (
          <MovieMultiSelect
            movies={pool}
            value={addIds}
            onChange={setAddIds}
            placeholder={poolLoading ? t('api.loading') : t('genres.addItems')}
          />
        )}
      </div>

      {/* ⚠️ ერთი ქვედა ზოლი თითო ჩანართზე: მარცხნივ — რას შეეხება და რა აკლია, მარჯვნივ — ერთი ღილაკი */}
      {section === 'records' && items.length > 0 && (
        <ModalFooter className="justify-between">
          <span className="text-sm" data-testid="genre-apply-state">
            {t('genres.selectedCount', { count: selected.length })}
            {blocker && <span className="ml-2 text-xs text-muted-foreground">{blocker}</span>}
          </span>
          <Button
            variant={action === 'move' ? 'default' : 'destructive'}
            onClick={() => void apply()}
            disabled={!!blocker || busy}
          >
            {ApplyIcon && <ApplyIcon className="size-4" />}
            {t('genres.actApply', { count: selected.length })}
          </Button>
        </ModalFooter>
      )}
      {section === 'add' && (
        <ModalFooter>
          <Button
            onClick={() => mut.mutate({ type, action: 'attach', ids: addIds })}
            disabled={addIds.length === 0 || busy}
          >
            <Plus className="size-4" />
            {t('genres.addItemsN', { count: addIds.length })}
          </Button>
        </ModalFooter>
      )}
    </>
  )
}

/* ============================================================
   ახალი ჟანრის შექმნისას ჩანაწერების წინასწარი მონიშვნა.
   ჟანრი ჯერ არ არსებობს, ამიტომ მხოლოდ id-ებს ვაგროვებთ; მიბმა
   შექმნის შემდეგ ხდება (იხ. GenresPage). დომენები მოდულებიდან მოდის
   (ანიმეც).
   ============================================================ */
export function GenreItemsPicker({
  value,
  onChange,
}: {
  value: Record<MediaType, number[]>
  onChange: (v: Record<MediaType, number[]>) => void
}) {
  const { t, i18n } = useTranslation()
  const { mediaModules } = useModules()

  return (
    <div className="mt-5 border-t border-border pt-4">
      <Label className="mb-3 flex items-center gap-1.5">
        {t('genres.addItems')}
        <InfoHint info={t('genres.newItemsHint')} />
      </Label>
      {mediaModules.map((m) => (
        <DomainPicker
          key={m.type}
          type={m.type}
          label={moduleName(m, i18n.language)}
          value={value[m.type]}
          onChange={(ids) => onChange({ ...value, [m.type]: ids })}
        />
      ))}
    </div>
  )
}

function DomainPicker({
  type,
  label,
  value,
  onChange,
}: {
  type: MediaType
  label: string
  value: number[]
  onChange: (ids: number[]) => void
}) {
  const { t } = useTranslation()
  // ⚠️ `all` — მისამაგრებელი ავზი მთელი ბიბლიოთეკაა
  const q = useQuery({
    queryKey: ['genre-attach-pool', type],
    queryFn: () => mediaApi(type).list({ all: true }).then((p) => p.items),
  })
  const all = q.data ?? []

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onChange(all.map((m) => m.id))}
            disabled={!all.length}
            className="cursor-pointer rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {t('genres.pickAll')} ({all.length})
          </button>
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="cursor-pointer rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {t('filter.clear')}
            </button>
          )}
        </div>
      </div>
      <MovieMultiSelect
        movies={all}
        value={value}
        onChange={onChange}
        placeholder={q.isLoading ? t('api.loading') : t('genres.pickPlaceholder')}
      />
    </div>
  )
}
