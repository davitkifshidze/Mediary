import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Cake, ExternalLink, Globe, Loader2, MapPin, RefreshCw, Star } from 'lucide-react'
import { resyncActor, type Actor } from '@/api/media'
import { errorMessage } from '@/lib/errors'
import { useDateFormat } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { PosterImage } from '@/components/PosterImage'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   მსახიობის **hero** — შიდა გვერდის თავი (Tasks §8.1/§8.5).

   მოთხოვნა: „მსახიობებს შიდა გვერდები ცალკე უნდა ჰქონდეს" და „სტანდარტული
   ჩამოწერა ოფიციალური საიტებიდან — IMDb და TMDB".

   ⚠️ **მონაცემი გლობალურ ლექსიკონშია** (`cast_members`) და ერთხელ ივსება —
   ბიოგრაფია, დაბადების თარიღი და IMDb-ის id პიროვნების ფაქტებია და არა
   ჩემი მონაცემი (ჩემი მხოლოდ ტეგები და ფოტოებია).

   ⚠️ **შევსება ცხადი ღილაკია** და არა ავტომატური: TMDB-ის ლიმიტი საერთოა,
   მსახიობის გვერდი კი ხშირად იხსნება. ერთადერთი გამონაკლისი — როცა
   მონაცემი **საერთოდ არ არის**: მაშინ ღილაკი თვალშისაცემია და ტექსტიც
   ამბობს, რომ ჯერ არაფერი მოგვიტანია.

   ⚠️ **ბიოგრაფია ინგლისურია და თარგმანის ცხრილი არ ემატება** — TMDB მას
   ქართულად პრაქტიკულად არ იძლევა, ე.ი. ცარიელი ცხრილი დარჩებოდა
   (წიგნების ზუსტი პრეცედენტი).
   ============================================================ */

/** ცნობილი ქსელები — რაც არ იცნობა, უბრალოდ არ იხატება */
const LINKS: { key: string; label: string; href: (id: string) => string }[] = [
  { key: 'imdb_id', label: 'IMDb', href: (id) => `https://www.imdb.com/name/${id}/` },
  { key: 'instagram_id', label: 'Instagram', href: (id) => `https://www.instagram.com/${id}/` },
  { key: 'twitter_id', label: 'X', href: (id) => `https://x.com/${id}` },
  { key: 'facebook_id', label: 'Facebook', href: (id) => `https://www.facebook.com/${id}` },
  { key: 'tiktok_id', label: 'TikTok', href: (id) => `https://www.tiktok.com/@${id}` },
  { key: 'youtube_id', label: 'YouTube', href: (id) => `https://www.youtube.com/${id}` },
  { key: 'wikidata_id', label: 'Wikidata', href: (id) => `https://www.wikidata.org/wiki/${id}` },
]

export function ActorHero({ actor, name }: { actor: Actor; name: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { date: formatDate } = useDateFormat()
  const [expanded, setExpanded] = useState(false)

  const resync = useMutation({
    mutationFn: () => resyncActor(actor.id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['actor', String(actor.id)] })
      qc.invalidateQueries({ queryKey: ['gallery', 'cast', actor.id] })
      toast({
        title: res.updated ? t('actor.detailsUpdated') : t('actor.detailsUnavailable'),
        variant: res.updated ? 'success' : 'info',
      })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /** ბმულები — `profile_links` + პირდაპირი `imdb_id` */
  const links = LINKS.flatMap((link) => {
    const value = link.key === 'imdb_id'
      ? (actor.imdb_id ?? actor.profile_links?.imdb_id)
      : actor.profile_links?.[link.key]

    return value ? [{ ...link, value }] : []
  })

  const bio = actor.biography ?? ''
  const longBio = bio.length > 420

  return (
    <header className="mb-8 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-5 p-5 sm:flex-row">
        <div className="mx-auto size-32 shrink-0 overflow-hidden rounded-2xl bg-muted ring-1 ring-border sm:mx-0">
          <PosterImage src={actor.photo} alt={name} className="size-full object-cover" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
            <h1 className="font-display text-3xl font-semibold tracking-tight">{name}</h1>
            {actor.known_for && (
              <span className="mt-1.5 rounded-md bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">
                {actor.known_for}
              </span>
            )}
            {actor.popularity != null && (
              <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Star className="size-3.5 text-gold" />
                {actor.popularity.toFixed(1)}
              </span>
            )}
          </div>

          {/* მეორე ენის სახელი — ორივე ხშირად საჭიროა ძებნისთვის */}
          {actor.name_ka && actor.name_ka !== name && (
            <p className="text-sm text-muted-foreground">{actor.name}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {actor.birthday && (
              <span className="inline-flex items-center gap-1.5">
                <Cake className="size-3.5" />
                {formatDate(actor.birthday)}
                {actor.deathday && ` — ${formatDate(actor.deathday)}`}
              </span>
            )}
            {actor.place_of_birth && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {actor.place_of_birth}
              </span>
            )}
          </div>

          {/* ---------- ოფიციალური ბმულები ---------- */}
          {(links.length > 0 || actor.homepage) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {links.map((link) => (
                <a
                  key={link.key}
                  href={link.href(link.value)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  <ExternalLink className="size-3" />
                  {link.label}
                </a>
              ))}
              {actor.homepage && (
                <a
                  href={actor.homepage}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  <Globe className="size-3" />
                  {t('actor.homepage')}
                </a>
              )}
            </div>
          )}

          {/* ---------- ბიოგრაფია ---------- */}
          {bio && (
            <div className="mt-3">
              <p className={cn('text-sm leading-relaxed text-muted-foreground', !expanded && 'line-clamp-4')}>
                {bio}
              </p>
              {longBio && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-1 cursor-pointer text-xs font-medium text-primary hover:text-primary/70"
                >
                  {t(expanded ? 'actions.less' : 'actions.more')}
                </button>
              )}
            </div>
          )}

          {/* ⚠️ მონაცემის უქონლობა ცალკე მდგომარეობაა და ცხადად ითქმის */}
          {!bio && !actor.birthday && (
            <p className="mt-3 text-sm text-muted-foreground">{t('actor.noDetails')}</p>
          )}
        </div>

        <div className="shrink-0">
          <Button
            variant="outline"
            size="sm"
            disabled={resync.isPending || actor.has_tmdb === false}
            onClick={() => resync.mutate()}
            title={actor.has_tmdb === false ? t('gallery.noTmdbId') : undefined}
          >
            {resync.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {t('actor.refreshDetails')}
          </Button>
        </div>
      </div>
    </header>
  )
}
