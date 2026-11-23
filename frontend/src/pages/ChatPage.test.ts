import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FeedbackProvider } from '@/components/ui/feedback'
import type { ChatMessage, ChatThread } from '@/api/chat'
import i18n from '@/i18n'

/* ============================================================
   **ღია საუბარი: სამი ჩუმი ხარვეზი.**

   ⚠️ Enter გაგზავნის დროსაც აგზავნიდა — ნელ პასუხზე იგივე წერილი ორჯერ მიდიოდა.

   ⚠️ „ძველის ჩატვირთვით" გახსნილი წერილები ლოკალური მდგომარეობაა: რეაქცია იქ
   ეკრანზე არ ჩანდა, და „არ იმუშავა"-ს მეორე დაჭერა მას ხსნიდა.

   ⚠️ სხვა საუბარზე გადასვლისას, სანამ ახალი ჩაიტვირთებოდა, წინა საუბრის
   წერილები ახალი მისამართის ქვეშ ჩანდა.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchConversations: vi.fn(),
  fetchThread: vi.fn(),
  sendMessage: vi.fn(),
  reactToMessage: vi.fn(),
}))

vi.mock('@/api/chat', async (original) => ({
  ...(await original<typeof import('@/api/chat')>()),
  fetchConversations: mocks.fetchConversations,
  fetchThread: mocks.fetchThread,
  sendMessage: mocks.sendMessage,
  reactToMessage: mocks.reactToMessage,
}))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom-ს სქროლი არ აქვს — გვერდი მას ახალ წერილზე იძახებს
Element.prototype.scrollIntoView = () => {}

const message = (id: number, body: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  type: 'text',
  body,
  mine: false,
  attachment: null,
  attachment_deleted: false,
  attachment_name: null,
  reactions: {},
  my_reaction: null,
  pinned: false,
  record: null,
  created_at: '2026-11-13T10:00:00+04:00',
  ...over,
})

const thread = (items: ChatMessage[], hasMore = false): ChatThread =>
  ({
    data: items,
    meta: { has_more: hasMore, oldest_id: items[0]?.id ?? null, newest_id: items.at(-1)?.id ?? null },
    profile: { username: 'bob', display_name: 'Bob', avatar_url: null },
    profile_public: true,
    other_read_at: null,
    muted: false,
    theme: null,
    nickname: null,
    blocked_by_me: false,
    blocked: false,
  }) as unknown as ChatThread

let root: Root | null = null
let container: HTMLDivElement | null = null
let go: (to: string) => void = () => {}
let ChatPage: typeof import('@/pages/ChatPage').ChatPage

// ⚠️ დიდი გვერდია — იმპორტი ერთხელ, ტესტის დროის ლიმიტის გარეთ
beforeAll(async () => {
  ChatPage = (await import('@/pages/ChatPage')).ChatPage
}, 30_000)

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  document.body.innerHTML = ''
  root = null
  container = null
  vi.clearAllMocks()
})

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

async function mount(path: string) {
  mocks.fetchConversations.mockResolvedValue({ data: [], unread_total: 0 })

  function Nav() {
    const navigate = useNavigate()
    go = (to) => navigate(to)
    return null
  }

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () =>
    root!.render(
      h(
        MemoryRouter,
        { initialEntries: [path] },
        h(
          QueryClientProvider,
          { client: qc },
          h(
            TooltipProvider,
            null,
            h(FeedbackProvider, null, h(Nav), h(Routes, null, h(Route, { path: '/chat/:id', element: h(ChatPage) }))),
          ),
        ),
      ),
    ),
  )
  await flush()
  await flush()
}

const text = () => document.body.textContent ?? ''

describe('ChatPage', () => {
  it('გაგზავნის დროს Enter მეორედ არ აგზავნის', async () => {
    mocks.fetchThread.mockResolvedValue(thread([message(1, 'hello')]))
    // პასუხი ნელია — მოთხოვნა ჯერ გზაშია
    let answer: (value: ChatMessage) => void = () => {}
    mocks.sendMessage.mockImplementation(() => new Promise<ChatMessage>((resolve) => { answer = resolve }))

    await mount('/chat/7')

    const box = document.querySelector('textarea')!
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    await act(async () => {
      setValue.call(box, 'one message')
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const enter = () => act(async () => { box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })

    await enter()
    await flush()
    await enter()
    await enter()
    await flush()

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1)
    expect(mocks.sendMessage).toHaveBeenCalledWith(7, 'one message')

    await act(async () => answer(message(2, 'one message', { mine: true })))
    await flush()
  })

  it('ჩატვირთულ ძველ წერილზე რეაქცია ეკრანზე მაშინვე ჩანს', async () => {
    mocks.fetchThread.mockImplementation(async (_id: number, cursor: { before_id?: number } = {}) =>
      cursor.before_id ? thread([message(1, 'old one')]) : thread([message(2, 'new one')], true),
    )
    mocks.reactToMessage.mockResolvedValue(message(1, 'old one', { reactions: { '❤️': 1 }, my_reaction: '❤️' }))

    await mount('/chat/7')

    const older = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(i18n.t('chat.loadOlder')))!
    await act(async () => older.click())
    await flush()
    expect(text()).toContain('old one')

    // ძველი წერილის სწრაფი რეაქცია
    const row = document.getElementById('chat-msg-1')!
    const heart = [...row.querySelectorAll('button')].find((b) => b.textContent?.trim() === '❤️')!
    await act(async () => heart.click())
    await flush()

    expect(mocks.reactToMessage).toHaveBeenCalledWith(1, '❤️')
    // ბუშტის ქვეშ რეაქციის ნიშანი გაჩნდა — ის `my_reaction`-ით მონიშნულია
    const badge = [...document.getElementById('chat-msg-1')!.querySelectorAll('button')].filter((b) => b.textContent?.trim() === '❤️')
    expect(badge.some((b) => b.className.includes('border-primary'))).toBe(true)
  })

  it('სხვა საუბარზე გადასვლისას წინა საუბრის წერილები აღარ ჩანს', async () => {
    let answerSecond: (value: ChatThread) => void = () => {}
    mocks.fetchThread.mockImplementation((id: number) =>
      id === 7
        ? Promise.resolve(thread([message(1, 'secret of the first chat')]))
        : new Promise<ChatThread>((resolve) => { answerSecond = resolve }),
    )

    await mount('/chat/7')
    expect(text()).toContain('secret of the first chat')

    await act(async () => go('/chat/8'))
    await flush()

    // მეორე საუბარი ჯერ იტვირთება — პირველის შიგთავსი მის ქვეშ არ იხატება
    expect(text()).not.toContain('secret of the first chat')

    await act(async () => answerSecond(thread([message(9, 'second chat')])))
    await flush()
    expect(text()).toContain('second chat')
  })
})
