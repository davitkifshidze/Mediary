import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ImageOff, ListMusic, Loader2, Search, Users } from 'lucide-react'
import { globalSearch, type SearchGroup, type SearchItem } from '@/api/search'
import { storageUrl } from '@/lib/api'
import { moduleName, useModules } from '@/lib/modules'
import { highlightParts, resultPath } from '@/lib/searchResults'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { CutTabs } from '@/components/ui/cut-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { ModuleIcon } from '@/components/ModuleIcon'

/* ============================================================
   ძებნის გვერდი — `/search?q=`.

   ⚠️ **ჩამოსაშლელი სია ამას ვერ ცვლის და პირიქითაც.** ჰედერის სია
   „პირდაპირ გადასვლისთვისაა" (თითო დომენიდან სამიოდე სტრიქონი); ეს გვერდი
   კი პასუხობს „სად და რა კონტექსტში ვახსენე ეს სიტყვა" — ყველა დომენი,
   თითოეული ჩანაწერის **ნაჭრებით** და დომენის ღრმა სიით.

   ⚠️ **ორი მოთხოვნა და არა ერთი.** მიმოხილვა (ყველა დომენი, თითო რამდენიმე)
   ჩიპებისთვისაც საჭიროა — ე.ი. დომენის არჩევის შემდეგაც უნდა ჩანდეს
   „სხვაგან რამდენია". ერთი მოთხოვნით არჩეული დომენის მიღმა ყველა რიცხვი
   გაქრებოდა.

   ⚠️ **ნაჭერს სერვერი აბრუნებს, ხაზგასმას კი ბრაუზერი** — `highlightParts()`
   სუფთა ტექსტს ჭრის, ე.ი. ნედლი HTML არსად არ ჩნდება.
   ============================================================ */

/** მიმოხილვაში თითო დომენიდან რამდენი ჩანს */
const OVERVIEW_PER_GROUP = 5

/** ერთ დომენში „მეტის ჩვენების" ბიჯი (სერვერის ჭერი 100-ია) */
const DEEP_STEP = 25

const DEEP_MAX = 100

/** დომენები, რომლებიც მოდულები **არ** არიან — მათ სახელს i18n იძლევა */
const OWN_LABEL = ['cast', 'playlist', 'gallery']

/** აკრეფის დასრულების ლოდინი — სექციების ძებნის იგივე რიტმი */
const DEBOUNCE_MS = 350

export function SearchPage() {
  const { t, i18n } = useTranslation()
  const { enabled: modules } = useModules()
  const [params, setParams] = useSearchParams()

  const q = (params.get('q') ?? '').trim()
  const domain = params.get('domain')

  const [term, setTerm] = useState(params.get('q') ?? '')
  const [limit, setLimit] = useState(DEEP_STEP)

  /* აკრეფა მისამართში ჯდება — „უკან", გაზიარებული ბმული და ჰედერის ველი
     ერთსა და იმავეს უნდა ხედავდნენ */
  useEffect(() => {
    const timer = setTimeout(() => {
      if (term.trim() === q) return
      const next = new URLSearchParams(params)
      if (term.trim()) next.set('q', term.trim())
      else next.delete('q')
      // სხვა სიტყვაზე დომენის ფილტრი აზრს კარგავს
      next.delete('domain')
      setParams(next, { replace: true })
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term])

  // მისამართის გარედან შეცვლა (ჰედერიდან მოსვლა) ველშიც უნდა აისახოს
  useEffect(() => {
    setTerm((current) => (current.trim() === q ? current : q))
  }, [q])

  useEffect(() => setLimit(DEEP_STEP), [domain, q])

  const overview = useQuery({
    queryKey: ['global-search', q, 'overview'],
    queryFn: ({ signal }) => globalSearch(q, { perModule: OVERVIEW_PER_GROUP, signal }),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
  })

  const deep = useQuery({
    queryKey: ['global-search', q, domain, limit],
    queryFn: ({ signal }) => globalSearch(q, { perModule: limit, domain: domain!, signal }),
    enabled: q.length >= 2 && !!domain,
    placeholderData: keepPreviousData,
  })

  const groups = domain ? (deep.data?.groups ?? []) : (overview.data?.groups ?? [])
  const total = overview.data?.total ?? 0
  const loading = overview.isFetching || deep.isFetching

  const setDomain = (key: string | null) => {
    const next = new URLSearchParams(params)
    if (key) next.set('domain', key)
    else next.delete('domain')
    setParams(next, { replace: true })
  }

  const routes = useMemo(
    () => Object.fromEntries(modules.map((m) => [m.key, m.route_base])),
    [modules],
  )

  /**
   * ⚠️ **სამი დომენი მოდული არ არის** (`cast` გლობალური ლექსიკონია,
   * `playlist` სიმღერის შიგნითაა), ე.ი. `modules.color` მათ ვერ უპასუხებს.
   * ასეთ დროს არც `color` ბრუნდება და არც `node` — და ბარათი ტონსა და
   * ხატულას `lib/cutStyle.ts`-იდან იღებს.
   */
  const cutIdentity = (group: SearchGroup) => {
    const found = modules.find((m) => m.key === group.module)

    return found
      ? {
          color: found.color ?? null,
          node: <ModuleIcon name={found.icon} className="size-4 text-[var(--mod)]" />,
        }
      : {}
  }

  const labelOf = (group: SearchGroup) => {
    if (OWN_LABEL.includes(group.key)) return t(`search.group.${group.key}`)
    const found = modules.find((m) => m.key === group.module)

    return found ? moduleName(found, i18n.language) : group.key
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('search.title')}
        subtitle={q.length >= 2 ? t('search.found', { count: total }) : t('search.hint')}
      />

      <div className="relative mb-5 max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t('search.placeholder')}
          aria-label={t('search.placeholder')}
          className="h-11 pl-9 text-base"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* ⚠️ ჩიპები **მიმოხილვიდან** იწერება, ე.ი. არჩეული დომენის მიღმაც
          ჩანს, სად რამდენი შედეგია */}
      {(overview.data?.groups.length ?? 0) > 1 && (
        <div className="mb-5">
          <CutTabs
            options={[
              { key: 'all', label: t('search.allDomains'), count: total },
              ...(overview.data?.groups ?? []).map((g) => ({
                key: g.key,
                label: labelOf(g),
                count: g.total,
                ...cutIdentity(g),
              })),
            ]}
            value={domain ?? 'all'}
            onChange={(key) => setDomain(key === 'all' ? null : key)}
          />
        </div>
      )}

      {q.length < 2 && (
        <EmptyState
          icon={<Search className="size-6" />}
          title={t('search.title')}
          hint={t('search.hint')}
        />
      )}

      {q.length >= 2 && !loading && groups.length === 0 && (
        <EmptyState
          icon={<Search className="size-6" />}
          title={t('search.empty', { query: q })}
          hint={t('search.emptyHint')}
        />
      )}

      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.key}>
            <div className="mb-2 flex items-center gap-2">
              <GroupIcon group={group} />
              <h2 className="font-display text-base font-semibold">{labelOf(group)}</h2>
              <span className="text-sm tabular-nums text-muted-foreground">{group.total}</span>
            </div>

            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {group.items.map((item) => (
                <ResultRow key={`${item.domain}-${item.id}`} item={item} term={q} base={routes[item.module ?? '']} />
              ))}
            </ul>

            {group.total > group.items.length && (
              <div className="mt-2">
                {!domain ? (
                  <Button variant="outline" size="sm" onClick={() => setDomain(group.key)}>
                    {t('search.showAllIn', { name: labelOf(group), count: group.total })}
                  </Button>
                ) : group.items.length < DEEP_MAX ? (
                  <Button variant="outline" size="sm" onClick={() => setLimit((l) => Math.min(l + DEEP_STEP, DEEP_MAX))}>
                    {t('list.showMore')}
                  </Button>
                ) : (
                  /* ⚠️ ჭერზე მისული სია სექციაში გრძელდება — ეს გვერდი
                     ბიბლიოთეკის სრული სიის შემცვლელი არაა */
                  <p className="text-sm text-muted-foreground">{t('search.capped', { count: DEEP_MAX })}</p>
                )}
              </div>
            )}
          </section>
        ))}
      </div>
    </PageContainer>
  )
}

