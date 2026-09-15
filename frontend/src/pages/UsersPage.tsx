import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpDown, ChevronDown, SquarePen, Search, Trash2 } from 'lucide-react'
import { deleteUser, fetchRoles, fetchUsers, type User } from '@/api/account'
import { useAuth } from '@/lib/auth'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { roleName } from '@/lib/display'
import { UserAvatar } from '@/components/UserAvatar'
import { ActionMenu, ActionMenuClose, actionItemClass } from '@/components/ui/action-menu'
import { Input } from '@/components/ui/input'
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
   ============================================================ */

type SortKey = 'name' | 'last_name' | 'role' | 'created_at' | 'last_activity'

/** სვეტის სათაური — დაჭერით სორტირდება */
function Th({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string
  sortKey?: SortKey
  sort: { key: SortKey; dir: 'asc' | 'desc' }
  onSort: (key: SortKey) => void
  className?: string
}) {
  if (!sortKey) {
    return <th className={cn('px-3 py-2.5 text-left font-medium', className)}>{label}</th>
  }

  const active = sort.key === sortKey
  return (
    <th className={cn('px-3 py-2.5 text-left font-medium', className)}>
      <button
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground',
          active && 'text-foreground',
        )}
      >
        {label}
        <ArrowUpDown className={cn('size-3.5', active ? 'opacity-100' : 'opacity-40')} />
      </button>
    </th>
  )
}

export function UsersPage() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { user: me, canAdmin } = useAuth()
  const fmt = useDateFormat()

  const [q, setQ] = useState('')
  const [role, setRole] = useState('all')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'created_at',
    dir: 'desc',
  })

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

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()

    const filtered = users.filter((u) => {
      if (role !== 'all' && u.role !== role) return false
      if (status === 'active' && !u.is_active) return false
      if (status === 'disabled' && u.is_active) return false
      if (!term) return true
      return [u.display_name, u.first_name, u.last_name, u.email, u.username]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    })

    const value = (u: User): string | number => {
      switch (sort.key) {
        case 'name':
          return (u.first_name || u.display_name).toLowerCase()
        case 'last_name':
          return (u.last_name ?? '').toLowerCase()
        case 'role':
          return roleName(u, i18n.language).toLowerCase()
        case 'created_at':
          return u.created_at ? Date.parse(u.created_at) : 0
        case 'last_activity':
          return u.last_activity ? Date.parse(u.last_activity) : 0
      }
    }

    return [...filtered].sort((a, b) => {
      const av = value(a)
      const bv = value(b)
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [users, q, role, status, sort, i18n.language])

  // Tasks 1.6 — წვდომა როლიდანაც შეიძლება მოვიდეს
  if (!canAdmin('users')) return null

  return (
    <PageContainer>
      <PageHeader
        tool="users"
        title={t('admin.users')}
        subtitle={t('admin.usersSubtitle')}
      />

      {/* ---------- ძებნა და ფილტრები ---------- */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('admin.searchUsers')}
            className="w-full pl-9 sm:w-72"
          />
        </div>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-44">
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
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.allStatuses')}</SelectItem>
            <SelectItem value="active">{t('admin.active')}</SelectItem>
            <SelectItem value="disabled">{t('admin.disabled')}</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          {t('admin.usersCount', { count: rows.length })}
        </span>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <Th label={t('admin.colName')} sortKey="name" sort={sort} onSort={toggleSort} />
                <Th label={t('admin.colLastName')} sortKey="last_name" sort={sort} onSort={toggleSort} />
                <Th label={t('admin.colRole')} sortKey="role" sort={sort} onSort={toggleSort} />
                <Th label={t('admin.registered')} sortKey="created_at" sort={sort} onSort={toggleSort} />
                <Th label={t('admin.lastActivity')} sortKey="last_activity" sort={sort} onSort={toggleSort} />
                <Th label={t('admin.colActions')} sort={sort} onSort={toggleSort} className="w-40 text-right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-b-0 hover:bg-muted/40">
                  <td className="px-3 py-2.5">
                    <Link to={`/users/${u.id}`} className="flex items-center gap-2.5">
                      <UserAvatar user={u} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium hover:text-primary">
                          {u.first_name || u.display_name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">{u.last_name || '—'}</td>
                  <td className="px-3 py-2.5">
                    {/* 1.2 — badge, არა checkbox */}
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
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {fmt.date(u.created_at)}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {u.last_activity ? new Date(u.last_activity).toLocaleString() : t('admin.never')}
                  </td>
                  <td className="px-3 py-2.5 text-right">
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
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    {t('admin.noUsersFound')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">{t('admin.userTableHint')}</p>
    </PageContainer>
  )
}
