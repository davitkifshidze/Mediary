import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, Pencil, PlayCircle, Star, Trash2 } from 'lucide-react'
import { PosterImage } from './PosterImage'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirm, useToast } from '@/components/ui/feedback'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { mediaApi } from '@/api/media'
import { mediaOf, type MediaType } from '@/lib/media'
import { cn } from '@/lib/utils'
import { genreName, movieTitle } from '@/lib/display'
import type { MovieListItem, Status } from '@/api/types'

const STATUSES: Status[] = ['undecided', 'to_watch', 'watching', 'watched']

export function MovieCard({ movie, type = 'movie' }: { movie: MovieListItem; type?: MediaType }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const qc = useQueryClient()
  const nav = useNavigate()
  const confirm = useConfirm()
  const { toast } = useToast()
  const api = mediaApi(type)
  const { detailBase } = mediaOf(type)
  const missing = movie.missing ?? []
  const desc = lang === 'ka' ? movie.description_ka || movie.description_en : movie.description_en || movie.description_ka

  const inval = () => {
    qc.invalidateQueries({ queryKey: [type] })
    qc.invalidateQueries({ queryKey: [type, 'detail', String(movie.id)] })
  }
  const statusMut = useMutation({ mutationFn: (s: Status) => api.setStatus(movie.id, s), onSuccess: inval })
  const favMut = useMutation({ mutationFn: () => api.toggleFavorite(movie.id), onSuccess: inval })
  const delMut = useMutation({
    mutationFn: () => api.remove(movie.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [type] })
      toast({ title: t('toast.deleted'), variant: 'success' })
    },
  })

  const askDelete = async () => {
    const ok = await confirm({
      title: t('confirm.deleteMovieTitle'),
      description: t('confirm.deleteMovieDesc', { title: movieTitle(movie, lang) }),
      confirmText: t('confirm.delete'),
      cancelText: t('confirm.cancel'),
      variant: 'destructive',
    })
    if (ok) delMut.mutate()
  }

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
                className="absolute left-2 top-2 z-10 grid size-6 cursor-help place-items-center rounded-full bg-destructive/15 text-destructive shadow ring-1 ring-destructive/30 transition-colors hover:bg-destructive hover:text-destructive-foreground"
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
              <Link to={`${detailBase}/${movie.id}`} className="block">
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
                      className="absolute bottom-2 left-2 z-10 inline-flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-full bg-amber-400/95 px-2 py-0.5 text-[10px] font-semibold text-black shadow ring-1 ring-black/10 backdrop-blur-sm"
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
                    <span>{movie.year ?? '—'}</span>
                    {movie.rating && (
                      <>
                        <span className="opacity-40">·</span>
                        <span>★ {movie.rating}</span>
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

      <ContextMenuContent>
        <ContextMenuSub>
          <ContextMenuSubTrigger>{t('form.status')}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {STATUSES.map((s) => (
              <ContextMenuItem key={s} onSelect={() => statusMut.mutate(s)}>
                <Check className={cn('size-3.5', movie.status === s ? 'opacity-100' : 'opacity-0')} />
                {t(`status.${s}`)}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onSelect={() => favMut.mutate()}>
          <Star className={cn('size-3.5', movie.is_favorite && 'fill-current text-favorite')} />
          {movie.is_favorite ? t('actions.unfavorite') : t('actions.favorite')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => nav(`${detailBase}/${movie.id}/edit`)}>
          <Pencil className="size-3.5" />
          {t('actions.edit')}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            // defer so the menu fully closes before the dialog grabs focus
            setTimeout(askDelete, 0)
          }}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <Trash2 className="size-3.5" />
          {t('actions.delete')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
