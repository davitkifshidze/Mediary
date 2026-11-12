import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, ExternalLink, Globe, Link2, Loader2, Share2, X } from 'lucide-react'
import { updateProfile } from '@/api/account'
import { fetchGuestRecord, guestRecordPath } from '@/api/guestRecord'
import { setDomainVisibility, setModulePublic } from '@/api/publicProfile'
import { createShareLink, type ShareDomainKey, type ShareExpiry, type ShareLink } from '@/api/shareLinks'
import { useAuth } from '@/lib/auth'
import { copyText } from '@/lib/clipboard'
import { errorMessage } from '@/lib/errors'
import { useModules } from '@/lib/modules'
import { shareBlocks, shareMeta, shareTokenOf } from '@/lib/shareLinks'
import { cn } from '@/lib/utils'
import { ShareQr } from '@/components/share/ShareQr'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/feedback'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import type { MenuAction } from '@/components/ui/record-menu'
import { ScopeCard } from '@/components/ui/scope-card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/* ============================================================
   **ერთი ჩანაწერის გაზიარება** — ჩანაწერის გვერდიდან და ბარათის მენიუდან.

   ორი არჩევანი, თითო თავისი განმარტებით — რომ „პირადი ბმულით" შემთხვევით იმაზე
   მეტი არ გაზიარდეს, ვიდრე გინდოდა:
   · **ბმული მხოლოდ ამ ჩანაწერზე** — გაზიარების ბმული ერთი ჩანაწერით (`scope: ids`),
     ვადით და არჩეული ბლოკებით. საიდუმლო მისამართია და ჩანაწერს საჯაროდ არ აქცევს;
   · **პირადი ბმული** — საჯარო გვერდის მისამართი პირდაპირ ამ ჩანაწერზე: მუდმივია და
     ყველას ეჩვენება, ვინც გვერდს ხსნის.

   ⚠️ **„ჩანს თუ არა" სერვერს ეკითხება და არა სიის რიგს**: პირადი ბმულის რეჟიმი
   სტუმრის გვერდის მისამართს თვითონ ითხოვს — 200 ნიშნავს, რომ სამივე ფენა ღიაა
   (პროფილი → მოდული → ჩანაწერი) და ჩანაწერი ჩაკეტილი არ არის. სიებს `visibility`
   ყველა მოდულში არც მოაქვთ, ხოლო „ღია" რომ აქ გამოგვეთვალა, ჩაკეტილ ჩანაწერზე
   მკვდარ ბმულს გავცემდით.

   ⚠️ **სიის გაზიარება აქ არ არის** — ის `/share-links`-ზე რჩება.
   ============================================================ */

/** რა ზიარდება */
export interface ShareTarget {
  domain: ShareDomainKey
  id: number
  title: string
}

const ShareContext = createContext<(target: ShareTarget) => void>(() => {})

/** ფანჯარა ერთხელ იხატება — ყველა მოდულის მენიუ მას ერთი ფუნქციით ხსნის */
export function RecordShareProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ShareTarget | null>(null)

  return (
    <ShareContext.Provider value={setTarget}>
      {children}
      {target && <RecordShareDialog target={target} onClose={() => setTarget(null)} />}
    </ShareContext.Provider>
  )
}

/** მენიუს პუნქტი „გაზიარება" — ყველა მოდულზე ერთნაირი */
export function useRecordShare(): {
  open: (target: ShareTarget) => void
  action: (target: ShareTarget) => MenuAction
} {
  const open = useContext(ShareContext)
  const { t } = useTranslation()

  const action = useCallback(
    (target: ShareTarget): MenuAction => ({
      key: 'share',
      label: t('recordShare.action'),
      icon: Share2,
      iconClassName: 'text-primary',
      run: () => open(target),
    }),
    [open, t],
  )

  return useMemo(() => ({ open, action }), [open, action])
}

type Mode = 'link' | 'profile'

type ExpiryChoice = '7' | '30' | '365' | 'never'

export function RecordShareDialog({ target, onClose }: { target: ShareTarget; onClose: () => void }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>('link')

  return (
    <ModalShell title={t('recordShare.title', { name: target.title })} onClose={onClose}>
      <div className="grid gap-2 sm:grid-cols-2">
        <ScopeCard
          active={mode === 'link'}
          icon={<Link2 className="size-4" />}
          label={t('recordShare.linkMode')}
          info={t('recordShare.linkModeHint')}
          onClick={() => setMode('link')}
        />
        <ScopeCard
          active={mode === 'profile'}
          icon={<Globe className="size-4" />}
          label={t('recordShare.profileMode')}
          info={t('recordShare.profileModeHint')}
          onClick={() => setMode('profile')}
        />
      </div>

      {mode === 'link' ? (
        <LinkMode target={target} onClose={onClose} />
      ) : (
        <ProfileMode target={target} onClose={onClose} />
      )}
    </ModalShell>
  )
}

