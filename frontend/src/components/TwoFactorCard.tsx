import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, KeyRound, Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
import {
  confirmTwoFactor,
  disableTwoFactor,
  regenerateRecoveryCodes,
  startTwoFactor,
} from '@/api/account'
import { useAuth } from '@/lib/auth'
import { copyText } from '@/lib/clipboard'
import { errorMessage } from '@/lib/errors'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/secret-input'
import { InfoHint } from '@/components/ui/info-hint'
import { ModalShell } from '@/components/ui/modal-shell'
import { StepSection } from '@/components/ui/step-section'
import { useConfirm, useToast } from '@/components/ui/feedback'

/* ⚠️ **QR მხოლოდ მაშინ ჩამოდის, როცა მართლა იხატება.** `qrcode.react`
   თვითმყოფადია (დამოკიდებულებების გარეშე), მაგრამ პროფილის გვერდს ის
   მხოლოდ ჩართვის დიალოგში სჭირდება — ე.ი. სტატიკური import მას ყველას
   ჩამოატვირთვინებდა (იგივე წესი, რაც `recharts`-ს და date-picker-ს აქვს). */
const QRCodeSVG = lazy(() =>
  import('qrcode.react').then((m) => ({ default: m.QRCodeSVG })),
)

function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useTranslation()
  const [done, setDone] = useState(false)

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        }
      }}
    >
      {done ? <Check className="size-4" /> : <Copy className="size-4" />}
      {done ? t('twoFactor.copied') : label}
    </Button>
  )
}

/**
 * **ორფაქტორიანი შესვლა (FEAT-16) — `/profile`-ის ბლოკი.**
 *
 * ⚠️ **ჩართვა ორნაბიჯიანია და ეს ტექსტშიც წერია**: სანამ კოდი არ
 * დადასტურდა, შესვლა უცვლელია — თორემ ავთენტიფიკატორში ვერ ჩაწერილი
 * საიდუმლო ანგარიშს სამუდამოდ კეტავდა.
 *
 * ⚠️ **აღდგენის კოდები ერთხელ ჩანს.** ისინი დაშიფრულად ინახება, მაგრამ
 * ხელახლა გამოთხოვა განზრახ არ არსებობს: „ვნახოთ, რა მაქვს" ისეთივე
 * კარია, როგორიც თვითონ კოდები. დაკარგულს ახალი ცვლის.
 */
