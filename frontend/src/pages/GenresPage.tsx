import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Languages, SquarePen, Plus, Trash2 } from 'lucide-react'
import { createGenre, deleteGenre, fetchGenres, updateGenre, updateGenreItems } from '@/api/movies'
import type { Genre } from '@/api/types'
import { emptyMediaIds, type MediaType } from '@/lib/media'
import { GenreItemsManager, GenreItemsPicker, type GenreSection } from '@/components/GenreItemsManager'
import { Tabs, TabInfo, type TabItem } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { GenreSingleSelect } from '@/components/GenreSelect'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/feedback'
import { genreName } from '@/lib/display'
import { cn } from '@/lib/utils'

export function GenresPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const genresQ = useQuery({ queryKey: ['genres'], queryFn: () => fetchGenres() })
  const [editing, setEditing] = useState<Genre | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Genre | null>(null)

  const genres = genresQ.data ?? []

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

      {genresQ.isLoading ? (
        <div className="text-muted-foreground">{t('api.loading')}</div>
      ) : genres.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          {t('genres.empty')}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {genres.map((g) => (
            <li key={g.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{genreName(g, lang)}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {lang === 'ka' ? g.name_en : g.name_ka || '—'}
                </div>
              </div>
              {/* ორი მთვლელი ერთმანეთის ქვეშ, თითო თავის ჩარჩოში, ერთი სიგანით (Tasks K10) */}
              <div className="flex w-28 shrink-0 flex-col gap-1">
                <span className="rounded-[5px] border border-border bg-muted/60 px-2 py-0.5 text-center text-xs text-muted-foreground">
                  {t('genres.moviesCount', { count: g.movies_count ?? 0 })}
                </span>
                <span className="rounded-[5px] border border-border bg-muted/60 px-2 py-0.5 text-center text-xs text-muted-foreground">
                  {t('genres.seriesCount', { count: g.series_count ?? 0 })}
                </span>
              </div>
              <button
                onClick={() => setEditing(g)}
                aria-label={t('genres.edit')}
                className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <SquarePen className="size-4" />
              </button>
              <button
                onClick={() => setDeleting(g)}
                aria-label={t('confirm.delete')}
                className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
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
  // C2 — ახალ ჟანრში მაშინვე მიბმული ჩანაწერები (ჟანრი ჯერ არ არსებობს)
  const [attach, setAttach] = useState<Record<MediaType, number[]>>(emptyMediaIds)
  const [tab, setTab] = useState<GenreSection>('names')

  const mut = useMutation({
    mutationFn: async () => {
      const payload = { name_ka: nameKa.trim(), name_en: nameEn.trim() }
      if (genre) return updateGenre(genre.id, payload)

      // შექმნა → მონიშნული ჩანაწერების მიბმა (ორივე დომენი, თუ არჩეულია)
      const created = await createGenre(payload)
      for (const type of ['movie', 'series'] as MediaType[]) {
        if (attach[type].length) {
          await updateGenreItems(created.id, { type, action: 'attach', ids: attach[type] })
        }
      }
      return created
    },
    onSuccess: () => {
      ;['genres', 'genre-items', 'genre-attach-pool', 'movie', 'series'].forEach((k) =>
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

  // K1 — რედაქტირებაში ბევრი ფუნქციონალია, ამიტომ ტაბებად დაიყო.
  // L5 — „ჩანაწერები" და „ქმედებები" ერთ ტაბადაა: მონიშვნა და ქმედება ერთ ეკრანზე.
  // ახალი ჟანრი მარტივია (სახელი + წინასწარი მონიშვნა), იქ ტაბები არ გვჭირდება.
  const TABS: TabItem<GenreSection>[] = [
    { value: 'names', label: t('genres.tabNames') },
    { value: 'items', label: t('genres.tabItems') },
    { value: 'add', label: t('genres.tabAdd') },
  ]

  return (
    <ModalShell title={genre ? t('genres.edit') : t('genres.add')} onClose={onClose} wide>
      {genre && <Tabs items={TABS} value={tab} onChange={setTab} className="mt-4" />}

      <div className="mt-4">
        {tab === 'names' && (
          <>
            <TabInfo>{t('genres.infoNames')}</TabInfo>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <Label className="mb-0">
                  {t('genres.nameField')}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {lang === 'ka' ? 'ქართული' : 'English'}
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

            {/* C2 — ახალ ჟანრზე ჩანაწერების წინასწარი მონიშვნა (ტაბები აქ არ არის) */}
            {!genre && <GenreItemsPicker value={attach} onChange={setAttach} />}
          </>
        )}

        {tab === 'items' && <TabInfo>{t('genres.infoItems')}</TabInfo>}
        {tab === 'add' && <TabInfo>{t('genres.infoAdd')}</TabInfo>}

        {/* C1 — ყოველთვის დამონტაჟებული, რომ მონიშვნა ტაბებს შორის არ დაიკარგოს */}
        {genre && <GenreItemsManager genre={genre} allGenres={allGenres} section={tab} />}
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={onClose}>
          {t('confirm.cancel')}
        </Button>
        {/* Tasks 4 — განმარტება tooltip-ია და არა `title`: hover-ზე მაშინვე ჩანს */}
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
      </div>
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
     დარჩენა შეუმჩნევლად წაშლიდა მიბმას. ⚠️ ანიმე აქ **აკლდა** (Tasks BUG-19):
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
      // ჟანრი გლობალურია — არაადმინის წაშლა ადმინთან მიდის დასადასტურებლად (I7)
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

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {t('confirm.cancel')}
        </Button>
        <Button variant="destructive" onClick={() => mut.mutate()} disabled={confirmDisabled}>
          {t('confirm.delete')}
        </Button>
      </div>
    </ModalShell>
  )
}

