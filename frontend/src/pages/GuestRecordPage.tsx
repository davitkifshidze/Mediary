import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, Link2Off, Loader2, Star } from 'lucide-react'
import { fetchGuestRecord, guestListPath, type GuestSource } from '@/api/guestRecord'
import { SHARE_DOMAINS, type ShareDomainKey } from '@/api/shareLinks'
import type { Status } from '@/api/types'
import { storageUrl } from '@/lib/api'
import { isPortraitCategory } from '@/lib/galleryPhoto'
import { PAGE_ALL } from '@/lib/pageSize'
import { cardRatings, formatRating } from '@/lib/rating'
import { useContentLang } from '@/lib/settings'
import { shareGenreName, shareMeta } from '@/lib/shareLinks'
import { ENUM_STATUS_NS, type EnumStatusDomain } from '@/lib/statuses'
import { cn } from '@/lib/utils'
import { InLibraryMark } from '@/components/share/ImportMarks'
import { PosterImage } from '@/components/PosterImage'
import { EnumStatusBadge, StatusBadge } from '@/components/StatusBadge'
import { VideoEmbed, type Embeddable } from '@/components/VideoEmbed'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Markdown } from '@/components/ui/markdown'
import { PageContainer } from '@/components/ui/page'
import { PhotoGrid, type PhotoItem } from '@/components/ui/photo-grid'

/* ============================================================
   **სტუმრის შიდა გვერდი** — `/share/:token/:domain/:id` და
   `/u/:username/:domain/:id`.

   ⚠️ **`Protected`-ის გარეთ დგას** (`SharePage`-ის წესი): ბმულით ნახვა შესვლის
   გარეშეც შეიძლება, ამიტომ მოდულების კონტექსტი და პლეერი აქ არ არის — თრეილერი
   ჩვეულებრივი ჩაშენებული კადრია (`VideoEmbed`, ჰოსტი `lib/embed.ts`-ით მოწმდება).

   ⚠️ **გვერდი არაფერს წყვეტს**: რა ჩანს, სერვერმა უკვე გადაწყვიტა (`blocks`).
   ჩართული და ცარიელი ბლოკი „არ არის"-ს წერს, გამორთული საერთოდ არ იხატება —
   სტუმარი ვერ გაიგებს, რა დამალა მფლობელმა.
   ============================================================ */

/** მთავარი ფოტოს კადრი — სექციის ფორმით (`SHARE_DOMAIN_META.shape`) */
const ASPECT = {
  poster: 'aspect-[2/3]',
  wide: 'aspect-video',
  photo: 'aspect-[4/3]',
} as const

