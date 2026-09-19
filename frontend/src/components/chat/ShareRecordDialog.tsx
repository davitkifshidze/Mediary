import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { fetchConversations, shareRecord } from '@/api/chat'
import { storageUrl } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { ModalShell } from '@/components/ui/modal-shell'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   ჩანაწერის გაზიარება ჩატში (FEAT-13).

   ⚠️ **საუბარს ვირჩევთ და არა ადამიანს.** ახალი საუბრის დაწყება
   `POST /chat/with/{username}`-ია და ის თავისი კარიბჭეებით (ორივე
   პროფილი საჯარო, დაბლოკვა) `/people`-ზე უკვე არსებობს — აქ მისი
   გამეორება ორ ადგილას ერთსა და იმავე წესს დაბადებდა.

   ⚠️ **კომენტარი არჩევითია**: ბარათი თვითონაა შეტყობინება. სავალდებულო
   ტექსტი „ეს ნახე"-ს აკრეფას ყოველ ჯერზე მოითხოვდა.
   ============================================================ */

export function ShareRecordDialog({
  domain,
  recordId,
  title,
  onClose,
}: {
  domain: string
  recordId: number
  title: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()

  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [sent, setSent] = useState<number[]>([])

  const list = useQuery({ queryKey: ['chat'], queryFn: fetchConversations })
  const conversations = list.data?.data ?? []

  const send = async (id: number) => {
    setBusy(id)
    try {
      await shareRecord(id, domain, recordId, note.trim() || undefined)
      setSent((prev) => [...prev, id])
      toast({ title: t('chat.shareSent'), variant: 'success' })
    } catch (e) {
      toast({ title: errorMessage(e), variant: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <ModalShell title={t('chat.shareTitle')} onClose={onClose}>
      <p className="mb-3 text-sm text-muted-foreground">{t('chat.shareHint', { name: title })}</p>

      <label className="mb-4 block">
        <span className="mb-1 block text-sm font-medium">{t('chat.shareNote')}</span>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('chat.shareNotePlaceholder')} />
      </label>

      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : conversations.length === 0 ? (
        <EmptyState icon={<Send className="size-6" />} title={t('chat.empty')} hint={t('chat.shareEmptyHint')} />
      ) : (
        <ul className="space-y-1.5">
          {conversations.map((c) => {
            const name = c.nickname ?? c.profile?.display_name ?? '—'
            const avatar = c.profile?.avatar_path ? storageUrl(c.profile.avatar_path) : null

            return (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-md border border-border bg-background p-2.5"
              >
                {avatar ? (
                  <img src={avatar} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold uppercase">
                    {name.slice(0, 2)}
                  </span>
                )}

                <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy !== null || sent.includes(c.id)}
                  onClick={() => send(c.id)}
                >
                  <Send className="size-4" />
                  {sent.includes(c.id) ? t('chat.shareDone') : t('chat.shareAction')}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </ModalShell>
  )
}
