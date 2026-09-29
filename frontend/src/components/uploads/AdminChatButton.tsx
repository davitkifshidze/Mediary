import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { MessageSquareText } from 'lucide-react'
import { fetchChatAdmins, openConversation } from '@/api/chat'
import { errorMessage } from '@/lib/errors'
import { ActionMenu, actionItemClass } from '@/components/ui/action-menu'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **„მიწერე ადმინს" (Tasks §34.5)** — ჩატი სუპერადმინთან.

   ⚠️ **მიწერა ყოველთვის შეიძლება** — პროფილის საჯაროობის მიუხედავად
   (`ChatService::staffPair()`); დაბლოკვა კი მაინც მოქმედებს, და მაშინ
   სერვერის `chat_blocked` toast-ად ჩანს.

   ⚠️ **ერთი ადმინი — ერთი დაჭერა, რამდენიმე — სია.** ადმინის გარეშე
   ინსტალაციაზე (ან როცა ერთადერთი ადმინი მე ვარ) ღილაკი საერთოდ არ
   იხატება — ღილაკი, რომელიც არსად მიდის, ტყუილი იქნებოდა.
   ============================================================ */

export function AdminChatButton() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { toast } = useToast()

  const { data: admins = [] } = useQuery({ queryKey: ['chat-admins'], queryFn: fetchChatAdmins, staleTime: 10 * 60_000 })

  const open = useMutation({
    mutationFn: (username: string) => openConversation(username),
    onSuccess: (id) => navigate(`/chat/${id}`),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  if (admins.length === 0) return null

  const label = (
    <>
      <MessageSquareText className="size-4" />
      {t('uploads.writeAdmin')}
    </>
  )

  return (
    <span className="inline-flex items-center gap-1.5">
      {admins.length === 1 ? (
        <Button size="sm" variant="outline" disabled={open.isPending} onClick={() => open.mutate(admins[0].username)}>
          {label}
        </Button>
      ) : (
        <ActionMenu
          label={t('uploads.writeAdminPick')}
          trigger={
            <Button size="sm" variant="outline" disabled={open.isPending}>
              {label}
            </Button>
          }
        >
          {admins.map((a) => (
            <button key={a.username} type="button" className={actionItemClass()} onClick={() => open.mutate(a.username)}>
              {a.display_name}
              <span className="text-xs text-muted-foreground">@{a.username}</span>
            </button>
          ))}
        </ActionMenu>
      )}
      <InfoHint info={t('uploads.writeAdminHint')} />
    </span>
  )
}
