import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarClock,
  ExternalLink,
  Link2Off,
  ListMusic,
  Loader2,
  LogIn,
  Search,
  Star,
  User as UserIcon,
  UserPlus,
} from 'lucide-react'
import {
  fetchPublicShare,
  fetchPublicShareItems,
  fetchSharePlaylist,
  planShareImport,
  type ShareCard,
  type ShareDomainKey,
} from '@/api/shareLinks'
import type { Status } from '@/api/types'
import { storageUrl } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useDateFormat } from '@/lib/dates'
import { isApiCode } from '@/lib/errors'
import { useContentLang } from '@/lib/settings'
import { cardRatings, formatRating } from '@/lib/rating'
import { shareGenreName, shareMeta, type ShareClassifierKind, type ShareDomainMeta } from '@/lib/shareLinks'
import { ENUM_STATUS_NS, type EnumStatusDomain } from '@/lib/statuses'
import { PageContainer } from '@/components/ui/page'
import { Pagination } from '@/components/ui/pagination'
import { LIST_PAGE_SIZE, usePages } from '@/lib/paged'
import { Button, buttonVariants } from '@/components/ui/button'
import { CutTabs } from '@/components/ui/cut-tabs'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ModuleIcon } from '@/components/ModuleIcon'
import { InLibraryMark, SelectBox } from '@/components/share/ImportMarks'
import { LibraryImportBar } from '@/components/share/LibraryImportBar'
import { useLibraryImport } from '@/components/share/useLibraryImport'
import { EnumStatusBadge, StatusBadge } from '@/components/StatusBadge'
import { PlaylistPlayerDialog } from '@/components/PublicPlaylistDialog'
import { cn } from '@/lib/utils'

/* ============================================================
   **გაზიარების ბმულის გვერდი — `/share/:token`**.

   ⚠️ **`Protected`-ის გარეთ დგას**: ბმულით ნახვა შესვლის გარეშეც
   შეიძლება — `/u/:username`-ის ყალიბი. ანონიმს „შესვლა / რეგისტრაცია"
   ეწერება, რომელიც **ისევ აქ აბრუნებს** (`state.from`).

   ⚠️ **ბიბლიოთეკაში დამატება მხოლოდ შესულს**: ბარათების მონიშვნა ან
   „ყველა ახალი" → გეგმა (`POST /shares/{token}/plan` — გარე წყაროს არ
   ეკითხება) → რიგი (`share` სახეობა, თითო ჩანაწერი ცალკე). ⚠️ მოდულის
   უქონელს ცარიელი ღილაკი ან 403 არ ხვდება — სექციაზე წერია, რომ მოდული
   არ აქვს, და იქვე მოთხოვნის ღილაკია. `ModulesProvider` ამ გვერდს არ ფარავს
   (ის `Protected`-შია), ამიტომ ეს ცოდნა სერვერიდან მოდის (`viewer.sections`).

   ⚠️ **სია `useInfiniteQuery`-ია** და არა ხელით დაგროვებული გვერდები:
   დამატების შემდეგ „უკვე გაქვს ✓" ყველა ჩატვირთულ გვერდზე უნდა განახლდეს,
   ხელით დაგროვება კი ხელახლა ჩამოტვირთულ გვერდს მეორედ დაურთავდა.

   ⚠️ **თერთმეტი სექცია, სამი ბარათის ფორმა** (`SHARE_DOMAIN_META`):
   პოსტერი (ფილმი, თამაში, წიგნი…), ფართო ესკიზი (ვიდეო, სიმღერა, ბუკმარკი,
   კურსი) და ფოტო (ადგილი). ერთ სექციაში ერთი ფორმაა, ამიტომ ბადეც მას
   მიჰყვება. ფილტრის სიტყვაც სექციისაა — „ყველა ჟანრი" / „კატეგორია" / „ტიპი".

   ⚠️ **პლეილისტის ბარათი იხსნება**: შიგნით მისი სიმღერებია რიგით,
   დაკვრით (პლეილისტის ფანჯარა — `PlaylistPlayerDialog`, ბმულის წყაროთი).
   სექციის მეტამონაცემი `song`-ისაა (`SHARE_DOMAIN_META.module`), სახელი და
   ხატულა — თავისი.
   ============================================================ */

