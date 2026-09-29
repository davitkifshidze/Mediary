import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import i18n from '@/i18n'
import { formatBytes } from '@/lib/utils'

/* ============================================================
   **ატვირთვის მოთხოვნის განხილვა — „ვისზე გავრცელდეს" (Tasks §34.5, Q42).**

   ⚠️ რასაც ტიპი ვერ ხედავს:
    · **„მხოლოდ მას" ნაგულისხმევია** — ერთი დაჭერა სხვებს არაფერს უცვლის;
    · „ყველასთვის" ჩანს, მაგრამ **მხოლოდ სუპერადმინს** ირჩევა (სერვერიც
      403-ს აბრუნებს — ეს მხოლოდ მოხერხებაა);
    · არჩევანი **ნამდვილად მიდის** სერვერზე (`scope`) — backend-ის ტესტი
      ამბობს „`scope=all` ცვლის ინსტალაციას", მაგრამ ვერ იტყვის, რომ UI
      მას აგზავნის.
   ============================================================ */

const REQUEST = {
  id: 9,
  type: 'upload_limit',
  status: 'pending',
  message: 'მინდა აუდიო',
  payload: { kind: 'doc', formats: ['mp3'], max_kb: 51200, current_max_kb: 20480, current_formats: ['pdf', 'docx'] },
  created_at: '2026-09-30T10:00:00+04:00',
  reviewed_at: null,
  review_note: null,
  user: { id: 3, display_name: 'Alice', email: 'alice@example.com' },
  reviewer: null,
  module: null,
  genre: null,
}

const mocks = vi.hoisted(() => ({
  auth: { value: {} as Record<string, unknown> },
  approve: vi.fn(async () => ({})),
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  fetchAdminRequests: async () => ({
    items: [REQUEST],
    counts: { pending: 1, approved: 0, rejected: 0, all: 1 },
  }),
  fetchMyRequests: async () => [],
  approveRequest: mocks.approve,
}))

vi.mock('@/lib/auth', () => ({ useAuth: () => mocks.auth.value }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  document.body.innerHTML = ''
  root = null
  container = null
  vi.clearAllMocks()
})

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mount(superAdmin: boolean) {
  // ⚠️ ერთი და იგივე ობიექტი ყოველ რენდერზე — კონტექსტის ჰუკის მოკის წესი
  mocks.auth.value = { user: { id: 1, is_super_admin: superAdmin }, canAdmin: () => true }

  const { RequestsPage } = await import('@/pages/RequestsPage')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () =>
    root!.render(h(MemoryRouter, null, h(QueryClientProvider, { client: qc }, h(TooltipProvider, null, h(RequestsPage))))),
  )
  await flush()
  await flush()
}

const button = (text: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement

async function click(el: Element) {
  await act(async () => {
    ;(el as HTMLElement).click()
  })
  await flush()
}

const radio = (value: string) => document.body.querySelector(`button[role="radio"][value="${value}"]`) as HTMLButtonElement

describe('RequestsPage — upload limit review', () => {
  it('names the request and defaults to the user alone', async () => {
    await mount(false)

    const label = i18n.t('admin.wantsUpload', {
      kind: i18n.t('uploads.kind.doc'),
      what: `MP3 · ≤ ${formatBytes(51200 * 1024)}`,
    })
    expect(container!.textContent).toContain(label)

    await click(button(i18n.t('requests.review')))

    expect(radio('user').getAttribute('aria-checked')).toBe('true')
    // ⚠️ „ყველასთვის" ჩანს, მაგრამ ჩვეულებრივ ადმინს არ ირჩევა
    expect(radio('all').disabled).toBe(true)
    expect(document.body.textContent).toContain(i18n.t('requests.scopeAllSuper'))

    await click(button(i18n.t('admin.approve')))

    expect(mocks.approve).toHaveBeenCalledWith(9, undefined, undefined, 'user')
  })

  it('lets a super admin approve for everyone', async () => {
    await mount(true)
    await click(button(i18n.t('requests.review')))

    expect(radio('all').disabled).toBe(false)
    await click(radio('all'))
    await click(button(i18n.t('admin.approve')))

    expect(mocks.approve).toHaveBeenCalledWith(9, undefined, undefined, 'all')
  })
})
