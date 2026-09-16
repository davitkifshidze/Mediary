import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, SquarePen, Trash2 } from 'lucide-react'
import { deleteUser, fetchRoles, fetchUsers, type User } from '@/api/account'
import { useAuth } from '@/lib/auth'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { roleName } from '@/lib/display'
import { UserAvatar } from '@/components/UserAvatar'
import { ActionMenu, ActionMenuClose, actionItemClass } from '@/components/ui/action-menu'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { InfoHint } from '@/components/ui/info-hint'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   მომხმარებლების სექცია (Tasks 1.1/1.2) — ადრე ადმინის ტაბი იყო.

   ერთი ცხრილი: სახელი · გვარი · როლი · რეგისტრაცია · ბოლო აქტივობა ·
   მოქმედება. როლი/სტატუსი/მოდულები **შიდა გვერდზე** იმართება (1.3),
   რომ სია მსუბუქი დარჩეს.

   ⚠️ **ცხრილი `DataTable`-ია (Tasks §5).** აქ ის ხელით ეწერა — საკუთარი
   `Th` კომპონენტით, საკუთარი `toggleSort`-ითა და საკუთარი ძებნით — და
   **გვერდები საერთოდ არ ჰქონდა**, ე.ი. სია მთლიანად ერთ ეკრანზე იყრიდა
   თავს. სამივე ფაქტი გაზიარებულ კომპონენტში უკვე ეწერა; მეორე ასლი კი
   სწორედ ის დუბლირებაა, რომლის გამოც `DataTable` თავის დროზე გამოვიდა.

   ⚠️ **როლისა და სტატუსის ფილტრები ცხრილს არ ეკუთვნის** (ისინი *სიას*
   ჭრიან და არა ტექსტს ეძებენ), ამიტომ `rows`-ს გადაცემამდე მოქმედებენ,
   ხოლო თვითონ კონტროლები `toolbar`-ში ჯდება — რომ ერთსა და იმავე ზოლში
   იყოს ყველაფერი, რითიც სია ვიწროვდება.
   ============================================================ */

