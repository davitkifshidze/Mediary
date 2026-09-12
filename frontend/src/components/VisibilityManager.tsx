import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Globe, Loader2, Lock, Search } from 'lucide-react'
import {
  DOMAIN_MODULE,
  PUBLIC_DOMAINS,
  fetchVisibilityList,
  setDomainVisibility,
  setRecordVisibility,
  type PublicDomainKey,
  type Visibility,
  type VisibilityCard,
} from '@/api/publicProfile'
import { useAuth } from '@/lib/auth'
import { useContentLang } from '@/lib/settings'
import { errorMessage } from '@/lib/errors'
import { moduleName, useModules } from '@/lib/modules'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   **ხილვადობის მესამე ფენა — ერთ ადგილას (Tasks §6.1).**

   ადრე „პირადი/საჯარო" **თითო ჩანაწერის შიგნით** იჯდა, ე.ი. ასი ფილმის
   გასაჯაროება ასჯერ გვერდის გახსნას ნიშნავდა და „რა მაქვს საჯარო" კითხვას
   პასუხი არ ჰქონდა. ახლა სამივე ფენა ერთ ბარათშია: პროფილი → მოდული →
   **ჩანაწერები** (აქ).

   ⚠️ **ჩანაწერის გვერდიდან გადამრთველი მოხსნილია** (`VisibilityToggle`
   აღარ ერთვის) — ორი ადგილი ერთსა და იმავე ფაქტს მართავდა და „სად არის ეს
   პარამეტრი" ყოველ ჯერზე ხელახლა უნდა გამოგეცნო. `VisibilityBadge` რჩება:
   ის მხოლოდ **აჩვენებს** მდგომარეობას და არ ცვლის.

   ⚠️ **„ყველა" ცხადი სკოუპია** და არა „ცარიელი მონიშვნა" — `/purge`-ის იგივე
   წესი. ორივე მასობრივი მოქმედება დასტურს ითხოვს.
   ============================================================ */

const PER_PAGE = 24

