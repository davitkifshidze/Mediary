import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Languages, SquarePen, Plus, Trash2 } from 'lucide-react'
import { createGenre, deleteGenre, fetchGenres, updateGenre, updateGenreItems } from '@/api/movies'
import type { Genre } from '@/api/types'
import { emptyMediaIds, type MediaType } from '@/lib/media'
import { GenreItemsManager, GenreItemsPicker, type GenreSection } from '@/components/GenreItemsManager'
import { TabInfo } from '@/components/ui/tabs'
import { CutTabs } from '@/components/ui/cut-tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { GenreSingleSelect } from '@/components/GenreSelect'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/feedback'
import { MENU_ICONS, RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'
import { genreName } from '@/lib/display'
import { modAccent, moduleName, useModules } from '@/lib/modules'
import { ModuleIcon } from '@/components/ModuleIcon'
import { cn } from '@/lib/utils'

/** დომენი → ჟანრის რესურსის მთვლელი და მისი წარწერა (⚠️ ანიმეს სვეტი `animes_count`-ია) */
const DOMAIN_COUNT: Record<MediaType, { field: 'movies_count' | 'series_count' | 'animes_count'; label: string }> = {
  movie: { field: 'movies_count', label: 'genres.moviesCount' },
  series: { field: 'series_count', label: 'genres.seriesCount' },
  anime: { field: 'animes_count', label: 'genres.animesCount' },
}

/**
 * **ჟანრების მართვა.** ჟანრი გლობალურია და სამ მედია-დომენს ერთად ეკუთვნის,
 * ამიტომ ტაბი (ფილმი · სერიალი · ანიმე, მოდულის ფერში, `?tab=`) სიას კი არ ჭრის,
 * არამედ **იმ დომენის რიცხვით ალაგებს** (`GET /genres?type=`) და მის რიცხვს
 * ფერად ჩიპად აჩვენებს. ⚠️ 0-იანი ჟანრი არ იმალება — ბოლოში რჩება, რომ ჩანაწერის
 * მიმაგრება აქედანაც შეიძლებოდეს. წიგნის/თამაშის/სიმღერის/სამაგიდოს ჟანრები
 * სხვა ლექსიკონებია (`/dictionaries`).
 */
export function GenresPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { mediaModules } = useModules()
  const [params, setParams] = useSearchParams()
  // ⚠️ უცნობი/გამორთული ტაბი პირველზე ბრუნდება (`StatsPage`-ის წესი)
  const requested = params.get('tab')
  const tab: MediaType = mediaModules.find((m) => m.type === requested)?.type ?? mediaModules[0]?.type ?? 'movie'
  const module = mediaModules.find((m) => m.type === tab)
  const genresQ = useQuery({ queryKey: ['genres', tab], queryFn: () => fetchGenres(tab) })
  const [editing, setEditing] = useState<Genre | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Genre | null>(null)

  const genres = genresQ.data ?? []
  const used = (type: MediaType) => genres.filter((g) => (g[DOMAIN_COUNT[type].field] ?? 0) > 0).length

  return (
    <PageContainer>
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('actions.back')}
      </Link>

      <PageHeader
        tool="genres"
        title={t('genres.title')}
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" />
            {t('genres.add')}
          </Button>
        }
      />

      {/* დომენის ტაბები — ფერითა და ხატულით; რიცხვი = რამდენ ჟანრს აქვს ამ დომენის ჩანაწერი */}
      {mediaModules.length > 1 && (
        <div className="mb-4">
          <CutTabs
            layout="inline"
            value={tab}
            onChange={(key) =>
              setParams((current) => {
                const next = new URLSearchParams(current)
                next.set('tab', key)
                return next
              })
            }
            options={mediaModules.map((m) => ({
              key: m.type,
              label: moduleName(m, i18n.language),
              count: genresQ.data ? used(m.type) : undefined,
              color: m.color,
              node: <ModuleIcon name={m.icon} className="size-4 text-[var(--mod)]" />,
            }))}
          />
        </div>
      )}

      {genresQ.isLoading ? (
        <div className="text-muted-foreground">{t('api.loading')}</div>
      ) : genres.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          {t('genres.empty')}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {genres.map((g) => {
            /* მარჯვენა ღილაკი: რედაქტირება · — · წაშლა */
            const actions: MenuAction[] = [
              { key: 'edit', label: t('genres.edit'), icon: MENU_ICONS.edit, run: () => setEditing(g) },
              { key: 'delete', label: t('confirm.delete'), icon: MENU_ICONS.delete, danger: true, separator: true, run: () => setDeleting(g) },
            ]
            return (
            <RecordContextMenu key={g.id} actions={actions}>
            <li className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{genreName(g, lang)}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {lang === 'ka' ? g.name_en : g.name_ka || '—'}
                </div>
              </div>
              {/* არჩეული დომენის რიცხვი მოდულის ფერში; 0 — ჩამქრალი */}
              <span
                style={modAccent(module?.color)}
                className={cn(
                  'w-28 shrink-0 rounded-md border px-2 py-0.5 text-center text-xs',
                  (g[DOMAIN_COUNT[tab].field] ?? 0) > 0
                    ? 'border-[var(--mod)] bg-[var(--mod-soft)] text-[var(--mod)]'
                    : 'border-border text-muted-foreground',
                )}
                data-testid="genre-count"
              >
                {t(DOMAIN_COUNT[tab].label, { count: g[DOMAIN_COUNT[tab].field] ?? 0 })}
              </span>
              {/* რიგის ღილაკები — `h-9`, აიქონი + ტექსტი (ყველგან ერთი ზომა) */}
              <div className="flex shrink-0 items-center gap-1.5">
                <Button type="button" variant="edit" size="sm" onClick={() => setEditing(g)} aria-label={t('genres.edit')}>
                  <SquarePen className="size-3.5" />
                  {t('actions.edit')}
                </Button>
                <Button type="button" variant="destructiveOutline" size="sm" onClick={() => setDeleting(g)}>
                  <Trash2 className="size-3.5" />
                  {t('confirm.delete')}
                </Button>
              </div>
            </li>
            </RecordContextMenu>
            )
          })}
        </ul>
      )}

      {editing && (
        <GenreFormDialog
          genre={editing === 'new' ? null : editing}
          allGenres={genres}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <GenreDeleteDialog genre={deleting} allGenres={genres} onClose={() => setDeleting(null)} />
      )}
    </PageContainer>
  )
}

