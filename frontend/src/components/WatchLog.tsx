import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Plus, Trash2 } from 'lucide-react'
import { deleteWatch, fetchWatches, logWatch } from '@/api/watches'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import type { MediaType } from '@/lib/media'
import { Button } from '@/components/ui/button'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { InfoHint } from '@/components/ui/info-hint'

/* ============================================================
   ხელახლა ნახვის ჟურნალი (FEAT-14).

   ⚠️ **ბლოკი მხოლოდ მაშინ ჩანს, როცა ჩანაწერი ერთხელ მაინც ნანახია.**
   ჟურნალის პირველ რიგს **სტატუსი** ქმნის („ნანახად მოვნიშნე" უკვე
   ნახვაა), ე.ი. ცარიელი ჟურნალი ნიშნავს „ჯერ არ მინახავს" — და იქ
   „კიდევ ვნახე" უაზრო ღილაკი იქნებოდა.

   ⚠️ **„ბოლო ნახვა" აქ არ იწერება და ეს განზრახია** — ის ჩანაწერის
   `watched_at`-შია და სერვერი მას ჟურნალიდან ითვლის; მეორედ დაწერა
   ორ რიცხვს დააშორებდა.
   ============================================================ */

export function WatchLog({ type, recordId, watched }: { type: MediaType; recordId: number; watched: boolean }) {
  const { t } = useTranslation()
  const { date } = useDateFormat()
  const { toast } = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)

  const { data: watches = [] } = useQuery({
    queryKey: ['watches', type, recordId],
    queryFn: () => fetchWatches(type, recordId),
    enabled: watched,
  })

  /* ⚠️ ჩანაწერიც უქმდება: `watched_at` სერვერზე ჟურნალიდან გადაითვალა,
     ე.ი. ბარათზე „ბოლო ნახვა" სხვაგვარად ძველი დარჩებოდა. */
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['watches', type, recordId] })
    queryClient.invalidateQueries({ queryKey: [type] })
  }

  const add = useMutation({
    mutationFn: () => logWatch(type, recordId),
    onSuccess: () => {
      toast({ title: t('watchLog.added'), variant: 'success' })
      setOpen(true)
      refresh()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => deleteWatch(id),
    onSuccess: refresh,
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  if (!watched) return null

  const askRemove = async (id: number) => {
    const ok = await confirm({
      title: t('watchLog.deleteTitle'),
      description: t('watchLog.deleteHint'),
      confirmText: t('confirm.delete'),
      variant: 'destructive',
    })

    if (ok) remove.mutate(id)
  }

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Eye className="size-4 text-muted-foreground" />
          {t('watchLog.title')}
          <span className="text-muted-foreground">{t('watchLog.count', { count: watches.length })}</span>
          <InfoHint info={t('watchLog.hint')} />
        </h2>

        <div className="flex items-center gap-2">
          {watches.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
              {open ? t('watchLog.hide') : t('watchLog.show')}
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" disabled={add.isPending} onClick={() => add.mutate()}>
            <Plus className="size-4" />
            {t('watchLog.again')}
          </Button>
        </div>
      </div>

      {open && watches.length > 0 && (
        <ul className="mt-3 grid gap-1.5">
          {watches.map((w) => (
            <li
              key={w.id}
              className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <span className="tabular-nums">{w.watched_at ? date(w.watched_at) : '—'}</span>
              {w.note && <span className="min-w-0 flex-1 truncate text-muted-foreground">{w.note}</span>}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto"
                disabled={remove.isPending}
                onClick={() => askRemove(w.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
