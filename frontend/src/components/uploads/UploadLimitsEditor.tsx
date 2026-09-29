import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock, RotateCcw, Save } from 'lucide-react'
import {
  saveInstallationUploadLimits,
  type UploadKind,
  type UploadKindLimit,
  type UploadLimits,
  type UploadLimitValues,
} from '@/api/account'
import { errorMessage } from '@/lib/errors'
import { byFamily, formatList, kbToMb, mbToKb, UPLOAD_LIMITS_KEY } from '@/lib/uploadLimits'
import { cn, formatBytes } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **ატვირთვის ლიმიტები — სუპერადმინის რედაქტორი (Tasks §34.2).**

   შენი სიტყვები: „ატვირთვის ლიმიტები და ფორმატები უნდა შეიძლებოდეს გაწერო,
   რაც გინდა — სუპერადმინზე მაქვს საუბარი“.

   ⚠️ **ფორმატი სიიდან ირჩევა და ხელით არ იწერება** — ჩიპები სერვერის
   `selectable`-იდან იხატება (კატალოგი, სახეობის ოჯახით შეზღუდული), ხოლო
   აქტიური შიგთავსი (SVG, HTML, XML, სკრიპტი) იქ **საერთოდ არ არის**:
   სერვერი მას ვერც ერთი გზით ვერ ჩართავს (`UploadLimits::NEVER`).

   ⚠️ **ზომა `php.ini`-ის ჭერს ვერ გადააჭარბებს** და რედაქტორი ორივეს
   აჩვენებს — თორემ „500 MB" ჩაიწერებოდა და ჩუმად 128 MB იმოქმედებდა.

   ⚠️ **საკუთარი შენახვა აქვს და მოდალშია** — `/settings`-ის შენახვის ზოლი
   ანგარიშის პარამეტრებს ინახავს, ეს კი ინსტალაციისაა (ყველა ანგარიშს
   ეხება); ერთ ზოლზე ორი სხვადასხვა ბუნების ცვლილება ერთმანეთში აირეოდა.
   ============================================================ */

interface Draft {
  mb: string
  formats: string[]
}

type Drafts = Record<UploadKind, Draft>

function toDraft(v: UploadLimitValues): Draft {
  return { mb: kbToMb(v.max_kb), formats: [...v.formats] }
}

function sameFormats(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((f) => b.includes(f))
}

export function UploadLimitsEditor({ limits, onClose }: { limits: UploadLimits; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const initial = useMemo(
    () => Object.fromEntries(limits.kinds.map((k) => [k.kind, toDraft(k.installation)])) as Drafts,
    [limits],
  )
  const [drafts, setDrafts] = useState<Drafts>(initial)

  const minMb = limits.min_kb / 1024
  const maxMb = limits.ceiling_kb / 1024

  /** ერთი სახეობის პრობლემა — ან `null` */
  const problem = (k: UploadKindLimit): string | null => {
    const d = drafts[k.kind]
    const kb = mbToKb(d.mb)

    if (kb === null || kb < limits.min_kb || kb > limits.ceiling_kb) {
      return t('uploads.sizeInvalid', { min: minMb, max: maxMb })
    }
    if (!k.locked && d.formats.length === 0) return t('uploads.formatsRequired')

    return null
  }

  const changed = limits.kinds.filter((k) => {
    const d = drafts[k.kind]

    return mbToKb(d.mb) !== k.installation.max_kb || (!k.locked && !sameFormats(d.formats, k.installation.formats))
  })
  const broken = limits.kinds.some((k) => problem(k) !== null)

  const patch = (kind: UploadKind, next: Partial<Draft>) =>
    setDrafts((cur) => ({ ...cur, [kind]: { ...cur[kind], ...next } }))

  const toggle = (k: UploadKindLimit, format: string) => {
    const cur = drafts[k.kind].formats
    // ⚠️ კატალოგის რიგი რჩება — სია ყოველთვის ერთნაირად იხატება
    const next = cur.includes(format) ? cur.filter((f) => f !== format) : k.selectable.filter((f) => f === format || cur.includes(f))
    patch(k.kind, { formats: next })
  }

  const save = useMutation({
    mutationFn: () =>
      saveInstallationUploadLimits(
        Object.fromEntries(
          changed.map((k) => [
            k.kind,
            { max_kb: mbToKb(drafts[k.kind].mb) ?? k.installation.max_kb, formats: drafts[k.kind].formats },
          ]),
        ),
      ),
    onSuccess: (data) => {
      // ⚠️ პასუხი უკვე ახალი ლიმიტებია — ხელახალი GET ზედმეტია
      qc.setQueryData(UPLOAD_LIMITS_KEY, data)
      toast({ title: t('uploads.saved'), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <ModalShell
      title={t('uploads.editorTitle')}
      hint={t('uploads.editorHint')}
      size="wide"
      onClose={onClose}
    >
      <div className="space-y-4">
        {limits.kinds.map((k) => {
          const d = drafts[k.kind]
          const kb = mbToKb(d.mb)
          const error = problem(k)
          const isDefault = kb === k.default.max_kb && sameFormats(d.formats, k.default.formats)
          const overServer = kb !== null && kb * 1024 > limits.server.max_bytes

          return (
            <section key={k.kind} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">{t(`uploads.kind.${k.kind}`)}</h3>
                <InfoHint info={t(`uploads.where.${k.kind}`)} />
                {!isDefault && <Badge className="bg-secondary">{t('uploads.customized')}</Badge>}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  disabled={isDefault}
                  onClick={() => setDrafts((cur) => ({ ...cur, [k.kind]: toDraft(k.default) }))}
                >
                  <RotateCcw className="size-4" />
                  {t('uploads.resetKind')}
                </Button>
              </div>

              {/* ---------- ზომა ---------- */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label htmlFor={`upload-size-${k.kind}`} className="text-sm text-muted-foreground">
                  {t('uploads.sizeLabel')}
                </label>
                <Input
                  id={`upload-size-${k.kind}`}
                  type="number"
                  min={minMb}
                  max={maxMb}
                  step={1}
                  inputMode="numeric"
                  className="w-28"
                  value={d.mb}
                  onChange={(e) => patch(k.kind, { mb: e.target.value })}
                />
                <span className="text-sm text-muted-foreground">MB</span>
                {overServer && (
                  <span className="text-xs text-destructive">
                    {t('uploads.sizeServer', {
                      max: formatBytes(limits.server.max_bytes),
                      ini: limits.server.upload_max_filesize,
                    })}
                  </span>
                )}
              </div>

              {/* ---------- ფორმატები ---------- */}
              <div className="mt-3">
                {k.locked ? (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Lock className="size-4 shrink-0" />
                    <span className="font-medium text-foreground">{formatList(k.installation.formats)}</span>
                    <span>— {t('uploads.locked')}</span>
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {byFamily(limits.catalog, k.selectable).map((g) => (
                      <div key={g.family}>
                        <p className="mb-1 text-xs text-muted-foreground">{t(`uploads.family.${g.family}`)}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {g.formats.map((f) => (
                            <Chip key={f} active={d.formats.includes(f)} onClick={() => toggle(k, f)}>
                              {f.toUpperCase()}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && <p className={cn('mt-2 text-xs text-destructive')}>{error}</p>}
            </section>
          )
        })}

        <ModalFooter>
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button disabled={broken || changed.length === 0 || save.isPending} onClick={() => save.mutate()}>
            <Save className="size-4" />
            {t('actions.save')}
          </Button>
        </ModalFooter>
      </div>
    </ModalShell>
  )
}
