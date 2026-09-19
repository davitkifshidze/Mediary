import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowLeft,
  BellOff,
  ChevronUp,
  FileText,
  Loader2,
  Paperclip,
  Pin,
  PinOff,
  Search,
  Send,
  Settings2,
  Smile,
  Trash2,
  X,
} from 'lucide-react'
import {
  attachmentUrl,
  deleteAttachment,
  deleteMessage,
  fetchConversations,
  fetchPins,
  fetchThread,
  mediaTypeOf,
  pinMessage,
  reactToMessage,
  searchThread,
  sendAttachment,
  sendMessage,
  type ChatConversation,
  type ChatMessage,
  type RemovalScope,
} from '@/api/chat'
import { storageUrl } from '@/lib/api'
import { chatThemeStyle } from '@/lib/chatThemes'
import { QUICK_REACTIONS } from '@/lib/emoji'
import { errorMessage, isApiCode } from '@/lib/errors'
import { highlightParts } from '@/lib/searchResults'
import { useDateFormat } from '@/lib/dates'
import { cn, formatBytes } from '@/lib/utils'
import { ChatThreadMenu } from '@/components/chat/ChatThreadMenu'
import { SharedRecordCard } from '@/components/chat/SharedRecordCard'
import { Button } from '@/components/ui/button'
import { EmojiPicker } from '@/components/ui/emoji-picker'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { ModalShell } from '@/components/ui/modal-shell'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm, useToast } from '@/components/ui/feedback'

