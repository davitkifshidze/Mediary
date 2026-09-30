import { useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Blocks } from 'lucide-react'
import { fetchCustomModulesOverview, setCustomModuleActive, type CustomModuleOverview } from '@/api/account'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { MODULE_ACCENT_FALLBACK, modAccent } from '@/lib/modules'
import { formatBytes } from '@/lib/utils'
import { ModuleIcon } from '@/components/ModuleIcon'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { InfoHint } from '@/components/ui/info-hint'
import { Switch } from '@/components/ui/switch'

/* ============================================================
   **„მომხმარებლების მოდულები" — სუპერადმინის ზედამხედველობა (Tasks §37.8, Q41).**

   ⚠️ **აგრეგატები და არა შიგთავსი**: სახელი, მფლობელი, ჩანაწერების რაოდენობა
   და დაკავებული ადგილი. მოდულის გვერდზე ბმული **არ არის** — სხვისი პირადი
   მოდულის ჩანაწერები სუპერადმინისთვისაც 404-ია, ე.ი. ბმული ცარიელ გვერდზე
   მიიყვანდა; მფლობელის სახელი კი მის `/users/{id}`-ზე მიდის.

   ⚠️ **ერთადერთი მოქმედება გამორთვაა** (`modules.is_active`) და **წაშლა არ
   არის** — მოდული მისი მფლობელისაა. გამორთვა მფლობელის საკუთარ
   ჩართვა/გამორთვაზე მაღლა დგას (ის თვითონ ვეღარ ჩართავს), მონაცემები
   ხელუხლებელია და მფლობელი შეტყობინებას იღებს. ⚠️ გამორთვა სხვა ადამიანს
   ეხება, ამიტომ დადასტურებას ითხოვს — ჩართვა კი არა.
   ============================================================ */

const QUERY_KEY = ['admin-custom-modules'] as const

export function CustomModulesOversight() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { date } = useDateFormat()

  const { data: rows = [], isLoading } = useQuery({ queryKey: QUERY_KEY, queryFn: fetchCustomModulesOverview })

  const toggle = useMutation({
    mutationFn: ({ id, on }: { id: number; on: boolean }) => setCustomModuleActive(id, on),
    onSuccess: (row) => {
      qc.setQueryData<CustomModuleOverview[]>(QUERY_KEY, (old) => old?.map((m) => (m.id === row.id ? row : m)))
      toast({ title: t(row.is_active ? 'customModules.oversightEnabled' : 'customModules.oversightDisabled'), variant: 'info' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const lang = i18n.language
  const { mutate, isPending } = toggle

  const name = useCallback(
    (m: CustomModuleOverview) => (lang === 'en' ? m.name_en : m.name_ka) || m.key,
    [lang],
  )

  const change = useCallback(
    async (m: CustomModuleOverview, on: boolean) => {
      if (!on) {
        const ok = await confirm({
          title: t('customModules.disableTitle', { name: name(m) }),
          description: t('customModules.disableHint', { owner: m.owner?.name ?? '—' }),
          confirmText: t('customModules.disableConfirm'),
          variant: 'destructive',
        })

        if (!ok) return
      }

      mutate({ id: m.id, on })
    },
    [confirm, mutate, name, t],
  )

  /* ⚠️ `useMemo` — `DataTable`-ის სორტირება `columns`-ზე დგას (UsersPage-ის წესი) */
  const columns = useMemo<DataColumn<CustomModuleOverview>[]>(
    () => [
      {
        key: 'module',
        label: t('customModules.oversightModule'),
        value: (m) => name(m).toLowerCase(),
        render: (m) => (
          <span className="flex items-center gap-2.5" style={modAccent(m.color) ?? MODULE_ACCENT_FALLBACK}>
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--mod-soft)]">
              <ModuleIcon name={m.icon} className="size-4 text-[var(--mod)]" />
            </span>
            <span className="min-w-0 truncate font-medium">{name(m)}</span>
          </span>
        ),
      },
      {
        key: 'owner',
        label: t('customModules.oversightOwner'),
        value: (m) => (m.owner?.name ?? '').toLowerCase(),
        render: (m) =>
          m.owner ? (
            <Link to={`/users/${m.owner.id}`} className="min-w-0 transition-colors hover:text-primary">
              <span className="block truncate">{m.owner.name}</span>
              {m.owner.username && <span className="block truncate text-xs text-muted-foreground">@{m.owner.username}</span>}
            </Link>
          ) : (
            '—'
          ),
      },
      {
        key: 'records',
        label: t('customModules.oversightRecords'),
        value: (m) => m.records,
        render: (m) => <span className="tabular-nums">{m.records}</span>,
      },
      {
        key: 'bytes',
        label: t('customModules.oversightSpace'),
        value: (m) => m.bytes,
        render: (m) => <span className="tabular-nums">{formatBytes(m.bytes)}</span>,
      },
      {
        key: 'created',
        label: t('customModules.oversightCreated'),
        value: (m) => (m.created_at ? Date.parse(m.created_at) : 0),
        render: (m) => <span className="text-muted-foreground">{m.created_at ? date(m.created_at) : '—'}</span>,
      },
      {
        key: 'active',
        label: t('customModules.oversightActive'),
        value: (m) => (m.is_active ? 1 : 0),
        render: (m) => (
          <span className="flex items-center gap-2">
            <Switch
              checked={m.is_active}
              disabled={isPending}
              aria-label={t('customModules.oversightActive')}
              onCheckedChange={(v) => void change(m, v)}
            />
            {!m.is_active && <span className="text-xs text-destructive">{t('customModules.oversightOff')}</span>}
          </span>
        ),
      },
    ],
    [t, name, change, date, isPending],
  )

  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 flex items-center gap-1.5 font-display text-lg font-semibold tracking-tight">
        <Blocks className="size-5 text-muted-foreground" />
        {t('customModules.oversightTitle')}
        <InfoHint info={t('customModules.oversightHint')} />
      </h2>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(m) => m.id}
          searchOf={(m) => [m.name_ka, m.name_en, m.owner?.name, m.owner?.username]}
          searchPlaceholder={t('customModules.oversightSearch')}
          defaultSort={{ key: 'created', dir: 'desc' }}
          empty={<EmptyState icon={<Blocks className="size-6" />} title={t('customModules.oversightEmpty')} />}
        />
      )}
    </section>
  )
}
