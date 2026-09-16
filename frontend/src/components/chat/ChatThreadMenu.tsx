import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, BellOff, BellRing, Check, Palette, ShieldOff, SquarePen } from 'lucide-react'
import { setChatMuted, setChatNickname, setChatTheme, setBlocked, type ChatThread } from '@/api/chat'
import { CHAT_THEMES, chatThemeSwatch, type ChatTheme } from '@/lib/chatThemes'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   **საუბრის პარამეტრები ერთ ფანჯარაში (Tasks §10.5/§10.6/§10.11).**

   დადუმება, თემა, ნიკნეიმი და დაბლოკვა ერთი კითხვის ოთხი პასუხია —
   „ამ საუბარს როგორ ვინახავ". ჰედერში ოთხი ღილაკი ძაფს ხმაურს მატებდა.

   ⚠️ **თემა ორივე მხარისაა** (Messenger-ის სემანტიკა, `conversations.theme`),
   დადუმება და ნიკნეიმი კი — **მხოლოდ ჩემი**. ფანჯარა ამას ცხადად ამბობს,
   თორემ „შევუცვალე ფერი და მანაც დაინახა" გაუგებრობა იქნებოდა.

   ⚠️ **დაბლოკვა აქვეა, მაგრამ ცალკე ბლოკში და წითლად** — ის ერთადერთია,
   რაც მიმოწერას წყვეტს.
   ============================================================ */

export function ChatThreadMenu({
  id,
  thread,
  onClose,
}: {
  id: number
  thread: ChatThread
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()

  const [nickname, setNickname] = useState(thread.nickname ?? '')

  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['chat'] })
    qc.invalidateQueries({ queryKey: ['chat-unread'] })
  }

  const mute = useMutation({
    mutationFn: (next: boolean) => setChatMuted(id, next),
    onSuccess: refresh,
    onError: fail,
  })

  const theme = useMutation({
    mutationFn: (next: string | null) => setChatTheme(id, next),
    onSuccess: refresh,
    onError: fail,
  })

  const rename = useMutation({
    mutationFn: () => setChatNickname(id, nickname.trim() || null),
    onSuccess: () => {
      refresh()
      toast({ title: t('chat.nicknameSaved'), variant: 'success' })
    },
    onError: fail,
  })

  const block = useMutation({
    mutationFn: (next: boolean) => setBlocked(thread.profile!.username, next),
    onSuccess: () => {
      refresh()
      onClose()
    },
    onError: fail,
  })

  const current = (thread.theme ?? 'default') as ChatTheme
  const blockedByMe = thread.blocked_by_me

  return (
    <ModalShell title={t('chat.settingsTitle')} onClose={onClose}>
      <div className="mt-4 space-y-5">
        {/* ---------- დადუმება (§10.5) ---------- */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{t('chat.mute')}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('chat.muteHint')}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={mute.isPending}
            onClick={() => mute.mutate(!thread.muted)}
          >
            {thread.muted ? <BellRing className="size-4" /> : <BellOff className="size-4" />}
            {t(thread.muted ? 'chat.unmute' : 'chat.mute')}
          </Button>
        </div>

        {/* ---------- თემა (§10.6) ---------- */}
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Palette className="size-4" />
            {t('chat.theme')}
          </div>
          <p className="mt-0.5 mb-2 text-xs text-muted-foreground">{t('chat.themeHint')}</p>
          <div className="flex flex-wrap gap-2">
            {CHAT_THEMES.map((key) => (
              <button
                key={key}
                type="button"
                disabled={theme.isPending}
                onClick={() => theme.mutate(key === 'default' ? null : key)}
                title={t(`chat.themeName.${key}`)}
                className={cn(
                  // ⚠️ ფერს `.fb-chat-swatch` აწებებს (index.css) — მუქი ვარიანტი
                  // CSS-ით ირჩევა და არა JS-ით
                  'fb-chat-swatch grid size-9 cursor-pointer place-items-center rounded-md border transition-colors',
                  current === key ? 'border-primary' : 'border-border hover:border-primary/40',
                )}
                style={chatThemeSwatch(key)}
              >
                {current === key && <Check className="size-4 text-white drop-shadow" />}
              </button>
            ))}
          </div>
        </div>

        {/* ---------- ნიკნეიმი (§10.11) ---------- */}
        <div>
          <Label htmlFor="chat-nickname" className="flex items-center gap-1.5">
            <SquarePen className="size-4" />
            {t('chat.nickname')}
          </Label>
          <p className="mt-0.5 mb-2 text-xs text-muted-foreground">{t('chat.nicknameHint')}</p>
          <div className="flex gap-2">
            <Input
              id="chat-nickname"
              value={nickname}
              maxLength={60}
              placeholder={thread.profile?.display_name ?? ''}
              onChange={(e) => setNickname(e.target.value)}
            />
            <Button variant="outline" disabled={rename.isPending} onClick={() => rename.mutate()}>
              {t('actions.save')}
            </Button>
          </div>
        </div>

        {/* ---------- დაბლოკვა ---------- */}
        {(!thread.blocked || blockedByMe) && (
          <div className="border-t border-border pt-4">
            <Button
              variant="ghost"
              className={blockedByMe ? undefined : 'text-destructive'}
              disabled={block.isPending}
              onClick={async () => {
                if (blockedByMe) return block.mutate(false)
                if (await confirm({ title: t('chat.blockConfirm'), variant: 'destructive' })) {
                  block.mutate(true)
                }
              }}
            >
              {blockedByMe ? <ShieldOff className="size-4" /> : <Ban className="size-4" />}
              {t(blockedByMe ? 'chat.unblock' : 'chat.block')}
            </Button>
          </div>
        )}
      </div>
    </ModalShell>
  )
}
