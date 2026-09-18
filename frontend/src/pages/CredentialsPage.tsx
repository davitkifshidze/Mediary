import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, HelpCircle, KeyRound, Loader2, RotateCw, Trash2, TriangleAlert } from 'lucide-react'
import {
  clearCredential,
  fetchCredentials,
  revealCredential,
  saveCredential,
  testCredential,
  type Credential,
  type CredentialSource,
} from '@/api/credentials'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { SecretInput } from '@/components/ui/secret-input'
import { CredentialHelpDialog } from '@/components/CredentialHelpDialog'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Switch } from '@/components/ui/switch'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/auth'
import { useDateFormat } from '@/lib/dates'
import { TOOL_SECTIONS } from '@/lib/toolSections'
import { cn } from '@/lib/utils'

/* ============================================================
   **„მონაცემები" — ჩემი გასაღებები და ლიმიტები (Tasks §21).**

   ⚠️ **საიდუმლოს ველი ყოველთვის ცარიელი იწყება და ეს არაა ხარვეზი.**
   სერვერი გასაღებს არ აბრუნებს (მხოლოდ ნიღბიან კუდს), ე.ი. „უცვლელად
   დატოვება" ნიშნავს ველის საერთოდ არშევსებას. სწორედ ამიტომ ცარიელი ველი
   **არ იგზავნება**: სხვაგვარად ჩვეულებრივი „შენახვა" ყოველ ჯერზე ჩუმად
   წაშლიდა გასაღებს.

   ⚠️ **სამი მდგომარეობა ჩანს და არა ორი** — „ჩემია" · „საერთოა" · „არსად
   არაა". შუა მდგომარეობის დამალვა ნიშნავდა, რომ მომხმარებელი ვერ
   მიხვდებოდა, რატომ მუშაობს თარგმანი გასაღების ჩაწერის გარეშე (და ვისი
   კვოტა იხარჯება).
   ============================================================ */

const PROVIDERS = ['tmdb', 'gemini', 'rawg', 'igdb', 'serpapi', 'serper', 'youtube', 'telegram'] as const

/** ბრენდის სახელი — არ ითარგმნება, ე.ი. i18n-ის გასაღები არ ეკუთვნის */
const BRAND: Record<string, string> = {
  tmdb: 'TMDB',
  gemini: 'Google Gemini',
  rawg: 'RAWG.io',
  igdb: 'IGDB (Twitch)',
  serpapi: 'SerpApi',
  serper: 'Serper.dev',
  youtube: 'YouTube Data API',
  telegram: 'Telegram',
}

const SOURCE_TONE: Record<CredentialSource, string> = {
  user: 'bg-[color-mix(in_oklab,var(--icon-ok)_18%,transparent)] text-foreground',
  shared: 'bg-secondary text-secondary-foreground',
  none: 'bg-[color-mix(in_oklab,var(--destructive)_14%,transparent)] text-foreground',
}

