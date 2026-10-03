import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clapperboard,
  Gamepad2,
  HelpCircle,
  Images,
  Joystick,
  KeyRound,
  Languages,
  Loader2,
  Plus,
  RotateCw,
  ScanSearch,
  Search,
  Send,
  Sparkles,
  SquarePlay,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import {
  clearCredential,
  fetchCredentials,
  revealCredential,
  saveCredential,
  testCredential,
  type Credential,
} from '@/api/credentials'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { SecretInput } from '@/components/ui/secret-input'
import { CredentialHelpDialog } from '@/components/CredentialHelpDialog'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Switch } from '@/components/ui/switch'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { Badge } from '@/components/ui/badge'
import {
  CREDENTIAL_BRAND,
  CREDENTIAL_GROUPS,
  credentialState,
  isCredentialProvider,
  usagePercent,
  type CredentialProvider,
  type CredentialState,
} from '@/lib/credentials'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { modAccent } from '@/lib/modules'
import {
  notificationPermission,
  requestNotificationPermission,
  showTestNotification,
  type NotificationPermissionState,
} from '@/lib/noteReminders'
import { cn } from '@/lib/utils'

/* ============================================================
   **„მონაცემები" — ჩემი გასაღებები და ლიმიტები (Tasks §21 → §30).**

   §30: რვა სრულსიგანიანი, ერთფეროვანი ბარათი ერთმანეთის ქვეშ **ბადედ**
   იქცა — ჯგუფებად („რისთვის მჭირდება"), თითო წყაროს თავისი ფერითა და
   აიქონით, მდგომარეობის ფერადი ნიშნით, ბოლო შემოწმებითა და ლიმიტის
   ზოლით. რედაქტირება ბარათზე დაჭერით, მოდალში იხსნება.

   ⚠️ **გასაღები მხოლოდ ჩემია (Q38)** — „საერთო" მდგომარეობა, მისი ნიღაბი
   და „საერთო გასაღებით" placeholder აღარ არსებობს. ვისაც გასაღები არ
   აქვს, მისთვის წყარო არ მუშაობს — ბარათი ამას ცხადად ამბობს და
   დამატებისკენ მიუთითებს.

   ⚠️ **ყველა ძველი წესი რჩება** (§30.2): საიდუმლო სიაში არასდროს მოდის
   (მხოლოდ ნიღაბი), „ნახვა" ცალკე მოთხოვნაა, ცარიელი ველი არ იგზავნება
   (= „უცვლელი"), Serper-ის შემოწმება კრედიტს ხარჯავს და დასტურს ითხოვს.
   ============================================================ */

/** წყაროს ფერი და აიქონი — ფერები `index.css`-შია, ორივე თემაზე (`--cred-*`) */
const LOOK: Record<CredentialProvider, { icon: LucideIcon; color: string }> = {
  tmdb: { icon: Clapperboard, color: 'var(--cred-tmdb)' },
  gemini: { icon: Sparkles, color: 'var(--cred-gemini)' },
  rawg: { icon: Gamepad2, color: 'var(--cred-rawg)' },
  igdb: { icon: Joystick, color: 'var(--cred-igdb)' },
  serpapi: { icon: ScanSearch, color: 'var(--cred-serpapi)' },
  serper: { icon: Images, color: 'var(--cred-serper)' },
  youtube: { icon: SquarePlay, color: 'var(--cred-youtube)' },
  telegram: { icon: Send, color: 'var(--cred-telegram)' },
}

/** უცნობი (ახალი სერვერის) წყარო ცვივის ნაცვლად ნეიტრალურად იხატება */
const FALLBACK_LOOK = { icon: KeyRound, color: 'var(--tool-credentials)' }

type GroupKey = (typeof CREDENTIAL_GROUPS)[number]['key']

const GROUP_ICON: Record<GroupKey, LucideIcon> = {
  media: Clapperboard,
  translation: Languages,
  web: Search,
  notify: BellRing,
}

/**
 * მდგომარეობის ფერი. ⚠️ „შეუვსებელი" და „გამორთული" ქარვისფერია — არაფერი
 * გატეხილა, უბრალოდ ერთი ნაბიჯი აკლია; „ვერ იშიფრება" კი წითელია: ჩაწერილი
 * გასაღები ფაქტობრივად დაკარგულია.
 */
