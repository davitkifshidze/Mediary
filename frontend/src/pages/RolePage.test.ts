import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/i18n'

/* ============================================================
   რეგრესია: **`admin:roles`-ის მქონე ადმინი ცარიელ გვერდს ხედავდა**
   (Tasks GAP-10).

   ⚠️ `/roles`-ის ბმულიც და მარშრუტიც `canAdmin('roles')`-ზეა, ხოლო
   `RolePage`-ს `if (!isAdmin) return null` ედო — `isAdmin` კი
   `is_super_admin`-ია. ე.ი. role-granted ადმინი სიას ხედავდა, როლზე
   დაჭერით კი **ცარიელ ეკრანს**, ახსნის გარეშე.

   ⚠️ ამას მხოლოდ ნამდვილი მიმაგრება იჭერს: `tsc`-ისთვის `isAdmin` და
   `canAdmin('roles')` ერთნაირად `boolean`-ია.

   ⚠️ ორი read-only საკეტიც აქვე მოწმდება, რადგან ისინი SEC-03-ის სარკეა:
   ადმინ-სექციებს **მხოლოდ სუპერ-ადმინი** ცვლის (403 `role_escalation`),
   საკუთარი როლის უფლებებს კი — სხვა ადმინი (422 `cannot_edit_own_role`).
   ============================================================ */

const ROLE = {
  id: 5,
  key: 'moderator',
  name_ka: 'მოდერატორი',
  name_en: 'Moderator',
  permissions: { movie: ['view'], 'admin:roles': ['view', 'update'] } as Record<string, string[]>,
  is_system: false,
  is_super_admin: false,
  sort_order: 2,
  users_count: 1,
  actions: ['view', 'create', 'update', 'delete'],
}

const { fetchRoles, auth } = vi.hoisted(() => ({
  fetchRoles: vi.fn(),
  auth: { value: {} as Record<string, unknown> },
}))

vi.mock('@/api/account', async (original) => ({
  ...(await original<typeof import('@/api/account')>()),
  fetchRoles,
}))

vi.mock('@/lib/auth', () => ({ useAuth: () => auth.value }))

/* მოდულების სია კონტექსტიდან მოდის — ტესტს ერთი მოდული ჰყოფნის */
vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => ({
    all: [
      {
        id: 1,
        key: 'movie',
        name_ka: 'ფილმები',
        name_en: 'Movies',
        icon: 'Film',
        color: '#7073ff',
        is_active: true,
        route_base: '/movies',
      },
    ],
    enabled: [],
    mediaModules: [],
    pageModules: [],
    has: () => true,
    loading: false,
  }),
}))

// React 19-ის `act()` ამ დროშას ითხოვს, თორემ ეფექტებს არ ატარებს
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  fetchRoles.mockReset()
})

/** ქსელური პასუხების ჩამოჯდომა */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/**
 * `admin:roles`-ის მქონე ადმინი (სუპერ-ადმინი **არა**).
 * `ownRole` — მისი საკუთარი როლი სწორედ ეს არის თუ არა.
 */
function actor({ ownRole = false, update = true }: { ownRole?: boolean; update?: boolean } = {}) {
  const permissions: Record<string, string[]> = { 'admin:roles': update ? ['view', 'update'] : ['view'] }

  return {
    user: { id: 9, is_super_admin: false, role_id: ownRole ? ROLE.id : 1, permissions },
    isAdmin: false,
    canAdmin: (resource: string, action?: string) =>
      action ? (permissions[`admin:${resource}`] ?? []).includes(action) : resource === 'roles',
  }
}

async function mountPage(me: ReturnType<typeof actor>) {
  auth.value = me
  fetchRoles.mockResolvedValue([ROLE])

  const { RolePage } = await import('@/pages/RolePage')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  await act(async () => {
    root!.render(
      h(
        QueryClientProvider,
        { client: qc },
        h(
          MemoryRouter,
          { initialEntries: [`/roles/${ROLE.id}`] },
          h(TooltipProvider, null, h(RolePage)),
        ),
      ),
    )
  })

  await flush()

  return container!
}

/** ტექსტის მიხედვით ღილაკები — `@testing-library`-ის გარეშე */
function buttons(scope: ParentNode, text: string) {
  return [...scope.querySelectorAll('button')].filter((b) => (b.textContent ?? '').includes(text))
}

/** მოდულის ბარათის „რედაქტირების" გადამრთველი */
const moduleToggle = (node: ParentNode) => {
  const card = [...node.querySelectorAll('div')].find(
    (d) => (d.textContent ?? '').includes('ფილმები') && buttons(d, 'რედაქტირება').length === 1,
  )

  return card ? buttons(card, 'რედაქტირება')[0] : undefined
}

/** ადმინის სექციის ბარათის გადამრთველი */
const adminToggle = (node: ParentNode) => {
  const card = [...node.querySelectorAll('div')].find(
    (d) => (d.textContent ?? '').includes('აუდიტ-ლოგი') && buttons(d, 'რედაქტირება').length === 1,
  )

  return card ? buttons(card, 'რედაქტირება')[0] : undefined
}

vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useParams: () => ({ id: String(ROLE.id) }),
}))

describe('RolePage', () => {
  it('`admin:roles`-ის მქონე ადმინი მატრიცას ხედავს და მოდულებს ცვლის', async () => {
    const node = await mountPage(actor())

    // ⚠️ სწორედ ეს იყო ცარიელი გვერდი (სათაური `name_ka`-დან, UI ქართულია)
    expect(node.textContent).toContain('მოდერატორი')
    expect(node.textContent).toContain('ფილმები')

    const toggle = moduleToggle(node)
    expect(toggle, 'მოდულის გადამრთველი უნდა დაიხატოს').toBeTruthy()
    expect(toggle!.disabled, 'მოდულის უფლება მას უნდა შეეცვალოს').toBe(false)
  })

  it('ადმინის სექციები მისთვის read-only-ია', async () => {
    const node = await mountPage(actor())

    expect(node.textContent).toContain('აუდიტ-ლოგი')
    // SEC-03 — ადმინ-ზონას მხოლოდ სუპერ-ადმინი ცვლის (403 `role_escalation`)
    expect(adminToggle(node)?.disabled, 'ადმინის სექცია გამორთული უნდა იყოს').toBe(true)
  })

  it('საკუთარ როლზე მთელი მატრიცა read-only-ია, სახელი კი — არა', async () => {
    const node = await mountPage(actor({ ownRole: true }))

    // SEC-03 — 422 `cannot_edit_own_role`
    expect(moduleToggle(node)?.disabled, 'საკუთარი როლის მოდული გამორთული უნდა იყოს').toBe(true)
    expect(adminToggle(node)?.disabled).toBe(true)

    // ⚠️ გადარქმევა ცვლილებად არ ითვლება — backend მას უშვებს
    const name = node.querySelector<HTMLInputElement>('#rn-ka')
    expect(name?.disabled, 'სახელი უნდა იცვლებოდეს').toBe(false)
  })

  it('მხოლოდ ნახვის უფლებით შენახვა გამორთულია', async () => {
    const node = await mountPage(actor({ update: false }))

    expect(moduleToggle(node)?.disabled).toBe(true)
    expect(node.querySelector<HTMLInputElement>('#rn-ka')?.disabled).toBe(true)
    expect(buttons(node, 'შენახვა')[0]?.disabled).toBe(true)
  })
})