/* ---------- ბმული მხოლოდ ამ ჩანაწერზე ---------- */

function LinkMode({ target, onClose }: { target: ShareTarget; onClose: () => void }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const meta = shareMeta(target.domain)
  const blocks = shareBlocks(target.domain)

  const [showStatus, setShowStatus] = useState(true)
  const [showRating, setShowRating] = useState(true)
  // შიდა გვერდის ბლოკები ნაგულისხმევად დახურულია — მფლობელი ცხადად რთავს
  const [showGallery, setShowGallery] = useState(false)
  const [showCast, setShowCast] = useState(false)
  const [showTrailer, setShowTrailer] = useState(false)
  const [expiry, setExpiry] = useState<ExpiryChoice>('30')
  const [result, setResult] = useState<ShareLink | null>(null)

  const create = useMutation({
    mutationFn: () =>
      createShareLink({
        domains: { [target.domain]: { scope: 'ids', ids: [target.id] } },
        name: target.title.slice(0, 80),
        show_status: showStatus,
        show_rating: showRating,
        show_gallery: blocks.gallery && showGallery,
        show_cast: blocks.cast && showCast,
        show_trailer: blocks.trailer && showTrailer,
        expires_days: expiry === 'never' ? null : (Number(expiry) as ShareExpiry),
      }),
    onSuccess: (link) => {
      qc.invalidateQueries({ queryKey: ['share-links'] })
      setResult(link)
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  if (result) {
    const token = shareTokenOf(result.url)
    // ბმული პირდაპირ ჩანაწერის შიდა გვერდზე მიდის და არა ერთბარათიან სიაზე
    const path = token ? guestRecordPath({ kind: 'link', token }, target.domain, target.id) : null

    return (
      <>
        <div className="mt-4 space-y-3" data-testid="record-share-result">
          <p className="text-sm text-muted-foreground">{t('share.readyHint')}</p>
          {path ? (
            <LinkBox url={window.location.origin + path} path={path} />
          ) : (
            <p className="text-sm text-destructive">{t('share.unreadable')}</p>
          )}
        </div>
        <CloseFooter onClose={onClose} />
      </>
    )
  }

  const toggles: {
    key: string
    show: boolean
    checked: boolean
    set: (v: boolean) => void
  }[] = [
    {
      key: 'status',
      show: meta.status !== null,
      checked: showStatus,
      set: setShowStatus,
    },
    {
      key: 'rating',
      show: meta.personalRating,
      checked: showRating,
      set: setShowRating,
    },
    {
      key: 'gallery',
      show: blocks.gallery,
      checked: showGallery,
      set: setShowGallery,
    },
    { key: 'cast', show: blocks.cast, checked: showCast, set: setShowCast },
    {
      key: 'trailer',
      show: blocks.trailer,
      checked: showTrailer,
      set: setShowTrailer,
    },
  ]

  return (
    <>
      <div className="mt-4 space-y-4">
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            {t('recordShare.shown')}
            <InfoHint info={t('recordShare.shownHint')} />
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {toggles
              .filter((toggle) => toggle.show)
              .map((toggle) => (
                <label key={toggle.key} className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <Checkbox
                    checked={toggle.checked}
                    onCheckedChange={(v) => toggle.set(v === true)}
                    data-testid={`record-share-${toggle.key}`}
                  />
                  {t(`recordShare.blocks.${toggle.key}`)}
                </label>
              ))}
          </div>
        </div>

        <div className="sm:max-w-xs">
          <Label className="mb-1.5 block">{t('share.expiry')}</Label>
          <Select value={expiry} onValueChange={(v) => setExpiry(v as ExpiryChoice)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t('share.expiryDays', { count: 7 })}</SelectItem>
              <SelectItem value="30">{t('share.expiryDays', { count: 30 })}</SelectItem>
              <SelectItem value="365">{t('share.expiryYear')}</SelectItem>
              <SelectItem value="never">{t('share.expiryNever')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <ModalFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          <X className="size-4" />
          {t('actions.cancel')}
        </Button>
        <Button type="button" disabled={create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
          {t('share.create')}
        </Button>
      </ModalFooter>
    </>
  )
}

/* ---------- პირადი ბმული (საჯარო გვერდი) ---------- */

function ProfileMode({ target, onClose }: { target: ShareTarget; onClose: () => void }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const { user, setUser } = useAuth()
  const { all } = useModules()

  const meta = shareMeta(target.domain)
  const username = user?.username ?? ''
  const profilePublic = user?.profile_visibility === 'public'
  const modulePublic = !!all.find((m) => m.key === meta.module)?.is_public

  /* სამივე ფენა ღიაა და ჩანაწერი ჩაკეტილი არ არის? — სტუმრის გვერდის იგივე მოთხოვნა.
     ⚠️ შეცდომა „არ ჩანს"-ია და არა ფანჯრის შეცდომა: 404 სწორედ პასუხია. */
  const reach = useQuery({
    queryKey: ['record-share-reach', username, target.domain, target.id],
    queryFn: () =>
      fetchGuestRecord({ kind: 'profile', username }, target.domain, target.id).then(
        () => true,
        () => false,
      ),
    enabled: username !== '',
    retry: false,
    refetchOnWindowFocus: false,
  })

  const [tried, setTried] = useState(false)

  const publish = useMutation({
    mutationFn: async () => {
      if (!profilePublic) {
        const fd = new FormData()
        fd.append('profile_visibility', 'public')
        setUser(await updateProfile(fd))
      }
      if (!modulePublic) await setModulePublic(meta.module, true)
      await setDomainVisibility(target.domain, 'public', { ids: [target.id] })
    },
    onSuccess: async () => {
      setTried(true)
      await qc.invalidateQueries({ queryKey: ['modules'] })
      for (const key of meta.listKeys) qc.invalidateQueries({ queryKey: [key] })
      await reach.refetch()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  if (username === '') {
    return (
      <>
        <p className="mt-4 text-sm text-muted-foreground" data-testid="record-share-no-username">
          {t('recordShare.usernameNeeded')}{' '}
          <Link to="/profile" onClick={onClose} className="text-primary hover:text-primary/70">
            {t('recordShare.toProfile')}
          </Link>
        </p>
        <CloseFooter onClose={onClose} />
      </>
    )
  }

  if (reach.isLoading) {
    return (
      <div className="grid place-items-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (reach.data) {
    const path = guestRecordPath({ kind: 'profile', username }, target.domain, target.id)

    return (
      <>
        <div className="mt-4 space-y-3" data-testid="record-share-result">
          <p className="text-sm text-muted-foreground">{t('recordShare.profileReady')}</p>
          <LinkBox url={window.location.origin + path} path={path} />
        </div>
        <CloseFooter onClose={onClose} />
      </>
    )
  }

  /* რომელი ფენაა დახურული. ჩანაწერის ფენას სია არ გვეუბნება — ის „დახურულია", რადგან
     სტუმრის გვერდი არ იხსნება; ორი ზედა ფენის გახსნის შემდეგ მხოლოდ ის რჩება. */
  const layers = [
    { key: 'profile', open: profilePublic },
    { key: 'module', open: modulePublic },
    { key: 'record', open: false },
  ]

  return (
    <>
      <div className="mt-4 space-y-3" data-testid="record-share-closed">
        <p className="text-sm">{t('recordShare.notPublic')}</p>
        <ul className="space-y-1.5 text-sm">
          {layers.map((layer) => (
            <li key={layer.key} className="flex items-center gap-2" data-open={layer.open}>
              {layer.open ? (
                <Check className="size-4 text-status-watched" />
              ) : (
                <X className="size-4 text-destructive" />
              )}
              <span className={cn(!layer.open && 'font-medium')}>{t(`recordShare.layers.${layer.key}`)}</span>
            </li>
          ))}
        </ul>
        {/* ყველაფერი გაიხსნა და მაინც არ ჩანს — ჩაკეტილი საჯარო არასდროსაა */}
        {tried && <p className="text-sm text-destructive">{t('recordShare.stillClosed')}</p>}
      </div>

      <ModalFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          <X className="size-4" />
          {t('actions.cancel')}
        </Button>
        <Button type="button" disabled={publish.isPending} onClick={() => publish.mutate()}>
          {publish.isPending ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
          {t('recordShare.makePublic')}
        </Button>
      </ModalFooter>
    </>
  )
}

/* ---------- საერთო ნაწილები ---------- */

/** მზა ბმული: ველი, კოპირება, QR და „გახსნა" */
function LinkBox({ url, path }: { url: string; path: string }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const ok = await copyText(url)
    setCopied(ok)
    toast({
      title: ok ? t('share.copied') : t('share.copyFailed'),
      variant: ok ? 'success' : 'error',
    })
  }

  return (
    <>
      <div className="flex gap-2">
        <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
        <Button type="button" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {t('share.copy')}
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <ShareQr value={url} />
        <a
          href={path}
          target="_blank"
          rel="noreferrer noopener"
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <ExternalLink className="size-4" />
          {t('share.openAsRecipient')}
        </a>
      </div>
    </>
  )
}

function CloseFooter({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()

  return (
    <ModalFooter>
      <Button type="button" onClick={onClose}>
        <X className="size-4" />
        {t('actions.close')}
      </Button>
    </ModalFooter>
  )
}
