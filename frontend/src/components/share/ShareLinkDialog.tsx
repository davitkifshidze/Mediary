import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, ExternalLink, Link2, Loader2 } from 'lucide-react'
import {
  createShareLink,
  previewShareLink,
  SHARE_DOMAINS,
  updateShareLink,
  type ShareDomainKey,
  type ShareDomainSpec,
  type ShareExpiry,
  type ShareLink,
} from '@/api/shareLinks'
import { fetchGenres } from '@/api/media'
import { useModules } from '@/lib/modules'
import { copyText } from '@/lib/clipboard'
import { errorMessage } from '@/lib/errors'
import { buildDomains, isShareDomain, shareTokenOf, specComplete } from '@/lib/shareLinks'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { StepSection } from '@/components/ui/step-section'
import { InfoHint } from '@/components/ui/info-hint'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/feedback'
import { MediaDomainCards } from '@/components/MediaDomainCards'
import { ShareScopeFields } from '@/components/share/ShareScopeFields'
import { ShareQr } from '@/components/share/ShareQr'

/* ============================================================
   **გაზიარების ბმულის შექმნა და რედაქტირება (Tasks §40.4).**

   ნაბიჯები: 1) რომელი სექციები · 2) თითო სექციის ფარგლები ცოცხალი რიცხვით
   · 3) რას ხედავს მიმღები, სახელი, ვადა · 4) შედეგი — ბმული, კოპირება, QR.

   ⚠️ **რიცხვი სერვერისაა** (`GET /share-links/preview`) და იმავე query-დან
   მოდის, რომელიც მიმღების გვერდს ხატავს — ბრაუზერში დათვლილი „128"
   ფარგლის წესს ვერ გაიმეორებდა (ცოცხალი ჟანრები, სტატუსის როლები).

   ⚠️ **პირადი თუ მოხვდა — წითელი სამკუთხედი**: ბმული ხილვადობის ერთადერთი
   გამონაკლისია და „ვისაც ეს ბმული ექნება, შენს პირად ჩანაწერებსაც დაინახავს"
   სწორედ ის ფაქტია, რომლის გამოტოვებაც არ შეიძლება.
   ============================================================ */

type ExpiryChoice = '7' | '30' | '365' | 'never' | 'keep'

