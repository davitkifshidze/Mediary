import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { saveStorageAllocations, type StorageUsage } from '@/api/account'
import { errorMessage } from '@/lib/errors'
import { formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   კვოტის გადანაწილება მოდულებზე (Tasks §17.2).

   ⚠️ **ცარიელი ველი ≠ 0.** ცარიელი ნიშნავს „ცალკე ლიმიტი არ აქვს" — მოდული
   საერთო აუზიდან ხარჯავს; `0` კი ნიშნავს „ატვირთვა აკრძალულია". ორივე
   ცალკე მდგომარეობაა და backend-ზეც ასე ინახება (`null` vs `0`).

   ⚠️ **ჯამი კვოტას ვერ აღემატება** — ამას backend ამოწმებს (422
   `allocation_exceeds_quota`), აქ მხოლოდ წინასწარ ვაფრთხილებთ, რომ
   შენახვის ღილაკამდე ჩანდეს.

   ⚠️ **ლიმიტის შემცირება უკვე დახარჯულზე ქვემოთ ფაილებს არ შლის** — ახალი
   ატვირთვა ჩერდება, არსებული რჩება. ასეთი რიგი წითლად აღინიშნება.
   ============================================================ */

const MB = 1024 * 1024

export function StorageAllocations({
  usage,
  modules,
}: {
  usage: StorageUsage
  /** მხოლოდ ჩართული მოდულები — ავატარი (`account`) ლიმიტს ვერ იღებს */
  modules: { key: string; name: string }[]
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  /** ბაიტები → MB-ის ველის ტექსტი; ლიმიტის გარეშე — ცარიელი */
  const initial = useMemo(() => {
    const out: Record<string, string> = {}
    for (const m of modules) {
      const bytes = usage.allocations?.[m.key]
      out[m.key] = bytes === undefined ? '' : String(Math.round(bytes / MB))
    }
    return out
  }, [modules, usage.allocations])

  const [draft, setDraft] = useState<Record<string, string>>(initial)
  const [touched, setTouched] = useState(false)

  const bytesOf = (value: string) => {
    const n = Number(value)
    return value.trim() === '' || !Number.isFinite(n) || n < 0 ? null : Math.round(n * MB)
  }

  const allocated = Object.values(draft).reduce((sum, v) => sum + (bytesOf(v) ?? 0), 0)
  const overQuota = allocated > usage.quota

  const save = useMutation({
    mutationFn: () =>
      saveStorageAllocations(
        Object.fromEntries(modules.map((m) => [m.key, bytesOf(draft[m.key] ?? '')])),
      ),
    onSuccess: (next) => {
      qc.setQueryData(['storage'], next)
      qc.invalidateQueries({ queryKey: ['storage'] })
      setTouched(false)
      toast({ title: t('storage.allocationsSaved'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  if (!modules.length) return null

  return (
    <div className="mt-4 border-t border-border pt-4">
      <h3 className="mb-1 text-sm font-semibold">{t('storage.allocationsTitle')}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{t('storage.allocationsHint')}</p>

      {/* ვიზუალური ზოლი — სად რამდენი წავიდა */}
      <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-muted">
        {modules.map((m, i) => {
          const bytes = bytesOf(draft[m.key] ?? '') ?? 0
          if (!bytes || !usage.quota) return null
          return (
            <span
              key={m.key}
              title={`${m.name} · ${formatBytes(bytes)}`}
              style={{ width: `${Math.min(100, (bytes / usage.quota) * 100)}%` }}
              className={i % 2 === 0 ? 'bg-primary' : 'bg-primary/60'}
            />
          )
        })}
      </div>

      <ul className="space-y-1.5">
        {modules.map((m) => {
          const bytes = bytesOf(draft[m.key] ?? '')
          const used = usage.modules?.[m.key] ?? 0
          // ლიმიტი უკვე დახარჯულზე ნაკლებია — ფაილები რჩება, ატვირთვა ჩერდება
          const shrunk = bytes !== null && used > bytes

          return (
            <li key={m.key} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatBytes(used)}
              </span>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={draft[m.key] ?? ''}
                placeholder={t('storage.noLimit')}
                onChange={(e) => {
                  setDraft((cur) => ({ ...cur, [m.key]: e.target.value }))
                  setTouched(true)
                }}
                className="w-28 shrink-0"
              />
              <span className="w-8 shrink-0 text-xs text-muted-foreground">MB</span>
              {shrunk && (
                <span className="w-full text-xs text-destructive">{t('storage.limitBelowUsage')}</span>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className={overQuota ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
          {t('storage.allocatedOf', {
            allocated: formatBytes(allocated),
            quota: formatBytes(usage.quota),
          })}
          {!overQuota && ` · ${t('storage.unallocated', { bytes: formatBytes(usage.quota - allocated) })}`}
        </p>
        <Button size="sm" disabled={!touched || overQuota || save.isPending} onClick={() => save.mutate()}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          {t('actions.save')}
        </Button>
      </div>
    </div>
  )
}
