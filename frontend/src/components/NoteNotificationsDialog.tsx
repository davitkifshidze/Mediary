import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing, Check, Send, TriangleAlert } from 'lucide-react'
import { fetchNotificationLog, markNotificationRead, type NoteNotification } from '@/api/notes'
import { useDateFormat } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ModalShell } from '@/components/ui/modal-shell'

/* ============================================================
   შეხსენებების ჟურნალი (Tasks §8.2).

   ⚠️ **ეს ელფოსტის არხის ჩამნაცვლებელია.** არხი ამოღებულია („არ გვინდა"),
   და მასთან ერთად წავიდა ერთადერთი გზა, რომლითაც შეხსენება **დახურულ
   აპშიც** გაწვდებოდა. ხვრელს ჟურნალი ხურავს: ყოველი გასროლა ისედაც
   იწერებოდა `note_notifications`-ში — უბრალოდ არსად ჩანდა.

   ⚠️ **ეს რიგი არ არის.** „ამოხტომა" ცალკე მექანიზმია (`useNoteReminderWatcher`
   → `GET /note-reminders/due`) და წაკითხვისთანავე ქრება. აქ კი ისტორიაა,
   წაკითხულის ჩათვლით — თორემ ჟურნალი, რომელიც თავს იწმენდს, ჟურნალი აღარაა.

   ⚠️ **ჩავარდნილი გაგზავნა ცხადად ჩანს** (`status: failed` + მიზეზი): ტელეგრამის
   ბოტი რომ არ არის მორგებული, ეს „შეხსენება არ მოსულა"-სგან უნდა გაირჩეოდეს.
   ============================================================ */

export function NoteNotificationsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { dateTime } = useDateFormat()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['note-notifications'],
    queryFn: () => fetchNotificationLog({ per_page: 50 }),
  })

  const read = useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['note-notifications'] })
      qc.invalidateQueries({ queryKey: ['note-reminders', 'due'] })
    },
  })

  const rows = data?.data ?? []

  return (
    <ModalShell title={t('notes.logTitle')} onClose={onClose} wide>
      <p className="mt-2 text-xs text-muted-foreground">{t('notes.logHint')}</p>

      <div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
        {isLoading && <p className="text-sm text-muted-foreground">{t('api.loading')}</p>}

        {!isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('notes.logEmpty')}</p>
        )}

        {rows.map((row) => (
          <LogRow key={row.id} row={row} at={dateTime} onRead={() => read.mutate(row.id)} />
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
      </div>
    </ModalShell>
  )
}

function LogRow({
  row,
  at,
  onRead,
}: {
  row: NoteNotification
  at: (value: string | null | undefined) => string
  onRead: () => void
}) {
  const { t } = useTranslation()
  const failed = row.status === 'failed'
  const unread = !row.read_at

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3',
        failed ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card/50',
        unread && !failed && 'border-primary/40',
      )}
    >
      <span className="mt-0.5 shrink-0 text-muted-foreground">
        {failed ? (
          <TriangleAlert className="size-4 text-destructive" />
        ) : row.channel === 'telegram' ? (
          <Send className="size-4" />
        ) : (
          <BellRing className="size-4" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{row.title}</p>
        {row.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{row.body}</p>}
        <p className="mt-1 text-[11px] text-muted-foreground">
          {at(row.scheduled_for)} · {t(`notes.channels.${row.channel}`)}
          {/* ჩავარდნის მიზეზი პირდაპირ რიგშივე — ცალკე გამოძიება არ უნდა დასჭირდეს */}
          {failed && row.error && ` · ${row.error}`}
        </p>
      </div>

      {unread && (
        <Button variant="ghost" size="sm" onClick={onRead} title={t('notes.logMarkRead')}>
          <Check className="size-4" />
        </Button>
      )}
    </div>
  )
}