export function CredentialsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({ queryKey: ['credentials'], queryFn: fetchCredentials })
  const { isAdmin } = useAuth()

  return (
    <PageContainer width="narrow">
      <PageHeader
        tool="credentials"
        title={t('credentials.title')}
        hint={<InfoHint info={t('credentials.subtitle')} />}
      />

      <p className="mb-5 rounded-xl border border-border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
        {t('credentials.intro')}
      </p>

      {isLoading && <div className="h-40 animate-pulse rounded-xl bg-muted" />}

      <div className="space-y-4">
        {data?.data
          .slice()
          .sort((a, b) => PROVIDERS.indexOf(a.provider as never) - PROVIDERS.indexOf(b.provider as never))
          .map((c) => (
            <ProviderCard
              key={c.provider}
              credential={c}
              canSeeShared={isAdmin}
              onChanged={() => qc.invalidateQueries({ queryKey: ['credentials'] })}
            />
          ))}
      </div>

      {/* §21.9 — რაც `.env`-შია, მაგრამ გასაღები არაა.
          ⚠️ **წასაკითხია და არა ფორმა**: `yt-dlp`-ის ბილიკი ამ *კომპიუტერის*
          ფაქტია და per-user ვერ გახდება; ღია რეგისტრაცია — მთელი
          ინსტალაციისა. მაგრამ „რატომ არ ჩანს, რაც `.env`-ში წერია"
          სამართლიანი კითხვაა, ამიტომ აქვეა, ცხადი მინაწერით. */}
      {(data?.installation.length ?? 0) > 0 && (
        <section className="mt-6 rounded-xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-1.5 font-display text-lg font-semibold tracking-tight">
            {t('credentials.installation')}
            <InfoHint info={t('credentials.installationHint')} />
          </h2>

          <dl className="mt-4 space-y-2">
            {data?.installation.map((row) => (
              <div key={row.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/60 pb-2 last:border-0">
                <dt className="font-mono text-xs text-muted-foreground">{row.key}</dt>
                <dd className="min-w-0 flex-1 break-all font-mono text-xs">
                  {row.value ?? <span className="text-muted-foreground">{t('credentials.empty')}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </PageContainer>
  )
}

function ProviderCard({
  credential,
  canSeeShared,
  onChanged,
}: {
  credential: Credential
  /** super_admin — მხოლოდ მას უბრუნებს სერვერი ინსტალაციის მნიშვნელობას */
  canSeeShared: boolean
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { dateTime } = useDateFormat()

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
    onError: () => toast({ title: t('toast.error'), variant: 'error' }),
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
    onError: () => toast({ title: t('toast.error'), variant: 'error' }),
  })

  const remove = useMutation({
    mutationFn: () => clearCredential(credential.provider),
    onSuccess: () => {
      toast({ title: t('credentials.cleared'), variant: 'success' })
      onChanged()
    },
  })

  const toggleActive = useMutation({
    mutationFn: (value: boolean) => saveCredential(credential.provider, { is_active: value }),
    onSuccess: onChanged,
  })

  const accent = TOOL_SECTIONS.credentials.color
  const hasOwn = credential.fields.some((f) => f.has_own)

  return (
    <section
      className="rounded-xl border border-border bg-card p-5"
      style={credential.source === 'user' ? { borderColor: `color-mix(in oklab, ${accent} 35%, var(--border))` } : undefined}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <KeyRound className="size-4 shrink-0" style={{ color: accent }} />
        <h2 className="font-display text-lg font-semibold tracking-tight">{BRAND[credential.provider]}</h2>

        <Badge className={SOURCE_TONE[credential.source]}>{t(`credentials.source.${credential.source}`)}</Badge>

        {credential.verified_at && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5" />
            {t('credentials.verifiedAt', { date: dateTime(credential.verified_at) })}
          </span>
        )}
        {credential.last_error && (
          <span className="inline-flex items-center gap-1 text-xs text-destructive">
            <TriangleAlert className="size-3.5" />
            {t(`credentials.error.${credential.last_error}`, credential.last_error)}
          </span>
        )}

        <span className="flex-1" />

        {/* ⚠️ **ბმულის ნაცვლად ინსტრუქცია** (შენი მითითება): „გახსენი
            დოკუმენტაცია და გაერკვიე" ზუსტად ის ადგილია, სადაც ადამიანი
            ჩერდება — ბმული ახლა ნაბიჯების ბოლოშია. */}
        <Button variant="ghost" size="sm" onClick={() => setHelpOpen(true)}>
          <HelpCircle className="size-4" />
          {t('credentials.getKey')}
        </Button>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">{t(`credentials.desc.${credential.provider}`)}</p>

      {/* ⚠️ **გაუშიფრავი გასაღები ცხადად უნდა ითქვას (Tasks GAP-11).** მანქანის
          შეცვლა ან `key:generate` რიგს წასაკითხად უვარგისს ხდის და აპი საერთო
          `.env`-ის გასაღებზე ვარდება — აქამდე ეს უბრალოდ „არ არის"-ად
          იხატებოდა, ე.ი. მიზეზი არსად ჩანდა. ⚠️ ტექსტი პროზაა და არა ხატულა:
          ის **მდგომარეობითია** (გამოჩნდა ამჟამინდელი მდგომარეობის გამო) —
          სწორედ ის შემთხვევა, რომელსაც `InfoHint`-ის წესი პროზად ტოვებს. */}
      {credential.undecryptable && (
        <p className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{t('credentials.undecryptable')}</span>
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {credential.fields.map((f) => (
          <label key={f.name} className="block">
            <span className="mb-1 block text-sm font-medium">
              {t(`credentials.field.${f.name}`)}
              {f.required && <span className="text-destructive"> *</span>}
            </span>
            {f.secret ? (
              <SecretInput
                value={fields[f.name] ?? ''}
                onChange={(value) => setFields((s) => ({ ...s, [f.name]: value }))}
                /* ⚠️ **ნიღაბი აღარაა `placeholder`** — ის ფერმკრთალად იხატებოდა
                   და შევსებული ველი ცარიელისგან არ განსხვავდებოდა. ახლა ის
                   ველის **შიგთავსია** და მისი არსებობა თვითონ ამბობს, რომ
                   გასაღები შენახულია. */
                masked={f.masked ?? (canSeeShared && f.has_shared ? f.shared_hint : null)}
                placeholder={f.has_shared ? t('credentials.usingShared') : t('credentials.empty')}
                /* ⚠️ თვალი მხოლოდ მაშინ ჩანს, როცა **სერვერი მართლა გასცემს**
                   მნიშვნელობას: ჩემი გასაღები ყოველთვის, ინსტალაციისა კი
                   მხოლოდ super_admin-ს (§21.9). სხვა შემთხვევაში ღილაკი
                   ცარიელს დააბრუნებდა და გაუგებარი „არაფერი მოხდა" იქნებოდა. */
                onReveal={
                  f.has_own || (canSeeShared && f.has_shared)
                    ? async () => (await revealCredential(credential.provider)).fields[f.name] ?? null
                    : undefined
                }
              />
            ) : (
              <Input
                autoComplete="off"
                value={fields[f.name] ?? ''}
                onChange={(e) => setFields((s) => ({ ...s, [f.name]: e.target.value }))}
                placeholder={f.shared_hint ?? ''}
              />
            )}
          </label>
        ))}

        {credential.limits.map((l) => (
          <label key={l.name} className="block">
            <span className="mb-1 block text-sm font-medium">{t(`credentials.limit.${l.name}`)}</span>
            <Input
              type="number"
              min={0}
              value={limits[l.name] ?? ''}
              onChange={(e) => setLimits((s) => ({ ...s, [l.name]: e.target.value }))}
              placeholder={l.shared === null ? t('credentials.noLimit') : String(l.shared)}
            />
            {/* ⚠️ `0` და ცარიელი სხვადასხვა ფაქტია და ველის ქვეშ ეს ცხადად წერია */}
            <span className="mt-1 block text-xs text-muted-foreground">{t('credentials.limitHint')}</span>
          </label>
        ))}
      </div>

      {credential.usage && (
        <div className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm">
          <span className="font-medium">{t('credentials.usage')}: </span>
          <span className="tabular-nums">{credential.usage.used}</span>
          {credential.usage.limit ? <span className="text-muted-foreground"> / {credential.usage.limit}</span> : null}
          {credential.usage.remaining !== null && credential.usage.remaining !== undefined && (
            <span className="text-muted-foreground"> · {t('credentials.remaining', { n: credential.usage.remaining })}</span>
          )}
          {/* ⚠️ მრიცხველი **ჩვენია** და არა provider-ისა — ეს ცხადად ეწერება,
              თორემ რიცხვი ავტორიტეტულად წაიკითხებოდა */}
          <p className="mt-1 text-xs text-muted-foreground">{t('credentials.usageHint')}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          {t('actions.save')}
        </Button>

        <Button
          variant="outline"
          onClick={() => check.mutate()}
          disabled={!credential.configured || check.isPending}
          title={credential.test_costs_credit ? t('credentials.testCosts') : undefined}
        >
          {check.isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
          {credential.test_costs_credit ? t('credentials.testPaid') : t('credentials.test')}
        </Button>

        {hasOwn && (
          <>
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm">
              <Switch
                checked={credential.is_active}
                onCheckedChange={(v) => toggleActive.mutate(v)}
              />
              <span className={cn(!credential.is_active && 'text-muted-foreground')}>{t('credentials.useMine')}</span>
            </label>

            <Button
              variant="outline"
              onClick={async () => {
                const ok = await confirm({
                  title: t('credentials.clearTitle'),
                  description: t('credentials.clearHint', { name: BRAND[credential.provider] }),
                  variant: 'destructive',
                })
                if (ok) remove.mutate()
              }}
            >
              <Trash2 className="size-4" />
              {t('credentials.clear')}
            </Button>
          </>
        )}
      </div>

      {helpOpen && (
        <CredentialHelpDialog
          provider={credential.provider}
          brand={BRAND[credential.provider]}
          docs={credential.docs}
          onClose={() => setHelpOpen(false)}
        />
      )}
    </section>
  )
}