const STATE_TONE: Record<CredentialState, string> = {
  mine: 'bg-[color-mix(in_oklab,var(--icon-ok)_18%,transparent)] text-foreground',
  off: 'bg-[color-mix(in_oklab,var(--icon-warn)_22%,transparent)] text-foreground',
  partial: 'bg-[color-mix(in_oklab,var(--icon-warn)_22%,transparent)] text-foreground',
  none: 'bg-secondary text-muted-foreground',
  undecryptable: 'bg-[color-mix(in_oklab,var(--destructive)_16%,transparent)] text-foreground',
}

/** ბარათის შემოსვლის საფეხური და ჭერი (`/modules`-ის წესი, `index.css`-ის `fb-card`) */
const STAGGER_MS = 40
const STAGGER_MAX_MS = 240

function lookOf(provider: string) {
  return isCredentialProvider(provider) ? LOOK[provider] : FALLBACK_LOOK
}

function brandOf(provider: string) {
  return isCredentialProvider(provider) ? CREDENTIAL_BRAND[provider] : provider
}

export function CredentialsPage() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({ queryKey: ['credentials'], queryFn: fetchCredentials })
  const [open, setOpen] = useState<string | null>(null)

  const byProvider = useMemo(() => new Map((data?.data ?? []).map((c) => [c.provider, c])), [data])
  const connected = (data?.data ?? []).filter((c) => c.source === 'user').length
  /* ⚠️ მოდალი წყაროს **სახელით** იხსნება და ობიექტს ყოველ რენდერზე
     ახალი სიიდან იღებს — შენახვის/შემოწმების შემდეგ ის თვითონ განახლდება. */
  const openCredential = open ? byProvider.get(open) : undefined

  let index = 0

  return (
    <PageContainer>
      <PageHeader
        tool="credentials"
        title={t('credentials.title')}
        hint={<InfoHint info={t('credentials.intro')} />}
        subtitle={data ? t('credentials.connected', { count: connected, total: data.data.length }) : undefined}
      />

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      )}

      <div className="space-y-8">
        {CREDENTIAL_GROUPS.map((group) => {
          const items = group.providers
            .map((p) => byProvider.get(p))
            .filter((c): c is Credential => c !== undefined)

          /* §27.2 — „შეტყობინებების" ჯგუფს ბრაუზერის ბარათიც აქვს, ე.ი. წყაროების გარეშეც იხატება */
          if (!items.length && group.key !== 'notify') return null

          const Icon = GROUP_ICON[group.key]

          return (
            <section key={group.key} aria-labelledby={`cred-group-${group.key}`}>
              <h2
                id={`cred-group-${group.key}`}
                className="mb-3 flex items-center gap-2 font-display text-lg font-semibold tracking-tight"
              >
                <Icon className="size-4 text-muted-foreground" />
                {t(`credentials.group.${group.key}`)}
              </h2>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((c) => (
                  <ProviderTile
                    key={c.provider}
                    credential={c}
                    delay={Math.min(index++ * STAGGER_MS, STAGGER_MAX_MS)}
                    onOpen={() => setOpen(c.provider)}
                  />
                ))}
                {group.key === 'notify' && <BrowserChannelTile delay={Math.min(index++ * STAGGER_MS, STAGGER_MAX_MS)} />}
              </div>
            </section>
          )
        })}
      </div>

      {/* §21.9 → §30.10 — რაც `.env`-შია, მაგრამ გასაღები არაა (მხოლოდ სუპერ-ადმინს).
          ⚠️ **წასაკითხია და არა ფორმა**: `yt-dlp`-ის ბილიკი ამ *კომპიუტერის*
          ფაქტია და per-user ვერ გახდება; ღია რეგისტრაცია — მთელი
          ინსტალაციისა. ⚠️ წყაროს გასაღები აქ **არასდროს** ჩნდება — ის
          ადამიანისაა (Q38). ბოლოსაა და ცალკე, რომ ბარათებს არ ერეოდეს. */}
      {(data?.installation.length ?? 0) > 0 && (
        <section className="mt-10 rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-1.5 font-display text-lg font-semibold tracking-tight">
            {t('credentials.installation')}
            <InfoHint info={t('credentials.installationHint')} />
          </h2>

          <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {data?.installation.map((row) => (
              <div key={row.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/60 pb-2">
                <dt className="font-mono text-xs text-muted-foreground">{row.key}</dt>
                <dd className="min-w-0 flex-1 break-all font-mono text-xs">
                  {row.value ?? <span className="text-muted-foreground">{t('credentials.empty')}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {openCredential && <ProviderDialog credential={openCredential} onClose={() => setOpen(null)} />}
    </PageContainer>
  )
}

/* ---------- ბარათი (§30.1) ---------- */

function ProviderTile({
  credential,
  delay,
  onOpen,
}: {
  credential: Credential
  delay: number
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const look = lookOf(credential.provider)
  const state = credentialState(credential)
  const Icon = look.icon

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('credentials.editTitle', { name: brandOf(credential.provider) })}
      style={{ ...modAccent(look.color), animationDelay: `${delay}ms` }}
      className="fb-card group flex h-full cursor-pointer flex-col rounded-2xl border border-border bg-card p-5 text-left transition-[border-color,transform] hover:-translate-y-0.5 hover:border-[var(--mod)]"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)]">
          <Icon className="size-5 text-[var(--mod)]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-base font-semibold tracking-tight">{brandOf(credential.provider)}</div>
          <Badge className={cn('mt-1', STATE_TONE[state])}>{t(`credentials.state.${state}`)}</Badge>
        </div>
        <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>

      <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{t(`credentials.desc.${credential.provider}`)}</p>

      <div className="mt-auto space-y-3 border-t border-border pt-3">
        {state === 'mine' && <UsageBar credential={credential} />}
        <CheckLine credential={credential} state={state} />
      </div>
    </button>
  )
}

/* ---------- ბრაუზერის არხი (Tasks §27.2) ----------
   ⚠️ **გასაღები არაა და სერვერზე არაფერი იწერება**: ნებართვა ბრაუზერისაა და ამ
   კომპიუტერზე ცხოვრობს. ბარათი აქ იმიტომაა, რომ შეხსენების ორივე არხი — ბრაუზერი
   და ტელეგრამი — ერთ ადგილას მოწმდებოდეს და ჩანაწერების გვერდი პარამეტრებისგან
   დაცლილიყო (აქამდე `NoteChannelsDialog` იყო, ტოკენის დუბლიკატი ფორმით).
   ⚠️ ნებართვა **მხოლოდ დაჭერიდან** ითხოვება — სხვანაირად ბრაუზერები ბლოკავენ.
   ⚠️ სატესტო შეტყობინება ნამდვილის გზით მიდის (`showTestNotification`). */
const PERMISSION_TONE: Record<NotificationPermissionState, string> = {
  granted: STATE_TONE.mine,
  default: STATE_TONE.partial,
  denied: STATE_TONE.undecryptable,
  unsupported: STATE_TONE.none,
}

function BrowserChannelTile({ delay }: { delay: number }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [permission, setPermission] = useState<NotificationPermissionState>(notificationPermission())
  const [busy, setBusy] = useState(false)

  const ask = async () => {
    setBusy(true)
    try {
      setPermission(await requestNotificationPermission())
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    try {
      await showTestNotification(t('credentials.browser.testTitle'), t('credentials.browser.testBody'))
      toast({ title: t('credentials.browser.sent'), variant: 'success' })
    } catch (e) {
      toast({ title: errorMessage(e), variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      data-testid="browser-channel"
      style={{ ...modAccent('var(--cred-browser)'), animationDelay: `${delay}ms` }}
      className="fb-card flex h-full flex-col rounded-2xl border border-border bg-card p-5 text-left"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)]">
          <BellRing className="size-5 text-[var(--mod)]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-base font-semibold tracking-tight">{t('credentials.browser.title')}</div>
          <Badge className={cn('mt-1', PERMISSION_TONE[permission])}>{t(`credentials.browser.state.${permission}`)}</Badge>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{t('credentials.browser.desc')}</p>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {permission === 'default' && (
          <Button variant="outline" size="sm" disabled={busy} onClick={ask}>
            <BellRing className="size-3.5" />
            {t('credentials.browser.ask')}
          </Button>
        )}
        {permission === 'granted' && (
          <Button variant="outline" size="sm" disabled={busy} onClick={test}>
            <Send className="size-3.5" />
            {t('credentials.browser.test')}
          </Button>
        )}
        {permission === 'denied' && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-destructive">
            <TriangleAlert className="size-3.5 shrink-0" />
            {t('credentials.browser.deniedHint')}
          </span>
        )}
        {permission === 'unsupported' && (
          <span className="text-[11px] text-muted-foreground">{t('credentials.browser.unsupportedHint')}</span>
        )}
      </div>
    </div>
  )
}

/** ლიმიტის მოხმარების ზოლი — მხოლოდ კვოტიან წყაროებზე (Gemini, SerpApi) */
function UsageBar({ credential }: { credential: Credential }) {
  const { t } = useTranslation()
  const usage = credential.usage
  const percent = usagePercent(usage)

  if (!usage) return null

  return (
    <div className="text-[11px]">
      <div className="mb-1 flex items-center justify-between gap-2 text-muted-foreground">
        <span>{t(usage.period === 'month' ? 'credentials.usageMonth' : 'credentials.usageDay')}</span>
        <span className="tabular-nums">
          {usage.limit ? `${usage.used} / ${usage.limit}` : t('credentials.usageNoLimit', { used: usage.used })}
        </span>
      </div>
      {percent !== null && (
        <div className="h-1.5 overflow-hidden rounded-md bg-muted" aria-hidden>
          <div
            className={cn('h-full rounded-md', percent >= 100 ? 'bg-destructive' : 'bg-[var(--mod)]')}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  )
}

/** ბოლო შემოწმება — ან რა ნაბიჯი აკლია */
function CheckLine({ credential, state }: { credential: Credential; state: CredentialState }) {
  const { t } = useTranslation()
  const { dateTime } = useDateFormat()

  if (state !== 'mine') {
    const Icon = state === 'undecryptable' ? TriangleAlert : Plus

    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-[11px]',
          state === 'undecryptable' ? 'text-destructive' : 'text-[var(--mod)]',
        )}
      >
        <Icon className="size-3.5" />
        {t(`credentials.cta.${state}`)}
      </span>
    )
  }

  if (credential.last_error) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-destructive">
        <TriangleAlert className="size-3.5" />
        {t(`credentials.error.${credential.last_error}`, credential.last_error)}
      </span>
    )
  }

  return credential.verified_at ? (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <CheckCircle2 className="size-3.5 text-[var(--icon-ok)]" />
      {t('credentials.verifiedAt', { date: dateTime(credential.verified_at) })}
    </span>
  ) : (
    <span className="text-[11px] text-muted-foreground">{t('credentials.neverChecked')}</span>
  )
}

