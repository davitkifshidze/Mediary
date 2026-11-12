import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { ArrowRight, Bell, CheckCheck, Loader2, Plus } from 'lucide-react'
import {
  fetchNotificationCounts,
  fetchNotifications,
  markNotificationsRead,
  markNotificationsSeen,
  type AppNotification,
} from '@/api/notifications'
import { useDateFormat } from '@/lib/dates'
import { LAYER_POPUP } from '@/lib/layers'
import { notificationDetail, notificationIcon, notificationTitle } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useQueue } from '@/components/ui/queue'

/**
 * **შეტყობინებების ცენტრი — ჰედერის ზარი.**
 *
 * ⚠️ **ორი query და არა ერთი.** ზარი ყოველ 30 წამში მხოლოდ **რიცხვებს**
 * ეკითხება, სია კი მხოლოდ მაშინ იტვირთება, როცა პანელი იხსნება — თორემ ყოველი
 * პოლინგი ოც რიგს ეზიდებოდა.
 *
 * ⚠️ **რიცხვი უნახავია, წერტილი — წაუკითხავი.** ზარის გახსნა ყველაფერს
 * *ნახულად* ნიშნავს (რიცხვი ქრება), მაგრამ არაფერს კითხულობს: წაუკითხავს
 * წერტილი რჩება, სანამ არ დააჭერ. ადრე რიცხვი მანამ ენთო, სანამ ყველაფერს
 * სათითაოდ არ გახსნიდი.
 *
 * ⚠️ **ტექსტი `type`-იდან იგება და სერვერიდან არ მოდის** (`lib/notifications.ts`):
 * ენა ბრაუზერში ირჩევა.
 *
 * ⚠️ **ზარი მხოლოდ მაშინ ჩანს, როცა რაღაც არის** — ცარიელი ღილაკი ჰედერს
 * ტყუილად არ იკავებს (თარგმანის ღილაკის იგივე წესი). სრული სია — გვერდებით,
 * ფილტრით და მასობრივი მოქმედებებით — `/notifications`-ზეა („ყველას ნახვა").
 */

/** პანელში რამდენი ჩანს — დანარჩენი გვერდზეა */
const PANEL_SIZE = 20

export function NotificationBell() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const fmt = useDateFormat()
  const { enqueue, isQueued } = useQueue()
  const [open, setOpen] = useState(false)

  const { data: counts } = useQuery({
    queryKey: ['notifications-counts'],
    queryFn: fetchNotificationCounts,
    refetchInterval: 30_000,
  })

  const { data } = useQuery({
    queryKey: ['notifications', 'panel'],
    queryFn: () => fetchNotifications({ per_page: PANEL_SIZE }),
    // სია მხოლოდ გახსნისას — პოლინგი რიცხვებს ეკითხება
    enabled: open,
  })

  const items = data?.items ?? []
  const unseen = counts?.unseen ?? 0
  const unread = counts?.unread ?? 0
  const total = counts?.total ?? 0

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['notifications'] })
    qc.invalidateQueries({ queryKey: ['notifications-counts'] })
  }

  const read = useMutation({ mutationFn: (id?: string) => markNotificationsRead(id), onSuccess: refresh })
  const seen = useMutation({
    mutationFn: () => markNotificationsSeen(),
    onSuccess: (next) => qc.setQueryData(['notifications-counts'], next),
  })

  if (total === 0 && unseen === 0) return null

  const change = (next: boolean) => {
    setOpen(next)
    // გახსნა = „დავინახე": რიცხვი ქრება, წერტილები რჩება
    if (next && unseen > 0) seen.mutate()
  }

  const row = (n: AppNotification) => {
    const Icon = notificationIcon(n.type)
    const line = notificationDetail(n, t, i18n.language)

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
            {notificationTitle(t, n.type)}
          </span>
          {line && <span className="mt-0.5 block text-xs text-muted-foreground">{line}</span>}
          <span className="mt-0.5 block text-[11px] text-muted-foreground">{fmt.relative(n.created_at)}</span>
        </span>
        {/* წაუკითხავის წერტილი — დაჭერამდე რჩება */}
        {!n.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" data-testid="unread-dot" />}
      </>
    )

    const shared = 'flex w-full cursor-pointer gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted'

    /* ⚠️ **გახსნა წაკითხვასაც ნიშნავს** — ცალკე „წავიკითხე" ღილაკი თითო
       რიგზე იმას ნიშნავდა, რომ წერტილი მას შემდეგაც ანთია, რაც ადამიანმა
       საქმე უკვე გააკეთა. */
    const main = n.route ? (
      <Link
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
      <button data-kind="row" type="button" className={shared} onClick={() => !n.read_at && read.mutate(n.id)}>
        {body}
      </button>
    )

    /* „ფრანჩაიზს ნაწილი აკლია" — ნაწილი აქედანვე ემატება („აღმოჩენის" რიგით), გვერდზე
       გადასვლის გარეშე. ⚠️ ღილაკი რიგის **ქვემოთაა** და არა შიგნით: რიგი ბმულია, ღილაკი
       ბმულში კი არასწორი HTML-ია. დამატება წაკითხვასაც ნიშნავს. */
    const tmdbId = n.type === 'franchise_part' ? Number(n.data.tmdb_id) || 0 : 0
    const adding = tmdbId > 0 && isQueued(tmdbId, 'movie')

    return (
      <div key={n.id}>
        {main}
        {tmdbId > 0 && (
          <div className="flex justify-end px-2 pb-1.5">
            <Button
              type="button"
              size="xs"
              disabled={adding}
              data-testid="bell-add-part"
              onClick={() => {
                enqueue([{ tmdbId, title: String(n.data.title_en ?? n.data.title_ka ?? '') }], 'movie')
                if (!n.read_at) read.mutate(n.id)
              }}
            >
              {adding ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              {adding ? t('queue.queued') : t('actor.add')}
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={change}>
      <PopoverPrimitive.Trigger
        title={t('notifications.title')}
        aria-label={t('notifications.title')}
        className="relative grid size-9 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
      >
        <Bell className="size-5" />
        {unseen > 0 ? (
          <span
            data-testid="bell-count"
            className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-md bg-primary px-1 text-[10px] font-semibold leading-[18px] text-primary-foreground"
          >
            {unseen > 99 ? '99+' : unseen}
          </span>
        ) : (
          // ნახული, მაგრამ ჯერ წაუკითხავი — რიცხვის ნაცვლად წერტილი
          unread > 0 && <span data-testid="bell-dot" className="absolute right-1 top-1 size-2 rounded-full bg-primary" />
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
                variant="outline"
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
              <EmptyState size="compact" kind="bell" title={t('notifications.empty')} />
            ) : (
              items.map(row)
            )}
          </div>

          {/* სრული სია — გვერდებით, ფილტრით და მასობრივი მოქმედებებით */}
          <div className="mt-1.5 border-t border-border pt-1.5">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full justify-between')}
            >
              {t('notifications.seeAll')}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