/* ---------- Add / edit dialog ---------- */
function GenreFormDialog({
  genre,
  allGenres,
  onClose,
}: {
  genre: Genre | null
  allGenres: Genre[]
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [nameKa, setNameKa] = useState(genre?.name_ka ?? '')
  const [nameEn, setNameEn] = useState(genre?.name_en ?? '')
  const [lang, setLang] = useState<'ka' | 'en'>(i18n.language === 'en' ? 'en' : 'ka')
  const [error, setError] = useState<string | null>(null)
  // ახალ ჟანრში მაშინვე მიბმული ჩანაწერები (ჟანრი ჯერ არ არსებობს)
  const [attach, setAttach] = useState<Record<MediaType, number[]>>(emptyMediaIds)
  const [tab, setTab] = useState<GenreSection>('names')

  const mut = useMutation({
    mutationFn: async () => {
      const payload = { name_ka: nameKa.trim(), name_en: nameEn.trim() }
      if (genre) return updateGenre(genre.id, payload)

      // შექმნა → მონიშნული ჩანაწერების მიბმა (ყველა დომენი, სადაც რამე არჩეულია — ანიმეც)
      const created = await createGenre(payload)
      for (const type of Object.keys(attach) as MediaType[]) {
        if (attach[type].length) {
          await updateGenreItems(created.id, { type, action: 'attach', ids: attach[type] })
        }
      }
      return created
    },
    onSuccess: () => {
      ;['genres', 'genre-items', 'genre-attach-pool', 'movie', 'series', 'anime'].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      )
      toast({ title: t('genres.saved'), variant: 'success' })
      onClose()
    },
    onError: (e: { response?: { data?: { errors?: Record<string, string[]> } } }) => {
      const errs = e?.response?.data?.errors
      setError(errs ? Object.values(errs)[0]?.[0] ?? t('toast.error') : t('toast.error'))
    },
  })

  // რედაქტირებაში ბევრი ფუნქციონალია, ამიტომ ჩანართებად დაიყო.
  // „ჩანაწერები" და „ქმედებები" ერთ ჩანართადაა: მონიშვნა და ქმედება ერთ ეკრანზე.
  // ახალი ჟანრი მარტივია (სახელი + წინასწარი მონიშვნა), იქ ჩანართები არ გვჭირდება.
  // შენი ბარათ-ჩანართები (`CutTabs`, ხატულა და ფერი `lib/cutStyle.ts`-იდან)
  const TABS: { key: GenreSection; label: string }[] = [
    { key: 'names', label: t('genres.tabNames') },
    { key: 'records', label: t('genres.tabItems') },
    { key: 'add', label: t('genres.tabAdd') },
  ]

  return (
    <ModalShell title={genre ? t('genres.edit') : t('genres.add')} onClose={onClose} wide>
      {genre && (
        <div className="mt-4">
          <CutTabs layout="inline" options={TABS} value={tab} onChange={(key) => setTab(key as GenreSection)} />
        </div>
      )}

      <div className="mt-4">
        {tab === 'names' && (
          <>
            <TabInfo>{t('genres.infoNames')}</TabInfo>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <Label className="mb-0">
                  {t('genres.nameField')}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {t(`lang.${lang}`)}
                  </span>
                </Label>
                <button
                  type="button"
                  onClick={() => setLang((l) => (l === 'ka' ? 'en' : 'ka'))}
                  className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Languages className="size-3.5" />
                  {t('genres.switchLang')}
                </button>
              </div>
              {lang === 'ka' ? (
                <Input key="ka" value={nameKa} onChange={(e) => setNameKa(e.target.value)} autoFocus />
              ) : (
                <Input key="en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} autoFocus />
              )}
            </div>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

            {/* ახალ ჟანრზე ჩანაწერების წინასწარი მონიშვნა (ტაბები აქ არ არის) */}
            {!genre && <GenreItemsPicker value={attach} onChange={setAttach} />}
          </>
        )}

        {tab === 'records' && <TabInfo>{t('genres.infoItems')}</TabInfo>}
        {tab === 'add' && <TabInfo>{t('genres.infoAdd')}</TabInfo>}
      </div>

      {/* ყოველთვის დამონტაჟებული, რომ მონიშვნა ჩანართებს შორის არ დაიკარგოს;
          „ჩანაწერებისა" და „დამატების" ქვედა ზოლს თვითონ ხატავს */}
      {genre && <GenreItemsManager genre={genre} allGenres={allGenres} section={tab} />}

      {tab === 'names' && (
        <ModalFooter>
          <Button variant="outline" onClick={onClose}>
            {t('confirm.cancel')}
          </Button>
          {/* განმარტება tooltip-ია და არა `title`: hover-ზე მაშინვე ჩანს */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => mut.mutate()}
                disabled={mut.isPending || (!nameKa.trim() && !nameEn.trim())}
              >
                {t('genres.save')}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-sm">
              {t('genres.saveNamesHint')}
            </TooltipContent>
          </Tooltip>
        </ModalFooter>
      )}
    </ModalShell>
  )
}

