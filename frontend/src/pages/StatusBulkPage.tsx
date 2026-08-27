import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { bulkSetStatus, fetchMovies } from '@/api/movies'
import type { Status } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MovieMultiSelect } from '@/components/MovieMultiSelect'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

const STATUSES: Status[] = ['undecided', 'to_watch', 'watching', 'watched']
type Mode = 'by_status' | 'specific'

export function StatusBulkPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()

  const moviesQ = useQuery({ queryKey: ['movies', 'bulk'], queryFn: () => fetchMovies() })
  const movies = useMemo(() => moviesQ.data ?? [], [moviesQ.data])

  const [mode, setMode] = useState<Mode>('by_status')
  const [fromStatus, setFromStatus] = useState<Status | ''>('')
  const [ids, setIds] = useState<number[]>([])
  const [target, setTarget] = useState<Status | ''>('')

  const affectedCount =
    mode === 'by_status'
      ? fromStatus
        ? movies.filter((m) => m.status === fromStatus).length
        : 0
      : ids.length

  const canApply =
    !!target &&
    ((mode === 'by_status' && !!fromStatus && affectedCount > 0) ||
      (mode === 'specific' && ids.length > 0))

  const mut = useMutation({
    mutationFn: () =>
      bulkSetStatus(
        mode === 'by_status'
          ? { status: target as Status, from_status: fromStatus as Status }
          : { status: target as Status, ids },
      ),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['movie'] })
      toast({ title: t('bulkStatus.done', { count: updated }), variant: 'success' })
      setIds([])
      setFromStatus('')
      setTarget('')
    },
    onError: () => toast({ title: t('toast.error'), variant: 'error' }),
  })

  const apply = async () => {
    if (!canApply) return
    const ok = await confirm({
      title: t('bulkStatus.confirmTitle'),
      description: t('bulkStatus.confirmDesc', {
        count: affectedCount,
        status: t(`status.${target}`),
      }),
      confirmText: t('confirm.confirm'),
      cancelText: t('confirm.cancel'),
    })
    if (ok) mut.mutate()
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('actions.back')}
      </Link>

      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{t('bulkStatus.title')}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t('bulkStatus.subtitle')}</p>

      <div className="space-y-6 rounded-xl border border-border bg-card p-5">
        {/* რას ვცვლით */}
        <div>
          <Label className="mb-2 block">{t('bulkStatus.whichLabel')}</Label>
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="gap-3">
            <div
              className={cn(
                'rounded-lg border p-3 transition-colors',
                mode === 'by_status' ? 'border-primary bg-secondary/50' : 'border-border',
              )}
            >
              <label className="flex cursor-pointer items-center gap-3">
                <RadioGroupItem value="by_status" />
                <span className="text-sm font-medium">{t('bulkStatus.modeByStatus')}</span>
              </label>
              {mode === 'by_status' && (
                <div className="mt-3 pl-8">
                  <Select value={fromStatus} onValueChange={(v) => setFromStatus(v as Status)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('bulkStatus.fromStatusPick')} />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`status.${s}`)} ({movies.filter((m) => m.status === s).length})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div
              className={cn(
                'rounded-lg border p-3 transition-colors',
                mode === 'specific' ? 'border-primary bg-secondary/50' : 'border-border',
              )}
            >
              <label className="flex cursor-pointer items-center gap-3">
                <RadioGroupItem value="specific" />
                <span className="text-sm font-medium">{t('bulkStatus.modeSpecific')}</span>
              </label>
              {mode === 'specific' && (
                <div className="mt-3 pl-8">
                  <MovieMultiSelect
                    movies={movies}
                    value={ids}
                    onChange={setIds}
                    placeholder={moviesQ.isLoading ? t('api.loading') : t('bulkStatus.moviesPick')}
                  />
                </div>
              )}
            </div>
          </RadioGroup>
        </div>

        {/* ახალი სტატუსი */}
        <div>
          <Label className="mb-2 block">{t('bulkStatus.targetLabel')}</Label>
          <Select value={target} onValueChange={(v) => setTarget(v as Status)}>
            <SelectTrigger>
              <SelectValue placeholder={t('bulkStatus.targetPick')} />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`status.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <span className="text-sm text-muted-foreground">
            {t('bulkStatus.affected', { count: affectedCount })}
          </span>
          <Button onClick={apply} disabled={!canApply || mut.isPending}>
            {mut.isPending ? t('actions.saving') : t('bulkStatus.apply')}
          </Button>
        </div>
      </div>
    </main>
  )
}