export function ShareLinkDialog({
  link,
  initial,
  onClose,
}: {
  /** რედაქტირება — URL იგივე რჩება */
  link?: ShareLink | null
  /** „ეს სია გაუზიარე" — ბიბლიოთეკის გვერდიდან (დომენი + მიმდინარე ფილტრი) */
  initial?: { domain: ShareDomainKey; spec: ShareDomainSpec }
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const { mediaModules } = useModules()

  const editing = !!link

  const available = useMemo(
    () => mediaModules.map((m) => m.type).filter((type): type is ShareDomainKey => isShareDomain(type)),
    [mediaModules],
  )

  const [selected, setSelected] = useState<ShareDomainKey[]>(() => {
    if (link) return SHARE_DOMAINS.filter((d) => d in link.domains)
    if (initial) return [initial.domain]
    return available
  })
  const [specs, setSpecs] = useState<Partial<Record<ShareDomainKey, ShareDomainSpec>>>(() => {
    if (link) return { ...link.domains }
    if (initial) return { [initial.domain]: initial.spec }
    return {}
  })
  const [name, setName] = useState(link?.name ?? '')
  const [showStatus, setShowStatus] = useState(link?.show_status ?? true)
  const [expiry, setExpiry] = useState<ExpiryChoice>(editing ? 'keep' : '30')
  const [result, setResult] = useState<ShareLink | null>(null)
  const [copied, setCopied] = useState(false)

  const genresQ = useQuery({ queryKey: ['genres'], queryFn: () => fetchGenres() })

  const domains = useMemo(() => buildDomains(selected, specs), [selected, specs])
  const complete = selected.length > 0 && selected.every((d) => specComplete(domains[d] ?? { scope: 'all' }))

  const preview = useQuery({
    queryKey: ['share-preview', domains],
    queryFn: ({ signal }) => previewShareLink(domains, signal),
    enabled: complete && !result,
    // ⚠️ წინა რიცხვი რჩება, სანამ ახალი მოვა — თორემ ყოველ დაწკაპუნებაზე ციმციმებდა
    placeholderData: keepPreviousData,
  })

  const toggleDomain = (type: string) => {
    if (!isShareDomain(type)) return
    setSelected((cur) => (cur.includes(type) ? cur.filter((d) => d !== type) : [...cur, type]))
  }

  const expiresDays = (): ShareExpiry | undefined => {
    if (expiry === 'keep') return undefined
    if (expiry === 'never') return null
    return Number(expiry) as ShareExpiry
  }

  const save = useMutation({
    mutationFn: () => {
      const days = expiresDays()
      const input = {
        domains,
        name: name.trim() || null,
        show_status: showStatus,
        ...(days !== undefined ? { expires_days: days } : {}),
      }

      return link ? updateShareLink(link.id, input) : createShareLink(input)
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['share-links'] })

      if (editing) {
        toast({ title: t('share.saved'), variant: 'success' })
        onClose()
        return
      }

      setResult(saved)
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const copy = async (url: string) => {
    const ok = await copyText(url)
    setCopied(ok)
    toast({ title: ok ? t('share.copied') : t('share.copyFailed'), variant: ok ? 'success' : 'error' })
  }

  /* ---------- 4. შედეგი ---------- */
  if (result) {
    const token = shareTokenOf(result.url)

    return (
      <ModalShell title={t('share.readyTitle')} onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('share.readyHint')}</p>

          {result.url ? (
            <>
              <div className="flex gap-2">
                <Input readOnly value={result.url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
                <Button type="button" onClick={() => copy(result.url as string)}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {t('share.copy')}
                </Button>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <ShareQr value={result.url} />
                {token && (
                  <a
                    href={`/share/${token}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/70"
                  >
                    <ExternalLink className="size-4" />
                    {t('share.openAsRecipient')}
                  </a>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-destructive">{t('share.unreadable')}</p>
          )}
        </div>

        <ModalFooter>
          <Button type="button" onClick={onClose}>
            {t('actions.close')}
          </Button>
        </ModalFooter>
      </ModalShell>
    )
  }

  const count = preview.data

  return (
    <ModalShell
      size="wide"
      title={t(editing ? 'share.editTitle' : 'share.createTitle')}
      hint={t('share.dialogHint')}
      onClose={onClose}
    >
      <div className="space-y-4">
        {/* ---------- 1. რომელი სექციები ---------- */}
        <StepSection step={1} title={t('share.stepSections')} hint={t('share.stepSectionsHint')}>
          <MediaDomainCards value={selected} onToggle={toggleDomain} />
          {selected.length === 0 && (
            <p className="mt-2 text-xs text-destructive">{t('share.noSections')}</p>
          )}
        </StepSection>

        {/* ---------- 2. ფარგლები ---------- */}
        {selected.length > 0 && (
          <StepSection
            step={2}
            title={
              <>
                {t('share.stepScope')}
                {/* ⚠️ `StepSection`-ის `hint` ლურჯ `i`-ს ხატავს; წითელი სამკუთხედი სათაურშია */}
                {count && count.private > 0 && (
                  <InfoHint critical={t('share.privateWarning', { count: count.private })} />
                )}
              </>
            }
            hint={t('share.liveHint')}
            status={
              complete && count ? (
                <span className={count.private > 0 ? 'text-destructive' : undefined}>
                  {t('share.previewTotal', { count: count.total })}
                  {count.private > 0 && ` · ${t('share.previewPrivate', { count: count.private })}`}
                </span>
              ) : !complete ? (
                t('share.incomplete')
              ) : null
            }
          >
            <div className="space-y-3">
              {SHARE_DOMAINS.filter((d) => selected.includes(d)).map((domain) => (
                <ShareScopeFields
                  key={domain}
                  domain={domain}
                  module={mediaModules.find((m) => m.type === domain)}
                  spec={specs[domain] ?? { scope: 'all' }}
                  genres={genresQ.data ?? []}
                  count={count?.domains[domain]}
                  onChange={(next) => setSpecs((cur) => ({ ...cur, [domain]: next }))}
                />
              ))}
            </div>
          </StepSection>
        )}

        {/* ---------- 3. რას ხედავს მიმღები ---------- */}
        <StepSection step={selected.length > 0 ? 3 : 2} title={t('share.stepRecipient')} hint={t('share.stepRecipientHint')}>
          <div className="space-y-4">
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <Checkbox checked={showStatus} onCheckedChange={(v) => setShowStatus(v === true)} className="mt-0.5" />
              <span>
                <span className="font-medium">{t('share.showStatus')}</span>
                <span className="block text-xs text-muted-foreground">{t('share.showStatusHint')}</span>
              </span>
            </label>
            {/* ⚠️ „ჩემი შეფასება" აქ განზრახ არ ჩანს: სამივე მედია-დომენის
                `rating` TMDB-ის ქულაა და არა შენი (`ShareDomain::personal_rating`),
                ე.ი. გადამრთველი არაფერს შეცვლიდა. ეტაპი 2-ის დომენებზე გამოჩნდება. */}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="share-name" className="mb-1.5 flex items-center gap-1.5">
                  {t('share.name')}
                  <InfoHint info={t('share.nameHint')} />
                </Label>
                <Input
                  id="share-name"
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('share.namePlaceholder')}
                />
              </div>
              <div>
                <Label className="mb-1.5 flex items-center gap-1.5">
                  {t('share.expiry')}
                  {editing && <InfoHint info={t('share.expiryEditHint')} />}
                </Label>
                <Select value={expiry} onValueChange={(v) => setExpiry(v as ExpiryChoice)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {editing && <SelectItem value="keep">{t('share.expiryKeep')}</SelectItem>}
                    <SelectItem value="7">{t('share.expiryDays', { count: 7 })}</SelectItem>
                    <SelectItem value="30">{t('share.expiryDays', { count: 30 })}</SelectItem>
                    <SelectItem value="365">{t('share.expiryYear')}</SelectItem>
                    <SelectItem value="never">{t('share.expiryNever')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </StepSection>
      </div>

      <ModalFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button type="button" disabled={!complete || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
          {t(editing ? 'actions.save' : 'share.create')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}
