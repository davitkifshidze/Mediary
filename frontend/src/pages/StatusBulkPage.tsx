import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { fetchDashboard } from '@/api/dashboard'
import { mediaApi } from '@/api/media'
import { type MediaType } from '@/lib/media'
import { moduleName, useModules } from '@/lib/modules'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { Label } from '@/components/ui/label'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ModuleIcon } from '@/components/ModuleIcon'
import { MovieMultiSelect } from '@/components/MovieMultiSelect'
import { ScopeCard, ScopeGroup } from '@/components/ui/scope-card'
import { VideoBulkPanel } from '@/components/VideoBulkPanel'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'
import { statusName, useStatuses } from '@/lib/statuses'
import { useContentLang } from '@/lib/settings'

type Mode = 'by_status' | 'specific'
/** დომენი: მედია-ტიპი ან ვიდეოები (ვიდეოს თავისი პანელი აქვს — ტიპი და ტეგებიც) */
type Domain = MediaType | 'video'

/* ============================================================
   მასობრივი ოპერაციები (Tasks 4).
   ერთი გვერდი ყველა დომენზე — გადამრთველი გვერდზევეა:
   · მედია (ფილმები/სერიალები/ანიმე) → სტატუსის შეცვლა
   · ვიდეოები → სტატუსი, ტიპი და ტეგები (19.9 → §6.4: სტატუსი ვიდეოსაც აქვს)
   ============================================================ */

export function StatusBulkPage() {
  const { t, i18n } = useTranslation()
  const { mediaModules, enabled } = useModules()

  // ჩართული დომენები; ერთის შემთხვევაში გადამრთველი არ ჩანს
  const domains = useMemo(
    () => [
      ...mediaModules.map((m) => ({ ...m, label: moduleName(m, i18n.language), domain: m.type as Domain })),
      ...enabled
        .filter((m) => m.key === 'video')
        .map((m) => ({ ...m, label: moduleName(m, i18n.language), domain: 'video' as Domain })),
    ],
    [mediaModules, enabled, i18n.language],
  )

  /* ⚠️ **რიცხვი დეშბორდის იმავე endpoint-იდან მოდის და არა ცალკე დათვლიდან**:
     ბარათს რიცხვი სჭირდება (თორემ იგივე უფერო პილულაა), ჩამონათვალი კი
     მხოლოდ **აქტიური** დომენისთვის იტვირთება — ე.ი. დანარჩენ სამ ბარათს
     საკუთარი წყარო არ აქვს. `GET /dashboard` ერთი მოკლე რექვესთია და
     დეშბორდიდან ისედაც ქეშშია. */
  const { data: cards } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard })
  const countOf = (key: string) => cards?.find((c) => c.key === key)?.count ?? undefined

  const [domain, setDomain] = useState<Domain>(domains[0]?.domain ?? 'movie')
  // მოდულების ჩატვირთვამდე `domains` ცარიელია — პირველივე ხელმისაწვდომზე გადავდივართ
  const active = domains.some((d) => d.domain === domain) ? domain : (domains[0]?.domain ?? domain)

  return (
    <PageContainer>
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('actions.back')}
      </Link>

      <PageHeader
        tool="bulk"
        title={t('bulkStatus.title')}
        hint={<InfoHint info={t(active === 'video' ? 'bulkVideo.subtitle' : 'bulkStatus.subtitle')} />}
      />

      {/* ---------- დომენის არჩევა — ყველა ჩართული მოდული ერთ გვერდზეა (Tasks 4) ----------
          ⚠️ **ბარათები აუდიტ-ლოგის იმავე კომპონენტისაა** (`ui/scope-card.tsx`,
          შენი მითითება 2026-09-15): ერთნაირი ჩარჩოიანი ღილაკები მხოლოდ
          წარწერით განსხვავდებოდნენ, ე.ი. „რომელ ბიბლიოთეკაში ვცვლი სტატუსს"
          წაკითხვას მოითხოვდა. ფერი და ხატულა **მოდულის საკუთარია**
          (`modules.color`) — იგივე, რასაც საიდბარი და გვერდის ჰედერი ხატავს. */}
      {domains.length > 1 && (
        <div className="mb-5">
          <ScopeGroup>
            {domains.map((d) => (
              <ScopeCard
                key={d.key}
                active={active === d.domain}
                color={d.color}
                icon={<ModuleIcon name={d.icon} className="size-4 text-[var(--mod)]" />}
                label={d.label}
                count={countOf(d.key)}
                onClick={() => setDomain(d.domain)}
              />
            ))}
          </ScopeGroup>
        </div>
      )}

      {active === 'video' ? <VideoBulkPanel /> : <MediaBulkPanel type={active} />}
    </PageContainer>
  )
}

/** სტატუსის მასობრივი შეცვლა — ფილმები და სერიალები */
function MediaBulkPanel({ type }: { type: MediaType }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  // §6.4 — სია ლექსიკონიდან; ორივე გადამრჩევი (საიდან/სად) იმავეს ხატავს
  const { data: statuses = [] } = useStatuses(type)
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const api = mediaApi(type)

  // ⚠️ `all` — მასობრივი სტატუსი მთელ სიაზე მოქმედებს
  const moviesQ = useQuery({ queryKey: [type, 'bulk'], queryFn: () => api.list({ all: true }).then((p) => p.items) })
  const movies = useMemo(() => moviesQ.data ?? [], [moviesQ.data])

  const [mode, setMode] = useState<Mode>('by_status')
  const [fromStatus, setFromStatus] = useState('')
  const [ids, setIds] = useState<number[]>([])
  const [target, setTarget] = useState('')

  const affectedCount =
    mode === 'by_status'
      ? fromStatus
        ? movies.filter((m) => m.status?.key === fromStatus).length
        : 0
      : ids.length

  const canApply =
    !!target &&
    ((mode === 'by_status' && !!fromStatus && affectedCount > 0) ||
      (mode === 'specific' && ids.length > 0))

  const mut = useMutation({
    mutationFn: () =>
      api.bulkStatus(
        mode === 'by_status'
          ? { status: target, from_status: fromStatus }
          : { status: target, ids },
      ),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: [type] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
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
        status: statusName(statuses.find((s) => s.key === target), lang),
      }),
      confirmText: t('confirm.confirm'),
      cancelText: t('confirm.cancel'),
    })
    if (ok) mut.mutate()
  }

  return (
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
                <Select value={fromStatus} onValueChange={setFromStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('bulkStatus.fromStatusPick')} />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => (
                      <SelectItem key={s.id} value={s.key}>
                        {statusName(s, lang)} ({movies.filter((m) => m.status?.id === s.id).length})
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
                  key={type}
                />
              </div>
            )}
          </div>
        </RadioGroup>
      </div>

      {/* ახალი სტატუსი */}
      <div>
        <Label className="mb-2 block">{t('bulkStatus.targetLabel')}</Label>
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger>
            <SelectValue placeholder={t('bulkStatus.targetPick')} />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s.id} value={s.key}>
                {statusName(s, lang)}
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
  )
}
