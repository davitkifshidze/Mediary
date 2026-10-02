import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarClock,
  Check,
  CheckSquare,
  Library,
  Link2Off,
  Loader2,
  LogIn,
  Search,
  Send,
  Star,
  Trash2,
  User as UserIcon,
  UserPlus,
} from 'lucide-react'
import {
  fetchPublicShare,
  fetchPublicShareItems,
  planShareImport,
  type ShareCard,
  type ShareDomainKey,
  type SharePlanItem,
  type ShareStatusMode,
} from '@/api/shareLinks'
import { requestModule } from '@/api/account'
import type { Status } from '@/api/types'
import { storageUrl } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useDateFormat } from '@/lib/dates'
import { errorMessage, isApiCode } from '@/lib/errors'
import { useContentLang } from '@/lib/settings'
import { genreName } from '@/lib/display'
import { PageContainer } from '@/components/ui/page'
import { Button, buttonVariants } from '@/components/ui/button'
import { CutTabs } from '@/components/ui/cut-tabs'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { InfoHint } from '@/components/ui/info-hint'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/feedback'
import { useQueue } from '@/components/ui/queue'
import { ModuleIcon } from '@/components/ModuleIcon'
import { StatusBadge } from '@/components/StatusBadge'
import { cn } from '@/lib/utils'

/* ============================================================
   **გაზიარების ბმულის გვერდი — `/share/:token`** (Tasks §40.6, §40.8).

   ⚠️ **`Protected`-ის გარეთ დგას** (Q46): ბმულით ნახვა შესვლის გარეშეც
   შეიძლება — `/u/:username`-ის ყალიბი. ანონიმს „შესვლა / რეგისტრაცია"
   ეწერება, რომელიც **ისევ აქ აბრუნებს** (`state.from`).

   ⚠️ **ბიბლიოთეკაში დამატება მხოლოდ შესულს** (Q46): ბარათების მონიშვნა ან
   „ყველა ახალი" → გეგმა (`POST /shares/{token}/plan` — გარე წყაროს არ
   ეკითხება) → რიგი (`share` სახეობა, თითო ჩანაწერი ცალკე). ⚠️ მოდულის
   უქონელს ცარიელი ღილაკი ან 403 არ ხვდება — სექციაზე წერია, რომ მოდული
   არ აქვს, და იქვე მოთხოვნის ღილაკია. `ModulesProvider` ამ გვერდს არ ფარავს
   (ის `Protected`-შია), ამიტომ ეს ცოდნა სერვერიდან მოდის (`viewer.sections`).

   ⚠️ **სია `useInfiniteQuery`-ია** და არა ხელით დაგროვებული გვერდები:
   დამატების შემდეგ „უკვე გაქვს ✓" ყველა ჩატვირთულ გვერდზე უნდა განახლდეს,
   ხელით დაგროვება კი ხელახლა ჩამოტვირთულ გვერდს მეორედ დაურთავდა.
   ============================================================ */

const ALL_GENRES = '__all__'