export function UsersPage() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { user: me, canAdmin } = useAuth()
  const fmt = useDateFormat()

  const [role, setRole] = useState('all')
  const [status, setStatus] = useState('all')

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: fetchUsers,
    enabled: canAdmin('users'),
  })
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: fetchRoles, enabled: canAdmin('roles') })

  const remove = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast({ title: t('admin.userDeleted'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const rows = useMemo(
    () =>
      users.filter((u) => {
        if (role !== 'all' && u.role !== role) return false
        if (status === 'active' && !u.is_active) return false
        if (status === 'disabled' && u.is_active) return false
        return true
      }),
    [users, role, status],
  )

  /* ⚠️ `useMemo` აუცილებელია: `DataTable`-ის ფილტრაცია/სორტირება `columns`-ზეა
     დამოკიდებული, ე.ი. ყოველ რენდერზე ახალი მასივი მთელ სიას თავიდან
     გადაალაგებდა. */
  const columns = useMemo<DataColumn<User>[]>(
    () => [
      {
        key: 'name',
        label: t('admin.colName'),
        value: (u) => (u.first_name || u.display_name).toLowerCase(),
        render: (u) => (
          <Link to={`/users/${u.id}`} className="flex items-center gap-2.5">
            <UserAvatar user={u} />
            <span className="min-w-0">
              <span className="block truncate font-medium transition-colors hover:text-primary">
                {u.first_name || u.display_name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
            </span>
          </Link>
        ),
      },
      {
        key: 'last_name',
        label: t('admin.colLastName'),
        value: (u) => (u.last_name ?? '').toLowerCase(),
        render: (u) => u.last_name || '—',
      },
      {
        key: 'role',
        label: t('admin.colRole'),
        value: (u) => roleName(u, i18n.language).toLowerCase(),
        render: (u) => (
          // 1.2 — badge, არა checkbox
          <span className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'rounded-md px-2 py-0.5 text-[11px] leading-relaxed',
                u.is_super_admin ? 'bg-primary text-primary-foreground' : 'bg-secondary',
              )}
            >
              {roleName(u, i18n.language)}
            </span>
            {!u.is_active && (
              <span className="rounded-md border border-destructive/40 px-2 py-0.5 text-[11px] leading-relaxed text-destructive">
                {t('admin.disabled')}
              </span>
            )}
          </span>
        ),
      },
      {
        key: 'created_at',
        label: t('admin.registered'),
        className: 'w-36',
        value: (u) => (u.created_at ? Date.parse(u.created_at) : 0),
        render: (u) => <span className="text-muted-foreground">{fmt.date(u.created_at)}</span>,
      },
      {
        key: 'last_activity',
        label: t('admin.lastActivity'),
        className: 'w-44',
        value: (u) => (u.last_activity ? Date.parse(u.last_activity) : 0),
        /* ⚠️ აქ ადრე ბარე `toLocaleString()` იყო, ე.ი. თარიღის ერთიანი
           პარამეტრი ამ ერთ უჯრაზე არაფერს ცვლიდა (`lib/dates.ts`-ის წესი). */
        render: (u) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {u.last_activity ? fmt.dateTime(u.last_activity) : t('admin.never')}
          </span>
        ),
      },
      {
        key: 'actions',
        label: t('admin.colActions'),
        className: 'w-40 text-right',
        render: (u) => (
          <div className="flex justify-end">
            {/* 1.2 — `...`-ის ნაცვლად ცხადი ღილაკი „მოქმედება" */}
            <ActionMenu
              label={t('admin.colActions')}
              trigger={
                <span className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-xs transition-colors hover:bg-muted">
                  {t('admin.colActions')}
                  <ChevronDown className="size-3.5" />
                </span>
              }
            >
              <ActionMenuClose asChild>
                <Link to={`/users/${u.id}`} className={actionItemClass()}>
                  <SquarePen className="size-4 shrink-0" />
                  {t('actions.edit')}
                </Link>
              </ActionMenuClose>
              <ActionMenuClose asChild>
                <button
                  disabled={u.id === me?.id}
                  className={cn(actionItemClass('destructive'), 'disabled:opacity-40')}
                  onClick={async () => {
                    const ok = await confirm({
                      title: t('admin.deleteUser'),
                      description: t('admin.deleteUserHint', {
                        name: u.display_name,
                        movies: u.movies_count ?? 0,
                        series: u.series_count ?? 0,
                      }),
                      variant: 'destructive',
                    })
                    if (ok) remove.mutate(u.id)
                  }}
                >
                  <Trash2 className="size-4 shrink-0" />
                  {t('actions.delete')}
                </button>
              </ActionMenuClose>
            </ActionMenu>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language, fmt.date, fmt.dateTime, me?.id],
  )

  // Tasks 1.6 — წვდომა როლიდანაც შეიძლება მოვიდეს
  if (!canAdmin('users')) return null

  return (
    <PageContainer>
      <PageHeader
        tool="users"
        title={t('admin.users')}
        hint={<InfoHint info={t('admin.usersSubtitle')} />}
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(u) => u.id}
          defaultSort={{ key: 'created_at', dir: 'desc' }}
          pageSize={25}
          minWidth="880px"
          searchPlaceholder={t('admin.searchUsers')}
          searchOf={(u) => [u.display_name, u.first_name, u.last_name, u.email, u.username]}
          empty={t('admin.noUsersFound')}
          toolbar={
            <>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('admin.allRoles')}</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.key}>
                      {i18n.language === 'ka' ? r.name_ka : r.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('admin.allStatuses')}</SelectItem>
                  <SelectItem value="active">{t('admin.active')}</SelectItem>
                  <SelectItem value="disabled">{t('admin.disabled')}</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
        />
      )}

      <p className="mt-3 text-xs text-muted-foreground">{t('admin.userTableHint')}</p>
    </PageContainer>
  )
}