export function VisibilityManager() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { can } = useAuth()
  const { enabled } = useModules()
  const lang = useContentLang(i18n.language)

  const [domain, setDomain] = useState<PublicDomainKey | null>(null)
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [only, setOnly] = useState<'all' | Visibility>('all')
  const [page, setPage] = useState(1)
  const [picked, setPicked] = useState<number[]>([])

  /**
   * რომელი დომენი ჩანს: **ჩართული და გასაჯაროებადი** მოდულის დომენები.
   * ⚠️ `note` `PUBLIC_DOMAINS`-ში საერთოდ არ არის (§16.5), ე.ი. აქაც ვერ
   * გამოჩნდება — ერთი წყარო, ორი ადგილას გამეორების გარეშე.
   */
  const domains = useMemo(
    () =>
      PUBLIC_DOMAINS.filter((d) => {
        const key = DOMAIN_MODULE[d]
        const module = enabled.find((m) => m.key === key)
        return !!module?.shareable && can(key, 'view')
      }),
    [enabled, can],
  )

  useEffect(() => {
    if (domain === null && domains.length) setDomain(domains[0])
  }, [domains, domain])

  const domainLabel = (d: PublicDomainKey) => {
    // `playlist` და `song` ერთ მოდულს ეკუთვნის — დომენს საკუთარი სახელი სჭირდება
    if (d === 'playlist') return t('playlists.title')
    const module = enabled.find((m) => m.key === DOMAIN_MODULE[d])
    return module ? moduleName(module, i18n.language) : d
  }

  const listQ = useQuery({
    queryKey: ['visibility-list', domain, term, only, page],
    queryFn: () =>
      fetchVisibilityList(domain as PublicDomainKey, {
        q: term || undefined,
        only,
        page,
        per_page: PER_PAGE,
      }),
    enabled: !!domain,
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['visibility-list'] })
    // ბარათებზე ბეჯი ჩანს — მოდულის სიაც უნდა განახლდეს
    if (domain) qc.invalidateQueries({ queryKey: [domain] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const one = useMutation({
    mutationFn: ({ id, visibility }: { id: number; visibility: Visibility }) =>
      setRecordVisibility(domain as PublicDomainKey, id, visibility),
    onSuccess: (v) => {
      refresh()
      toast({
        title: v === 'public' ? t('visibility.nowPublic') : t('visibility.nowPrivate'),
        variant: 'success',
      })
    },
    onError: fail,
  })

  const many = useMutation({
    mutationFn: ({
      visibility,
      scope,
    }: {
      visibility: Visibility
      scope: { ids: number[] } | { all: true }
    }) => setDomainVisibility(domain as PublicDomainKey, visibility, scope),
    onSuccess: (updated) => {
      setPicked([])
      refresh()
      toast({ title: t('visibility.bulkDone', { count: updated }), variant: 'success' })
    },
    onError: fail,
  })

  const askMany = async (visibility: Visibility, all: boolean) => {
    const count = all ? (listQ.data?.meta.total ?? 0) : picked.length
    const ok = await confirm({
      title: visibility === 'public' ? t('visibility.bulkPublic') : t('visibility.bulkPrivate'),
      description: t(all ? 'visibility.bulkAllHint' : 'visibility.bulkSelectedHint', {
        count,
        name: domain ? domainLabel(domain) : '',
      }),
      confirmText: t('confirm.confirm'),
      variant: visibility === 'public' ? 'default' : 'destructive',
    })
    if (ok) many.mutate({ visibility, scope: all ? { all: true } : { ids: picked } })
  }

  const search = (e: React.FormEvent) => {
    e.preventDefault()
    setTerm(q.trim())
    setPage(1)
  }

  const switchDomain = (d: PublicDomainKey) => {
    setDomain(d)
    setPage(1)
    setPicked([])
    setQ('')
    setTerm('')
  }

  if (!domains.length) {
    return (
      <p className="mt-4 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        {t('publicProfile.noShareable')}
      </p>
    )
  }

  const rows = listQ.data?.data ?? []
  const meta = listQ.data?.meta
  const busy = one.isPending || many.isPending
  const canEdit = !!domain && can(DOMAIN_MODULE[domain], 'update')

  const title = (card: VisibilityCard) =>
    (lang === 'ka' ? card.title_ka : card.title_en) ||
    card.title_en ||
    card.title_ka ||
    `#${card.id}`

  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const allPicked = rows.length > 0 && rows.every((r) => picked.includes(r.id))

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="text-sm font-medium">{t('visibility.manageTitle')}</div>
      <p className="mt-0.5 mb-3 text-xs text-muted-foreground">{t('visibility.manageHint')}</p>

      {/* ---------- დომენები ---------- */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {domains.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => switchDomain(d)}
            className={cn(
              'cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors',
              d === domain
                ? 'border-primary bg-secondary text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {domainLabel(d)}
          </button>
        ))}
      </div>

      {/* ---------- ძებნა + ჭრილი ---------- */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form onSubmit={search} className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('visibility.searchPlaceholder')}
            className="h-9 pl-8"
          />
        </form>

        <span className="flex flex-wrap gap-1.5">
          {(['all', 'public', 'private'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setOnly(v)
                setPage(1)
              }}
              className={cn(
                'cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors',
                only === v
                  ? 'border-primary bg-secondary text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {v === 'all' ? t('filter.all') : t(`visibility.${v}`)}
              {meta && v !== 'all' && <span className="ml-1 opacity-60">{meta[v]}</span>}
            </button>
          ))}
        </span>
      </div>

      {/* ---------- მასობრივი მოქმედებები ---------- */}
      {canEdit && !!rows.length && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setPicked((p) =>
                allPicked ? p.filter((id) => !rows.some((r) => r.id === id)) : [...new Set([...p, ...rows.map((r) => r.id)])],
              )
            }
          >
            {allPicked ? t('storage.selectNone') : t('storage.selectShown', { count: rows.length })}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t('visibility.selected', { count: picked.length })}
          </span>

          <span className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={busy || !picked.length} onClick={() => askMany('public', false)}>
              <Globe className="size-4" />
              {t('visibility.makePublic')}
            </Button>
            <Button variant="outline" size="sm" disabled={busy || !picked.length} onClick={() => askMany('private', false)}>
              <Lock className="size-4" />
              {t('visibility.makePrivate')}
            </Button>
            {/* ⚠️ „ყველა" = **მთელი დომენი** და არა ნაჩვენები გვერდი */}
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => askMany('public', true)}>
              {t('visibility.allPublic', { count: meta?.total ?? 0 })}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => askMany('private', true)}>
              {t('visibility.allPrivate', { count: meta?.total ?? 0 })}
            </Button>
          </span>
        </div>
      )}

      {/* ---------- სია ---------- */}
      {listQ.isLoading ? (
        <div className="h-10 animate-pulse rounded-md bg-muted" />
      ) : !rows.length ? (
        <p className="text-sm text-muted-foreground">{t('visibility.empty')}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((card) => (
            <li
              key={card.id}
              className={cn(
                'flex flex-wrap items-center gap-2.5 rounded-lg border px-3 py-2',
                picked.includes(card.id) ? 'border-primary bg-primary/5' : 'border-border',
              )}
            >
              {canEdit && (
                <Checkbox
                  checked={picked.includes(card.id)}
                  onCheckedChange={() => toggle(card.id)}
                  aria-label={title(card)}
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{title(card)}</span>
                {(card.subtitle || card.year) && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {[card.subtitle, card.year].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
              <Switch
                checked={card.visibility === 'public'}
                disabled={!canEdit || busy}
                onCheckedChange={(v) =>
                  one.mutate({ id: card.id, visibility: v ? 'public' : 'private' })
                }
                aria-label={t(card.visibility === 'public' ? 'visibility.public' : 'visibility.private')}
              />
            </li>
          ))}
        </ul>
      )}

      {/* ---------- გვერდები ---------- */}
      {!!meta && meta.last_page > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {t('audit.pageOf', { page: meta.page, last: meta.last_page })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= meta.last_page}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      {busy && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {t('actions.saving')}
        </p>
      )}
    </div>
  )
}
