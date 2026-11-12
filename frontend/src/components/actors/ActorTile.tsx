import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, Lock, LockOpen, Star } from 'lucide-react'
import { ACTORS_KEY, type ActorCard, type ActorListItem, type HiddenActorCard } from '@/api/actors'
import { actorName } from '@/lib/actors'
import { actorLockBase } from '@/lib/locks'
import { useContentLang } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { PosterImage } from '@/components/PosterImage'
import { RecordUnlockDialog } from '@/components/locks/RecordLock'
import { RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'

/* ============================================================
   **მსახიობის ბარათი `/actors`-ზე.**

   ფოტო, სახელი კონტენტის ენაზე (მეორე ენა ქვემოთ), „N ფილმი · M სერიალი"
   **ჩემს ბიბლიოთეკაში** და ჩემი ტეგები. მარჯვენა ღილაკი — გვერდის მენიუ.

   ⚠️ **ვარსკვლავი ბმულის გვერდით დგას და არა შიგნით** — ბმულში ღილაკი არასწორი
   HTML-ია და ერთი დაჭერა გვერდსაც გახსნიდა. რჩეული მსახიობი სიაში ყოველთვის თავშია.

   ⚠️ **დამალული** (ჩემ მიერ ჩაკეტილი, ამ სესიაში დაუხსნელი) მხოლოდ
   ფილტრში „მხოლოდ ჩაკეტილები" ჩანს: სახელი და ბოქლომი, დაჭერა — გახსნა.
   ============================================================ */

export function ActorTile({
  actor,
  actions,
  onFavorite,
}: {
  actor: ActorListItem
  actions: MenuAction[]
  /** რჩეულის გადართვა; მის გარეშე ვარსკვლავი არ იხატება */
  onFavorite?: (actor: ActorCard) => void
}) {
  return actor.hidden ? <HiddenActorTile actor={actor} /> : <OpenActorTile actor={actor} actions={actions} onFavorite={onFavorite} />
}

function OpenActorTile({
  actor,
  actions,
  onFavorite,
}: {
  actor: ActorCard
  actions: MenuAction[]
  onFavorite?: (actor: ActorCard) => void
}) {
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
     <div className="relative">
      {onFavorite && (
        <button
          type="button"
          data-kind="toggle"
          data-testid="actor-favorite"
          aria-pressed={actor.favorite}
          aria-label={t(actor.favorite ? 'actions.unfavorite' : 'actions.favorite')}
          title={t(actor.favorite ? 'actions.unfavorite' : 'actions.favorite')}
          onClick={() => onFavorite(actor)}
          className={cn(
            'absolute left-2 top-2 z-[1] grid size-7 cursor-pointer place-items-center rounded-md bg-black/55 backdrop-blur-sm transition-colors',
            actor.favorite ? 'text-favorite' : 'text-white/80 hover:text-favorite',
          )}
        >
          <Star className={cn('size-4', actor.favorite && 'fill-current')} />
        </button>
      )}
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
          <p className="flex items-center gap-1 text-sm font-semibold">
            {/* ჩაკეტილი, ამ სესიაში გახსნილი */}
            {actor.locked && <LockOpen className="size-3.5 shrink-0 text-muted-foreground" aria-label={t('lock.badgeOpen')} />}
            <span className="line-clamp-1">{title}</span>
          </p>
          {alt && <p className="line-clamp-1 text-xs text-muted-foreground">{alt}</p>}
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {counts.length ? counts.join(' · ') : t('actors.onlyPhotos')}
          </p>
          {actor.tags.length > 0 && (
            <p className="line-clamp-1 text-[11px] text-muted-foreground">{actor.tags.map((tag) => `#${tag}`).join(' ')}</p>
          )}
        </div>
      </Link>
     </div>
    </RecordContextMenu>
  )
}

function HiddenActorTile({ actor }: { actor: HiddenActorCard }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const qc = useQueryClient()
  const [unlocking, setUnlocking] = useState(false)
  const { title } = actorName(actor, lang)

  return (
    <>
      <button data-kind="card" type="button" onClick={() => setUnlocking(true)} className="group block w-full cursor-pointer text-left" data-testid="actor-locked-tile">
        <div className="grid aspect-[2/3] place-items-center rounded-xl border border-border bg-muted text-muted-foreground transition group-hover:border-foreground/30">
          <span className="flex flex-col items-center gap-2 text-xs">
            <Lock className="size-8" />
            {t('lock.badgeLocked')}
          </span>
        </div>
        <p className="mt-2 line-clamp-1 text-sm font-semibold">{title}</p>
      </button>

      {unlocking && (
        <RecordUnlockDialog
          base={actorLockBase(actor.id)}
          record={{ ...actor, name: title }}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: [ACTORS_KEY] })
            qc.invalidateQueries({ queryKey: ['actor', String(actor.id)] })
          }}
          onClose={() => setUnlocking(false)}
        />
      )}
    </>
  )
}