/* ============================================================
   ჩატი (Tasks §16.3 → §10) — `/chat` და `/chat/:id`.

   ⚠️ **რეალურ დროში მიწოდება polling-ია და არა WebSocket** — §16.3-ის
   ცხადი გადაწყვეტილება: worker-ს არ ითხოვს. ღია საუბარი 5 წამში ერთხელ
   ახლდება, სია — 15 წამში.

   **§10 — Messenger-ის დონე.** ხუთი წესი, რომელიც ადვილად იშლება ჩუმად:

   ⚠️ **სქროლი „ბოლოშია?"-ზე დგას და არა სიის სიგრძეზე.** ძველი ეფექტი
   `data.length`-ზე იყო მიბმული, ე.ი. (ა) სხვა საუბარზე გადასვლისას,
   თუ გვერდს იგივე სიგრძე ჰქონდა, **საერთოდ არ ირთვებოდა** და შუაში
   აღმოჩნდებოდი; (ბ) 5-წამიანი გამოკითხვა სიგრძეს ზრდიდა, ე.ი. ისტორიის
   კითხვისას ახალი წერილი ქვემოთ გადაგაგდებდა.

   ⚠️ **ისტორია კურსორითაა** (§10.8): SPA ბოლო 50 წერილზე მეტს ვერ
   კითხულობდა — `meta.last_page` არსად გამოიყენებოდა და „ძველის ჩატვირთვის"
   ღილაკი არ არსებობდა.

   ⚠️ **ძებნიდან/პინიდან ნახტომი ცალკე ხედია** და არა სიაში ჩამატება:
   `around_id`-ის ფანჯარასა და უახლეს გვერდს შორის ხვრელი შეიძლება იყოს,
   ე.ი. შერწყმა ჩუმად „გამოტოვებულ" საუბარს დახატავდა. ნახტომში ვზივართ
   მანამ, სანამ „ბოლოზე დაბრუნებას" არ დააჭერ.

   ⚠️ **რეაქცია თითო კაცზე ერთია** (backend-ის წესი) — იმავეს ხელახლა
   დაჭერა მოხსნაა.

   ⚠️ **ნიკნეიმი ნამდვილ სახელს არ შლის**: ორივე მოდის და პროფილის ბმული
   ისევ ნამდვილზე მიდის.
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
      <PageHeader
        tool="chat"
        title={t('chat.title')}
        hint={<InfoHint info={t('chat.subtitle')} critical={t('chat.subtitleWarn')} />}
      />

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
  // §10.11 — ნიკნეიმი ჩემი ხედია; ნამდვილი სახელი `profile`-შია და არ იკარგება
  const name = c.nickname ?? c.profile?.display_name ?? '—'
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
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-sm font-medium">{name}</span>
            {/* §10.5 — გაჩუმებული საუბარი ბეჯს არ ანთებს; ნიშანი ამას ამბობს */}
            {c.muted && <BellOff className="size-3.5 shrink-0 text-muted-foreground" />}
          </span>
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
          <span
            className={cn(
              'shrink-0 rounded-md px-1.5 py-0.5 text-xs leading-none',
              // ⚠️ დადუმებულზე რიცხვი **რჩება**, უბრალოდ ხმას არ იღებს
              c.muted ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground',
            )}
          >
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
  const fmt = useDateFormat()

  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  // §4.6 — რომელ წერილს ვშლით (დიალოგი კითხულობს, ვისთან)
  const [removing, setRemoving] = useState<ChatMessage | null>(null)
  const [panel, setPanel] = useState<'none' | 'search' | 'pins' | 'settings'>('none')
  /** §10.8 — ჩატვირთული ძველი წერილები (უახლესი გვერდის წინ) */
  const [older, setOlder] = useState<ChatMessage[]>([])
  /** §10.8 — ნახტომის ხედი: ცალკე სია + „ბოლოზე დაბრუნება" */
  const [jump, setJump] = useState<{ at: number; items: ChatMessage[] } | null>(null)
  const [newBelow, setNewBelow] = useState(false)

  const scroller = useRef<HTMLDivElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  /** „ბოლოშია?" — სქროლის ერთადერთი კრიტერიუმი (§10.1) */
  const atBottom = useRef(true)
  const lastSeenId = useRef<number | null>(null)

  const thread = useQuery({
    queryKey: ['chat', id],
    queryFn: () => fetchThread(id),
    refetchInterval: THREAD_POLL_MS,
    placeholderData: keepPreviousData,
    retry: false,
  })

  /* ⚠️ საუბრის შეცვლაზე ყველაფერი ნულდება: ძველი ძაფის „ჩატვირთული
     ძველები" ახალში ჩარეულიყო. */
  useEffect(() => {
    setOlder([])
    setJump(null)
    setPanel('none')
    setNewBelow(false)
    atBottom.current = true
    lastSeenId.current = null
  }, [id])

  const head = useMemo(() => thread.data?.data ?? [], [thread.data])

  /** ჩვენებისთვის — ძველიდან ახლისკენ, დუბლების გარეშე */
  const messages = useMemo(() => {
    const source = jump ? jump.items : [...older, ...head]
    const byId = new Map<number, ChatMessage>()
    for (const m of source) byId.set(m.id, m)

    return [...byId.values()].sort((a, b) => a.id - b.id)
  }, [jump, older, head])

  const newestId = messages.length ? messages[messages.length - 1].id : null

  const toBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    bottom.current?.scrollIntoView({ block: 'end', behavior })
    atBottom.current = true
    setNewBelow(false)
  }, [])

  /* ⚠️ **მონტაჟზე/საუბრის ცვლილებაზე მყისიერი სქროლი** — ეს ის შემთხვევაა,
     რომელსაც ძველი `data.length`-ეფექტი საერთოდ ვერ იჭერდა. */
  useEffect(() => {
    if (!thread.data || jump) return
    if (lastSeenId.current === null && newestId !== null) {
      lastSeenId.current = newestId
      requestAnimationFrame(() => toBottom())
    }
  }, [thread.data, jump, newestId, toBottom])

  /* ახალი წერილი: ბოლოში ვდგავართ → ჩამოვყვებით; არა → „ახალი წერილები ↓" */
  useEffect(() => {
    if (newestId === null || lastSeenId.current === null || jump) return
    if (newestId === lastSeenId.current) return

    lastSeenId.current = newestId
    atBottom.current ? toBottom('smooth') : setNewBelow(true)
  }, [newestId, jump, toBottom])

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
      setJump(null)
      atBottom.current = true
      qc.invalidateQueries({ queryKey: ['chat', id] })
      refresh()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const loadOlder = useMutation({
    mutationFn: () => fetchThread(id, { before_id: messages[0]?.id }),
    onSuccess: (page) => {
      jump
        ? setJump((j) => (j ? { ...j, items: [...page.data, ...j.items] } : j))
        : setOlder((prev) => [...page.data, ...prev])
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /** §10.8 — ნახტომი ძებნიდან ან პინიდან; **წაკითხულად არ ნიშნავს** */
  const goTo = useMutation({
    mutationFn: (messageId: number) => fetchThread(id, { around_id: messageId }),
    onSuccess: (page, messageId) => {
      setJump({ at: messageId, items: page.data })
      setPanel('none')
      requestAnimationFrame(() => {
        document.getElementById(`chat-msg-${messageId}`)?.scrollIntoView({ block: 'center' })
      })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const removeFile = useMutation({
    mutationFn: (messageId: number) => deleteAttachment(messageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat', id] })
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
      setOlder([])
      setJump(null)
      qc.invalidateQueries({ queryKey: ['chat', id] })
      refresh()
      toast({ title: t('chat.messageDeleted'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /** §10.10 — რეაქცია; იმავე ემოჯის ხელახლა დაჭერა backend-ზე მოხსნაა */
  const react = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: number; emoji: string | null }) =>
      reactToMessage(messageId, emoji),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat', id] }),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /** §10.7 — დაპინვა; **ორივე მონაწილეს შეუძლია** */
  const pin = useMutation({
    mutationFn: ({ messageId, pinned }: { messageId: number; pinned: boolean }) =>
      pinMessage(messageId, pinned),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat', id] })
      qc.invalidateQueries({ queryKey: ['chat-pins', id] })
    },
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

  const data = thread.data
  const { profile, blocked, blocked_by_me: mine } = data
  // §10.11 — ჩემი ნიკნეიმი; ბმული მაინც ნამდვილ პროფილზე მიდის
  const name = data.nickname ?? profile?.display_name

  /* §10.3 — „ნანახია": მეორე მხარემ წაიკითხა ყველაფერი ჩემი ბოლო წერილის
     ჩათვლით. ⚠️ ნიშანი **მხოლოდ ბოლო ჩემს ბუშტზე** — თითოზე რომ გვეხატა,
     ძაფი ნიშნების კედელი გახდებოდა. */
  const lastMine = [...messages].reverse().find((m) => m.mine)
  const seen =
    !!lastMine &&
    !!data.other_read_at &&
    !!lastMine.created_at &&
    new Date(data.other_read_at) >= new Date(lastMine.created_at)

  const panels = (
    <>
      {panel === 'settings' && <ChatThreadMenu id={id} thread={data} onClose={() => setPanel('none')} />}
      {panel === 'search' && (
        <SearchPanel id={id} onClose={() => setPanel('none')} onJump={(m) => goTo.mutate(m)} />
      )}
      {panel === 'pins' && (
        <PinsPanel
          id={id}
          onClose={() => setPanel('none')}
          onJump={(m) => goTo.mutate(m)}
          onUnpin={(m) => pin.mutate({ messageId: m, pinned: false })}
        />
      )}
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
    </>
  )

  return (
    /* §10.6 — თემა inline ცვლადებით; „ღია თუ მუქი" CSS წყვეტს (`index.css`) */
    <div
      className="fb-chat flex h-[70vh] flex-col rounded-xl border border-border bg-card"
      style={chatThemeStyle(data.theme)}
    >
      {/* header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Link to="/chat" className="lg:hidden">
          <ArrowLeft className="size-4 text-muted-foreground" />
        </Link>
        <Link
          to={`/u/${profile?.username}`}
          className="min-w-0 flex-1 truncate font-medium transition-colors hover:text-primary"
        >
          {name}
        </Link>
        {data.muted && <BellOff className="size-4 shrink-0 text-muted-foreground" />}
        <Button variant="ghost" size="icon" aria-label={t('chat.search')} title={t('chat.search')} onClick={() => setPanel('search')}>
          <Search className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label={t('chat.pins')} title={t('chat.pins')} onClick={() => setPanel('pins')}>
          <Pin className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label={t('chat.settingsTitle')} title={t('chat.settingsTitle')} onClick={() => setPanel('settings')}>
          <Settings2 className="size-4" />
        </Button>
      </div>

      {/* §10.8 — ნახტომის ხედი ცხადად ამბობს, რომ ისტორიაში ვართ */}
      {jump && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 text-xs">
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{t('chat.jumpNotice')}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setJump(null)
              requestAnimationFrame(() => toBottom())
            }}
          >
            {t('chat.backToLatest')}
          </Button>
        </div>
      )}

      {/* messages */}
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
          if (atBottom.current) setNewBelow(false)
        }}
        className="relative min-h-0 flex-1 space-y-2 overflow-y-auto bg-[var(--chat-surface)] p-4"
      >
        {/* §10.8 — „ძველის ჩატვირთვა"; ღილაკი მხოლოდ მაშინ, თუ მართლა არის */}
        {(jump || data.meta.has_more) && messages.length > 0 && (
          <div className="flex justify-center pb-1">
            <Button variant="outline" size="sm" disabled={loadOlder.isPending} onClick={() => loadOlder.mutate()}>
              {loadOlder.isPending ? <Loader2 className="size-4 animate-spin" /> : <ChevronUp className="size-4" />}
              {t('chat.loadOlder')}
            </Button>
          </div>
        )}

        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('chat.noMessages')}</p>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            id={`chat-msg-${m.id}`}
            className={cn(
              'group flex items-center gap-1.5',
              m.mine ? 'justify-end' : 'justify-start',
              jump?.at === m.id && 'rounded-lg bg-primary/10',
            )}
          >
            {/* §4.6 — წაშლა ორივე მხარეს შეუძლია; **სკოუპს დიალოგი ეკითხება** */}
            {m.mine && <MessageTools message={m} onDelete={() => setRemoving(m)} onPin={pin.mutate} onReact={react.mutate} />}
            <div className="max-w-[75%]">
              <div
                className={cn(
                  'space-y-1.5 whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm',
                  m.mine
                    ? 'bg-[var(--chat-mine)] text-[var(--chat-mine-ink)]'
                    : 'bg-muted text-foreground',
                )}
              >
                {m.pinned && (
                  <p className="flex items-center gap-1 text-[11px] opacity-70">
                    <Pin className="size-3" />
                    {t('chat.pinned')}
                  </p>
                )}
                <Bubble message={m} onDeleteFile={m.mine ? askDeleteFile : undefined} />
              </div>

              {/* §10.10 — რეაქციები ბუშტის ქვეშ; დაჭერა ჩემსას ხსნის/ცვლის */}
              {Object.keys(m.reactions).length > 0 && (
                <div className={cn('mt-1 flex flex-wrap gap-1', m.mine && 'justify-end')}>
                  {Object.entries(m.reactions).map(([emoji, count]) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => react.mutate({ messageId: m.id, emoji })}
                      className={cn(
                        'cursor-pointer rounded-md border px-1.5 py-0.5 text-xs transition-colors',
                        m.my_reaction === emoji ? 'border-primary bg-secondary' : 'border-border hover:bg-muted',
                      )}
                    >
                      {emoji} {count > 1 ? count : ''}
                    </button>
                  ))}
                </div>
              )}

              {/* §10.3 — „ნანახია" მხოლოდ ბოლო ჩემს ბუშტზე */}
              {m.mine && lastMine?.id === m.id && (
                <p className="mt-0.5 text-right text-[11px] text-muted-foreground">
                  {seen ? t('chat.seen') : t('chat.sent')}
                  {m.created_at ? ` · ${fmt.dateTime(m.created_at)}` : ''}
                </p>
              )}
            </div>
            {!m.mine && <MessageTools message={m} onDelete={() => setRemoving(m)} onPin={pin.mutate} onReact={react.mutate} />}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {/* §10.1 — „ახალი წერილები ↓": ისტორიას ვკითხულობდი და ქვემოთ არ გადამაგდო */}
      {newBelow && (
        <div className="relative">
          <Button
            size="sm"
            className="absolute -top-12 left-1/2 -translate-x-1/2 shadow-lg"
            onClick={() => toBottom('smooth')}
          >
            <ArrowDown className="size-4" />
            {t('chat.newMessages')}
          </Button>
        </div>
      )}

      {panels}

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

              {/* §10.2 — ემოჯი კომპოზიტორში, დამოკიდებულების გარეშე */}
              <EmojiPicker
                onPick={(emoji) => setBody((b) => b + emoji)}
                trigger={
                  <Button variant="outline" size="icon" className="shrink-0" aria-label={t('chat.emoji')} title={t('chat.emoji')}>
                    <Smile className="size-4" />
                  </Button>
                }
              />

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

/**
 * ბუშტის მოქმედებები — მიტანაზე ჩნდება, რომ ძაფი არ აჭრელდეს.
 *
 * ⚠️ **სწრაფი რეაქციები აქვეა და სრული ამრჩევიც**: მთელი ფანჯრის გახსნა
 * ერთი გულისთვის ზედმეტი ნაბიჯია, ხოლო ექვსი ემოჯი ყველაფერს ვერ ფარავს.
 */
function MessageTools({
  message: m,
  onDelete,
  onPin,
  onReact,
}: {
  message: ChatMessage
  onDelete: () => void
  onPin: (input: { messageId: number; pinned: boolean }) => void
  onReact: (input: { messageId: number; emoji: string | null }) => void
}) {
  const { t } = useTranslation()

  const iconClass =
    'grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted focus:opacity-100 group-hover:opacity-100'

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {QUICK_REACTIONS.slice(0, 3).map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact({ messageId: m.id, emoji })}
          className={cn(iconClass, 'text-sm')}
          title={t('chat.react')}
        >
          {emoji}
        </button>
      ))}

      <EmojiPicker
        align="end"
        onPick={(emoji) => onReact({ messageId: m.id, emoji })}
        trigger={
          <button type="button" className={iconClass} aria-label={t('chat.react')} title={t('chat.react')}>
            <Smile className="size-3.5" />
          </button>
        }
      />

      <button
        type="button"
        onClick={() => onPin({ messageId: m.id, pinned: !m.pinned })}
        className={iconClass}
        aria-label={t(m.pinned ? 'chat.unpin' : 'chat.pin')}
        title={t(m.pinned ? 'chat.unpin' : 'chat.pin')}
      >
        {m.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
      </button>

      <button
        type="button"
        onClick={onDelete}
        aria-label={t('chat.deleteTitle')}
        title={t('chat.deleteTitle')}
        className={iconClass}
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

/** §10.9 — ძებნა ერთ საუბარში; ნაჭერს სერვერი ჭრის, ხაზგასმას კლიენტი */
function SearchPanel({
  id,
  onClose,
  onJump,
}: {
  id: number
  onClose: () => void
  onJump: (messageId: number) => void
}) {
  const { t } = useTranslation()
  const fmt = useDateFormat()
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')

  const hits = useQuery({
    queryKey: ['chat-search', id, term],
    queryFn: () => searchThread(id, term),
    enabled: term.length >= 2,
  })

  return (
    <ModalShell title={t('chat.search')} onClose={onClose}>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          setTerm(q.trim())
        }}
      >
        <div className="flex gap-2">
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('chat.searchPlaceholder')} />
          <Button type="submit" variant="outline">
            <Search className="size-4" />
          </Button>
        </div>

        {hits.isFetching && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
        {hits.data?.length === 0 && <p className="text-sm text-muted-foreground">{t('chat.searchEmpty')}</p>}

        <ul className="space-y-1.5">
          {hits.data?.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => onJump(hit.id)}
                className="w-full cursor-pointer rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:border-primary/40"
              >
                <span className="block">
                  {highlightParts(hit.snippet ?? '', term).map((part, i) =>
                    part.hit ? (
                      <mark key={i} className="rounded-md bg-primary/20 text-foreground">
                        {part.text}
                      </mark>
                    ) : (
                      <span key={i}>{part.text}</span>
                    ),
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {hit.mine ? `${t('chat.you')} · ` : ''}
                  {fmt.dateTime(hit.created_at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </form>
    </ModalShell>
  )
}

/** §10.7 — პინების სია; წაშლილი წერილი თავისით ცვივა (`scopeVisibleTo`) */
function PinsPanel({
  id,
  onClose,
  onJump,
  onUnpin,
}: {
  id: number
  onClose: () => void
  onJump: (messageId: number) => void
  onUnpin: (messageId: number) => void
}) {
  const { t } = useTranslation()
  const fmt = useDateFormat()

  const pins = useQuery({ queryKey: ['chat-pins', id], queryFn: () => fetchPins(id) })

  return (
    <ModalShell title={t('chat.pins')} onClose={onClose}>
      <div className="mt-4 space-y-2">
        {pins.isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
        {pins.data?.length === 0 && <p className="text-sm text-muted-foreground">{t('chat.pinsEmpty')}</p>}

        {pins.data?.map((m) => (
          <div key={m.id} className="flex items-start gap-2 rounded-md border border-border px-3 py-2">
            <button
              type="button"
              onClick={() => onJump(m.id)}
              className="min-w-0 flex-1 cursor-pointer text-left text-sm transition-colors hover:text-primary"
            >
              <span className="line-clamp-2 block">{m.body || m.attachment_name || t(`chat.type.${m.type}`)}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {m.mine ? `${t('chat.you')} · ` : ''}
                {fmt.dateTime(m.created_at)}
              </span>
            </button>
            <Button variant="ghost" size="icon" aria-label={t('chat.unpin')} title={t('chat.unpin')} onClick={() => onUnpin(m.id)}>
              <PinOff className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </ModalShell>
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

  /* FEAT-13 — გაზიარებული ჩანაწერი.
     ⚠️ **დანართზე მაღლა მოწმდება**: `record`-ტიპის წერილს `attachment`
     არასდროს აქვს, ე.ი. ქვემოთა `if (!m.attachment) return <>{m.body}</>`
     მას ჩუმად ცარიელ ბუშტად დახატავდა. */
  if (m.record) {
    return (
      <>
        <SharedRecordCard messageId={m.id} record={m.record} mine={m.mine} />
        {m.body && <p className="mt-1.5">{m.body}</p>}
      </>
    )
  }

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
