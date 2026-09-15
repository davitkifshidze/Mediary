import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Ban,
  FileText,
  Loader2,
  Paperclip,
  Send,
  ShieldOff,
  Trash2,
  X,
} from 'lucide-react'
import {
  attachmentUrl,
  deleteAttachment,
  deleteMessage,
  fetchConversations,
  fetchThread,
  mediaTypeOf,
  sendAttachment,
  sendMessage,
  setBlocked,
  type ChatConversation,
  type ChatMessage,
  type RemovalScope,
} from '@/api/chat'
import { storageUrl } from '@/lib/api'
import { errorMessage, isApiCode } from '@/lib/errors'
import { cn, formatBytes } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ModalShell } from '@/components/ui/modal-shell'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm, useToast } from '@/components/ui/feedback'

/* ============================================================
   ჩატი (Tasks §16.3) — `/chat` და `/chat/:id`.

   ⚠️ **რეალურ დროში მიწოდება polling-ია და არა WebSocket** — §16.3-ის
   ცხადი გადაწყვეტილება: worker-ს არ ითხოვს. ღია საუბარი 5 წამში ერთხელ
   ახლდება, სია — 15 წამში.

   **მედია გაკეთდა 2026-09-06-ს** (`docs/DECISIONS.md` §1).

   ⚠️ **ფაილის წაშლა ორივესთან შლის** — შეტყობინების ბუშტი რჩება და
   ნაცრისფერ „ფაილი წაშლილია"-დ იხატება. ასე გამგზავნის კვოტა მართლა
   თავისუფლდება და საუბრის ძაფიც იკითხება.

   ⚠️ **წაშლა მხოლოდ გამგზავნს შეუძლია** — ფაილი მისი კვოტიდან იხარჯება
   (§16.4), ე.ი. მიმღების ღილაკი ჩუმად სხვის ადგილს ათავისუფლებდა.
   ============================================================ */

const THREAD_POLL_MS = 5_000
const LIST_POLL_MS = 15_000

export function ChatPage() {
  const { id } = useParams()
  const { t } = useTranslation()
  const conversationId = id ? Number(id) : null

  const list = useQuery({
    queryKey: ['chat'],
    queryFn: fetchConversations,
    refetchInterval: LIST_POLL_MS,
  })

  return (
    <PageContainer>
      {/* §23 — ჰედერი საერთო კომპონენტისაა: ხელით აწყობილი სათაური სექციის
          ფერს ვერასდროს მიიღებდა, და თან ერთი სექცია დანარჩენებისგან
          განსხვავებულად გამოიყურებოდა. */}
      <PageHeader tool="chat" title={t('chat.title')} subtitle={t('chat.subtitle')} />

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        {/* ---------- საუბრების სია ---------- */}
        <aside className={cn('min-w-0', conversationId && 'hidden lg:block')}>
          {list.isLoading && <div className="h-24 animate-pulse rounded-xl bg-muted" />}

          {list.data && list.data.data.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t('chat.empty')}
            </p>
          )}

          <ul className="space-y-1.5">
            {list.data?.data.map((c) => (
              <ConversationRow key={c.id} conversation={c} active={c.id === conversationId} />
            ))}
          </ul>
        </aside>

        {/* ---------- გახსნილი საუბარი ---------- */}
        <section className="min-w-0">
          {conversationId ? (
            <Thread id={conversationId} />
          ) : (
            <p className="hidden rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground lg:block">
              {t('chat.pickConversation')}
            </p>
          )}
        </section>
      </div>
    </PageContainer>
  )
}