export function SharePage() {
  const { token = '' } = useParams()
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { user } = useAuth()
  const location = useLocation()
  const { date } = useDateFormat()
  const { toast } = useToast()
  const qc = useQueryClient()
  const { enqueueShare } = useQueue()

  const [domain, setDomain] = useState<ShareDomainKey | null>(null)
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [genre, setGenre] = useState(ALL_GENRES)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [statusMode, setStatusMode] = useState<ShareStatusMode>('default')
  const [adding, setAdding] = useState(false)

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

  const list = useInfiniteQuery({
    queryKey: ['public-share-items', token, domain, term, genre],
    queryFn: ({ pageParam }) =>
      fetchPublicShareItems(token, domain as ShareDomainKey, {
        page: pageParam,
        q: term || undefined,
        genre: genre === ALL_GENRES ? undefined : genre,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined),
    enabled: !!domain,
    refetchOnWindowFocus: false,
  })

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.data) ?? [], [list.data])
  const firstPage = list.data?.pages[0]

  const switchDomain = (next: string) => {
    setDomain(next as ShareDomainKey)
    setGenre(ALL_GENRES)
    setQ('')
    setTerm('')
    setSelected(new Set())
  }

  const ability = domain ? share?.viewer.sections[domain] : undefined
  const canAdd = !!share && share.viewer.signed_in && !share.viewer.own && !!ability?.can_create
  const fresh = items.filter((c) => !c.in_library)

  const toggle = (id: number) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const titleOf = (i: Pick<SharePlanItem, 'title_ka' | 'title_en' | 'year' | 'id'>) => {
    const title = (lang === 'ka' ? i.title_ka : i.title_en) || i.title_en || i.title_ka || `#${i.id}`
    return i.year ? `${title} (${i.year})` : title
  }

  /**
   * დამატება: ჯერ გეგმა (რომელი უკვე გაქვს), მერე რიგი.
   * ⚠️ **ურნაში მყოფიც რიგში მიდის** — სერვერი 409-ს აბრუნებს და რიგის მწკრივი
   * „აღდგენას" სთავაზობს (40.1); „უკვე გაქვს" კი არ მიდის — იქ საქმე არაფერია.
   */
  const add = async (ids?: number[]) => {
    if (!domain) return
    setAdding(true)

    try {
      const plan = await planShareImport(token, domain, ids)
      const queue = plan.items.filter((i) => i.state !== 'have')

      if (queue.length) {
        enqueueShare(
          token,
          domain,
          queue.map((i) => ({ id: i.id, title: titleOf(i) })),
          statusMode,
        )
      }

      toast({
        title: plan.counts.new > 0 ? t('share.page.queued', { count: plan.counts.new }) : t('share.page.nothingNew'),
        description:
          [
            plan.counts.have > 0 && t('share.summary.have', { count: plan.counts.have }),
            plan.counts.trash > 0 && t('share.summary.trash', { count: plan.counts.trash }),
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
        variant: plan.counts.new > 0 ? 'success' : 'info',
      })
      setSelected(new Set())
    } catch (e) {
      toast({ title: errorMessage(e), variant: 'error' })
    } finally {
      setAdding(false)
    }
  }

  const askModule = useMutation({
    mutationFn: (key: string) => requestModule(key),
    onSuccess: () => {
      toast({ title: t('share.page.requested'), variant: 'success' })
      qc.invalidateQueries({ queryKey: ['public-share', token] })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

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
  const moduleOf = (d: ShareDomainKey) => share.modules[d]
  const sectionName = (d: ShareDomainKey) => {
    const m = moduleOf(d)
    return m ? (lang === 'ka' ? m.name_ka : m.name_en) : d
  }
  const genres = firstPage?.genres ?? []

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
                      ? { color: m.color, node: <ModuleIcon name={m.icon} className="size-4 text-[var(--mod)]" /> }
                      : {}),
                  }
                })}
                value={domain ?? ''}
                onChange={switchDomain}
              />
            </div>

            {/* ---------- ბიბლიოთეკაში დამატება (შესულ უცხოს) ---------- */}
            {domain && share.viewer.signed_in && !share.viewer.own && ability && !ability.enabled && (
              <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                <p className="min-w-0 flex-1 text-sm">
                  {t('share.page.noModule', { module: sectionName(domain) })}
                </p>
                <Button
                  size="sm"
                  disabled={ability.requested || askModule.isPending}
                  onClick={() => askModule.mutate(domain)}
                >
                  <Send className="size-4" />
                  {t(ability.requested ? 'share.page.requestSent' : 'share.page.requestModule')}
                </Button>
              </div>
            )}

            {domain && share.viewer.signed_in && !share.viewer.own && ability?.enabled && !ability.can_create && (
              <p className="mb-5 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                {t('share.page.noCreateRight', { module: sectionName(domain) })}
              </p>
            )}

            {canAdd && (
              <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
                <Library className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t('share.page.addTitle')}</span>
                <InfoHint info={t('share.page.addHint')} />
                <div className="flex-1" />
                {share.link.show_status && (
                  <Select value={statusMode} onValueChange={(v) => setStatusMode(v as ShareStatusMode)}>
                    <SelectTrigger className="w-60" aria-label={t('share.page.statusMode')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">{t('share.page.statusDefault')}</SelectItem>
                      <SelectItem value="owner">{t('share.page.statusOwner')}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {fresh.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setSelected(selected.size === fresh.length ? new Set() : new Set(fresh.map((c) => c.id)))
                    }
                  >
                    <CheckSquare className="size-4" />
                    {t(selected.size === fresh.length ? 'share.page.unselectAll' : 'share.page.selectNew')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selected.size === 0 || adding}
                  onClick={() => add([...selected])}
                >
                  {t('share.page.addSelected', { count: selected.size })}
                </Button>
                <Button size="sm" disabled={adding} onClick={() => add()}>
                  {adding ? <Loader2 className="size-4 animate-spin" /> : <Library className="size-4" />}
                  {t('share.page.addAllNew')}
                </Button>
              </div>
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
                    <SelectItem value={ALL_GENRES}>{t('share.page.allGenres')}</SelectItem>
                    {genres.map((g) => (
                      <SelectItem key={g.slug} value={g.slug}>
                        {genreName(g, lang)} · {g.count}
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
              <div className="grid grid-cols-2 gap-4 pb-10 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                {items.map((card) => (
                  <ShareCardTile
                    key={`${card.domain}-${card.id}`}
                    card={card}
                    lang={lang}
                    selectable={canAdd && !card.in_library}
                    selected={selected.has(card.id)}
                    onToggle={() => toggle(card.id)}
                  />
                ))}
              </div>
            )}

            {list.hasNextPage && (
              <div className="flex justify-center pb-12">
                <Button variant="outline" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                  {list.isFetchingNextPage && <Loader2 className="size-4 animate-spin" />}
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

/** ერთი ბარათი — პოსტერი, სათაური, წელი, ჟანრები, სტატუსი, „უკვე გაქვს", მონიშვნა */
function ShareCardTile({
  card,
  lang,
  selectable,
  selected,
  onToggle,
}: {
  card: ShareCard
  lang: 'ka' | 'en'
  selectable: boolean
  selected: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const title = (lang === 'ka' ? card.title_ka : card.title_en) || card.title_en || card.title_ka || '—'
  const image = storageUrl(card.image)
  const genres = (card.genres ?? []).slice(0, 2)
  const status = card.status && typeof card.status === 'object' ? (card.status as Status) : null

  return (
    <div className="min-w-0" data-testid="share-card">
      <div
        className={cn(
          'relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted',
          selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        )}
      >
        {image ? (
          <img src={image} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-xs text-muted-foreground">—</div>
        )}
        {card.in_library && (
          <span
            className={cn(
              'absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium shadow',
              card.in_library.trashed ? 'bg-background/90 text-muted-foreground' : 'bg-status-watched text-white',
            )}
          >
            {card.in_library.trashed ? <Trash2 className="size-3" /> : <Check className="size-3" />}
            {t(card.in_library.trashed ? 'share.page.inTrash' : 'share.page.inLibrary')}
          </span>
        )}
        {selectable && (
          <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            aria-label={t('share.page.select', { title })}
            onClick={onToggle}
            className={cn(
              'absolute right-1.5 top-1.5 grid size-6 cursor-pointer place-items-center rounded-md border shadow',
              selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background/90',
            )}
          >
            {selected && <Check className="size-4" />}
          </button>
        )}
      </div>
      <div className="mt-2 min-w-0 space-y-1">
        <p className="truncate text-sm font-medium" title={title}>
          {title}
        </p>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {card.year && <span>{card.year}</span>}
          {card.rating != null && (
            <span className="inline-flex items-center gap-0.5">
              <Star className="size-3 fill-current" />
              {card.rating}
            </span>
          )}
        </p>
        {genres.length > 0 && (
          <p className="truncate text-[11px] text-muted-foreground">{genres.map((g) => genreName(g, lang)).join(' · ')}</p>
        )}
        {status && <StatusBadge status={status} />}
      </div>
    </div>
  )
}
