import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ExternalLink, Loader2, Lock, MessageSquare, Star, User as UserIcon } from 'lucide-react'
import {
  fetchPublicItems,
  fetchPublicProfile,
  type PublicCard,
  type PublicDomainKey,
} from '@/api/publicProfile'
import { openConversation } from '@/api/chat'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { storageUrl } from '@/lib/api'
import { useContentLang } from '@/lib/settings'
import { PageContainer } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { MatchPanel } from '@/components/MatchPanel'
import { useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   საჯარო პროფილი `/u/{username}` — Tasks §16.1.

   ⚠️ **ერთადერთი გვერდი `Protected`-ის გარეთ.** ავტორიზაციის გარეშეც იხსნება,
   რადგან „საჯარო პროფილი" გაზიარებად ბმულს ნიშნავს. მონაცემი ვიწროა:
   backend აქ ჩანაწერის სრულ რესურსს **არ** აბრუნებს (იხ. `PublicDomain::card()`).

   არასაჯარო პროფილი **404-ია და არა 403** — „ასეთი user არსებობს, უბრალოდ
   დამალულია" თვითონაც ინფორმაციაა.
   ============================================================ */

export function PublicProfilePage() {
  const { username = '' } = useParams()
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  /* §16.3 — „მიწერა": საუბარს backend ხსნის (არსებულს აბრუნებს, დუბლს არ ქმნის),
     ჩვენ მხოლოდ გადავდივართ. შეცდომა toast-ია — 409 „პროფილი საჯარო არაა",
     403 „დაბლოკილია". */
  const openChat = useMutation({
    mutationFn: () => openConversation(username),
    onSuccess: (id) => navigate(`/chat/${id}`),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const [domain, setDomain] = useState<PublicDomainKey | null>(null)
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<PublicCard[]>([])
  // §16.2 — „ჩანაწერები" vs „დამთხვევები"; მეორე მხოლოდ შესულ სტუმარს აქვს
  const [view, setView] = useState<'records' | 'matches'>('records')

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

  const itemsQuery = useQuery({
    queryKey: ['public-profile-items', username, domain, page],
    queryFn: () => fetchPublicItems(username, domain as PublicDomainKey, page),
    enabled: !!domain,
  })

  // გვერდები გროვდება („მეტის ჩვენება"), ტაბის შეცვლა კი სიას ანულებს
  useEffect(() => {
    if (!itemsQuery.data) return
    setItems((prev) =>
      itemsQuery.data.meta.current_page === 1
        ? itemsQuery.data.data
        : [...prev, ...itemsQuery.data.data],
    )
  }, [itemsQuery.data])

  const switchDomain = (d: PublicDomainKey) => {
    setDomain(d)
    setPage(1)
    setItems([])
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
  const hasMore = (itemsQuery.data?.meta.current_page ?? 1) < (itemsQuery.data?.meta.last_page ?? 1)

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

            {/* §16.3 — ჩატის ბუნებრივი შესასვლელი. ⚠️ იმავე პირობაზე ჩანს,
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

        {/* ---------- §16.2 — „ჩანაწერები" / „დამთხვევები" ----------
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
            <nav className="fb-scroll -mx-1 flex gap-2 overflow-x-auto py-5">
              {profile.domains.map((d) => (
                <Chip
                  key={d}
                  size="md"
                  active={d === domain}
                  onClick={() => switchDomain(d)}
                  count={profile.counts[d] ?? 0}
                >
                  {moduleLabel(d)}
                </Chip>
              ))}
            </nav>

            {/* ---------- ბადე ---------- */}
            {itemsQuery.isLoading && items.length === 0 ? (
              <div className="grid place-items-center py-16">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                {t('publicProfile.emptyDomain')}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4 pb-10 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                {items.map((card) => (
                  <PublicCardTile key={`${card.domain}-${card.id}`} card={card} lang={lang} />
                ))}
              </div>
            )}

            {hasMore && (
              <div className="flex justify-center pb-12">
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={itemsQuery.isFetching}
                >
                  {itemsQuery.isFetching && <Loader2 className="size-4 animate-spin" />}
                  {t('actions.loadMore')}
                </Button>
              </div>
            )}
          </>
        )}
      </PageContainer>
    </div>
  )
}

/** ერთი ბარათი — განზრახ მინიმალური: სათაური, ქვესათაური, ქულა */
function PublicCardTile({ card, lang }: { card: PublicCard; lang: 'ka' | 'en' }) {
  const title =
    (lang === 'ka' ? card.title_ka : card.title_en) ||
    card.title_en ||
    card.title_ka ||
    '—'

  const image = storageUrl(card.image)
  const subtitle = card.subtitle || (card.year ? String(card.year) : null)

  const body = (
    <>
      <div className="aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted">
        {image ? (
          <img src={image} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-xs text-muted-foreground">
            {card.songs_count !== undefined ? `${card.songs_count}` : '—'}
          </div>
        )}
      </div>
      <div className="mt-2 min-w-0">
        <p className="truncate text-sm font-medium" title={title}>
          {title}
        </p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        {card.rating != null && (
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="size-3 fill-current" />
            {card.rating}
          </p>
        )}
      </div>
    </>
  )

  // ვიდეოსა და სიმღერას გარე ბმული აქვს — სწორედ იმისთვისაა გაზიარებული, რომ გაიხსნას
  if (card.url) {
    return (
      <a
        href={card.url}
        target="_blank"
        rel="noreferrer noopener"
        className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
        <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground group-hover:text-foreground">
          <ExternalLink className="size-3" />
        </span>
      </a>
    )
  }

  return <div>{body}</div>
}