/* ---------- რედაქტირების მოდალი (§30.2) ---------- */

function ProviderDialog({ credential, onClose }: { credential: Credential; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { dateTime } = useDateFormat()

  const brand = brandOf(credential.provider)
  const state = credentialState(credential)
  const onChanged = () => qc.invalidateQueries({ queryKey: ['credentials'] })

  /* ველების მონახაზი. ⚠️ საიდუმლო ყოველთვის ცარიელია (სერვერი მას არ
     აბრუნებს), ღია ველი კი მიმდინარე მნიშვნელობით იწყება — თორემ მოდელის
     შეცვლა მის ხელახლა აკრეფას მოითხოვდა. */
  const initial = useMemo(() => {
    const out: Record<string, string> = {}
    for (const f of credential.fields) out[f.name] = f.secret ? '' : (f.value ?? '')
    return out
  }, [credential])

  const initialLimits = useMemo(() => {
    const out: Record<string, string> = {}
    for (const l of credential.limits) out[l.name] = l.own === null ? '' : String(l.own)
    return out
  }, [credential])

  const [fields, setFields] = useState(initial)
  const [limits, setLimits] = useState(initialLimits)
  const [helpOpen, setHelpOpen] = useState(false)

  // სერვერიდან ახალი სურათი მოვიდა (შენახვა/შემოწმება) → ფორმა მას მიჰყვება
  useEffect(() => setFields(initial), [initial])
  useEffect(() => setLimits(initialLimits), [initialLimits])

  const dirty =
    Object.entries(fields).some(([k, v]) => v !== initial[k]) ||
    Object.entries(limits).some(([k, v]) => v !== initialLimits[k])

  const save = useMutation({
    mutationFn: () => {
      /* ⚠️ **ცარიელი საიდუმლო არ იგზავნება.** backend-ზე ცარიელი სტრიქონი
         „გასუფთავებას" ნიშნავს — ე.ი. ველის გაუვსებლად დაწკაპება ყოველ
         ჯერზე ჩუმად წაშლიდა უკვე ჩაწერილ გასაღებს. */
      const payload: Record<string, string> = {}
      for (const [k, v] of Object.entries(fields)) {
        if (v !== initial[k]) payload[k] = v
      }

      const limitPayload: Record<string, number | null> = {}
      for (const [k, v] of Object.entries(limits)) {
        if (v !== initialLimits[k]) limitPayload[k] = v.trim() === '' ? null : Number(v)
      }

      return saveCredential(credential.provider, { fields: payload, limits: limitPayload })
    },
    onSuccess: () => {
      toast({ title: t('credentials.saved'), variant: 'success' })
      onChanged()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const check = useMutation({
    mutationFn: () => testCredential(credential.provider, credential.test_costs_credit),
    onSuccess: (res) => {
      toast({
        title: res.ok ? t('credentials.testOk') : t('credentials.testFailed'),
        description: res.ok ? undefined : t(`credentials.error.${res.error ?? 'unreachable'}`, t('credentials.error.unreachable')),
        variant: res.ok ? 'success' : 'error',
      })
      onChanged()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const remove = useMutation({
    mutationFn: () => clearCredential(credential.provider),
    onSuccess: () => {
      toast({ title: t('credentials.cleared'), variant: 'success' })
      onChanged()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const toggleActive = useMutation({
    mutationFn: (value: boolean) => saveCredential(credential.provider, { is_active: value }),
    onSuccess: onChanged,
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const hasOwn = credential.fields.some((f) => f.has_own)

  return (
    <ModalShell
      title={brand}
      hint={t(`credentials.desc.${credential.provider}`)}
      onClose={onClose}
      aside={<Badge className={STATE_TONE[state]}>{t(`credentials.state.${state}`)}</Badge>}
    >
      <div className="mt-2 space-y-5">
        {/* ⚠️ **გაუშიფრავი გასაღები ცხადად უნდა ითქვას (Tasks GAP-11).** ტექსტი
            პროზაა და არა ხატულა: ის **მდგომარეობითია** (გამოჩნდა ამჟამინდელი
            მდგომარეობის გამო) — სწორედ ის შემთხვევა, რომელსაც `InfoHint`-ის
            წესი პროზად ტოვებს. */}
        {credential.undecryptable && (
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{t('credentials.undecryptable')}</span>
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {credential.fields.map((f) => (
            <label key={f.name} className="block">
              <span className="mb-1.5 block text-sm font-medium">
                {t(`credentials.field.${f.name}`)}
                {f.required && <span className="text-destructive"> *</span>}
              </span>
              {f.secret ? (
                <SecretInput
                  value={fields[f.name] ?? ''}
                  onChange={(value) => setFields((s) => ({ ...s, [f.name]: value }))}
                  /* ⚠️ ნიღაბი ველის **შიგთავსია** და არა `placeholder` — მისი
                     არსებობა თვითონ ამბობს, რომ გასაღები შენახულია. §30-იდან
                     მხოლოდ **ჩემი** ნიღაბი არსებობს. */
                  masked={f.masked}
                  placeholder={t('credentials.empty')}
                  // თვალი მხოლოდ მაშინ, როცა სერვერი მართლა გასცემს — ჩემს გასაღებს
                  onReveal={
                    f.has_own
                      ? async () => (await revealCredential(credential.provider)).fields[f.name] ?? null
                      : undefined
                  }
                />
              ) : (
                <Input
                  autoComplete="off"
                  value={fields[f.name] ?? ''}
                  onChange={(e) => setFields((s) => ({ ...s, [f.name]: e.target.value }))}
                  // კოდის ნაგულისხმევი (Gemini-ის მოდელი) — ცარიელი ველი მას ნიშნავს
                  placeholder={f.default ?? ''}
                />
              )}
            </label>
          ))}

          {credential.limits.map((l) => (
            <label key={l.name} className="block">
              <span className="mb-1.5 block text-sm font-medium">{t(`credentials.limit.${l.name}`)}</span>
              <Input
                type="number"
                min={0}
                value={limits[l.name] ?? ''}
                onChange={(e) => setLimits((s) => ({ ...s, [l.name]: e.target.value }))}
                placeholder={l.default === null ? '' : String(l.default)}
              />
              {/* ⚠️ `0` და ცარიელი სხვადასხვა ფაქტია და ველის ქვეშ ეს ცხადად წერია */}
              <span className="mt-1 block text-xs text-muted-foreground">
                {l.default === null
                  ? t('credentials.limitHintNoDefault')
                  : t('credentials.limitHint', { n: l.default })}
              </span>
            </label>
          ))}
        </div>

        {state === 'mine' && credential.usage && (
          <div className="rounded-md border border-border bg-muted/40 p-3" style={modAccent(lookOf(credential.provider).color)}>
            <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
              {t('credentials.usage')}
              <InfoHint info={t('credentials.usageHint')} />
              {credential.usage.remaining !== null && credential.usage.remaining !== undefined && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {t('credentials.remaining', { n: credential.usage.remaining })}
                </span>
              )}
            </div>
            <UsageBar credential={credential} />
          </div>
        )}

        {hasOwn && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch checked={credential.is_active} onCheckedChange={(v) => toggleActive.mutate(v)} />
            <span className={cn(!credential.is_active && 'text-muted-foreground')}>{t('credentials.enabled')}</span>
            <InfoHint info={t('credentials.enabledHint')} />
          </label>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {/* ⚠️ **ბმულის ნაცვლად ინსტრუქცია** (§21.8): „გახსენი დოკუმენტაცია და
              გაერკვიე" ზუსტად ის ადგილია, სადაც ადამიანი ჩერდება. */}
          <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)}>
            <HelpCircle className="size-4" />
            {t('credentials.getKey')}
          </Button>

          {/* ⚠️ შემოწმება **შენახულ** გასაღებს ამოწმებს — შეუნახავ ცვლილებაზე
              ძველის შემოწმება მომხმარებელს შეცდომაში შეიყვანდა */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => check.mutate()}
            disabled={!credential.configured || dirty || check.isPending}
          >
            {check.isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
            {credential.test_costs_credit ? t('credentials.testPaid') : t('credentials.test')}
          </Button>
          {/* ფულის ხარჯი — წითელი სამკუთხედი (`InfoHint`-ის წესი) */}
          {credential.test_costs_credit && <InfoHint critical={t('credentials.testCosts')} />}

          {credential.verified_at && !credential.last_error && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-[var(--icon-ok)]" />
              {t('credentials.verifiedAt', { date: dateTime(credential.verified_at) })}
            </span>
          )}
          {credential.last_error && (
            <span className="inline-flex items-center gap-1 text-xs text-destructive">
              <TriangleAlert className="size-3.5" />
              {t(`credentials.error.${credential.last_error}`, credential.last_error)}
            </span>
          )}
        </div>

        {dirty && credential.configured && (
          <p className="text-xs text-muted-foreground">{t('credentials.testAfterSave')}</p>
        )}
      </div>

      <ModalFooter>
        {hasOwn && (
          <Button
            variant="destructiveOutline"
            className="mr-auto"
            disabled={remove.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: t('credentials.clearTitle'),
                description: t('credentials.clearHint', { name: brand }),
                variant: 'destructive',
              })
              if (ok) remove.mutate()
            }}
          >
            <Trash2 className="size-4" />
            {t('credentials.clear')}
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          {t('actions.close')}
        </Button>
        <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          {t('actions.save')}
        </Button>
      </ModalFooter>

      {helpOpen && (
        <CredentialHelpDialog
          provider={credential.provider}
          brand={brand}
          docs={credential.docs}
          onClose={() => setHelpOpen(false)}
        />
      )}
    </ModalShell>
  )
}
