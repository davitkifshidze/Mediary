import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import {
  Bell,
  CheckCheck,
  CircleAlert,
  DatabaseBackup,
  HardDrive,
  ListChecks,
  Trash2,
} from 'lucide-react'
import {
  clearNotifications,
  fetchNotifications,
  fetchUnreadNotifications,
  markNotificationsRead,
  type AppNotification,
} from '@/api/notifications'
import { useDateFormat } from '@/lib/dates'
import { LAYER_POPUP } from '@/lib/layers'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/feedback'

/**
 * **შეტყობინებების ცენტრი (FEAT-19) — ჰედერის ზარი.**
 *
 * ⚠️ **ორი query და არა ერთი.** ბეჯი ყოველ 30 წამში მხოლოდ **რიცხვს**
 * ეკითხება (ჩატის წაუკითხავის ზუსტი ფორმა), სრული სია კი მხოლოდ მაშინ
 * იტვირთება, როცა პანელი იხსნება — თორემ ყოველი პოლინგი ორმოცდაათ რიგს
 * ეზიდებოდა.
 *
 * ⚠️ **ტექსტი `type`-იდან იგება და სერვერიდან არ მოდის**: ენა ბრაუზერში
 * ირჩევა. უცნობი სახე — **ნედლი კოდის ნაცვლად ზოგადი სათაური**: ახალი
 * ტიპი ძველ SPA-ზე „რაღაც მოხდა"-დ იკითხება და არა `batch_done`-ად.
 *
 * ⚠️ **ზარი მხოლოდ მაშინ ჩანს, როცა რაღაც არის** — არც წაუკითხავი და
 * არც სია, ე.ი. ცარიელი ღილაკი ჰედერს ტყუილად არ იკავებს (თარგმანის
 * ღილაკის იგივე წესი).
 */

const ICONS: Record<string, typeof Bell> = {
  request_approved: CheckCheck,
  request_rejected: CircleAlert,
  storage_warning: HardDrive,
  backup_failed: DatabaseBackup,
  batch_done: ListChecks,
}

export function NotificationBell() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const fmt = useDateFormat()
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)

  const { data: unread = 0 } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: fetchUnreadNotifications,
    refetchInterval: 30_000,
  })

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    // სია მხოლოდ გახსნისას — პოლინგი რიცხვს ეკითხება
    enabled: open,
  })

  const items = data?.items ?? []

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['notifications'] })
    qc.invalidateQueries({ queryKey: ['notifications-unread'] })
  }

  const read = useMutation({ mutationFn: markNotificationsRead, onSuccess: refresh })
  const clear = useMutation({ mutationFn: clearNotifications, onSuccess: refresh })

  /** მეორე ხაზი — მოვლენის დეტალი; `null`, თუ სათაურს დასამატებელი არაფერი აქვს */
  const detail = (n: AppNotification): string | null => {
    const d = n.data as Record<string, string | number | undefined>

    if (n.type === 'storage_warning') {
      return t('notifications.detail.storage', { percent: d.percent, threshold: d.threshold })
    }
    if (n.type === 'backup_failed' && d.name) {
      return t('notifications.detail.backup', { name: d.name })
    }
    if (n.type === 'batch_done') {
      return t('notifications.detail.batch', { total: d.total ?? 0, failed: d.failed ?? 0 })
    }
    // ⚠️ მოდულის სახელი **ორივე ენაზე მოდის** — ინტერფეისის ენა წყვეტს, რომელი
    const name = i18n.language === 'en' ? d.module_en : d.module_ka
    if (name) return t('notifications.detail.module', { name })
    if (d.note) return t('notifications.detail.note', { note: d.note })

    return null
  }

  if (unread === 0 && items.length === 0) return null

  const row = (n: AppNotification) => {
    const Icon = ICONS[n.type] ?? Bell
    const line = detail(n)
    const title = NOTIFICATION_LABEL(t, n.type)

    const body = (
      <>
        <span
          className={cn(
            'mt-0.5 grid size-7 shrink-0 place-items-center rounded-md',
            n.read_at ? 'bg-secondary text-muted-foreground' : 'bg-primary/15 text-primary',
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block text-sm', n.read_at ? 'text-muted-foreground' : 'font-medium')}>
            {title}
          </span>
          {line && <span className="mt-0.5 block text-xs text-muted-foreground">{line}</span>}
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {fmt.relative(n.created_at)}
          </span>
        </span>
      </>
    )

    const shared = 'flex w-full gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted'

    /* ⚠️ **გახსნა წაკითხვასაც ნიშნავს** — ცალკე „წავიკითხე" ღილაკი თითო
       რიგზე იმას ნიშნავდა, რომ ბეჯი მას შემდეგაც ანთია, რაც ადამიანმა
       საქმე უკვე გააკეთა. */
    return n.route ? (
      <Link
        key={n.id}
        to={n.route}
        className={shared}
        onClick={() => {
          if (!n.read_at) read.mutate(n.id)
          setOpen(false)
        }}
      >
        {body}
      </Link>
    ) : (
      <button
        key={n.id}
        type="button"
        className={shared}
        onClick={() => !n.read_at && read.mutate(n.id)}
      >
        {body}
      </button>
    )
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        title={t('notifications.title')}
        aria-label={t('notifications.title')}
        className="relative grid size-9 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-md bg-primary px-1 text-[10px] font-semibold leading-[18px] text-primary-foreground">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={8}
          className={cn(
            LAYER_POPUP,
            'fb-content w-80 rounded-xl border border-border bg-card p-1.5 shadow-xl focus:outline-none',
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-2.5 pb-2 pt-1.5">
            <p className="text-sm font-medium">{t('notifications.title')}</p>
            {unread > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => read.mutate(undefined)}
                disabled={read.isPending}
              >
                <CheckCheck className="size-4" />
                {t('notifications.markAll')}
              </Button>
            )}
          </div>

          <div className="fb-scroll mt-1.5 max-h-96 space-y-0.5 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">
                {t('notifications.empty')}
              </p>
            ) : (
              items.map(row)
            )}
          </div>

          {items.length > 0 && (
            <div className="mt-1.5 border-t border-border pt-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={async () => {
                  if (
                    await confirm({
                      title: t('notifications.clear'),
                      description: t('notifications.clearConfirm'),
                      variant: 'destructive',
                    })
                  ) {
                    clear.mutate()
                  }
                }}
              >
                <Trash2 className="size-4" />
                {t('notifications.clear')}
              </Button>
            </div>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

/**
 * ⚠️ **უცნობი სახე ზოგად სათაურს იღებს და არა ნედლ კოდს.** სერვერს
 * მოგვიანებით შეიძლება ახალი ტიპი დაემატოს, ხოლო ბრაუზერში გახსნილი
 * ძველი SPA მას `snake_case`-ად დახატავდა.
 */
function NOTIFICATION_LABEL(t: (key: string) => string, type: string): string {
  const key = `notifications.kind.${type}`
  const text = t(key)

  return text === key ? t('notifications.title') : text
}