function ConversationRow({ conversation: c, active }: { conversation: ChatConversation; active: boolean }) {
  const { t } = useTranslation()
  const name = c.profile?.display_name ?? '—'
  const avatar = c.profile?.avatar_path ? storageUrl(c.profile.avatar_path) : null

  return (
    <li>
      <Link
        to={`/chat/${c.id}`}
        className={cn(
          'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
          active ? 'border-primary bg-secondary/50' : 'border-border bg-card hover:bg-secondary/40',
        )}
      >
        {avatar ? (
          <img src={avatar} alt={name} className="size-10 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold uppercase">
            {name.slice(0, 2)}
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {c.last_message
              ? `${c.last_message.mine ? `${t('chat.you')}: ` : ''}${
                  // მედიაზე ტექსტი ცარიელია — სახელი ან „ფაილი" უნდა ჩანდეს
                  c.last_message.body || c.last_message.attachment_name || t(`chat.type.${c.last_message.type}`)
                }`
              : t('chat.noMessages')}
          </span>
        </span>

        {c.unread > 0 && (
          <span className="shrink-0 rounded-md bg-primary px-1.5 py-0.5 text-xs leading-none text-primary-foreground">
            {c.unread}
          </span>
        )}
      </Link>
    </li>
  )
}

function Thread({ id }: { id: number }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  // §4.6 — რომელ წერილს ვშლით (დიალოგი კითხულობს, ვისთან)
  const [removing, setRemoving] = useState<ChatMessage | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)

  const thread = useQuery({
    queryKey: ['chat', id],
    queryFn: () => fetchThread(id),
    refetchInterval: THREAD_POLL_MS,
    placeholderData: keepPreviousData,
    retry: false,
  })

  // ახალ შეტყობინებაზე ბოლოში ჩამოსქროლვა
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [thread.data?.data.length])

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['chat'] })
    qc.invalidateQueries({ queryKey: ['chat-unread'] })
    // §16.4 — ატვირთვა კვოტას ხარჯავს, ე.ი. ჰედერისა და `/settings`-ის ციფრიც
    qc.invalidateQueries({ queryKey: ['storage'] })
    qc.invalidateQueries({ queryKey: ['me'] })
  }

  const send = useMutation({
    // ფაილი არჩეულია → ატვირთვა; წარწერა (`body`) არჩევითია
    mutationFn: () =>
      file
        ? sendAttachment(id, file, mediaTypeOf(file), body.trim() || undefined)
        : sendMessage(id, body.trim()),
    onSuccess: () => {
      setBody('')
      setFile(null)
      refresh()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const removeFile = useMutation({
    mutationFn: (messageId: number) => deleteAttachment(messageId),
    onSuccess: () => {
      refresh()
      toast({ title: t('chat.fileDeleted'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const askDeleteFile = async (messageId: number) => {
    const ok = await confirm({
      title: t('chat.fileDeleteTitle'),
      description: t('chat.fileDeleteHint'),
      confirmText: t('confirm.delete'),
      variant: 'destructive',
    })
    if (ok) removeFile.mutate(messageId)
  }

  /* §4.6 — წერილის წაშლა. ⚠️ **სკოუპი ცხადად ეკითხება** და არ იგულისხმება;
     რიგი ბაზაში რჩება, ე.ი. ეს დამალვაა და არა შეუქცევადი წაშლა. */
  const removeMessage = useMutation({
    mutationFn: ({ id: messageId, scope }: { id: number; scope: RemovalScope }) =>
      deleteMessage(messageId, scope),
    onSuccess: () => {
      setRemoving(null)
      qc.invalidateQueries({ queryKey: ['chat', id] })
      refresh()
      toast({ title: t('chat.messageDeleted'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const block = useMutation({
    mutationFn: (next: boolean) => setBlocked(thread.data!.profile!.username, next),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat'] }),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  if (isApiCode(thread.error, 'profile_not_public')) {
    return <Notice title={t('matches.needPublicTitle')} hint={t('matches.needPublicHint')} to="/profile" />
  }
  if (thread.isLoading || !thread.data) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const { profile, blocked, blocked_by_me: mine } = thread.data
  // ⚠️ სია ახლიდან ძველისკენ მოდის — ჩვენებისთვის ვაბრუნებთ
  const messages = [...thread.data.data].reverse()

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border border-border bg-card">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link to="/chat" className="lg:hidden">
          <ArrowLeft className="size-4 text-muted-foreground" />
        </Link>
        <Link to={`/u/${profile?.username}`} className="min-w-0 flex-1 truncate font-medium hover:text-primary">
          {profile?.display_name}
        </Link>
        {/* ⚠️ ღილაკი მხოლოდ მაშინ, თუ **მე** დავბლოკე — სხვისი დაბლოკვა ჩემი მოსახსნელი არაა */}
        {(!blocked || mine) && (
          <Button
            variant="ghost"
            size="sm"
            className={mine ? undefined : 'text-destructive'}
            disabled={block.isPending}
            onClick={async () => {
              if (mine) return block.mutate(false)
              if (await confirm({ title: t('chat.blockConfirm'), variant: 'destructive' })) block.mutate(true)
            }}
          >
            {mine ? <ShieldOff className="size-4" /> : <Ban className="size-4" />}
            {t(mine ? 'chat.unblock' : 'chat.block')}
          </Button>
        )}
      </div>

      {/* messages */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('chat.noMessages')}</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn('group flex items-center gap-1.5', m.mine ? 'justify-end' : 'justify-start')}
          >
            {/* §4.6 — წაშლა ორივე მხარეს შეუძლია; **სკოუპს დიალოგი ეკითხება**
                (მხოლოდ ჩემთან თუ ორივესთან), ე.ი. სხვისი წერილის დამალვაც
                მხოლოდ ჩემს ხედს ეხება. */}
            {m.mine && <DeleteButton onClick={() => setRemoving(m)} />}
            <div
              className={cn(
                'max-w-[75%] space-y-1.5 whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm',
                m.mine ? 'bg-primary text-primary-foreground' : 'bg-muted',
              )}
            >
              <Bubble message={m} onDeleteFile={m.mine ? askDeleteFile : undefined} />
            </div>
            {!m.mine && <DeleteButton onClick={() => setRemoving(m)} />}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {/* §4.6 — „მხოლოდ შენთან წავშალო თუ ორივესთან?" */}
      {removing && (
        <ModalShell title={t('chat.deleteTitle')} destructive onClose={() => setRemoving(null)}>
          <div className="mt-4 space-y-4 text-sm">
            <p className="text-muted-foreground">{t('chat.deleteHint')}</p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                disabled={removeMessage.isPending}
                onClick={() => removeMessage.mutate({ id: removing.id, scope: 'self' })}
              >
                {t('chat.deleteForMe')}
              </Button>
              {/* ⚠️ „ორივესთან" მხოლოდ ავტორს — სხვისი წერილის ყველასთვის
                  გაქრობა მიმოწერის გადაწერაა (backend-იც 403-ს აბრუნებს) */}
              {removing.mine && (
                <Button
                  variant="destructive"
                  disabled={removeMessage.isPending}
                  onClick={() => removeMessage.mutate({ id: removing.id, scope: 'both' })}
                >
                  {t('chat.deleteForBoth')}
                </Button>
              )}
              <Button variant="ghost" onClick={() => setRemoving(null)}>
                {t('actions.cancel')}
              </Button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* composer */}
      <div className="border-t border-border p-3">
        {blocked ? (
          <p className="text-center text-sm text-muted-foreground">
            {t(mine ? 'chat.blockedByMe' : 'chat.blockedByThem')}
          </p>
        ) : (
          <>
            {/* არჩეული ფაილი — გაგზავნამდე ჩანს და მოხსნადია */}
            {file && (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs">
                <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  aria-label={t('actions.cancel')}
                  className="grid size-5 shrink-0 cursor-pointer place-items-center rounded hover:bg-muted"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-end gap-2">
              <input
                ref={picker}
                type="file"
                hidden
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null)
                  // იმავე ფაილის ხელახლა არჩევაც უნდა მუშაობდეს
                  e.target.value = ''
                }}
              />
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                aria-label={t('chat.attach')}
                title={t('chat.attach')}
                onClick={() => picker.current?.click()}
              >
                <Paperclip className="size-4" />
              </Button>
              <Textarea
                rows={1}
                value={body}
                placeholder={t(file ? 'chat.captionPlaceholder' : 'chat.placeholder')}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  // Enter აგზავნის, Shift+Enter ახალ ხაზს იძლევა
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (body.trim() || file) send.mutate()
                  }
                }}
                className="max-h-32 min-h-[2.5rem] resize-none"
              />
              <Button
                disabled={(!body.trim() && !file) || send.isPending}
                onClick={() => send.mutate()}
              >
                {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** წერილის წაშლის ღილაკი — მიტანაზე ჩნდება, რომ ძაფი არ აჭრელდეს */
function DeleteButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('chat.deleteTitle')}
      title={t('chat.deleteTitle')}
      className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted focus:opacity-100 group-hover:opacity-100"
    >
      <Trash2 className="size-3.5" />
    </button>
  )
}

/**
 * ერთი შეტყობინების შიგთავსი — ტექსტი, მედია ან „ფაილი წაშლილია".
 *
 * ⚠️ **წაშლილი მედია ცალკე დროშით არ ინახება** — მედიის შეტყობინება
 * ფაილის გარეშე ვერასდროს იქმნება, ე.ი. `attachment_deleted` backend-ზე
 * სწორედ ამ ორი ფაქტიდან გამოდის (იხ. `Message::attachmentDeleted()`).
 */
function Bubble({
  message: m,
  onDeleteFile,
}: {
  message: ChatMessage
  onDeleteFile?: (id: number) => void
}) {
  const { t } = useTranslation()

  if (m.attachment_deleted) {
    return (
      <>
        <p className="flex items-center gap-1.5 rounded-lg bg-black/10 px-2.5 py-1.5 text-xs italic opacity-80">
          <Trash2 className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            {t('chat.attachmentDeleted')}
            {m.attachment_name ? ` · ${m.attachment_name}` : ''}
          </span>
        </p>
        {m.body && <p>{m.body}</p>}
      </>
    )
  }

  if (!m.attachment) return <>{m.body}</>

  const href = attachmentUrl(m.attachment)

  return (
    <>
      {m.type === 'image' ? (
        <a href={href} target="_blank" rel="noreferrer" className="block">
          <img
            src={href}
            alt={m.attachment.name ?? ''}
            loading="lazy"
            className="max-h-64 w-auto rounded-lg object-contain"
          />
        </a>
      ) : m.type === 'video' ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- პირადი ჩანაწერი, სუბტიტრები არ არსებობს
        <video src={href} controls className="max-h-64 w-full rounded-lg" />
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-lg bg-black/10 px-2.5 py-2 hover:text-primary"
        >
          <FileText className="size-4 shrink-0" />
          <span className="min-w-0 truncate">{m.attachment.name}</span>
        </a>
      )}

      <p className="flex items-center gap-2 text-[11px] opacity-70">
        <span>{m.attachment.size != null ? formatBytes(m.attachment.size) : ''}</span>
        {/* ⚠️ ღილაკი მხოლოდ გამგზავნს — ფაილი მისი კვოტიდან იხარჯება */}
        {onDeleteFile && (
          <button
            type="button"
            onClick={() => onDeleteFile(m.id)}
            className="inline-flex cursor-pointer items-center gap-1 hover:text-primary"
          >
            <Trash2 className="size-3" />
            {t('actions.delete')}
          </button>
        )}
      </p>

      {m.body && <p>{m.body}</p>}
    </>
  )
}

function Notice({ title, hint, to }: { title: string; hint: string; to: string }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      <Link to={to} className="mt-4 inline-block text-sm text-primary hover:text-primary/70">
        {t('publicProfile.title')}
      </Link>
    </div>
  )
}