export function GuestRecordPage({ via }: { via: GuestSource['kind'] }) {
  const { token = '', username = '', domain = '', id = '' } = useParams()
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)

  const source = useMemo<GuestSource>(
    () => (via === 'link' ? { kind: 'link', token } : { kind: 'profile', username }),
    [via, token, username],
  )
  const recordId = Number(id)
  const back = guestListPath(source)

  const query = useQuery({
    queryKey: ['guest-record', via, via === 'link' ? token : username, domain, recordId],
    queryFn: () => fetchGuestRecord(source, domain, recordId),
    enabled: Number.isInteger(recordId) && recordId > 0,
    retry: false,
    // ⚠️ გახსნა ჟურნალში იწერება — ფანჯარაზე დაბრუნება ახალ გახსნად არ ითვლება
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  })

  const page = query.data

  const photos = useMemo<PhotoItem[]>(
    () =>
      (page?.gallery ?? []).map((photo) => ({
        id: photo.id,
        src: photo.path,
        portrait: isPortraitCategory(photo.category),
        width: photo.width,
        height: photo.height,
      })),
    [page],
  )

  if (query.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!page) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="max-w-md text-center">
          <Link2Off className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold">{t('guestRecord.notFound')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('guestRecord.notFoundHint')}</p>
          <Link to={back} className={cn(buttonVariants({ variant: 'outline' }), 'mt-6')}>
            <ArrowLeft className="size-4" />
            {t('guestRecord.back')}
          </Link>
        </div>
      </div>
    )
  }

  const card = page.record
  const title = (lang === 'ka' ? card.title_ka : card.title_en) || card.title_en || card.title_ka || '—'
  const description = page.description
    ? (lang === 'ka' ? page.description.ka : page.description.en) || page.description.en || page.description.ka
    : null
  const shape = (SHARE_DOMAINS as readonly string[]).includes(card.domain)
    ? shareMeta(card.domain as ShareDomainKey).shape
    : 'wide'
  const ratings = cardRatings(card)
  const status = card.status && typeof card.status === 'object' ? (card.status as Status) : null
  const enumStatus =
    typeof card.status === 'string' && card.domain in ENUM_STATUS_NS
      ? { domain: card.domain as EnumStatusDomain, key: card.status }
      : null

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageContainer width="wide">
        <Link to={back} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          <ArrowLeft className="size-4" />
          {t('guestRecord.back')}
        </Link>

        {/* ---------- ჩანაწერი ---------- */}
        <article className="mt-5 grid gap-6 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]" data-testid="guest-record">
          <div className="relative self-start">
            <div className={cn('w-full overflow-hidden rounded-lg bg-muted', ASPECT[shape])}>
              <PosterImage src={storageUrl(card.image) ?? null} alt={title} className="size-full" />
            </div>
            <InLibraryMark mine={card.in_library} />
          </div>

          <div className="min-w-0 space-y-4">
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
              {card.subtitle && <p className="mt-1 text-sm text-muted-foreground">{card.subtitle}</p>}
            </div>

            <p className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {card.year && <span>{card.year}</span>}
              {/* მფლობელის ქულა ვარსკვლავით, მედიაზე TMDB-ის საშუალო ცალკე */}
              {ratings.mine != null && (
                <span className="inline-flex items-center gap-1 text-gold" data-testid="guest-my-rating">
                  <Star className="size-4 fill-current" aria-hidden="true" />
                  {formatRating(ratings.mine)}
                </span>
              )}
              {ratings.average != null && <span title={t('rating.tmdbAverage')}>TMDB {ratings.average}</span>}
              {status && <StatusBadge status={status} />}
              {enumStatus && <EnumStatusBadge domain={enumStatus.domain} status={enumStatus.key} />}
            </p>

            {page.genres.length > 0 && (
              <p className="flex flex-wrap gap-2" data-testid="guest-genres">
                {page.genres.map((g) => (
                  <Badge key={g.value} className="bg-secondary text-secondary-foreground">
                    {shareGenreName(g, lang)}
                  </Badge>
                ))}
              </p>
            )}

            {/* ვიდეოს, სიმღერის, ბუკმარკისა და კურსის წყარო — სწორედ იმისთვისაა გაზიარებული, რომ გაიხსნას */}
            {card.url && (
              <a
                href={card.url}
                target="_blank"
                rel="noreferrer noopener"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <ExternalLink className="size-4" />
                {t('share.page.openSource')}
              </a>
            )}

            {description && <Markdown text={description} className="text-sm" />}
          </div>
        </article>

        {/* ---------- თრეილერი ---------- */}
        {page.blocks.trailer && (
          <section className="mt-10" data-testid="guest-trailer">
            <h2 className="mb-3 font-display text-lg font-semibold">{t('guestRecord.trailer')}</h2>
            {page.trailer ? (
              <div className="max-w-3xl">
                <VideoEmbed
                  video={{
                    title,
                    url: page.trailer.url,
                    embed_url: page.trailer.embed_url,
                    platform: (page.trailer.platform ?? undefined) as Embeddable['platform'],
                  }}
                />
              </div>
            ) : (
              <EmptyState size="line" title={t('guestRecord.noTrailer')} />
            )}
          </section>
        )}

        {/* ---------- მსახიობები ---------- */}
        {page.blocks.cast && (
          <section className="mt-10" data-testid="guest-cast">
            <h2 className="mb-3 font-display text-lg font-semibold">{t('guestRecord.cast')}</h2>
            {page.cast.length === 0 ? (
              <EmptyState size="line" title={t('guestRecord.noCast')} />
            ) : (
              <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                {page.cast.map((member, index) => {
                  const name = (lang === 'ka' ? member.name_ka : null) || member.name

                  return (
                    <li key={`${member.name}-${index}`} className="min-w-0">
                      <div className="aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted">
                        <PosterImage src={storageUrl(member.photo) ?? null} alt={name} className="size-full" />
                      </div>
                      <p className="mt-2 truncate text-sm font-medium" title={name}>
                        {name}
                      </p>
                      {member.character && (
                        <p className="truncate text-xs text-muted-foreground" title={member.character}>
                          {member.character}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}

        {/* ---------- გალერეა ---------- */}
        {page.blocks.gallery && (
          <section className="mt-10 pb-12" data-testid="guest-gallery">
            <h2 className="mb-3 font-display text-lg font-semibold">{t('guestRecord.gallery')}</h2>
            <PhotoGrid items={photos} readOnly pageSize={PAGE_ALL} emptyText={t('guestRecord.noPhotos')} />
          </section>
        )}
      </PageContainer>
    </div>
  )
}
