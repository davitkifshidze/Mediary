import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Film, LockOpen, PlayCircle, Star } from 'lucide-react'
import { PosterImage } from './PosterImage'
import { RecordActionBar } from '@/components/RecordActionBar'
import { RecordView } from '@/components/RecordView'
import { DictionaryStatusMenu } from '@/components/StatusMenu'
import { InfoHint } from '@/components/ui/info-hint'
import { RatingBadge } from '@/components/ui/star-rating'
import { FranchiseFavoriteDialog } from '@/components/FranchiseFavoriteDialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu'
import {
  contextMenuItems,
  favoriteAction,
  MENU_ICONS,
  statusActions,
  type MenuAction,
} from '@/components/ui/record-menu'
import { mediaApi } from '@/api/media'
import { relockRecord } from '@/api/locks'
import { lockMenuActions, mediaLockBase } from '@/lib/locks'
import { plainText } from '@/lib/richText'
import { RecordLockDialog } from '@/components/locks/RecordLock'
import { mediaKey, mediaOf, type MediaType } from '@/lib/media'
import { genreName, movieTitle } from '@/lib/display'
import { formatRating } from '@/lib/rating'
import type { MovieListItem } from '@/api/types'
import { useContentLang } from '@/lib/settings'
import { useStatuses } from '@/lib/statuses'

/* ============================================================
   **ფილმის/სერიალის/ანიმეს ჩანაწერი სიაში** — ბარათი (`MovieCard`, ბადეც მისივე
   კომპაქტური ზომაა) და სტრიქონი (`MovieRow`).

   ⚠️ **ლოგიკა ერთია** (`useMovieRecord`): სტატუსი, რჩეული (ფრანჩაიზის პოპაპით),
   ჩაკეტვა, წაშლა და მარჯვენა ღილაკის მენიუ — ორივე ხედს
   ერთნაირად აქვს, თორემ სტრიქონი ბარათს ერთ კვირაში დაშორდებოდა.
   ============================================================ */

function useMovieRecord(movie: MovieListItem, type: MediaType) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const qc = useQueryClient()
  const nav = useNavigate()
  const loc = useLocation()
  const confirm = useConfirm()
  const { toast } = useToast()
  const api = mediaApi(type)
  // სტატუსების სია ლექსიკონიდან (ქეში ერთია, ე.ი. ბარათზე დამატებითი მოთხოვნა არაა)
  const { data: statuses = [] } = useStatuses(type)
  const { detailBase } = mediaOf(type)
  const missing = movie.missing ?? []
  // ბარათზე აღწერა უბრალო ტექსტია (ფორმატი მხოლოდ დეტალშია)
  const desc = plainText(lang === 'ka' ? movie.description_ka || movie.description_en : movie.description_en || movie.description_ka)

  const inval = () => {
    qc.invalidateQueries({ queryKey: [type] })
    qc.invalidateQueries({ queryKey: [type, 'detail', String(movie.id)] })
  }
  const statusMut = useMutation({ mutationFn: (s: string) => api.setStatus(movie.id, s), onSuccess: inval })
  const favMut = useMutation({ mutationFn: () => api.toggleFavorite(movie.id), onSuccess: inval })
  /* ფილმზე, რომელსაც ფრანჩაიზი აქვს, რჩეულში **დამატება** პოპაპს ხსნის
     („მხოლოდ ეს ფილმი" / „მთელი ფრანჩაიზი"); მოხსნა და უფრანჩაიზო ფილმი — პირდაპირ. */
  const [franchiseOpen, setFranchiseOpen] = useState(false)
  // ჩაკეტვა / პაროლი მარჯვენა ღილაკიდან
  const [locking, setLocking] = useState(false)
  const relockMut = useMutation({
    mutationFn: () => relockRecord(mediaLockBase(type, movie.id)),
    onSuccess: () => {
      inval()
      toast({ title: t('lock.relocked'), variant: 'success' })
    },
  })
  const toggleFavorite = () => {
    if (type === 'movie' && !movie.is_favorite && movie.collection_id) setFranchiseOpen(true)
    else favMut.mutate()
  }
  const delMut = useMutation({
    mutationFn: () => api.remove(movie.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [type] })
      // ტექსტი დომენს მიჰყვება: სერიალზე „ფილმი წაიშალა" ეწერა
      toast({ title: t(mediaKey('toast.deleted', type)), variant: 'success' })
    },
  })

  const askDelete = async () => {
    const ok = await confirm({
      title: t(mediaKey('confirm.deleteRecord', type)),
      description: t('confirm.deleteRecordDesc', { name: movieTitle(movie, lang) }),
      confirmText: t('confirm.delete'),
      cancelText: t('confirm.cancel'),
      variant: 'destructive',
    })
    if (ok) delMut.mutate()
  }

  /* ერთი სია (`record-menu`): გახსნა · სტატუსი ▸ · რჩეული · — · რედაქტირება · წაშლა.
     „გახსნა" აქამდე არ იყო — მარჯვენა ღილაკი ბრაუზერის „ახალ ჩანართში"-ს ფარავდა. */
  const actions: MenuAction[] = [
    {
      key: 'open',
      label: t('actions.open'),
      icon: MENU_ICONS.open,
      run: () => nav(`${detailBase}/${movie.id}`, { state: { from: loc.pathname + loc.search } }),
    },
    statusActions(t('form.status'), statuses, movie.status, lang, (key) => statusMut.mutate(key)),
    favoriteAction(movie.is_favorite, toggleFavorite, t),
    ...lockMenuActions(!!movie.locked, { relock: () => relockMut.mutate(), manage: () => setLocking(true) }, t),
    { key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, separator: true, run: () => nav(`${detailBase}/${movie.id}/edit`) },
    { key: 'delete', label: t('actions.delete'), icon: MENU_ICONS.delete, danger: true, run: () => void askDelete() },
  ]

  const open = () => nav(`${detailBase}/${movie.id}`, { state: { from: loc.pathname + loc.search } })
  const edit = () => nav(`${detailBase}/${movie.id}/edit`)

  const dialogs = (
    <>
      {franchiseOpen && (
        <FranchiseFavoriteDialog movie={movie} onClose={() => setFranchiseOpen(false)} onDone={inval} />
      )}
      {locking && (
        <RecordLockDialog
          base={mediaLockBase(type, movie.id)}
          record={{
            id: movie.id,
            name: movieTitle(movie, lang),
            locked: !!movie.locked,
            unlocked: movie.unlocked ?? true,
            lock_hint: movie.lock_hint ?? null,
            unlock_blocked_until: movie.unlock_blocked_until ?? null,
          }}
          onChanged={inval}
          hint={t('lock.hintMedia')}
          onClose={() => setLocking(false)}
        />
      )}
    </>
  )

  return { lang, statuses, actions, missing, desc, detailBase, loc, open, edit, statusMut, favMut, toggleFavorite, askDelete, dialogs }
}

