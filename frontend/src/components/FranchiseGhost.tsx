import { useTranslation } from 'react-i18next'
import { Layers, Loader2, Plus } from 'lucide-react'
import type { MovieListItem } from '@/api/types'
import { movieTitle } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { PosterImage } from '@/components/PosterImage'
import { Button } from '@/components/ui/button'
import { useQueue } from '@/components/ui/queue'

/* ============================================================
   **ფრანჩაიზის დაუმატებელი ნაწილი სიაში — მკრთალი ბარათი.**

   სიის ფრანჩაიზის ჯგუფში ჩემს ნაწილებს შორის დგას ის ნაწილიც, რომელიც ბიბლიოთეკაში
   არ მაქვს (`ghost`): მკრთალია, წყვეტილი ჩარჩოთი, და დაჭერით ემატება — „აღმოჩენის"
   იმავე რიგით (`useQueue().enqueue`). ჩანაწერი არ არის: სტატუსი, ქულა, მენიუ და
   გახსნა არ აქვს.

   ⚠️ გამოუსვლელი ნაწილი (`released: false`) „მალე"-ს აწერს — ის ჯერ არც შეიძლება
   ნანახი იყოს, მაგრამ ფრანჩაიზში უკვე გამოცხადებულია.
   ============================================================ */

function useGhost(part: MovieListItem) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { enqueue, isQueued } = useQueue()

  const title = movieTitle(part, lang)
  const tmdbId = part.tmdb_id ?? 0
  const adding = isQueued(tmdbId, 'movie')
  const add = () => {
    if (tmdbId && !adding) enqueue([{ tmdbId, title }], 'movie')
  }
  // „2027 · მალე" · „2003 · აკლია"
  const meta = [part.year ?? null, part.released === false ? t('soon.section') : t('franchise.missing')].filter(Boolean).join(' · ')

  return { t, title, adding, add, meta }
}

export function FranchiseGhostCard({ part }: { part: MovieListItem }) {
  const { t, title, adding, add, meta } = useGhost(part)

  return (
    <button
      data-kind="card"
      type="button"
      onClick={add}
      title={t('franchise.ghostHint')}
      data-testid="franchise-ghost"
      className={cn(
        'group block w-full cursor-pointer text-left transition-opacity',
        adding ? 'opacity-100' : 'opacity-50 hover:opacity-100',
      )}
    >
      <div className="relative overflow-hidden rounded-lg border border-dashed border-border bg-muted">
        <div className="aspect-[2/3]">
          <PosterImage src={part.poster} alt={title} className="h-full w-full" />
        </div>
        <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          <Layers className="size-3" />
          {t('franchise.missing')}
        </span>
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center bg-primary/70 text-white transition-opacity',
            adding ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          <span className="inline-flex items-center gap-1 rounded-md bg-white/15 px-3 py-1.5 text-xs font-medium backdrop-blur">
            {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            {adding ? t('queue.queued') : t('actor.add')}
          </span>
        </span>
      </div>
      <span className="mt-2.5 block font-display text-[15px] font-medium leading-snug">{title}</span>
      <span className="mt-1 block text-xs text-muted-foreground">{meta}</span>
    </button>
  )
}

export function FranchiseGhostRow({ part }: { part: MovieListItem }) {
  const { t, title, adding, add, meta } = useGhost(part)

  return (
    <div
      data-testid="franchise-ghost"
      title={t('franchise.ghostHint')}
      className={cn(
        'flex items-center gap-3 rounded-md border border-dashed border-border bg-card/40 p-2 transition-opacity',
        adding ? 'opacity-100' : 'opacity-60 hover:opacity-100',
      )}
    >
      <span className="h-16 w-11 shrink-0 overflow-hidden rounded-md bg-muted">
        <PosterImage src={part.poster} alt={title} className="h-full w-full" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {[meta, part.collection_name].filter(Boolean).join(' · ')}
        </span>
      </span>
      <Button variant="outline" size="sm" onClick={add} disabled={adding}>
        {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {adding ? t('queue.queued') : t('actor.add')}
      </Button>
    </div>
  )
}
