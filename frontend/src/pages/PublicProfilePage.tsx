import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ExternalLink, Library, ListMusic, Loader2, Lock, MessageSquare, Star, User as UserIcon } from 'lucide-react'
import {
  fetchPublicItems,
  fetchPublicProfile,
  planProfileImport,
  type PublicCard,
  type PublicDomainKey,
} from '@/api/publicProfile'
import type { ShareDomainKey } from '@/api/shareLinks'
import { openConversation } from '@/api/chat'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { storageUrl } from '@/lib/api'
import { useContentLang } from '@/lib/settings'
import { cardRatings, formatRating } from '@/lib/rating'
import { PageContainer } from '@/components/ui/page'
import { Pagination } from '@/components/ui/pagination'
import { LIST_PAGE_SIZE, usePages } from '@/lib/paged'
import { Button } from '@/components/ui/button'
import { CutTabs } from '@/components/ui/cut-tabs'
import { ModuleIcon } from '@/components/ModuleIcon'
import { MatchPanel } from '@/components/MatchPanel'
import { PublicGalleryTab } from '@/components/PublicGalleryTab'
import { PublicPlaylistDialog } from '@/components/PublicPlaylistDialog'
import { PublicPersonalAlbumDialog, PublicPersonalAlbumTile } from '@/components/public-gallery/PublicPersonalAlbum'
import { InLibraryMark, SelectBox } from '@/components/share/ImportMarks'
import { LibraryImportBar } from '@/components/share/LibraryImportBar'
import { useLibraryImport } from '@/components/share/useLibraryImport'
import { InfoHint } from '@/components/ui/info-hint'
import { useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   საჯარო პროფილი `/u/{username}`.

   ⚠️ **ერთადერთი გვერდი `Protected`-ის გარეთ.** ავტორიზაციის გარეშეც იხსნება,
   რადგან „საჯარო პროფილი" გაზიარებად ბმულს ნიშნავს. მონაცემი ვიწროა:
   backend აქ ჩანაწერის სრულ რესურსს **არ** აბრუნებს (იხ. `PublicDomain::card()`).

   არასაჯარო პროფილი **404-ია და არა 403** — „ასეთი user არსებობს, უბრალოდ
   დამალულია" თვითონაც ინფორმაციაა.

   ⚠️ **შესულ უცხოს „ჩემს ბიბლიოთეკაში დამატება" აქვს** — გაზიარების ბმულის
   იგივე რიგი და ნიშნები (`LibraryImportBar`, „უკვე გაქვს ✓"), ფარგალი კი
   პროფილისაა. რომელი სექციიდან შეიძლება, სერვერი ამბობს (`viewer.sections`):
   გალერეა, პირადი გალერეა და პირადი მოდული მხოლოდ სანახავია — ასლი არ აქვთ.
   ============================================================ */

export function PublicProfilePage() {
  const { username = '' } = useParams()
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  /* „მიწერა": საუბარს backend ხსნის (არსებულს აბრუნებს, დუბლს არ ქმნის),
     ჩვენ მხოლოდ გადავდივართ. შეცდომა toast-ია — 409 „პროფილი საჯარო არაა",
     403 „დაბლოკილია". */
  const openChat = useMutation({
    mutationFn: () => openConversation(username),
    onSuccess: (id) => navigate(`/chat/${id}`),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const [domain, setDomain] = useState<PublicDomainKey | null>(null)
  // „ჩანაწერები" vs „დამთხვევები"; მეორე მხოლოდ შესულ სტუმარს აქვს
  const [view, setView] = useState<'records' | 'matches'>('records')
  // გახსნილი ფლეილისტი (მისი შიგთავსი და დაკვრა ფანჯარაშია)
  const [openPlaylist, setOpenPlaylist] = useState<PublicCard | null>(null)
  // პირადი გალერეის საჯარო ალბომი (ფოტო/ვიდეო ფანჯარაში)
  const [openPersonalAlbum, setOpenPersonalAlbum] = useState<PublicCard | null>(null)

  const profileQuery = useQuery({
    queryKey: ['public-profile', username],
    queryFn: () => fetchPublicProfile(username),
    retry: false,
  })

  const profile = profileQuery.data

  // პირველი ხილვადი დომენი ავტომატურად იხსნება
  useEffect(() => {
    if (profile && domain === null && profile.domains.length) {
      setDomain(profile.domains[0])
    }
  }, [profile, domain])

  /* გვერდზე 10: ნომრები + „მეტის ჩვენება"; ტაბის შეცვლა პირველ გვერდზე აბრუნებს.
     ⚠️ გალერეის ჩანართს **სხვა endpoint** ემსახურება — ბარათების წამოღება იქ ზედმეტია */
  const itemsQuery = usePages({
    queryKey: ['public-profile-items', username, domain],
    fetchPage: (page) =>
      fetchPublicItems(username, domain as PublicDomainKey, page, LIST_PAGE_SIZE).then((r) => ({
        ...r,
        items: r.data,
        total: r.meta.total,
        lastPage: r.meta.last_page,
      })),
    enabled: !!domain && domain !== 'gallery_album',
  })
  const items = itemsQuery.items

  // გადმოსატანი სექცია — მხოლოდ ის, რასაც სერვერი შესულ უცხოს სთავაზობს
  const section = domain ? profile?.viewer.sections[domain as ShareDomainKey] : undefined
  const library = useLibraryImport({
    source: { kind: 'profile', owner: username },
    domain: section ? (domain as ShareDomainKey) : null,
    lang,
    plan: (d, ids) => planProfileImport(username, d, ids),
    headKey: ['public-profile', username],
  })

  const switchDomain = (d: PublicDomainKey) => {
    setDomain(d)
    library.clear()
  }

  /**
   * ⚠️ დომენის ტონი და ხატულა **მოდულისაა** — იგივე, რასაც მფლობელი
   * ხედავს საიდბარში. `playlist` მოდული არ არის (სიმღერის შიგნითაა),
   * ე.ი. მისთვის არაფერი ბრუნდება და პასუხს `lib/cutStyle.ts` აგებს.
   */
  const domainIdentity = (d: PublicDomainKey) => {
    if (d === 'playlist') return {}

    const key = profile?.domain_modules[d]
    const m = key ? profile?.modules[key] : undefined

    return m
      ? {
          color: m.color,
          node: <ModuleIcon name={m.icon} className="size-4 text-[var(--mod)]" />,
        }
      : {}
  }

  const moduleLabel = useMemo(
    () => (d: PublicDomainKey) => {
      const key = profile?.domain_modules[d]
      const m = key ? profile?.modules[key] : undefined
      // `playlist` და `song` ერთ მოდულს ეკუთვნის — დომენს საკუთარი სახელი სჭირდება
      if (d === 'playlist') return t('playlists.title')
      return m ? (lang === 'ka' ? m.name_ka : m.name_en) : d
    },
    [profile, lang, t],
  )

  if (profileQuery.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (profileQuery.isError || !profile) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4">
        <div className="max-w-md text-center">
          <Lock className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold">{t('publicProfile.notFound')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('publicProfile.notFoundHint')}</p>
          <Link
            to={user ? '/' : '/login'}
            className="mt-6 inline-flex h-9 items-center rounded-md border border-border px-4 text-sm hover:bg-muted"
          >
            {t('publicProfile.goHome')}
          </Link>
        </div>
      </div>
    )
  }

  const avatar = storageUrl(profile.profile.avatar_path)
  // საკუთარ თავს არ ვედრებით — backend-იც 422 `cannot_match_self`-ს აბრუნებს
  const canMatch = !!user && user.username !== profile.profile.username
  // შესული უცხო — დამატების რიგი (ან ახსნა, რატომ არა) მას ეხება
  const stranger = profile.viewer.signed_in && !profile.viewer.own
  const canAdd = stranger && !!section?.can_create
  const fresh = items.filter((c) => !c.in_library)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageContainer width="wide">
        {/* ---------- თავი ---------- */}
        <header className="flex flex-wrap items-center gap-5 border-b border-border pb-7">
          <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-muted">
            {avatar ? (
              <img src={avatar} alt="" className="size-full object-cover" />
            ) : (
              <UserIcon className="size-9 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              {profile.profile.display_name}
            </h1>
            <p className="text-sm text-muted-foreground">@{profile.profile.username}</p>
            {profile.profile.bio && (
              <p className="mt-2 max-w-2xl text-sm text-foreground/80">{profile.profile.bio}</p>
            )}

            {/* ჩატის ბუნებრივი შესასვლელი. ⚠️ იმავე პირობაზე ჩანს,
                რაც დამთხვევები: შესული ვარ და ეს სხვისი პროფილია. */}
            {canMatch && (
              <Button
                size="sm"
                className="mt-3"
                disabled={openChat.isPending}
                onClick={() => openChat.mutate()}
              >
                {openChat.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MessageSquare className="size-4" />
                )}
                {t('chat.write')}
              </Button>
            )}
          </div>
        </header>

        {/* ---------- „ჩანაწერები" / „დამთხვევები" ----------
            შედარებას მეორე მხარე სჭირდება, ე.ი. ანონიმურ სტუმარს არ ეხება;
            საკუთარ თავთან შედარებაც უაზროა (backend-იც 422-ს აბრუნებს). */}
        {canMatch && (
          <div className="flex gap-2 pt-5">
            {(['records', 'matches'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  v === view ? 'bg-secondary font-medium' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {t(v === 'records' ? 'publicProfile.records' : 'matches.title')}
              </button>
            ))}
          </div>
        )}

        {canMatch && view === 'matches' ? (
          <div className="pt-5">
            <MatchPanel username={profile.profile.username} />
          </div>
        ) : profile.domains.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {t('publicProfile.nothingShared')}
          </p>
        ) : (
          <>
            {/* ---------- დომენების ტაბები რაოდენობებით ---------- */}
            <div className="py-5">
              <CutTabs
                options={profile.domains.map((d) => ({
                  key: d,
                  label: moduleLabel(d),
                  count: profile.counts[d] ?? 0,
                  ...domainIdentity(d),
                }))}
                value={domain ?? ''}
                onChange={(key) => switchDomain(key as PublicDomainKey)}
              />
            </div>

            {/* ---------- ჩემს ბიბლიოთეკაში დამატება (შესულ უცხოს) ---------- */}
            {stranger && domain && section && (
              <LibraryImportBar
                ability={section}
                sectionName={moduleLabel(domain)}
                hint={t('publicProfile.import.hint')}
                ownerStatus={section.owner_status}
                ownerStatusLabel={t('publicProfile.import.statusOwner')}
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
            {stranger && domain && !section && (
              <p className="mb-5 flex items-center gap-2 text-sm text-muted-foreground">
                <Library className="size-4" />
                {t('publicProfile.import.notCopyable')}
                <InfoHint info={t('publicProfile.import.notCopyableHint')} />
              </p>
            )}

            {/* ---------- ბადე ----------
                ⚠️ **გალერეის ჩანართი ბარათებს არ ხატავს**: მისი
                ჩანაწერი ალბომია (საქაღალდე), ჩვენება კი ფოტოებია — ბარათებად
                „3 ალბომი" ეწერებოდა იქ, სადაც ორასი ფოტოა. შიგნით
                მფლობელის გალერეის ჭრილებია; ბიბლიოთეკის დომენების სახელი და
                ფერი ამ პროფილის `modules`-იდან მოდის (სტუმარს `useModules()` არ აქვს). */}
            {domain === 'gallery_album' ? (
              <div className="pt-1">
                <PublicGalleryTab username={profile.profile.username} profile={profile} />
              </div>
            ) : itemsQuery.isLoading && items.length === 0 ? (
              <div className="grid place-items-center py-16">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                {t('publicProfile.emptyDomain')}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4 pb-10 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                {items.map((card) =>
                  card.domain === 'playlist' ? (
                    <PublicPlaylistTile
                      key={`${card.domain}-${card.id}`}
                      card={card}
                      selectable={canAdd && !card.in_library}
                      selected={library.selected.has(card.id)}
                      onToggle={() => library.toggle(card.id)}
                      onOpen={() => setOpenPlaylist(card)}
                    />
                  ) : card.domain === 'personal_album' ? (
                    <PublicPersonalAlbumTile
                      key={`${card.domain}-${card.id}`}
                      username={profile.profile.username}
                      card={card}
                      onOpen={() => setOpenPersonalAlbum(card)}
                    />
                  ) : (
                    <PublicCardTile
                      key={`${card.domain}-${card.id}`}
                      card={card}
                      lang={lang}
                      selectable={canAdd && !card.in_library}
                      selected={library.selected.has(card.id)}
                      onToggle={() => library.toggle(card.id)}
                    />
                  ),
                )}
              </div>
            )}

            {openPlaylist && (
              <PublicPlaylistDialog
                username={profile.profile.username}
                playlist={openPlaylist}
                onClose={() => setOpenPlaylist(null)}
              />
            )}

            {openPersonalAlbum && (
              <PublicPersonalAlbumDialog
                username={profile.profile.username}
                card={openPersonalAlbum}
                onClose={() => setOpenPersonalAlbum(null)}
              />
            )}

            {domain !== 'gallery_album' && <Pagination className="pb-12" {...itemsQuery.pagination} />}
          </>
        )}
      </PageContainer>
    </div>
  )
}

/**
 * **ფლეილისტის ბარათი იხსნება** — აქამდე ის მხოლოდ სახელსა და
 * რიცხვს ხატავდა და არაფერს აკეთებდა. შიგნით: სიმღერები რიგით, დაკვრა და
 * წყაროს ბმული (`PublicPlaylistDialog`).
 *
 * ⚠️ რიცხვი ყველა სტუმარს ერთნაირად ეწერება — შესულ უცხოს აქამდე „0" ჩანდა
 * (`PublicProfileService::query()`-ის `withCount`).
 */
function PublicPlaylistTile({
  card,
  selectable,
  selected,
  onToggle,
  onOpen,
}: {
  card: PublicCard
  selectable: boolean
  selected: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const title = card.title_en || card.title_ka || '—'

  // ⚠️ ნიშნები გახსნის ღილაკის **გვერდით** დგას და არა შიგნით (`ImportMarks`-ის წესი)
  return (
    <div className="relative min-w-0">
      <button type="button" onClick={onOpen} className="group block w-full cursor-pointer text-left">
        <div
          className={cn(
            'grid aspect-[2/3] w-full place-items-center overflow-hidden rounded-lg border border-border bg-muted transition-colors group-hover:border-primary/50',
            selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
          )}
        >
          <div className="px-2 text-center">
            <ListMusic className="mx-auto size-8 text-muted-foreground transition-colors group-hover:text-primary" />
            <p className="mt-2 text-xs text-muted-foreground">
              {t('playlists.songCount', { count: card.songs_count ?? 0 })}
            </p>
          </div>
        </div>
        <p className="mt-2 truncate text-sm font-medium" title={title}>
          {title}
        </p>
      </button>
      <InLibraryMark mine={card.in_library} />
      {selectable && <SelectBox title={title} selected={selected} onToggle={onToggle} />}
    </div>
  )
}

/** ერთი ბარათი — განზრახ მინიმალური: სათაური, ქვესათაური, ქულა (+ შესულ უცხოს „უკვე გაქვს" და მონიშვნა) */
function PublicCardTile({
  card,
  lang,
  selectable,
  selected,
  onToggle,
}: {
  card: PublicCard
  lang: 'ka' | 'en'
  selectable: boolean
  selected: boolean
  onToggle: () => void
}) {
  const title =
    (lang === 'ka' ? card.title_ka : card.title_en) ||
    card.title_en ||
    card.title_ka ||
    '—'

  const image = storageUrl(card.image)
  const subtitle = card.subtitle || (card.year ? String(card.year) : null)
  const ratings = cardRatings(card)

  const body = (
    <>
      <div
        className={cn(
          'aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted',
          selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        )}
      >
        {image ? (
          <img src={image} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-xs text-muted-foreground">—</div>
        )}
      </div>
      <div className="mt-2 min-w-0">
        <p className="truncate text-sm font-medium" title={title}>
          {title}
        </p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        {/* მფლობელის ქულა ვარსკვლავით, მედიაზე TMDB-ის საშუალო ცალკე */}
        {(ratings.mine != null || ratings.average != null) && (
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            {ratings.mine != null && (
              <span className="inline-flex items-center gap-1 text-gold">
                <Star className="size-3 fill-current" aria-hidden="true" />
                {formatRating(ratings.mine)}
              </span>
            )}
            {ratings.average != null && <span>TMDB {ratings.average}</span>}
          </p>
        )}
      </div>
    </>
  )

  // ⚠️ ნიშნები ბმულის **გარეთ** დგას (`ImportMarks`-ის წესი)
  const marks = (
    <>
      <InLibraryMark mine={card.in_library} />
      {selectable && <SelectBox title={title} selected={selected} onToggle={onToggle} />}
    </>
  )

  // ვიდეოსა და სიმღერას გარე ბმული აქვს — სწორედ იმისთვისაა გაზიარებული, რომ გაიხსნას
  if (card.url) {
    return (
      <div className="relative min-w-0">
        <a
          href={card.url}
          target="_blank"
          rel="noreferrer noopener"
          className="group block focus:outline-none"
        >
          {body}
          <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground group-hover:text-foreground">
            <ExternalLink className="size-3" />
          </span>
        </a>
        {marks}
      </div>
    )
  }

  return (
    <div className="relative min-w-0">
      {body}
      {marks}
    </div>
  )
}
