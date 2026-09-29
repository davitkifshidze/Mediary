import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { requestUploadLimit, type UploadKindLimit, type UploadLimits } from '@/api/account'
import { errorMessage } from '@/lib/errors'
import { byFamily, formatList, kbLabel, mbToKb, requestableFormats } from '@/lib/uploadLimits'
import { formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **ატვირთვის ლიმიტის მოთხოვნა (Tasks §34.5).**

   შენი სიტყვები: „მინდა ავტვირთო, მაგალითად, JPG და არ მაქვს — თუ
   შეგიძლია, ჩამირთე“.

   ⚠️ **ფორმატი სიიდან ირჩევა და ხელით არ იწერება** — მხოლოდ ის, რაც ამ
   სახეობის არჩევანშია და ჯერ **არ** გაქვს (`requestableFormats`). აქტიური
   შიგთავსი (SVG, HTML, სკრიპტი) სიაში საერთოდ არ არის, და სერვერი მას
   მოთხოვნამდე უარყოფს — ანუ ეს ფანჯარა მხოლოდ მოხერხებაა.

   ⚠️ **„ვისთვის ჩაირთოს" აქ არ იკითხება** — ამას ადმინი წყვეტს
   დამტკიცებისას (Q42: ნაგულისხმევად „მხოლოდ შენთვის“). ფანჯარა ამას
   ამბობს, რომ მოლოდინი სწორი იყოს.
   ============================================================ */

export function UploadRequestDialog({
  limit,
  limits,
  onClose,
}: {
  limit: UploadKindLimit
  limits: UploadLimits
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [formats, setFormats] = useState<string[]>([])
  const [mb, setMb] = useState('')
  const [note, setNote] = useState('')

  const kindName = t(`uploads.kind.${limit.kind}`)
  const options = requestableFormats(limit)
  const groups = byFamily(limits.catalog, options)

  const wantedKb = mbToKb(mb)
  // ⚠️ ზომა მხოლოდ ზრდაა — ნაკლები ან ტოლი „ახალი არაფერია"
  const sizeUp = wantedKb !== null && wantedKb > limit.max_kb
  const ready = formats.length > 0 || sizeUp
  const overServer = wantedKb !== null && wantedKb * 1024 > limits.server.max_bytes

  const toggle = (f: string) =>
    setFormats((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]))

  const send = useMutation({
    mutationFn: () =>
      requestUploadLimit({
        kind: limit.kind,
        formats: formats.length ? formats : undefined,
        max_kb: sizeUp && wantedKb !== null ? wantedKb : undefined,
        message: note.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-requests'] })
      toast({ title: t('uploads.requestSent'), variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <ModalShell
      title={t('uploads.requestTitle', { kind: kindName })}
      hint={t('uploads.requestHint')}
      onClose={onClose}
    >
      <div className="space-y-5">
        {/* ---------- ახლა რა გაქვს ---------- */}
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          {t('uploads.current', { size: kbLabel(limit.max_kb), formats: formatList(limit.mimes) })}
        </p>

        {/* ---------- ფორმატები ---------- */}
        {!limit.locked && (
          <section>
            <h3 className="mb-2 text-sm font-medium">{t('uploads.requestFormats')}</h3>

            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('uploads.requestAllOn')}</p>
            ) : (
              <div className="space-y-3">
                {groups.map((g) => (
                  <div key={g.family}>
                    <p className="mb-1.5 text-xs text-muted-foreground">{t(`uploads.family.${g.family}`)}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.formats.map((f) => (
                        <Chip key={f} active={formats.includes(f)} onClick={() => toggle(f)}>
                          {f.toUpperCase()}
                        </Chip>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ---------- ზომა ---------- */}
        <section>
          <Label htmlFor="upload-request-size" className="mb-1.5 flex items-center gap-1.5">
            {t('uploads.requestSize')}
            <InfoHint info={t('uploads.requestSizeHint', { current: kbLabel(limit.max_kb) })} />
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="upload-request-size"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              className="w-32"
              placeholder={String(Math.round(limit.max_kb / 1024))}
              value={mb}
              onChange={(e) => setMb(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">MB</span>
          </div>
          {overServer && (
            <p className="mt-1.5 text-xs text-destructive">
              {t('uploads.requestServerCap', { max: formatBytes(limits.server.max_bytes) })}
            </p>
          )}
        </section>

        {/* ---------- კომენტარი ---------- */}
        <section>
          <Label htmlFor="upload-request-note" className="mb-1.5 block">
            {t('uploads.requestNote')}
          </Label>
          <Textarea
            id="upload-request-note"
            rows={3}
            maxLength={1000}
            placeholder={t('admin.notePlaceholder')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </section>

        <ModalFooter>
          {!ready && <span className="mr-auto text-xs text-muted-foreground">{t('uploads.requestNothing')}</span>}
          <Button variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button disabled={!ready || send.isPending} onClick={() => send.mutate()}>
            <Send className="size-4" />
            {t('uploads.requestSend')}
          </Button>
        </ModalFooter>
      </div>
    </ModalShell>
  )
}
