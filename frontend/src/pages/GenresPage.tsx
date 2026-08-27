import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Languages, Pencil, Plus, Trash2 } from 'lucide-react'
import { createGenre, deleteGenre, fetchGenres, updateGenre } from '@/api/movies'
import type { Genre } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { GenreSingleSelect } from '@/components/GenreSelect'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useToast } from '@/components/ui/feedback'
import { genreName } from '@/lib/display'
import { cn } from '@/lib/utils'

export function GenresPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const genresQ = useQuery({ queryKey: ['genres'], queryFn: fetchGenres })
  const [editing, setEditing] = useState<Genre | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Genre | null>(null)

  const genres = genresQ.data ?? []

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('actions.back')}
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('genres.title')}</h1>
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" />
          {t('genres.add')}
        </Button>
      </div>

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
              <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                {t('genres.moviesCount', { count: g.movies_count ?? 0 })}
              </span>
              <button
                onClick={() => setEditing(g)}
                aria-label={t('genres.edit')}
                className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Pencil className="size-4" />
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

      {editing && <GenreFormDialog genre={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <GenreDeleteDialog genre={deleting} allGenres={genres} onClose={() => setDeleting(null)} />
      )}
    </main>
  )
}

/* ---------- Add / edit dialog ---------- */
function GenreFormDialog({ genre, onClose }: { genre: Genre | null; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [nameKa, setNameKa] = useState(genre?.name_ka ?? '')
  const [nameEn, setNameEn] = useState(genre?.name_en ?? '')
  const [lang, setLang] = useState<'ka' | 'en'>(i18n.language === 'en' ? 'en' : 'ka')
  const [error, setError] = useState<string | null>(null)

  const mut = useMutation({
    mutationFn: () => {
      const payload = { name_ka: nameKa.trim(), name_en: nameEn.trim() }
      return genre ? updateGenre(genre.id, payload) : createGenre(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['genres'] })
      qc.invalidateQueries({ queryKey: ['movie'] })
      qc.invalidateQueries({ queryKey: ['series'] })
      toast({ title: t('genres.saved'), variant: 'success' })
      onClose()
    },
    onError: (e: { response?: { data?: { errors?: Record<string, string[]> } } }) => {
      const errs = e?.response?.data?.errors
      setError(errs ? Object.values(errs)[0]?.[0] ?? t('toast.error') : t('toast.error'))
    },
  })

  return (
    <ModalShell title={genre ? t('genres.edit') : t('genres.add')} onClose={onClose}>
      <div className="mt-4 space-y-4">
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
            <Input
              key="ka"
              value={nameKa}
              onChange={(e) => setNameKa(e.target.value)}
              autoFocus
            />
          ) : (
            <Input
              key="en"
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              autoFocus
            />
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {t('confirm.cancel')}
        </Button>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending || (!nameKa.trim() && !nameEn.trim())}>
          {t('genres.save')}
        </Button>
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
  const count = genre.movies_count ?? 0
  const others = allGenres.filter((g) => g.id !== genre.id)
  const [mode, setMode] = useState<DeleteMode>('reassign')
  const [reassignTo, setReassignTo] = useState<string>('')

  const mut = useMutation({
    mutationFn: () => {
      if (count === 0) return deleteGenre(genre.id)
      if (mode === 'reassign' && reassignTo) return deleteGenre(genre.id, { reassign_to: Number(reassignTo) })
      return deleteGenre(genre.id, { force: true })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['genres'] })
      qc.invalidateQueries({ queryKey: ['movie'] })
      qc.invalidateQueries({ queryKey: ['series'] })
      toast({ title: t('genres.deleted'), variant: 'success' })
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

/* ---------- shared compact modal ---------- */
function ModalShell({
  title,
  onClose,
  destructive,
  children,
}: {
  title: string
  onClose: () => void
  destructive?: boolean
  children: ReactNode
}) {
  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fb-overlay fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm" />
        <DialogPrimitive.Content className="fb-content fixed left-1/2 top-1/2 z-[61] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-background p-6 shadow-xl focus:outline-none">
          <DialogPrimitive.Title
            className={cn('font-display text-lg font-semibold tracking-tight', destructive && 'text-destructive')}
          >
            {title}
          </DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