/* ---------- Delete dialog (reassign / leave empty) ---------- */
type DeleteMode = 'reassign' | 'empty'

function GenreDeleteDialog({
  genre,
  allGenres,
  onClose,
}: {
  genre: Genre
  allGenres: Genre[]
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const qc = useQueryClient()
  const { toast } = useToast()
  /* ჟანრი გაზიარებულია — სამივე დომენი უნდა ჩაითვალოს, თორემ „უჟანროდ"
     დარჩენა შეუმჩნევლად წაშლიდა მიბმას. ⚠️ ანიმე აქ **აკლდა**:
     მხოლოდ ანიმეზე მიბმული ჟანრი „0"-ს აჩვენებდა და ფორმა პირდაპირ
     `deleteGenre(id)`-ს უშვებდა, გადატანის შეთავაზების გარეშე. */
  const count = (genre.movies_count ?? 0) + (genre.series_count ?? 0) + (genre.animes_count ?? 0)
  const others = allGenres.filter((g) => g.id !== genre.id)
  const [mode, setMode] = useState<DeleteMode>('reassign')
  const [reassignTo, setReassignTo] = useState<string>('')

  const mut = useMutation({
    mutationFn: () => {
      if (count === 0) return deleteGenre(genre.id)
      if (mode === 'reassign' && reassignTo) return deleteGenre(genre.id, { reassign_to: Number(reassignTo) })
      return deleteGenre(genre.id, { force: true })
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['genres'] })
      qc.invalidateQueries({ queryKey: ['movie'] })
      qc.invalidateQueries({ queryKey: ['series'] })
      qc.invalidateQueries({ queryKey: ['my-requests'] })
      // ჟანრი გლობალურია — არაადმინის წაშლა ადმინთან მიდის დასადასტურებლად
      toast(
        res?.approvalRequired
          ? { title: t('genres.deleteRequested'), description: t('genres.deleteRequestedHint'), variant: 'info' }
          : { title: t('genres.deleted'), variant: 'success' },
      )
      onClose()
    },
    onError: () => toast({ title: t('toast.error'), variant: 'error' }),
  })

  const confirmDisabled =
    mut.isPending || (count > 0 && mode === 'reassign' && (others.length === 0 || !reassignTo))

  return (
    <ModalShell title={t('genres.deleteTitle')} onClose={onClose} destructive>
      {count === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t('genres.deleteSimple', { name: genreName(genre, lang) })}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted-foreground">{t('genres.inUse', { count })}</p>

          <RadioGroup value={mode} onValueChange={(v) => setMode(v as DeleteMode)} className="gap-3">
            {/* select ვერ ჯდება <label>-ში — თორემ მასზე დაჭერა radio-ს ააქტიურებდა და menu იხურებოდა */}
            <div
              className={cn(
                'rounded-lg border p-3 transition-colors',
                mode === 'reassign' ? 'border-primary bg-secondary/50' : 'border-border',
                others.length === 0 && 'pointer-events-none opacity-50',
              )}
            >
              <label className="flex cursor-pointer items-center gap-3">
                <RadioGroupItem value="reassign" disabled={others.length === 0} />
                <span className="text-sm font-medium">{t('genres.optReassign')}</span>
              </label>
              {mode === 'reassign' && others.length > 0 && (
                <div className="mt-2 pl-8">
                  <GenreSingleSelect
                    genres={others}
                    value={reassignTo}
                    onChange={setReassignTo}
                    placeholder={t('genres.optReassignPick')}
                  />
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
              <span className="text-sm font-medium">{t('genres.optLeaveEmpty')}</span>
            </label>
          </RadioGroup>
        </div>
      )}

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          {t('confirm.cancel')}
        </Button>
        <Button variant="destructive" onClick={() => mut.mutate()} disabled={confirmDisabled}>
          {t('confirm.delete')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}

