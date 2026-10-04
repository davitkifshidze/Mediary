import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Camera } from 'lucide-react'
import type { ActorCard } from '@/api/actors'
import { actorName } from '@/lib/actors'
import { useContentLang } from '@/lib/settings'
import { PosterImage } from '@/components/PosterImage'
import { RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'

/* ============================================================
   **მსახიობის ბარათი `/actors`-ზე (Tasks §35.2).**

   ფოტო, სახელი კონტენტის ენაზე (მეორე ენა ქვემოთ), „N ფილმი · M სერიალი"
   **ჩემს ბიბლიოთეკაში** და ჩემი ტეგები. მარჯვენა ღილაკი — გვერდის მენიუ (§7).
   ============================================================ */

export function ActorTile({ actor, actions }: { actor: ActorCard; actions: MenuAction[] }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { title, alt } = actorName(actor, lang)

  const counts = [
    actor.counts.movie ? t('actors.countMovies', { count: actor.counts.movie }) : null,
    actor.counts.series ? t('actors.countSeries', { count: actor.counts.series }) : null,
    actor.counts.anime ? t('actors.countAnime', { count: actor.counts.anime }) : null,
  ].filter(Boolean)

  return (
    <RecordContextMenu actions={actions}>
      <Link to={`/actors/${actor.id}`} className="group block" data-testid="actor-tile">
        <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-border bg-muted">
          <PosterImage src={actor.photo} alt={title} className="h-full w-full transition-transform duration-500 group-hover:scale-105" />
          {actor.photos > 0 && (
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-[5px] bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
              <Camera className="size-3" />
              {actor.photos}
            </span>
          )}
        </div>

        <div className="mt-2 space-y-0.5">
          <p className="line-clamp-1 text-sm font-semibold">{title}</p>
          {alt && <p className="line-clamp-1 text-xs text-muted-foreground">{alt}</p>}
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {counts.length ? counts.join(' · ') : t('actors.onlyPhotos')}
          </p>
          {actor.tags.length > 0 && (
            <p className="line-clamp-1 text-[11px] text-muted-foreground">{actor.tags.map((tag) => `#${tag}`).join(' ')}</p>
          )}
        </div>
      </Link>
    </RecordContextMenu>
  )
}
