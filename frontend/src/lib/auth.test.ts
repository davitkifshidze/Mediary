import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { User } from '@/api/account'
import { UNAUTHENTICATED_EVENT } from '@/lib/api'

/* ============================================================
   **ავტორიზაციის კონტექსტი და ქეში.**

   ⚠️ ქეში ანგარიშისაა: გასვლა და სესიის გაწყვეტა (401) მას მთლიანად წმენდს,
   თორემ შემდეგი ანგარიში იმავე ბრაუზერში წინას მონაცემებს დაინახავდა.

   ⚠️ მაგრამ **სტუმრის 401 სესიის გაწყვეტა არ არის** — `/auth/me` მას ყოველ
   გახსნაზე აბრუნებს. ქეშის წმენდა მიმდინარე მოთხოვნასაც უხმოდ წყვეტს, ე.ი.
   საჯარო გვერდი, რომლის მოთხოვნაც პარალელურად მიდიოდა, ჩატვირთვაზე რჩებოდა.
   ============================================================ */

const mocks = vi.hoisted(() => ({
  fetchMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}))

vi.mock('@/api/account', () => mocks)

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ALICE = { id: 1, username: 'alice', is_super_admin: false, permissions: { movie: ['view'] }, admin_resources: [] } as unknown as User

let root: Root | null = null
let container: HTMLDivElement | null = null
let qc: QueryClient
let auth: ReturnType<typeof import('@/lib/auth').useAuth>

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.clearAllMocks()
})

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })

async function mount() {
  const { AuthProvider, useAuth } = await import('@/lib/auth')

  function Probe() {
    auth = useAuth()
    return null
  }

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => root!.render(h(QueryClientProvider, { client: qc }, h(AuthProvider, null, h(Probe)))))
  await flush()
}

const unauthenticated = async () => {
  await act(async () => { window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT)) })
  // react-query-ის შეტყობინება შემდეგ tick-ზე მოდის
  await flush()
}

describe('AuthProvider', () => {
  it('შესული მომხმარებელი და მისი უფლებები `/auth/me`-დან მოდის', async () => {
    mocks.fetchMe.mockResolvedValue(ALICE)

    await mount()

    expect(auth.user?.id).toBe(1)
    expect(auth.loading).toBe(false)
    expect(auth.can('movie', 'view')).toBe(true)
    expect(auth.can('movie', 'delete')).toBe(false)
    expect(auth.canAdmin('users')).toBe(false)
  })

  it('სტუმარზე `/auth/me`-ს 401 ჩვეულებრივი მდგომარეობაა — user ცარიელია და არაფერი ვარდება', async () => {
    mocks.fetchMe.mockRejectedValue(new Error('401'))

    await mount()

    expect(auth.user).toBeNull()
    expect(auth.loading).toBe(false)
    expect(auth.can('movie', 'view')).toBe(false)
  })

  it('შესვლა user-ს აყენებს და დანარჩენ ქეშს მოძველებულად ნიშნავს', async () => {
    mocks.fetchMe.mockRejectedValue(new Error('401'))
    mocks.login.mockResolvedValue(ALICE)
    await mount()
    qc.setQueryData(['modules'], ['guest'])

    await act(async () => { await auth.login({ login: 'alice', password: 'x' }) })
    await flush()

    expect(auth.user?.id).toBe(1)
    expect(qc.getQueryState(['modules'])?.isInvalidated).toBe(true)
  })

  it('გასვლა მთელ ქეშს წმენდს — მაშინაც, როცა სერვერი შეცდომას აბრუნებს', async () => {
    mocks.fetchMe.mockResolvedValue(ALICE)
    mocks.logout.mockRejectedValue(new Error('network'))
    await mount()
    qc.setQueryData(['movie', 'list'], [{ id: 5 }])

    await act(async () => { await auth.logout().catch(() => {}) })
    await flush()

    expect(auth.user).toBeNull()
    expect(qc.getQueryData(['movie', 'list'])).toBeUndefined()
  })

  it('შესულის 401 სესიის გაწყვეტაა: user ქრება და პირადი ქეშიც', async () => {
    mocks.fetchMe.mockResolvedValue(ALICE)
    await mount()
    qc.setQueryData(['movie', 'list'], [{ id: 5 }])

    await unauthenticated()

    expect(auth.user).toBeNull()
    expect(qc.getQueryData(['movie', 'list'])).toBeUndefined()
  })

  it('სტუმრის 401 მიმდინარე საჯარო მოთხოვნას არ წყვეტს', async () => {
    mocks.fetchMe.mockRejectedValue(new Error('401'))
    await mount()

    // საჯარო გვერდის მოთხოვნა ჯერ გზაშია, როცა `/auth/me`-ს 401 მოდის
    let answer: (value: string) => void = () => {}
    const pending = qc.fetchQuery({ queryKey: ['public-share', 'token'], queryFn: () => new Promise<string>((resolve) => { answer = resolve }) })

    await unauthenticated()

    expect(qc.getQueryCache().find({ queryKey: ['public-share', 'token'] })).toBeDefined()

    answer('page')
    await expect(pending).resolves.toBe('page')
    expect(qc.getQueryData(['public-share', 'token'])).toBe('page')
  })
})