/* ---------- ერთი შედეგი ---------- */

function ResultRow({ item, term, base }: { item: SearchItem; term: string; base?: string }) {
  const { t } = useTranslation()
  const to = resultPath(item, base)
  const image = item.image ? storageUrl(item.image) : item.image_url

  const body = (
    <div className="flex gap-3 px-3 py-2.5">
      <span className="grid h-14 w-10 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
        {image ? (
          <img src={image} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <ImageOff className="size-4 text-muted-foreground" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">{item.title}</span>
          {item.subtitle && (
            <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>
          )}
        </div>

        {/* ⚠️ **ნაჭერი შედეგის მთავარი ნაწილია** — ის ამბობს *რატომ* მოვიდა
            ეს ჩანაწერი; სათაურების სია ამ კითხვას პასუხგაუცემელს ტოვებდა */}
        <ul className="mt-1 space-y-0.5">
          {item.matches.map((m, i) => (
            <li key={`${m.field}-${i}`} className="flex gap-1.5 text-xs leading-relaxed">
              <span className="shrink-0 rounded-md bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
                {t(`search.field.${m.field}`)}
              </span>
              <span className="min-w-0 text-muted-foreground">
                {highlightParts(m.text, term).map((p, k) => (
                  <span key={k} className={cn(p.hit && 'rounded-sm bg-primary/20 font-medium text-foreground')}>
                    {p.text}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )

  if (!to) return <li>{body}</li>

  return (
    <li>
      <Link to={to} className="block transition-colors hover:bg-muted/60">
        {body}
      </Link>
    </li>
  )
}

function GroupIcon({ group }: { group: SearchGroup }) {
  const { enabled: modules } = useModules()

  if (group.key === 'cast') return <Users className="size-4 text-muted-foreground" />
  if (group.key === 'playlist') return <ListMusic className="size-4 text-muted-foreground" />

  const found = modules.find((m) => m.key === group.module)
  if (!found) return <Search className="size-4 text-muted-foreground" />

  /* ⚠️ ფერი inline `style`-ითაა: მნიშვნელობა ბაზიდან მოდის, ე.ი.
     `text-[#7073ff]` კომპილაციისას არ არსებობს და Tailwind მას ვერ
     დააგენერირებდა (საიდბარის იგივე წესი). */
  return (
    <span style={found.color ? { color: found.color } : undefined} className="flex">
      <ModuleIcon name={found.icon} className="size-4" />
    </span>
  )
}
