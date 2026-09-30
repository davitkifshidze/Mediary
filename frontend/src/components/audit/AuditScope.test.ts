import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { AuditMeta, AuditSummary } from '@/api/audit'
import i18n from '@/i18n'

/* ============================================================
   **აუდიტის მოდულის ბარათები და პირადი მოდულები (Tasks §37.6).**

   ⚠️ მოწმდება ის, რაც მხოლოდ მონტირებით ჩანს: მეტამონაცემი **ყველა
   ანგარიშის** პირად მოდულს შეიცავს, ე.ი. სხვისი პირადი მოდული ბარათად
   მხოლოდ მაშინ ჩნდება, როცა ლოგში რიგი აქვს (თორემ ნულოვანი ბარათების
   კედელი ჭრილს დამარხავდა), და მისი სახელი **მფლობელით** იწერება — ორ
   ადამიანს ერთი სახელის მოდული შეიძლება ჰქონდეს. საბაზისო ნულოვანი
   ბარათი კი რჩება („აქ არაფერი მომხდარა" პასუხია).
   ============================================================ */

const mocks = vi.hoisted(() => ({
  // ⚠️ ერთი და იგივე ობიექტი ყოველ რენდერზე (`GalleryDownloadDialog.test`-ის გაკვეთილი)
  modules: {
    all: [
      { key: 'movie', name_ka: 'ფილმები', name_en: 'Movies', icon: 'Film', color: '#7073ff' },
      { key: 'c1-diary', name_ka: 'დღიური', name_en: 'Diary', icon: 'Book', color: '#22c55e', is_custom: true },
    ],
  },
  auth: { user: { id: 1, username: 'boss' } },
}))

vi.mock('@/lib/modules', async (original) => ({
  ...(await original<typeof import('@/lib/modules')>()),
  useModules: () => mocks.modules,
}))
vi.mock('@/lib/auth', () => ({ useAuth: () => mocks.auth }))

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

const meta: AuditMeta = {
  actions: ['create'],
  protected_actions: [],
  modules: [
    { key: 'movie', name_ka: 'ფილმები', name_en: 'Movies', owner: null },
    { key: 'c1-diary', name_ka: 'დღიური', name_en: 'Diary', owner: 'boss' },
    { key: 'c2-recipes', name_ka: 'რეცეპტები', name_en: 'Recipes', owner: 'nino' },
    { key: 'c3-recipes', name_ka: 'რეცეპტები', name_en: 'Recipes', owner: 'dato' },
  ],
  users: [],
}

const summary = {
  total: 5,
  modules: [
    { key: 'c2-recipes', total: 3 },
    { key: 'c1-diary', total: 2 },
  ],
  actions: [{ key: 'create', total: 5 }],
} as unknown as AuditSummary

async function mount() {
  const { AuditScope } = await import('@/components/audit/AuditScope')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root!.render(
      h(TooltipProvider, null, h(AuditScope, { meta, summary, filters: {}, onChange: () => {} })),
    ),
  )
}

const labels = () => [...container!.querySelectorAll('button')].map((b) => b.textContent ?? '')

describe('AuditScope — private modules', () => {
  it('names another account’s private module with its owner and only when it has rows', async () => {
    await i18n.changeLanguage('en')
    await mount()

    const all = labels()

    // საბაზისო — ნულითაც რჩება
    expect(all.some((l) => l.includes('Movies'))).toBe(true)
    // საკუთარი პირადი — ჩემი სახელით, მფლობელის გარეშე
    expect(all.some((l) => l.includes('Diary') && !l.includes('@'))).toBe(true)
    // სხვისი, რიგებით — მფლობელით
    expect(all.some((l) => l.includes('Recipes · @nino'))).toBe(true)
    // სხვისი, ნულოვანი — არ იხატება
    expect(all.some((l) => l.includes('@dato'))).toBe(false)
  })
})