export function MovieCard({ movie, type = 'movie' }: { movie: MovieListItem; type?: MediaType }) {
  const { t } = useTranslation()
  const { lang, actions, missing, desc, detailBase, loc, dialogs } = useMovieRecord(movie, type)

  return (
    <ContextMenu>
      <div className="group relative">
        {/* ❗ გაფრთხილება — ცალკე აიქონი საკუთარი hover-ინფოთი */}
        {missing.length > 0 && (
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t('missing.label')}
                onClick={(e) => e.preventDefault()}
                className="absolute left-2 top-2 z-10 grid size-6 cursor-help place-items-center rounded-md bg-destructive/15 text-destructive shadow ring-1 ring-destructive/30 transition-colors"
              >
                <AlertTriangle className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <p className="font-medium">{t('missing.label')}</p>
              <p className="mt-0.5 leading-snug text-muted-foreground">
                {missing.map((f) => t(`missing.${f}`)).join(', ')}
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        <Tooltip delayDuration={700}>
          <ContextMenuTrigger asChild>
            <TooltipTrigger asChild>
              <Link
                to={`${detailBase}/${movie.id}`}
                // საიდან შემოვედით — წაშლის/დაბრუნების შემდეგ ამ გვერდზე ვბრუნდებით
                state={{ from: loc.pathname + loc.search }}
                className="block"
              >
                <div className="relative overflow-hidden rounded-lg bg-muted shadow-sm ring-1 ring-border transition duration-300 group-hover:shadow-lg group-hover:ring-foreground/30">
                  <div className="aspect-[2/3]">
                    <PosterImage
                      src={movie.poster}
                      alt={movieTitle(movie, lang)}
                      className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  </div>
                  {movie.is_favorite && (
                    <span className="absolute right-2 top-2 text-favorite drop-shadow">
                      <Star className="size-4 fill-current" />
                    </span>
                  )}
                  {movie.franchise_next && (
                    <span
                      title={t('franchise.continue')}
                      className="absolute bottom-2 left-2 z-10 inline-flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-md bg-amber-400/95 px-2 py-0.5 text-[10px] font-semibold text-black shadow ring-1 ring-black/10 backdrop-blur-sm"
                    >
                      <PlayCircle className="size-3 shrink-0" />
                      <span className="truncate">{t('franchise.continue')}</span>
                    </span>
                  )}
                </div>
                <div className="mt-2.5">
                  <h3 className="font-display text-[15px] font-medium leading-snug transition-colors group-hover:text-gold">
                    {movieTitle(movie, lang)}
                  </h3>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {/* ჩაკეტილი, ამ სესიაში გახსნილი */}
                    {movie.locked && <LockOpen className="size-3" aria-label={t('lock.badgeOpen')} />}
                    <span>{movie.year ?? '—'}</span>
                    {/* ჩემი ქულა ოქროსფერი ვარსკვლავით; TMDB-ის საშუალო „TMDB"-ით და მინიშნებით */}
                    {movie.my_rating != null && (
                      <>
                        <span className="opacity-40">·</span>
                        <span className="inline-flex items-center gap-0.5 font-medium text-gold">
                          <Star className="transition-transform size-3 fill-current" aria-hidden="true" />
                          {formatRating(movie.my_rating)}
                        </span>
                      </>
                    )}
                    {movie.rating && (
                      <>
                        <span className="opacity-40">·</span>
                        <span title={t('rating.tmdbAverage')}>TMDB {movie.rating}</span>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            </TooltipTrigger>
          </ContextMenuTrigger>

          <TooltipContent side="bottom" align="start" className="max-w-sm rounded-xl p-4 shadow-lg">
            <p className="font-display text-sm font-semibold leading-snug">{movieTitle(movie, lang)}</p>
            {movie.genres.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {movie.genres.map((g) => (
                  <span key={g.id} className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium">
                    {genreName(g, lang)}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-2 line-clamp-6 text-xs leading-relaxed text-muted-foreground">
              {desc || t('detail.noDescription')}
            </p>
          </TooltipContent>
        </Tooltip>
      </div>

      <ContextMenuContent>{contextMenuItems(actions)}</ContextMenuContent>
      {dialogs}
    </ContextMenu>
  )
}

/**
 * **სტრიქონი**: პოსტერი, სათაური, წელი · ჟანრები · TMDB, და მოქმედებების ზოლი —
 * ჩემი ქულა · სტატუსი · რჩეული · რედაქტირება · წაშლა. მენიუ და დიალოგები ბარათისაა.
 */
export function MovieRow({ movie, type = 'movie' }: { movie: MovieListItem; type?: MediaType }) {
  const { t } = useTranslation()
  const { lang, statuses, actions, missing, open, edit, statusMut, favMut, toggleFavorite, askDelete, dialogs } =
    useMovieRecord(movie, type)

  return (
    <>
      <RecordView
        title={movieTitle(movie, lang)}
        onOpen={open}
        openLabel={t('actions.open')}
        photo={movie.poster}
        shape="poster"
        placeholder={<Film className="size-5" />}
        titleAside={
          /* ❗ ბარათის წითელი სამკუთხედის იგივე ინფო */
          missing.length > 0 ? (
            <InfoHint critical={`${t('missing.label')} ${missing.map((f) => t(`missing.${f}`)).join(', ')}`} />
          ) : undefined
        }
        meta={
          <>
            {/* ჩაკეტილი, ამ სესიაში გახსნილი */}
            {movie.locked && <LockOpen className="size-3" aria-label={t('lock.badgeOpen')} />}
            {movie.year ? <span>{movie.year}</span> : null}
            {movie.genres.slice(0, 3).map((g) => (
              <span key={g.id}>{genreName(g, lang)}</span>
            ))}
            {movie.rating && <span title={t('rating.tmdbAverage')}>TMDB {movie.rating}</span>}
            {movie.franchise_next && (
              <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                <PlayCircle className="size-3" />
                {t('franchise.continue')}
              </span>
            )}
          </>
        }
        actions={actions}
        onEdit={edit}
        bar={
          <RecordActionBar
            before={<RatingBadge value={movie.my_rating} size="row" className="mr-1" />}
            status={
              <DictionaryStatusMenu
                status={movie.status}
                statuses={statuses}
                label={t('form.status')}
                emptyLabel={t('library.noStatus')}
                onChange={(key) => statusMut.mutate(key)}
              />
            }
            favorite={{ active: movie.is_favorite, pending: favMut.isPending, onToggle: toggleFavorite }}
            onEdit={edit}
            onDelete={() => void askDelete()}
          />
        }
      />
      {dialogs}
    </>
  )
}