export function TwoFactorCard() {
  const { t } = useTranslation()
  const { user, refresh } = useAuth()
  const { toast } = useToast()
  const confirmDialog = useConfirm()

  /**
   * ⚠️ **პაროლის ველი სამ სხვადასხვა განზრახვას ემსახურება** (ჩართვა ·
   * გამორთვა · კოდების განახლება), ამიტომ ნაბიჯი თვითონ ამბობს, რომელია:
   * ერთი „password" მდგომარეობა და გვერდით მდგომი „rotating" ფლაგი ზუსტად
   * ის ორაზროვნებაა, რომელიც მოგვიანებით არასწორ ღილაკს დააჭერინებს.
   */
  const [step, setStep] = useState<
    'idle' | 'enable' | 'scan' | 'codes' | 'disable' | 'rotate'
  >('idle')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [secret, setSecret] = useState<{ secret: string; uri: string } | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user) return null

  const enabled = !!user.two_factor_enabled
  const pending = !!user.two_factor_pending

  const close = () => {
    setStep('idle')
    setPassword('')
    setCode('')
    setSecret(null)
    setCodes(null)
    setError(null)
  }

  const begin = async () => {
    setBusy(true)
    setError(null)
    try {
      setSecret(await startTwoFactor(password))
      setPassword('')
      setStep('scan')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      setCodes(await confirmTwoFactor(code))
      setCode('')
      setStep('codes')
      refresh()
      toast({ title: t('twoFactor.enabled'), variant: 'success' })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    setError(null)
    try {
      await disableTwoFactor(password)
      close()
      refresh()
      toast({ title: t('twoFactor.disabled'), variant: 'success' })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const rotate = async () => {
    setBusy(true)
    setError(null)
    try {
      setCodes(await regenerateRecoveryCodes(password))
      setPassword('')
      setStep('codes')
      toast({ title: t('twoFactor.codesRegenerated'), variant: 'success' })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const askRotate = async () => {
    if (
      !(await confirmDialog({
        title: t('twoFactor.regenerate'),
        description: t('twoFactor.regenerateWarn'),
      }))
    ) {
      return
    }
    setError(null)
    setStep('rotate')
  }

  /* ⚠️ **დიალოგები ერთ `const`-შია და ბარათის ერთადერთ `return`-შია
     ჩასმული** — `GroupsCut`-ის ცოცხალი შეცდომა: ღილაკი ერთ შტოში, მოდალი
     მეორეში, დაჭერა კი არაფერს აკეთებს. */
  const passwordGate = (onDone: () => void, action: string) => (
    <div className="space-y-4">
      <div>
        <Label htmlFor="tfa-password">{t('twoFactor.passwordLabel')}</Label>
        <PasswordInput
          id="tfa-password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
        />
        <p className="mt-1 text-xs text-muted-foreground">{t('twoFactor.passwordHint')}</p>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex justify-end">
        <Button type="button" onClick={onDone} disabled={busy || !password}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {action}
        </Button>
      </div>
    </div>
  )

  const dialogs = (
    <>
      {step === 'enable' && (
        <ModalShell title={t('twoFactor.title')} onClose={close}>
          {passwordGate(begin, t('twoFactor.continue'))}
        </ModalShell>
      )}

      {step === 'rotate' && (
        <ModalShell title={t('twoFactor.regenerate')} onClose={close}>
          {passwordGate(rotate, t('twoFactor.continue'))}
        </ModalShell>
      )}

      {step === 'disable' && (
        <ModalShell title={t('twoFactor.disable')} onClose={close} destructive>
          {passwordGate(disable, t('twoFactor.disable'))}
        </ModalShell>
      )}

      {step === 'scan' && secret && (
        <ModalShell title={t('twoFactor.title')} onClose={close} wide>
          <div className="space-y-4">
            <StepSection step={1} title={t('twoFactor.scanTitle')} hint={t('twoFactor.scanHint')}>
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                <div className="rounded-md bg-white p-3">
                  <Suspense
                    fallback={<div className="grid size-40 place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}
                  >
                    {/* ⚠️ თეთრი ფონი სავალდებულოა: QR-ის კონტრასტი მუქ თემაზე
                        იკარგება და კამერა ვერ კითხულობს */}
                    <QRCodeSVG value={secret.uri} size={160} level="M" />
                  </Suspense>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t('twoFactor.manualTitle')}</p>
                  <p className="mb-2 text-xs text-muted-foreground">{t('twoFactor.manualHint')}</p>
                  <code className="block break-all rounded-md border border-border bg-muted/40 px-2 py-1.5 font-mono text-xs">
                    {secret.secret}
                  </code>
                  <div className="mt-2">
                    <CopyButton text={secret.secret} label={t('twoFactor.copy')} />
                  </div>
                </div>
              </div>
            </StepSection>

            <StepSection
              step={2}
              title={t('twoFactor.confirmTitle')}
              hint={t('twoFactor.confirmHint')}
            >
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label htmlFor="tfa-code">{t('auth.code')}</Label>
                  <Input
                    id="tfa-code"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    className="w-32 font-mono tracking-widest"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </div>
                <Button type="button" onClick={confirm} disabled={busy || !code}>
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  {t('auth.verify')}
                </Button>
              </div>

              {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
            </StepSection>
          </div>
        </ModalShell>
      )}

      {step === 'codes' && codes && (
        <ModalShell title={t('twoFactor.recoveryTitle')} onClose={close}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('twoFactor.recoveryHint')}</p>

            <ul className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/40 p-3 font-mono text-sm">
              {codes.map((c) => (
                <li key={c} className="tabular-nums">
                  {c}
                </li>
              ))}
            </ul>

            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {t('twoFactor.recoveryWarn')}
            </p>

            <div className="flex justify-between gap-2">
              <CopyButton text={codes.join('\n')} label={t('twoFactor.copy')} />
              <Button type="button" onClick={close}>
                {t('actions.close')}
              </Button>
            </div>
          </div>
        </ModalShell>
      )}
    </>
  )

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {t('twoFactor.title')}
            <InfoHint className="ml-1.5" info={t('twoFactor.subtitle')} />
          </h2>
          <div className="mt-1.5 flex items-center gap-2">
            {enabled ? (
              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="size-3" />
                {t('twoFactor.on')}
              </Badge>
            ) : pending ? (
              <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-500">
                {t('twoFactor.pending')}
              </Badge>
            ) : (
              <Badge className="bg-secondary text-muted-foreground">
                <ShieldOff className="size-3" />
                {t('twoFactor.off')}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {enabled ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={askRotate}>
                <KeyRound className="size-4" />
                {t('twoFactor.regenerate')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setError(null)
                  setStep('disable')
                }}
              >
                <ShieldOff className="size-4" />
                {t('twoFactor.disable')}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setError(null)
                setStep('enable')
              }}
            >
              <ShieldCheck className="size-4" />
              {t('twoFactor.enable')}
            </Button>
          )}
        </div>
      </div>

      {pending && <p className="text-sm text-muted-foreground">{t('twoFactor.pendingHint')}</p>}

      {dialogs}
    </div>
  )
}