const ALL_GENRES = '__all__'

/** ფილტრის „ყველა" — კლასიფიკატორის სიტყვით */
const ALL_CLASSIFIERS = {
  genre: 'share.page.allGenres',
  category: 'share.page.allCategories',
  type: 'share.page.allTypes',
} as const satisfies Record<ShareClassifierKind, string>

/** ბარათის კადრის პროპორცია და ბადის სვეტები — სექციის ფორმით */
const SHAPE = {
  poster: { aspect: 'aspect-[2/3]', grid: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6' },
  wide: { aspect: 'aspect-video', grid: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' },
  photo: { aspect: 'aspect-[4/3]', grid: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' },
} as const satisfies Record<ShareDomainMeta['shape'], { aspect: string; grid: string }>

export function SharePage() {
  const { token = '' } = useParams()
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { user } = useAuth()
  const location = useLocation()
  const { date } = useDateFormat()

  const [domain, setDomain] = useState<ShareDomainKey | null>(null)
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [genre, setGenre] = useState(ALL_GENRES)
  const [openPlaylist, setOpenPlaylist] = useState<ShareCard | null>(null)

  // ძებნა ყოველ ასოზე არ იგზავნება
  useEffect(() => {
    const id = window.setTimeout(() => setTerm(q.trim()), 300)
    return () => window.clearTimeout(id)
  }, [q])

  const head = useQuery({
    queryKey: ['public-share', token],
    queryFn: () => fetchPublicShare(token),
    retry: false,
    // ⚠️ ნახვების მრიცხველი ამ მოთხოვნაზეა — ფანჯარაზე დაბრუნება ახალ ნახვად არ ითვლება
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  })

  const share = head.data

  // პირველი სექცია ავტომატურად იხსნება
  useEffect(() => {
    if (share && domain === null && share.sections.length) setDomain(share.sections[0].domain)
  }, [share, domain])

  // გვერდზე 10: ნომრები + „მეტის ჩვენება" (გაზიარების მისამართი ტოკენია — გვერდი მასში არ იწერება)
  const list = usePages({
    queryKey: ['public-share-items', token, domain, term, genre],
    fetchPage: (page) =>
      fetchPublicShareItems(token, domain as ShareDomainKey, {
        page,
        per_page: LIST_PAGE_SIZE,
        q: term || undefined,
        genre: genre === ALL_GENRES ? undefined : genre,
      }).then((r) => ({ ...r, items: r.data, total: r.meta.total, lastPage: r.meta.last_page })),
    enabled: !!domain,
    refetchOnWindowFocus: false,
  })

  const items = list.items
  const firstPage = list.first

  // ბიბლიოთეკაში დამატება: მონიშვნა, სტატუსის რეჟიმი, გეგმა → რიგი (პროფილის გვერდთან საერთო)
  const library = useLibraryImport({
    source: { kind: 'link', token, owner: share?.owner.username ?? '' },
    domain,
    lang,
    plan: (d, ids) => planShareImport(token, d, ids),
    headKey: ['public-share', token],
  })

  const switchDomain = (next: string) => {
    setDomain(next as ShareDomainKey)
    setGenre(ALL_GENRES)
    setQ('')
    setTerm('')
    library.clear()
    setOpenPlaylist(null)
  }

  const ability = domain ? share?.viewer.sections[domain] : undefined
  const canAdd = !!share && share.viewer.signed_in && !share.viewer.own && !!ability?.can_create
  const fresh = items.filter((c) => !c.in_library)

  if (head.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (head.isError || !share) {
    const expired = isApiCode(head.error, 'share_expired')
    const revoked = isApiCode(head.error, 'share_revoked')

    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="max-w-md text-center">
          <Link2Off className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold">
            {t(expired ? 'share.page.expired' : revoked ? 'share.page.revoked' : 'share.page.notFound')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(expired || revoked ? 'share.page.askOwner' : 'share.page.notFoundHint')}
          </p>
          <Link to={user ? '/' : '/login'} className={cn(buttonVariants({ variant: 'outline' }), 'mt-6')}>
            {t('publicProfile.goHome')}
          </Link>
        </div>
      </div>
    )
  }

  const avatar = storageUrl(share.owner.avatar_path)
  // ⚠️ პლეილისტის მოდული `song`-ია — ფერი იქიდან, სახელი და ხატულა თავისი
  const moduleOf = (d: ShareDomainKey) => share.modules[shareMeta(d).module]
  const sectionName = (d: ShareDomainKey) => {
    if (d === 'playlist') return t('playlists.title')
    const m = moduleOf(d)
    return m ? (lang === 'ka' ? m.name_ka : m.name_en) : d
  }
  const sectionIcon = (d: ShareDomainKey) => (d === 'playlist' ? 'ListMusic' : (moduleOf(d)?.icon ?? 'Film'))
  const genres = firstPage?.genres ?? []
  const meta = domain ? shareMeta(domain) : null
  const shape = SHAPE[meta?.shape ?? 'poster']

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageContainer width="wide">
        {/* ---------- ვინ გაგიზიარა ---------- */}
        <header className="flex flex-wrap items-center gap-5 border-b border-border pb-7">
          <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-muted">
            {avatar ? (
              <img src={avatar} alt="" className="size-full object-cover" />
            ) : (
              <UserIcon className="size-8 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">{t('share.page.sharedBy')}</p>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{share.owner.display_name}</h1>
            <p className="text-sm text-muted-foreground">@{share.owner.username}</p>
          </div>
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="size-4" />
            {share.link.expires_at
              ? t('share.page.validUntil', { date: date(share.link.expires_at) })
              : t('share.page.noExpiry')}
          </p>
        </header>

        {/* ---------- ვინ უყურებს ---------- */}
        {share.viewer.own ? (
          <p className="mt-5 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm">
            {t('share.page.ownLink')}
          </p>
        ) : !share.viewer.signed_in ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <p className="min-w-0 flex-1 text-sm">{t('share.page.signInToAdd')}</p>
            <Link to="/login" state={{ from: location.pathname }} className={buttonVariants({ size: 'sm' })}>
              <LogIn className="size-4" />
              {t('share.page.signIn')}
            </Link>
            <Link
              to="/register"
              state={{ from: location.pathname }}
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
            >
              <UserPlus className="size-4" />
              {t('share.page.register')}
            </Link>
          </div>
        ) : null}

        {share.sections.length === 0 ? (
          <EmptyState className="my-16" title={t('share.page.nothing')} hint={t('share.page.nothingHint')} />
        ) : (
          <>
            {/* ---------- სექციები ---------- */}
            <div className="py-5">
              <CutTabs
                options={share.sections.map((s) => {
                  const m = moduleOf(s.domain)

                  return {
                    key: s.domain,
                    label: sectionName(s.domain),
                    count: s.count,
                    ...(m
                      ? {
                          color: m.color,
                          node: <ModuleIcon name={sectionIcon(s.domain)} className="size-4 text-[var(--mod)]" />,
                        }
                      : {}),
                  }
                })}
                value={domain ?? ''}
                onChange={switchDomain}
              />
            </div>

            {/* ---------- ბიბლიოთეკაში დამატება (შესულ უცხოს) ---------- */}
            {domain && share.viewer.signed_in && !share.viewer.own && ability && (
              <LibraryImportBar
                ability={ability}
                sectionName={sectionName(domain)}
                hint={t('share.page.addHint')}
                // ⚠️ სტატუსის უქონელ სექციაზე (სიმღერა, სამაგიდო) არჩევანი არაფერს ცვლის
                ownerStatus={share.link.show_status && !!meta?.status}
                ownerStatusLabel={t('share.page.statusOwner')}
                statusMode={library.statusMode}
                onStatusMode={library.setStatusMode}
                freshCount={fresh.length}
                selectedCount={library.selected.size}
                onToggleAll={() => library.toggleAll(fresh.map((c) => c.id))}
                onAddSelected={() => library.add([...library.selected])}
                onAddAll={() => library.add()}
                adding={library.adding}
                onRequestModule={library.requestModule}
                requesting={library.requesting}
              />
            )}

            {/* ---------- ძებნა და ჟანრი ---------- */}
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t('search.placeholder')}
                  className="pl-9"
                />
              </div>
              {genres.length > 0 && (
                <Select value={genre} onValueChange={setGenre}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_GENRES}>{t(ALL_CLASSIFIERS[meta?.classifier ?? 'genre'])}</SelectItem>
                    {genres.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {shareGenreName(g, lang)} · {g.count}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {firstPage && (
                <span className="text-xs text-muted-foreground">
                  {t('share.page.shown', { count: firstPage.meta.total })}
                </span>
              )}
            </div>

            {/* ---------- ბადე ---------- */}
            {list.isLoading ? (
              <div className="grid place-items-center py-16">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                className="my-10"
                title={t(term || genre !== ALL_GENRES ? 'share.page.noMatch' : 'share.page.emptySection')}
                actions={
                  (term || genre !== ALL_GENRES) && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setQ('')
                        setGenre(ALL_GENRES)
                      }}
                    >
                      {t('filter.clear')}
                    </Button>
                  )
                }
              />
            ) : (
              <div className={cn('grid gap-4 pb-10', shape.grid)}>
                {items.map((card) =>
                  card.domain === 'playlist' ? (
                    <SharePlaylistTile
                      key={`${card.domain}-${card.id}`}
                      card={card}
                      selectable={canAdd && !card.in_library}
                      selected={library.selected.has(card.id)}
                      onToggle={() => library.toggle(card.id)}
                      onOpen={() => setOpenPlaylist(card)}
                    />
                  ) : (
                    <ShareCardTile
                      key={`${card.domain}-${card.id}`}
                      card={card}
                      lang={lang}
                      aspect={shape.aspect}
                      selectable={canAdd && !card.in_library}
                      selected={library.selected.has(card.id)}
                      onToggle={() => library.toggle(card.id)}
                    />
                  ),
                )}
              </div>
            )}

            {openPlaylist && (
              <PlaylistPlayerDialog
                queryKey={['public-share-playlist', token, openPlaylist.id]}
                load={(page) => fetchSharePlaylist(token, openPlaylist.id, page)}
                playlist={openPlaylist}
                onClose={() => setOpenPlaylist(null)}
              />
            )}

            <Pagination className="pb-12" {...list.pagination} />
          </>
        )}
      </PageContainer>
    </div>
  )
}

/**
 * ერთი ბარათი — კადრი, სათაური, ქვესათაური, წელი, ჟანრები, სტატუსი, „უკვე გაქვს",
 * მონიშვნა და (ვიდეოს, სიმღერის, ბუკმარკისა და კურსის) წყაროს ბმული.
 *
 * ⚠️ **სტატუსი ორი ფორმითაა**: ლექსიკონიან სექციაზე ობიექტი (სახელი
 * მფლობელის ლექსიკონიდან), enum-იანზე (თამაში, წიგნი, ადგილი, კურსი) —
 * გასაღები, რომელიც i18n-ით ითარგმნება.
 */
function ShareCardTile({
  card,
  lang,
  aspect,
  selectable,
  selected,
  onToggle,
}: {
  card: ShareCard
  lang: 'ka' | 'en'
  aspect: string
  selectable: boolean
  selected: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const title = (lang === 'ka' ? card.title_ka : card.title_en) || card.title_en || card.title_ka || '—'
  const image = storageUrl(card.image)
  const genres = (card.genres ?? []).slice(0, 2)
  const status = card.status && typeof card.status === 'object' ? (card.status as Status) : null
  const enumStatus =
    typeof card.status === 'string' && card.domain in ENUM_STATUS_NS
      ? { domain: card.domain as EnumStatusDomain, key: card.status }
      : null

  const ratings = cardRatings(card)

  return (
    <div className="min-w-0" data-testid="share-card">
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-lg bg-muted',
          aspect,
          selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        )}
      >
        {image ? (
          <img src={image} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-xs text-muted-foreground">—</div>
        )}
        <InLibraryMark mine={card.in_library} />
        {selectable && <SelectBox title={title} selected={selected} onToggle={onToggle} />}
      </div>
      <div className="mt-2 min-w-0 space-y-1">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <span className="truncate" title={title}>
            {title}
          </span>
          {card.url && (
            <a
              href={card.url}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={t('share.page.openSource')}
              title={t('share.page.openSource')}
              className="shrink-0 text-muted-foreground hover:text-primary"
            >
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </p>
        {card.subtitle && <p className="truncate text-xs text-muted-foreground">{card.subtitle}</p>}
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {card.year && <span>{card.year}</span>}
          {/* მფლობელის ქულა ვარსკვლავით, მედიაზე TMDB-ის საშუალო ცალკე */}
          {ratings.mine != null && (
            <span className="inline-flex items-center gap-0.5 text-gold">
              <Star className="size-3 fill-current" aria-hidden="true" />
              {formatRating(ratings.mine)}
            </span>
          )}
          {ratings.average != null && <span title={t('rating.tmdbAverage')}>TMDB {ratings.average}</span>}
        </p>
        {genres.length > 0 && (
          <p className="truncate text-[11px] text-muted-foreground">
            {genres.map((g) => shareGenreName(g, lang)).join(' · ')}
          </p>
        )}
        {status && <StatusBadge status={status} />}
        {enumStatus && <EnumStatusBadge domain={enumStatus.domain} status={enumStatus.key} />}
      </div>
    </div>
  )
}

/**
 * **პლეილისტის ბარათი** — სახელი, სიმღერების რიცხვი, „უკვე გაქვს",
 * მონიშვნა; კადრზე დაჭერა მის სიმღერებს ხსნის.
 *
 * ⚠️ მონიშვნის ღილაკი გახსნის ღილაკის **გვერდით** დგას და არა შიგნით —
 * ღილაკში ღილაკი არასწორი HTML-ია და ერთი დაჭერა ორივეს გაუშვებდა.
 */
function SharePlaylistTile({
  card,
  selectable,
  selected,
  onToggle,
  onOpen,
}: {
  card: ShareCard
  selectable: boolean
  selected: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const title = card.title_en || card.title_ka || '—'

  return (
    <div className="min-w-0" data-testid="share-card">
      <div className={cn('relative rounded-lg', selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background')}>
        <button
          type="button"
          onClick={onOpen}
          aria-label={t('share.page.openPlaylist', { title })}
          className="group grid aspect-[2/3] w-full cursor-pointer place-items-center overflow-hidden rounded-lg border border-border bg-muted transition-colors hover:border-primary/50"
        >
          <span className="px-2 text-center">
            <ListMusic className="mx-auto size-8 text-muted-foreground transition-colors group-hover:text-primary" />
            <span className="mt-2 block text-xs text-muted-foreground">
              {t('playlists.songCount', { count: card.songs_count ?? 0 })}
            </span>
          </span>
        </button>
        <InLibraryMark mine={card.in_library} />
        {selectable && <SelectBox title={title} selected={selected} onToggle={onToggle} />}
      </div>
      <p className="mt-2 truncate text-sm font-medium" title={title}>
        {title}
      </p>
    </div>
  )
}

